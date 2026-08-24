/**
 * Browser-side WS client to the Engine Server (RESEARCH Architecture
 * Patterns diagram, "Role A"). Connects on module load; pushes `sync_state`
 * after every local (manual or AI-applied) mutation commit so the server's
 * DocumentModel mirror stays current, and applies incoming `apply_mutation`
 * messages -- AI-confirmed proposals -- to the local store via
 * `applyIndices`, so the viewer updates in real time and the change is
 * undoable through the existing zundo undo/redo stack.
 *
 * Best-effort, non-blocking: this app is client-only per Phase 1/2's design
 * and must keep working with the engine unreachable (RESEARCH Open Question
 * 2). `syncState` is a silent no-op whenever the socket isn't open.
 */
import { useDrawingStore } from '@/store/drawingStore';
import type { SyncStateMessage, EngineOutboundMessage } from '@/server/wsProtocol';

const ENGINE_PORT = Number(import.meta.env.VITE_ENGINE_PORT) || 4000;
const ENGINE_URL = `ws://localhost:${ENGINE_PORT}`;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 10_000;

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

let socket: WebSocket | null = null;
let status: ConnectionStatus = 'disconnected';
let reconnectDelay = RECONNECT_BASE_MS;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
// Monotonic counter, incremented on every sync_state push -- an opaque
// staleness signal for the server's confirm_proposal version check
// (RESEARCH Pattern 2/4, Assumption A5). Not derived from zundo's internal
// history; a plain module-level counter the protocol treats as authoritative.
let versionCounter = 0;

function handleMessage(event: MessageEvent<string>): void {
  let message: EngineOutboundMessage;
  try {
    message = JSON.parse(event.data) as EngineOutboundMessage;
  } catch {
    return;
  }

  if (message.type === 'apply_mutation') {
    useDrawingStore.getState().applyIndices(message.indices, message.action);
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
}

function connect(): void {
  status = 'connecting';
  socket = new WebSocket(ENGINE_URL);

  socket.addEventListener('open', () => {
    status = 'connected';
    reconnectDelay = RECONNECT_BASE_MS;
    syncState(); // push whatever is already loaded (e.g. a reconnect after the engine restarted)
  });

  socket.addEventListener('message', handleMessage);

  socket.addEventListener('close', () => {
    status = 'disconnected';
    socket = null;
    scheduleReconnect();
  });

  socket.addEventListener('error', () => {
    // 'close' fires immediately after a failed connection attempt too --
    // reconnect scheduling lives there, nothing further to do here.
  });
}

export function getConnectionStatus(): ConnectionStatus {
  return status;
}

/** Pushes the current drawingStore state to the Engine Server. Silent no-op
 * if the socket isn't open or nothing is loaded yet -- callers never need to
 * check connection state themselves. */
export function syncState(): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;

  const state = useDrawingStore.getState();
  if (!state.rawFileText || !state.fileName) return;

  versionCounter += 1;
  const message: SyncStateMessage = {
    type: 'sync_state',
    rawFileText: state.rawFileText,
    fileName: state.fileName,
    deletedEntityIndices: [...state.deletedEntityIndices],
    hiddenEntityIndices: [...state.hiddenEntityIndices],
    version: versionCounter,
  };
  socket.send(JSON.stringify(message));
}

connect();
