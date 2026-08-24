/**
 * Typed WebSocket message definitions shared by the Engine Server
 * (src/server/engine.ts), the MCP relay (src/server/index.ts), and the
 * browser-facing leg (src/lib/engineSocket.ts).
 *
 * Two independent client roles connect to the same Engine Server WS port
 * (RESEARCH Architecture Patterns diagram, "TWO logical WS roles on one
 * port"):
 *   - Role A: the browser -- sends `sync_state`, receives `apply_mutation`
 *     when an AI-confirmed proposal is applied.
 *   - Role B: the MCP relay -- sends `tool_request`, receives
 *     `tool_response`.
 */

/** Browser -> Engine Server: full document sync, sent on file load and on
 * every subsequent local (manual or AI-applied) mutation commit. */
export interface SyncStateMessage {
  type: 'sync_state';
  rawFileText: string;
  fileName: string;
  deletedEntityIndices: number[];
  hiddenEntityIndices: number[];
  version: number;
}

/** MCP relay -> Engine Server: invoke a tool against the currently loaded
 * document. `requestId` pairs this request with its `tool_response`. */
export interface ToolRequestMessage {
  type: 'tool_request';
  requestId: string;
  tool: string;
  params: Record<string, unknown>;
}

/** Engine Server -> MCP relay: the result of a previously sent
 * `tool_request`, matched back via `requestId`. */
export interface ToolResponseMessage {
  type: 'tool_response';
  requestId: string;
  result?: unknown;
  error?: string;
}

/** Engine Server -> browser: an AI-confirmed proposal's indices have been
 * applied server-side; the browser applies the same mutation locally via
 * `useDrawingStore.getState().applyIndices(indices, action)` so the viewer
 * updates in real time and the change is undoable via the existing zundo
 * undo/redo stack (RESEARCH Pattern 5). */
export interface ApplyMutationMessage {
  type: 'apply_mutation';
  indices: number[];
  action: 'delete' | 'hide';
}

export type EngineInboundMessage = SyncStateMessage | ToolRequestMessage;
export type EngineOutboundMessage = ToolResponseMessage | ApplyMutationMessage;

export type WsMessage =
  | SyncStateMessage
  | ToolRequestMessage
  | ToolResponseMessage
  | ApplyMutationMessage;
