/**
 * Typed WebSocket message definitions shared by the Engine Server
 * (src/server/engine.ts), the MCP relay (src/server/index.ts), and --
 * for the browser-facing leg -- the future src/lib/engineSocket.ts client.
 *
 * Two independent client roles connect to the same Engine Server WS port
 * (RESEARCH Architecture Patterns diagram, "TWO logical WS roles on one
 * port"):
 *   - Role A: the browser -- sends `sync_state`, will later receive
 *     `apply_mutation` (Plan 02).
 *   - Role B: the MCP relay -- sends `tool_request`, receives
 *     `tool_response`.
 *
 * This plan only needs the messages for the list_layers tracer slice;
 * `apply_mutation` and proposal-related message types are added in Plan 02.
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

export type EngineInboundMessage = SyncStateMessage | ToolRequestMessage;
export type EngineOutboundMessage = ToolResponseMessage;

export type WsMessage =
  | SyncStateMessage
  | ToolRequestMessage
  | ToolResponseMessage;
