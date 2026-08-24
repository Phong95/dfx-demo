/**
 * Engine Server (RESEARCH Pattern 1) -- the only process that ever binds the
 * WS port. Owns the single in-memory DocumentModel for the active browser
 * session. Started by `npm run dev` via `concurrently`, alongside `vite`.
 *
 * Two logical client roles connect to the same WS port, distinguished by the
 * `type` of the first message they send:
 *   - Role A (browser): sends `sync_state` on load and after every local
 *     mutation commit.
 *   - Role B (MCP relay): sends `tool_request`, awaits a matching
 *     `tool_response`.
 *
 * Never binds to 0.0.0.0 -- localhost-only per RESEARCH Security Domain V4.
 * Diagnostics go to stderr only (console.error) -- this process doesn't
 * share stdio with Claude Desktop the way index.ts does, but keeping the
 * same convention here avoids ever having to think about it if logging
 * helpers are later shared between the two entry points.
 */
import { WebSocketServer } from 'ws';
import type { WebSocket, RawData } from 'ws';
import { DocumentModel } from './documentModel';
import { handleListLayers } from './tools/listLayers';
import { handleGetStructure } from './tools/getStructure';
import { handleApplyCleanupRule, type CleanupFilter } from './tools/applyCleanupRule';
import { handleRemoveSelection } from './tools/removeSelection';
import { handleConfirmProposal } from './tools/confirmProposal';
import { handleExportDxf } from './tools/exportDxf';
import type { ApplyMutationMessage, EngineInboundMessage, ToolResponseMessage } from './wsProtocol';

const ENGINE_PORT = Number(process.env.ENGINE_PORT) || 4000;
const HOST = '127.0.0.1';

// RESEARCH Security Domain: WebSocket connections don't enforce same-origin
// the way fetch/XHR do -- any localhost page could attempt to connect to
// ws://127.0.0.1:{ENGINE_PORT}. Accept only same-machine origins (any port,
// covering whatever port Vite's dev server picks) and no-origin connections
// (a plain Node `ws` client, e.g. the MCP relay, never sends an Origin
// header at all).
function isAllowedOrigin(origin: string): boolean {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

const documentModel = new DocumentModel();

// The single active browser connection (RESEARCH Open Question 3: "last
// connected browser tab wins", an accepted single-user-local-tool
// limitation). Set whenever a socket sends `sync_state`; cleared on that
// socket's close. confirm_proposal pushes `apply_mutation` here so an
// AI-confirmed change reaches the viewer in real time.
let browserSocket: WebSocket | null = null;

function pushApplyMutation(message: ApplyMutationMessage): void {
  if (browserSocket && browserSocket.readyState === browserSocket.OPEN) {
    browserSocket.send(JSON.stringify(message));
  }
}

const wss = new WebSocketServer({
  host: HOST,
  port: ENGINE_PORT,
  verifyClient: (info: { origin: string }) => isAllowedOrigin(info.origin),
});

wss.on('listening', () => {
  console.error(`[engine] ready on ws://${HOST}:${ENGINE_PORT}`);
});

wss.on('error', (error: NodeJS.ErrnoException) => {
  console.error(`[engine] failed to bind ws://${HOST}:${ENGINE_PORT}: ${error.message}`);
  process.exit(1);
});

async function dispatchTool(
  tool: string,
  params: Record<string, unknown>,
): Promise<{ result?: unknown; error?: string }> {
  if (!documentModel.isLoaded) {
    return { error: 'No drawing loaded. Please load a DXF file in the viewer first.' };
  }

  switch (tool) {
    case 'list_layers':
      return { result: handleListLayers(documentModel) };

    case 'get_structure':
      return { result: handleGetStructure(documentModel) };

    case 'apply_cleanup_rule': {
      const { action, filter } = params as { action: 'delete' | 'hide'; filter: CleanupFilter };
      return { result: handleApplyCleanupRule(documentModel, action, filter) };
    }

    case 'remove_selection': {
      const { indices, action } = params as { indices: number[]; action: 'delete' | 'hide' };
      const result = handleRemoveSelection(documentModel, indices, action);
      return 'error' in result ? { error: result.error } : { result };
    }

    case 'confirm_proposal': {
      const { proposalId } = params as { proposalId: string };
      const result = handleConfirmProposal(documentModel, proposalId, pushApplyMutation);
      return 'error' in result ? { error: result.error } : { result };
    }

    case 'export_dxf': {
      const { filePath } = params as { filePath: string };
      const result = await handleExportDxf(documentModel, filePath);
      return 'error' in result ? { error: result.error } : { result };
    }

    default:
      return { error: `Unknown tool: ${tool}` };
  }
}

wss.on('connection', (socket: WebSocket) => {
  socket.on('message', (raw: RawData) => {
    let message: EngineInboundMessage;
    try {
      message = JSON.parse(raw.toString()) as EngineInboundMessage;
    } catch {
      console.error('[engine] received a non-JSON message, ignoring');
      return;
    }

    if (message.type === 'sync_state') {
      // documentModel.load/updateState never throw -- parse failures are
      // caught internally and recorded on documentModel.loadError, never
      // crashing the Engine Server (RESEARCH Pitfall 5).
      documentModel.load(message.rawFileText, message.fileName);
      documentModel.updateState(
        message.deletedEntityIndices,
        message.hiddenEntityIndices,
        message.version,
      );
      browserSocket = socket; // this socket just identified itself as the browser leg
      return;
    }

    if (message.type === 'tool_request') {
      void dispatchTool(message.tool, message.params).then(({ result, error }) => {
        const response: ToolResponseMessage = {
          type: 'tool_response',
          requestId: message.requestId,
          result,
          error,
        };
        socket.send(JSON.stringify(response));
      });
      return;
    }
  });

  socket.on('close', () => {
    if (browserSocket === socket) browserSocket = null;
  });

  socket.on('error', (error: Error) => {
    console.error(`[engine] client socket error: ${error.message}`);
  });
});
