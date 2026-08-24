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

/** Thin, stateless WS client to the Engine Server (RESEARCH Pattern 1). Holds
 * a Map of pending requestIds -> resolvers so multiple in-flight tool calls
 * can be pairing-matched back to their responses. */
class EngineClient {
  private ws: WebSocket;
  private pending = new Map<
    string,
    { resolve: (value: ToolResponseMessage) => void; reject: (reason: Error) => void }
  >();

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.on('error', (error: Error) => {
      console.error(`[relay] engine connection error: ${error.message}`);
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

  private get isOpen(): boolean {
    return this.ws.readyState === WebSocket.OPEN;
  }

  async callTool(tool: string, params: Record<string, unknown>): Promise<ToolResponseMessage> {
    if (!this.isOpen) {
      throw new Error(ENGINE_UNREACHABLE_MESSAGE);
    }

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

      this.ws.send(JSON.stringify(request));
    });
  }
}

const engineClient = new EngineClient(ENGINE_URL);

const server = new McpServer({ name: 'dxf-demo', version: '0.1.0' });

server.registerTool(
  'list_layers',
  {
    description:
      'List all layers in the currently loaded DXF drawing with color, entity count, and frozen/locked state.',
    inputSchema: {},
  },
  async (): Promise<CallToolResult> => {
    try {
      const response = await engineClient.callTool('list_layers', {});
      if (response.error) {
        return errorResult(response.error);
      }
      return { content: [{ type: 'text', text: JSON.stringify(response.result, null, 2) }] };
    } catch (error) {
      return errorResult(error instanceof Error ? error.message : ENGINE_UNREACHABLE_MESSAGE);
    }
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
