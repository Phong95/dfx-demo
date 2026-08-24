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
import type { EngineInboundMessage, ToolResponseMessage } from './wsProtocol';

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

function dispatchTool(
  tool: string,
  _params: Record<string, unknown>,
): { result?: unknown; error?: string } {
  if (!documentModel.isLoaded) {
    return { error: 'No drawing loaded. Please load a DXF file in the viewer first.' };
  }

  switch (tool) {
    case 'list_layers':
      return { result: handleListLayers(documentModel) };
    case 'get_structure':
      return { result: handleGetStructure(documentModel) };
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
      return;
    }

    if (message.type === 'tool_request') {
      const { result, error } = dispatchTool(message.tool, message.params);
      const response: ToolResponseMessage = {
        type: 'tool_response',
        requestId: message.requestId,
        result,
        error,
      };
      socket.send(JSON.stringify(response));
      return;
    }
  });

  socket.on('error', (error: Error) => {
    console.error(`[engine] client socket error: ${error.message}`);
  });
});
