/**
 * MCP relay entry point (RESEARCH Pattern 1) -- the process Claude Desktop
 * spawns via `claude_desktop_config.json`'s stdio `command`. Holds NO
 * document state of its own: every registered tool's handler sends a typed
 * request over a `ws` client connection to the already-running Engine
 * Server (started separately by `npm run dev`) and awaits the matching
 * response.
 *
 * CRITICAL: this file, and everything it imports, must NEVER write to
 * process.stdout. `StdioServerTransport` owns stdin/stdout exclusively for
 * JSON-RPC framing -- any stray console.log/console.info call here would
 * corrupt the protocol stream and silently break the Claude Desktop
 * connection (RESEARCH Pitfall 1). All diagnostics use console.error
 * (stderr) only.
 */
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { WebSocket } from 'ws';
import * as z from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolRequestMessage, ToolResponseMessage } from './wsProtocol';

const ENGINE_PORT = Number(process.env.ENGINE_PORT) || 4000;
const ENGINE_URL = `ws://127.0.0.1:${ENGINE_PORT}`;
const REQUEST_TIMEOUT_MS = 10_000;
const ENGINE_UNREACHABLE_MESSAGE =
  "Cannot reach the DXF Demo engine server. Make sure 'npm run dev' is running, then try again.";

function errorResult(text: string): CallToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}

class EngineClient {
  private ws: WebSocket | null = null;
  private url: string;
  private pending = new Map<
    string,
    { resolve: (value: ToolResponseMessage) => void; reject: (reason: Error) => void }
  >();

  constructor(url: string) {
    this.url = url;
    this.connect();
  }

  private connect(): void {
    this.ws = new WebSocket(this.url);
    this.ws.on('error', (error: Error) => {
      console.error(`[relay] engine connection error: ${error.message}`);
    });
    this.ws.on('close', () => {
      this.ws = null;
    });
    this.ws.on('message', (raw) => {
      let message: ToolResponseMessage;
      try {
        message = JSON.parse(raw.toString()) as ToolResponseMessage;
      } catch {
        console.error('[relay] received a non-JSON message from engine, ignoring');
        return;
      }
      const pending = this.pending.get(message.requestId);
      if (!pending) return;
      this.pending.delete(message.requestId);
      pending.resolve(message);
    });
  }

  private ensureConnection(): Promise<WebSocket> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return Promise.resolve(this.ws);
    }

    if (this.ws?.readyState === WebSocket.CONNECTING) {
      return new Promise((resolve, reject) => {
        const ws = this.ws!;
        ws.once('open', () => resolve(ws));
        ws.once('error', () => reject(new Error(ENGINE_UNREACHABLE_MESSAGE)));
      });
    }

    this.connect();

    return new Promise((resolve, reject) => {
      const ws = this.ws!;
      ws.once('open', () => resolve(ws));
      ws.once('error', () => reject(new Error(ENGINE_UNREACHABLE_MESSAGE)));
    });
  }

  async callTool(tool: string, params: Record<string, unknown>): Promise<ToolResponseMessage> {
    const ws = await this.ensureConnection();

    const requestId = randomUUID();
    const request: ToolRequestMessage = { type: 'tool_request', requestId, tool, params };

    return new Promise<ToolResponseMessage>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error('Timed out waiting for a response from the DXF Demo engine server.'));
      }, REQUEST_TIMEOUT_MS);

      this.pending.set(requestId, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
      });

      ws.send(JSON.stringify(request));
    });
  }
}

const engineClient = new EngineClient(ENGINE_URL);

/** Shared relay/format step every tool handler uses: send a `tool_request`
 * to the Engine Server, await its `tool_response`, and map it to a
 * `CallToolResult`. Connection failures (the Engine Server not running yet)
 * are caught and surfaced as the same `ENGINE_UNREACHABLE_MESSAGE` every
 * handler would otherwise duplicate (RESEARCH Pattern 1's failure mode). */
async function callEngineTool(
  tool: string,
  params: Record<string, unknown> = {},
): Promise<CallToolResult> {
  try {
    const response = await engineClient.callTool(tool, params);
    if (response.error) {
      return errorResult(response.error);
    }
    return { content: [{ type: 'text', text: JSON.stringify(response.result, null, 2) }] };
  } catch (error) {
    return errorResult(error instanceof Error ? error.message : ENGINE_UNREACHABLE_MESSAGE);
  }
}

const server = new McpServer({ name: 'dxf-demo', version: '0.1.0' });

server.registerTool(
  'list_layers',
  {
    description:
      'List all layers in the currently loaded DXF drawing with color, entity count, and frozen/locked state.',
    inputSchema: {},
  },
  async (): Promise<CallToolResult> => callEngineTool('list_layers'),
);

server.registerTool(
  'get_structure',
  {
    description:
      'Get the hierarchical structure of the loaded DXF drawing: layers with entity type counts and unknown entity report.',
    inputSchema: {},
  },
  async (): Promise<CallToolResult> => callEngineTool('get_structure'),
);

server.registerTool(
  'apply_cleanup_rule',
  {
    description:
      'Preview a delete/hide rule against a layer and/or entity type filter. Returns a proposal_id and an ' +
      'affected-entity summary -- nothing is applied until confirm_proposal is called with that proposal_id.',
    inputSchema: {
      action: z.enum(['delete', 'hide']),
      filter: z.object({
        layer: z.string().optional(),
        entityType: z.string().optional(),
      }),
    },
  },
  async ({ action, filter }): Promise<CallToolResult> =>
    callEngineTool('apply_cleanup_rule', { action, filter }),
);

server.registerTool(
  'remove_selection',
  {
    description:
      'Preview a delete/hide of specific entity indices. Returns a proposal_id and an affected-entity summary -- ' +
      'nothing is applied until confirm_proposal is called with that proposal_id.',
    inputSchema: {
      indices: z.array(z.number().int().nonnegative()).max(50_000),
      action: z.enum(['delete', 'hide']),
    },
  },
  async ({ indices, action }): Promise<CallToolResult> =>
    callEngineTool('remove_selection', { indices, action }),
);

server.registerTool(
  'confirm_proposal',
  {
    description:
      'Apply a previously previewed proposal (from apply_cleanup_rule or remove_selection) by its proposal_id. ' +
      'Rejects the proposal if the drawing has changed since it was previewed -- request a new preview instead.',
    inputSchema: {
      proposalId: z.string(),
    },
  },
  async ({ proposalId }): Promise<CallToolResult> => callEngineTool('confirm_proposal', { proposalId }),
);

server.registerTool(
  'export_dxf',
  {
    description:
      'Export the currently loaded, cleaned-up DXF drawing to a file path (must end in .dxf). Deleted entities are ' +
      'removed byte-for-byte via the original file text; hidden-but-not-deleted entities are kept.',
    inputSchema: {
      filePath: z.string(),
    },
  },
  async ({ filePath }): Promise<CallToolResult> => callEngineTool('export_dxf', { filePath }),
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
