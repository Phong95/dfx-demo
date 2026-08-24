# Phase 3: AI-Assisted Cleanup via MCP - Research

**Researched:** 2026-08-24
**Domain:** MCP server integration (`@modelcontextprotocol/sdk` stdio transport) + Node/WebSocket state-sync bridge, reconciling a client-only Phase 1/2 browser architecture with the project-level "shared Document Model" design
**Confidence:** MEDIUM-HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**MCP Server Architecture**
- Shared Node process: MCP server (stdio transport) + HTTP/WS server for the React app, both reading the same in-memory Document Model — per research decision in STATE.md
- 5 MCP tools: `list_layers`, `get_structure`, `apply_cleanup_rule`, `remove_selection`, `export_dxf` — matches MCP-01/02/03 requirements
- WebSocket for real-time state sync between React app and Node server — app pushes current drawing state when loaded, server pushes back changes from AI operations
- Zod schemas for tool input validation — Standard Schema integration with MCP SDK

**AI Cleanup Operations**
- `apply_cleanup_rule`: accepts a rule object (e.g., {action: "delete", filter: {layer: "S-DIMS"}}), returns a preview of affected entities before applying — satisfies MCP-03 dry-run
- `remove_selection`: accepts an array of entity indices, validates they exist, returns preview, applies on confirmation — mirrors manual delete flow
- Two-step confirmation: tool returns a `proposal_id` with preview, a second `confirm_proposal` call applies it — explicit dry-run/confirm per MCP-03
- `export_dxf`: triggers the same surgical export pipeline from Phase 2, saves to a user-specified path — reuses existing code

**Integration & Claude Desktop Setup**
- Single `npm run dev` starts both Vite dev server and the Node/MCP engine server
- Claude Desktop config: provide a `claude_desktop_config.json` snippet in README with stdio command
- No-drawing-loaded error: return clear message "No drawing loaded. Please load a DXF file in the viewer first."
- Real-time viewer sync: WebSocket pushes state changes from AI operations to the React app, viewer updates automatically

### Claude's Discretion
No items deferred to Claude's discretion — all grey areas resolved.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MCP-01 | MCP server with stdio transport for Claude Desktop (list_layers, get_structure, apply_cleanup_rule, remove_selection, export_dxf tools) | Verified `@modelcontextprotocol/sdk@1.30.0` `McpServer.registerTool`/`StdioServerTransport` API (read directly from the published package's `.d.ts` files this session — see Code Examples). **Flags a real naming conflict**: CONTEXT.md's own Decisions also require a `confirm_proposal` tool, making 6 tools, not 5 — see Open Question 1 |
| MCP-02 | Natural language cleanup — user describes intent, AI proposes structured operations | `apply_cleanup_rule`'s `{action, filter}` shape + `get_structure`/`list_layers` give Claude enough structured context to reason about intent and construct a rule — see Architecture Patterns Pattern 3 |
| MCP-03 | Preview/dry-run mode showing proposed changes before applying destructive operations | Two-step proposal/confirm design with a server-side in-memory `Map<proposalId, Proposal>` plus a document-version staleness check — see Architecture Patterns Pattern 4 and Common Pitfalls #3 |

</phase_requirements>

## Summary

Phase 3's central challenge is not the MCP SDK itself (well-documented, low-risk, verified directly against the actual published package this session) — it is reconciling CONTEXT.md's "shared Node process... both reading the same in-memory Document Model" wording with a hard constraint that Phase 1/2 already locked in: **the browser owns the DXF parse, the raw file text, and the entire mutation/undo history (zustand + zundo), not a Node server.** The project-level `ARCHITECTURE.md` originally designed the opposite (Node server parses, browser only renders a pre-flattened payload) and explicitly named "two independent state copies (frontend-parses + backend-parses)" as Anti-Pattern 2 — but Phase 1 and Phase 2 RESEARCH.md both independently concluded (and this session's codebase read confirms) that the app was actually built entirely client-side, with the Node engine server deferred to "whenever Phase 3 needs it." Phase 3 is that reconciliation point, and it necessarily creates the two-copy situation the original architecture doc warned against — this is now unavoidable, not a mistake, and the design below is built to keep the two copies safely reconcilable rather than pretending they're literally one.

The second load-bearing finding is a genuine **implementation conflict inside CONTEXT.md's own literal wording**, not a hypothetical: "Single `npm run dev` starts both Vite dev server and the Node/MCP engine server" implies one process instance is bound to a port by the dev script, while Claude Desktop's MCP integration model *always* spawns its own separate OS process reading that process's own stdin/stdout — there is no way for Claude Desktop's spawned process to literally be the same OS process `npm run dev` already started. If both processes try to bind the same HTTP/WS port, the second one throws `EADDRINUSE`. CONTEXT.md's own "Specific Ideas" section already anticipates the fix without naming it as such: "The MCP server should be a separate entry point (`src/server/index.ts`) that imports from the shared domain modules." The recommended design (Architecture Patterns Pattern 1) makes this literal: **one process — the Engine Server — owns the real Document Model and binds the HTTP/WS port; it is started by `npm run dev` alongside Vite. A second, separate script is what Claude Desktop's config actually spawns over stdio; it holds no state of its own and is a thin WebSocket *client* that relays every MCP tool call into the already-running Engine Server.** This satisfies "one shared, real-time-synced Document Model" in spirit and satisfies "single `npm run dev` brings up everything needed to test the app" in practice, while avoiding the port conflict and (critically) avoiding ever writing to `stdout` from a process that also does browser-facing HTTP logging — `StdioServerTransport` reads/writes `process.stdin`/`process.stdout` directly for JSON-RPC framing [VERIFIED: `@modelcontextprotocol/sdk@1.30.0` `dist/esm/server/stdio.d.ts`, class docstring: "communicates with an MCP client by reading from the current process' stdin and writing to stdout"], and any unrelated stdout write (an `console.log`, an accidental print) from that same process corrupts the protocol stream — a well-documented MCP failure mode this design avoids by construction, since the MCP-only process does no HTTP/browser work at all.

Third: every "pure" module Phase 1/2 already built (`rawTagScan.ts`, `resolveColors.ts`, `entityTagRanges.ts`, `exportDxf.ts`'s `filterDxfText`/`validateExport`, `aciColorIndex.ts`) has zero browser-API dependencies and was directly confirmed importable under plain Node this session (`dxf-parser` loads and constructs successfully outside a Worker — `typeof DxfParser === 'function'` in a bare `node --input-type=module -e` check). These are reused verbatim on the server side — only `exportDxf.ts`'s `saveDxf()` (native `showSaveFilePicker`/`<a download>`) is browser-only and is **not** reusable for the `export_dxf` MCP tool, which needs a plain `fs.writeFile` to a Claude-supplied path instead.

**Primary recommendation:** Build two Node entry points under `src/server/`: `engine.ts` (HTTP+WS host, the actual Document Model owner, started by `npm run dev` via `concurrently` alongside `vite`) and `index.ts` (MCP-only, stdio, the script Claude Desktop's `claude_desktop_config.json` spawns, holding zero state and relaying every tool call to `engine.ts` over a local WebSocket). The browser syncs its `rawFileText` to the Engine Server once per file load and again after every local mutation (manual or AI-driven); the Engine Server independently re-parses that same text with the already-verified-Node-safe `dxf-parser`/`rawTagScan`/`resolveAllColors` pipeline, so entity-index alignment with the browser's own `dxfData.entities` is guaranteed by parsing the identical bytes, not by serializing dxf-parser's output over the wire. AI-confirmed mutations flow back to the browser as a `{indices, action}` command that a new `applyIndices` store action applies through the *existing* `deletedEntityIndices`/`hiddenEntityIndices` fields — already tracked by `zundo`'s `partialize` — so undo/redo covers AI edits with no new undo-stack code.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| DXF parsing, rendering, undo/redo, manual selection/delete/hide | Browser / Client (unchanged from Phase 1/2) | — | Already built and validated; Phase 3 does not move this to the server (would contradict the committed client-only architecture) |
| Document Model *mirror* (server-side re-parse for MCP tool answers) | API / Backend (Engine Server, Node) | — | MCP tools need something to inspect/compute previews against without depending on the browser tab staying open mid-tool-call; server independently re-parses the synced `rawFileText` |
| MCP tool protocol (stdio, JSON-RPC framing, schema validation) | API / Backend (thin MCP-relay process) | — | `@modelcontextprotocol/sdk`'s `StdioServerTransport` requires exclusive ownership of the spawned process's stdio; must not share a process with HTTP/browser logging |
| Real-time state sync (browser ⇄ Engine Server) | API / Backend (Engine Server) + Browser / Client | — | Bidirectional WebSocket: browser pushes on load/mutation, server pushes AI-confirmed mutations back |
| Two-step proposal/confirm bookkeeping | API / Backend (Engine Server, in-memory `Map`) | — | Must be server-side and shared across tool calls (preview in one MCP call, confirm in the next) — cannot live in the stateless MCP-relay process |
| `export_dxf` file write | API / Backend (Engine Server or MCP-relay via `fs.writeFile`) | — | Writing to an arbitrary filesystem path is a Node-only capability; the browser's `saveDxf()` (File System Access API) is not reusable here |

## Standard Stack

### Core (new for Phase 3)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @modelcontextprotocol/sdk | 1.30.0 [VERIFIED: npm registry `npm view @modelcontextprotocol/sdk version` → `1.30.0`; downloaded and inspected the actual published package's `dist/esm/server/*.d.ts` this session] | `McpServer`, `registerTool`, `StdioServerTransport` — official MCP protocol implementation | Official Anthropic/MCP SDK; already locked in CLAUDE.md and project STACK.md |
| zod | 4.4.3 [VERIFIED: npm registry, already pinned project-wide] | Tool input schema validation | SDK's peer dependency range is `"zod": "^3.25 \|\| ^4.0"` [VERIFIED: `@modelcontextprotocol/sdk@1.30.0` `package.json` `peerDependencies`] — 4.4.3 is compatible |
| ws | 8.21.3 [VERIFIED: npm registry `npm view ws version` → `8.21.3`] | WebSocket server (Engine Server) and WebSocket client (browser + MCP-relay process) | The de facto standard Node WebSocket library; Node has no built-in WS server, and the browser's native `WebSocket` client only covers one of the three connection legs needed here (browser↔engine) — `ws` covers the other leg (mcp-relay↔engine, a plain Node WS client) |
| concurrently | 10.0.5 [VERIFIED: npm registry `npm view concurrently version` → `10.0.5`] | Runs `vite` and the Engine Server (`tsx watch src/server/engine.ts`) from a single `npm run dev` | CONTEXT.md locks "Single `npm run dev` starts both" — `concurrently` is the standard cross-platform way to run two long-lived dev processes from one npm script without a bespoke shell script (this repo's dev environment mixes PowerShell and bash — a hand-rolled `&&`/`&` shell script would not be portable across both) |
| tsx | 4.23.12 [VERIFIED: npm registry `npm view tsx version` → `4.23.12`] | Runs TypeScript server files directly (dev and Claude-Desktop-spawned) without a separate build/emit step | Matches this project's PoC scope — no need to introduce a `tsc`-emit-then-run step for a demo; Claude Desktop's config command can point directly at `npx tsx src/server/index.ts` |

### Reused unchanged from Phase 1/2 (server-side, pure/Node-safe)
| Module | Verified Node-safe? | Reused By |
|--------|---------------------|-----------|
| `dxf-parser@1.1.2` | [VERIFIED: this session — `node --input-type=module -e "import DxfParser from 'dxf-parser'; console.log(typeof DxfParser)"` → `function`, run directly under plain Node (not a Worker), confirming Phase 1 research's "zero Node built-in dependencies" finding holds for Node itself, not just the browser Worker context it was originally verified for] | Engine Server's own re-parse of synced `rawFileText` |
| `src/dxf/rawTagScan.ts` | Pure TS/JS, no browser API [VERIFIED: read this session — no `self`, `window`, `document`, or Worker references] | `get_structure`'s unknown-entity report + layer frozen/locked flags |
| `src/dxf/resolveColors.ts` | Pure TS/JS [VERIFIED: read this session] | `list_layers` color reporting |
| `src/dxf/aciColorIndex.ts` | Pure data table | Same |
| `src/dxf/entityTagRanges.ts` | Pure TS/JS [VERIFIED: read this session] | `export_dxf`'s surgical filter |
| `src/dxf/exportDxf.ts` — `filterDxfText`, `validateExport` (NOT `saveDxf`) | Pure functions, no browser API [VERIFIED: read this session — `saveDxf` is the only browser-dependent export, using `window.showSaveFilePicker`/`document.createElement`/`Blob`] | `export_dxf`'s filter + re-parse validation; `saveDxf` is **not** reused — replaced by `fs.writeFile` server-side |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `ws` | Node's experimental built-in `WebSocket` client only (no server) | Node has no built-in WebSocket *server* API as of the LTS lines this project targets; `ws` remains necessary for the Engine Server's listening side regardless |
| Two-process (Engine Server + thin MCP relay) | Single process serving both HTTP/WS and stdio MCP | Rejected: Claude Desktop always spawns its own OS process for stdio servers — a single-process design only works if `npm run dev` is never also run standalone, contradicting CONTEXT.md's explicit "Single `npm run dev` starts both" decision; two cooperating processes resolves the port conflict cleanly, see Summary |
| `tsx` for the MCP entry point | Compile server TS to JS first, point Claude Desktop at the `.js` output | Adds a build step this PoC doesn't need; `tsx` is already a natural fit given the project's `"type": "module"` + Vite/ESM-first setup, and CONTEXT.md's "reuses existing code" framing favors the lower-ceremony option |
| In-memory `Map` for proposal storage | A job-queue library (e.g., bullmq) or SQLite | Massive overkill for a single-user local demo tracking a handful of pending proposals per session; the "Don't Hand-Roll" line here is about *not* reaching for infrastructure this scope doesn't need, not about needing a library at all |

**Installation:**
```bash
npm install @modelcontextprotocol/sdk@1.30.0 ws@8.21.3
npm install -D concurrently@10.0.5 tsx@4.23.12 @types/ws
```

**Version verification:** All new-dependency versions checked against the live npm registry this session via `npm view <pkg> version`. `@modelcontextprotocol/sdk@1.30.0` and `zod@4.4.3` were already pinned by this project's `CLAUDE.md`/STACK.md; both confirmed still current and mutually compatible (`peerDependencies` check above).

## Package Legitimacy Audit

| Package | Registry | Age (first publish / latest) | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-------------------------------|-----------|--------------|---------|-------------|
| @modelcontextprotocol/sdk | npm | latest published 2026-07-27 | ~50.6M/wk | github.com/modelcontextprotocol/typescript-sdk | SUS ("too-new") | Flagged — see note below |
| ws | npm | latest published 2026-08-07 | ~260.5M/wk | github.com/websockets/ws | SUS ("too-new") | Flagged — see note below |
| concurrently | npm | latest published 2026-08-15 | ~21.0M/wk | github.com/open-cli-tools/concurrently | SUS ("too-new") | Flagged — see note below |
| tsx | npm | latest published 2026-08-10 | ~83.0M/wk | github.com/privatenumber/tsx | SUS ("too-new") | Flagged — see note below |
| zod | npm | latest published 2026-05-04 | ~265.7M/wk | github.com/colinhacks/zod | OK | Approved |

**Note on the four "too-new" SUS verdicts:** identical false-positive pattern already documented in Phase 1 and Phase 2 RESEARCH.md — the legitimacy gate keys off the *latest published version's* timestamp (routine patch/minor releases within the last few weeks), not first-publish date. Every flagged package here has an official/canonical GitHub org (`modelcontextprotocol`, `websockets`, `open-cli-tools`, `privatenumber` — the last is the sole maintainer of the widely-adopted `tsx`, not an anonymous account) and tens-to-hundreds of millions of weekly downloads. `@modelcontextprotocol/sdk` is additionally already the project's own explicitly-pinned, CLAUDE.md-mandated dependency. Per the Package Legitimacy Protocol these are still tagged `[WARNING: flagged as suspicious — verify before using.]` and the planner must add a `checkpoint:human-verify` task before each install step, consistent with how Phase 1/2 handled the same false-positive pattern.

**Packages removed due to `[SLOP]` verdict:** none.
**Packages flagged as suspicious `[SUS]`:** `@modelcontextprotocol/sdk`, `ws`, `concurrently`, `tsx` — all judged likely false positives (see note above), but still gate behind `checkpoint:human-verify` per protocol.

## Architecture Patterns

### System Architecture Diagram

```
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  Claude Desktop                                                          │
  │  spawns via claude_desktop_config.json:                                  │
  │  "command": "npx", "args": ["tsx", "<abs-path>/src/server/index.ts"]     │
  └───────────────────────────────┬───────────────────────────────────────────┘
                                   │ stdio (JSON-RPC) — process's ONLY stdout use
                                   ▼
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  src/server/index.ts  ("MCP relay" process — holds NO document state)    │
  │  McpServer + StdioServerTransport, registers 6 tools (see Open Q1):      │
  │  list_layers · get_structure · apply_cleanup_rule · remove_selection ·   │
  │  confirm_proposal · export_dxf                                          │
  │  Each tool handler → sends a request over a `ws` CLIENT connection      │
  │  to the Engine Server, awaits the JSON reply, maps it to CallToolResult  │
  └───────────────────────────────┬───────────────────────────────────────────┘
                                   │ ws://localhost:4000  (local-only, see Security Domain)
                                   ▼
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  src/server/engine.ts  ("Engine Server" — started by `npm run dev`,      │
  │                          via `concurrently` alongside `vite`)            │
  │                                                                           │
  │   documentModel.ts (in-memory, per active browser session):              │
  │     rawFileText · dxfData (re-parsed server-side) · unknownEntityReport  │
  │     deletedEntityIndices · hiddenEntityIndices · version: number         │
  │                                                                           │
  │   proposals.ts: Map<proposalId, {action, indices, createdAtVersion}>     │
  │                                                                           │
  │   HTTP+WS server (ws package) — TWO logical WS roles on one port:        │
  │     Role A: browser client  — sync_state (in) / apply_mutation (out)     │
  │     Role B: mcp-relay client — tool-call request/response (both ways)    │
  └───────────────────────────────┬───────────────────────────────────────────┘
                                   │ ws://localhost:4000  (same port, browser leg)
                                   ▼
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  React app (Vite dev server, browser)                                    │
  │  drawingStore.ts (zustand + zundo) — UNCHANGED source of truth for       │
  │  rendering/undo; on load and on every local mutation, pushes             │
  │  {rawFileText?, deletedEntityIndices, hiddenEntityIndices} to engine.ts  │
  │  On receiving apply_mutation {indices, action} from engine.ts, calls     │
  │  the NEW applyIndices() store action (still zundo-tracked)               │
  └─────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure (additions to Phase 1/2's layout)
```
src/
├── server/
│   ├── engine.ts               # NEW — HTTP+WS host; owns documentModel; started by `npm run dev`
│   ├── documentModel.ts        # NEW — server-side mirror: re-parses synced rawFileText via
│   │                            #       dxf-parser + rawTagScan + resolveAllColors (all reused, Node-safe)
│   ├── proposals.ts            # NEW — in-memory Map<proposalId, Proposal>, staleness check
│   ├── wsProtocol.ts           # NEW — shared message type definitions (both WS legs)
│   ├── index.ts                # NEW — MCP-only entry point; Claude Desktop spawns this; stateless relay
│   └── tools/
│       ├── listLayers.ts
│       ├── getStructure.ts
│       ├── applyCleanupRule.ts
│       ├── removeSelection.ts
│       ├── confirmProposal.ts
│       └── exportDxf.ts
├── lib/
│   └── engineSocket.ts         # NEW — browser-side WS client: connects to engine.ts,
│                                #       pushes sync_state, applies incoming apply_mutation
├── store/
│   └── drawingStore.ts         # EXTENDED — new `applyIndices(indices, action)` action
│                                #   (still zundo-tracked — reuses deletedEntityIndices/hiddenEntityIndices)
└── dxf/                        # UNCHANGED — rawTagScan.ts, resolveColors.ts, entityTagRanges.ts,
                                 #   exportDxf.ts (filterDxfText/validateExport only) all reused server-side
```

### Pattern 1: Two cooperating processes, not one — resolves the `npm run dev` / Claude-Desktop-spawn conflict
**What:** `engine.ts` is the only process that ever binds the HTTP/WS port; it is what `npm run dev` starts (via `concurrently`, alongside `vite`). `index.ts` is a separate, stateless script that Claude Desktop's config spawns; on startup it opens a `ws` client connection to `engine.ts` and every registered tool's handler is just "send a typed request over that socket, await the typed response."
**When to use:** Always for this phase — see Summary for the full reasoning (port-binding conflict, stdout-corruption risk).
**Why it still satisfies CONTEXT.md's decision:** CONTEXT.md's own "Specific Ideas" already names `src/server/index.ts` as "a separate entry point... that imports from the shared domain modules" — this pattern is that decision made concrete, not a deviation from it. The "shared in-memory Document Model" is real in the sense that matters (one process owns it, one logical view, real-time sync) even though it is technically two OS processes, which any stdio-based MCP integration always requires.
**Failure mode to handle explicitly:** If Claude Desktop spawns `index.ts` before `npm run dev` has started `engine.ts`, the WS client connection fails (`ECONNREFUSED`). Every tool handler must catch this and return a clear `CallToolResult` with `isError: true` and text like `"Cannot reach the DXF Demo engine server. Make sure 'npm run dev' is running, then try again."` — the same UX pattern as CONTEXT.md's mandated "No drawing loaded" message, extended to this connection-level case.

### Pattern 2: Server-side Document Model is a re-parse of synced raw text, never a serialized `IDxf`
**What:** The browser never sends its parsed `dxfData` object over the wire. It sends `rawFileText` (once, on load) and `fileName`. `engine.ts` runs the exact same pipeline `dxf.worker.ts` already runs client-side — `new DxfParser().parseSync(text)` → `rawTagScan(text)` → `resolveAllColors(...)` — independently, server-side.
**Why:** `dxf-parser`'s parse is deterministic for identical input bytes, so the server's `dxfData.entities` array is index-aligned with the browser's, with no custom serialization format to design, version, or keep in sync as entity types are added. This also sidesteps `IDxf`'s non-trivially-serializable shape (nested class-like objects) — sending plain text is simpler and more robust than sending structured data.
**What the browser syncs on every local mutation (not just on load):** `{deletedEntityIndices: number[], hiddenEntityIndices: number[], version: number}` — a monotonically increasing counter incremented client-side on every commit to those two fields (a plain `useRef`/store field, not derived from `zundo`'s internal history, which the app must not depend on for external protocol semantics). This keeps the server's mirror of *removal state* current even for manual (non-AI) edits, which is required for `get_structure`/`list_layers` to answer accurately and for the confirm-time staleness check in Pattern 4.

### Pattern 3: `apply_cleanup_rule`'s filter and `remove_selection`'s indices both resolve to the same `Proposal` shape
**What:** Both tools compute a `number[]` of matching entity indices (against the server's own `dxfData`) and hand it to a single `createProposal()` helper — they differ only in *how* the indices are computed (rule-matching vs. direct input), not in what happens after.
**Example:**
```typescript
// src/server/proposals.ts
export interface Proposal {
  id: string;
  action: 'delete' | 'hide';
  indices: number[];
  createdAtVersion: number; // documentModel.version snapshot at preview time
  createdAt: number;
  source: 'apply_cleanup_rule' | 'remove_selection';
}

const proposals = new Map<string, Proposal>();

export function createProposal(
  action: 'delete' | 'hide',
  indices: number[],
  source: Proposal['source'],
  currentVersion: number,
): Proposal {
  const proposal: Proposal = {
    id: crypto.randomUUID(), // Node 22/24 global -- no extra dependency
    action,
    indices,
    createdAtVersion: currentVersion,
    createdAt: Date.now(),
    source,
  };
  proposals.set(proposal.id, proposal);
  return proposal;
}

export function getProposal(id: string): Proposal | undefined {
  return proposals.get(id);
}

export function consumeProposal(id: string): void {
  proposals.delete(id); // one-shot: a confirmed or rejected proposal cannot be re-confirmed
}
```
```typescript
// src/server/tools/applyCleanupRule.ts (rule → indices)
function resolveFilterIndices(
  dxfData: IDxf,
  deletedEntityIndices: Set<number>,
  filter: { layer?: string; entityType?: string },
): number[] {
  return dxfData.entities
    .map((entity, index) => ({ entity, index }))
    .filter(({ entity, index }) => {
      if (deletedEntityIndices.has(index)) return false; // already gone -- never re-propose
      if (filter.layer && entity.layer !== filter.layer) return false;
      if (filter.entityType && entity.type !== filter.entityType) return false;
      return true;
    })
    .map(({ index }) => index);
}
```
**Note on `filter` shape:** CONTEXT.md's only given example is `{layer: "S-DIMS"}`; a `filter.entityType` field is a reasonable, low-risk extension matching the project's core-value language ("clean up... through a mix of layer/object selection") — but it is not itself a locked decision, tag it `[ASSUMED]` (see Assumptions Log A1) and confirm with the user during planning if precision matters.

### Pattern 4: `confirm_proposal` re-validates against the current document version before applying
**What:** Because a preview and its confirm are two separate MCP tool calls with user (or Claude) time passing in between, the document may have changed — most importantly via a *manual* delete/hide the user makes in the browser between "Claude previews a deletion" and "Claude confirms it." `confirm_proposal` must check `proposal.createdAtVersion === documentModel.version` before applying, or a confirmed deletion could silently include/exclude entities relative to what was actually previewed.
**Example:**
```typescript
// src/server/tools/confirmProposal.ts
async function handleConfirmProposal(proposalId: string) {
  const proposal = getProposal(proposalId);
  if (!proposal) {
    return errorResult(`No pending proposal with id "${proposalId}". It may have already been applied, rejected, or expired.`);
  }
  if (proposal.createdAtVersion !== documentModel.version) {
    consumeProposal(proposalId);
    return errorResult(
      'The drawing has changed since this proposal was created (a manual edit or another AI action occurred). ' +
      'Please request a new preview before confirming.',
    );
  }
  consumeProposal(proposalId);
  await applyMutationAndSync(proposal.action, proposal.indices); // pushes to browser, awaits its re-sync
  return successResult(`Applied ${proposal.action} to ${proposal.indices.length} entities.`);
}
```
**Why this matters for MCP-03:** "never risking an unreviewed destructive change" implies the preview Claude showed the user must still be accurate at confirm time — a stale-but-silently-applied confirm would violate that guarantee even though the two-step flow exists.

### Pattern 5: AI-confirmed mutations apply through a new store action, not a duplicate mutation path
**What:** `drawingStore.ts` gets one new action, `applyIndices(indices: number[], action: 'delete' | 'hide')`, that writes directly into `deletedEntityIndices`/`hiddenEntityIndices` — the same two fields `deleteSelected`/`hideSelected` already write, already covered by `zundo`'s existing `partialize` (verified: `src/store/drawingStore.ts:225-229`, read this session — `partialize` already returns exactly `{selectedEntityIndices, deletedEntityIndices, hiddenEntityIndices}`).
**Example:**
```typescript
// src/store/drawingStore.ts — new action, same shape as deleteSelected/hideSelected
applyIndices: (indices: number[], action: 'delete' | 'hide') => {
  set((state) => {
    const targetSet = action === 'delete'
      ? new Set(state.deletedEntityIndices)
      : new Set(state.hiddenEntityIndices);
    for (const index of indices) targetSet.add(index);
    return action === 'delete'
      ? { deletedEntityIndices: targetSet }
      : { hiddenEntityIndices: targetSet };
  });
  // re-sync the new state back to engine.ts so its `version` mirror stays current (Pattern 2)
  engineSocket.syncState();
},
```
**Why no new undo-stack code is needed:** `applyIndices` mutates the exact fields `zundo`'s `temporal()` middleware is already watching — Ctrl+Z after an AI-applied deletion works identically to Ctrl+Z after a manual one, satisfying CONTEXT.md's "AI-proposed deletions flow through the same undo/redo stack as manual deletions" with zero changes to the undo/redo wiring itself.

### Anti-Patterns to Avoid
- **Writing anything to `process.stdout` from `src/server/index.ts` or any module it imports** — corrupts the MCP JSON-RPC stream (Pattern 1's whole reason for existing). Use `console.error` (writes to stderr, safe) or nothing.
- **Trying to run the MCP stdio server and the browser-facing HTTP/WS server in one process** — creates the `EADDRINUSE` conflict described in Summary/Pattern 1 the moment both `npm run dev` and a Claude-Desktop-spawned instance are alive at once.
- **Serializing `dxfData` (the parsed `IDxf` object) over WebSocket instead of re-parsing `rawFileText` server-side** — fragile, versioned-format problem for no benefit; `dxf-parser` is cheap enough to run twice on KB–low-MB structural files (Pattern 2).
- **Reusing `exportDxf.ts`'s `saveDxf()` for the `export_dxf` MCP tool** — it calls `window.showSaveFilePicker`, which does not exist in Node; use `fs.writeFile` directly against `filterDxfText`'s output.
- **Applying a confirmed proposal's stored indices without re-checking `documentModel.version`** — Pattern 4's staleness check exists specifically to prevent this.
- **Letting `applyIndices` bypass zustand's `set()`** (e.g., mutating a `Set` in place and calling `set({})` with no new reference) — zustand/zundo change detection requires a new object/Set reference, same convention `deleteSelected`/`hideSelected` already follow (verified: both existing actions construct `new Set(state.X)` before mutating).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MCP JSON-RPC protocol framing, tool/schema registration, stdio transport | A hand-rolled stdin/stdout JSON-RPC reader | `@modelcontextprotocol/sdk`'s `McpServer` + `registerTool` + `StdioServerTransport` | Official SDK, already locked project-wide; verified this session against the actual published `.d.ts` |
| WebSocket server/client framing | Raw `net.Socket` + hand-rolled WS handshake/frame parsing | `ws` | Ubiquitous, battle-tested; Node has no built-in WS server |
| Running two long-lived dev processes from one npm script, cross-shell-portably | A bespoke `&&`/background-process shell script | `concurrently` | This repo's dev environment mixes PowerShell and bash (per environment notes) — a hand-rolled shell script would not be portable across both, `concurrently` is Node-based and shell-agnostic |
| DXF surgical export filtering, color resolution, unknown-entity scanning | Re-implementing any of this server-side | Reuse `rawTagScan.ts`/`resolveColors.ts`/`entityTagRanges.ts`/`exportDxf.ts`'s pure functions verbatim | Already built, tested, and verified Node-safe this session — CONTEXT.md explicitly calls for reuse ("reuses existing code") |

**Key insight:** Unlike Phase 1/2 (where the hand-roll-shaped problems were forced by `dxf-parser` gaps), Phase 3's genuinely-custom pieces are narrow and process-topology-shaped, not algorithm-shaped: the two-process relay pattern (Pattern 1) and the proposal/version staleness check (Pattern 4) are bespoke to this project's specific "stdio MCP + browser WS + shared mutable state" combination — no library solves "safely bridge a Claude-Desktop-spawned stdio process into an already-running local dev server's in-memory state." Budget this as first-class design work, not glue code.

## Common Pitfalls

### Pitfall 1: `stdout` corruption silently breaks Claude Desktop's connection to the MCP server
**What goes wrong:** Any `console.log(...)` call (a stray debug statement, a library's default logger, an uncaught promise rejection's default Node printout in some configurations) inside `src/server/index.ts` or any module it imports writes to `process.stdout`, which `StdioServerTransport` is simultaneously reading/writing as the JSON-RPC channel — the client (Claude Desktop) receives malformed JSON-RPC frames and the tool connection silently fails or hangs, often with no clear error surfaced to the user.
**Why it happens:** `StdioServerTransport` uses `process.stdin`/`process.stdout` directly for protocol framing [VERIFIED: `stdio.d.ts` class docstring, this session]; Node's `console.log`/`console.info` also write to `process.stdout` by default — there is no isolation between "my debug print" and "the protocol channel" unless the developer is deliberate about it.
**How to avoid:** Ban `console.log`/`console.info` in `src/server/index.ts` and everything it imports; use `console.error` (writes to `stderr`, which Node's own `console.error`/`console.warn` route to by standard Node console semantics — safe, does not touch the protocol channel) for any diagnostic output. Note `dxf-parser`'s own `loglevel`-based warnings already default to `console.error`/`console.warn` (established in Phase 1 research), so this is not a new risk from that dependency — the risk is entirely from *new* Phase 3 code and its imports.
**Warning signs:** Claude Desktop shows the MCP server as connected but tool calls hang indefinitely or return a parse error; nothing in the app itself indicates a problem.

### Pitfall 2: Two OS processes racing to bind the same port
**What goes wrong:** If `src/server/index.ts` (the MCP entry) is mistakenly written to also start its own HTTP/WS listener (rather than connecting as a client to `engine.ts`), running `npm run dev` and then having Claude Desktop spawn the MCP server produces an `EADDRINUSE` crash in whichever process binds second.
**Why it happens:** CONTEXT.md's literal "single Node process" wording invites exactly this design if read too literally — see Summary and Pattern 1 for the full reasoning on why two cooperating processes is the correct resolution.
**How to avoid:** `src/server/index.ts` never calls `.listen()`; it only ever opens an outbound `ws` client connection to `engine.ts`.
**Warning signs:** `npm run dev` works fine standalone; the moment Claude Desktop is also configured and connects, one of the two processes crashes with `EADDRINUSE`.

### Pitfall 3: A confirmed proposal applies to entities that no longer mean what they meant at preview time
**What goes wrong:** Claude previews "delete these 12 entities on layer S-DIMS," the user manually deletes 3 of those same entities in the browser UI while deciding whether to approve, then Claude confirms — without a staleness check, the confirm either double-deletes (harmless but confusing) or, in a rule-based scenario where indices could theoretically shift, could apply to the wrong set entirely.
**Why it happens:** The two-step preview/confirm flow is, by design, split across two separate tool calls with real time (and potentially real user action) passing between them — nothing about the MCP protocol itself guarantees the document is unchanged.
**How to avoid:** Pattern 4's `createdAtVersion` check, incremented on every committed mutation (browser or AI-driven) and synced to the server.
**Warning signs:** A confirmed deletion count doesn't match what was shown in the original preview, or Claude reports success on entities the user already removed manually.

### Pitfall 4: Claude Desktop's config `cwd` is not guaranteed — relative paths in `args` will resolve against the wrong directory
**What goes wrong:** A `claude_desktop_config.json` snippet using a relative path like `"args": ["tsx", "src/server/index.ts"]` may fail to find the file, because Claude Desktop spawns the process with its own working directory, not necessarily the project root [CITED: WebSearch aggregation of current `claude_desktop_config.json` schema documentation — the schema documents `command`/`args`/`env`; no `cwd` field is consistently documented across sources, MEDIUM confidence, not independently verified against a single primary spec this session].
**How to avoid:** The README's `claude_desktop_config.json` snippet must use an **absolute path** to the entry script (e.g., `"args": ["tsx", "D:/absolute/path/to/dxf-demo/src/server/index.ts"]`), and document that the user must substitute their own clone path.
**Warning signs:** Claude Desktop shows the MCP server as failed/disconnected immediately on startup, with a "file not found" style error in Claude Desktop's own logs.

### Pitfall 5: `tsconfig.app.json`'s `include: ["src"]` sweeps in `src/server/**`, but has no Node lib
**What goes wrong:** `tsconfig.app.json` (verified this session: `"lib": ["ESNext", "DOM", "DOM.Iterable"]`, `"include": ["src"]`) will attempt to type-check every file under `src/`, including the new `src/server/**` directory, without Node-specific `lib` entries. `@types/node` (already a devDependency) provides ambient globals (`process`, `Buffer`, `crypto.randomUUID`) largely independent of the `lib` array, so this may silently "work," but it is fragile and mixes server-only code into the client (Vite) project's type-check scope.
**How to avoid:** Add a dedicated `tsconfig.server.json` (mirroring the existing `tsconfig.node.json` pattern used for `vite.config.ts`: `target: "ESNext"`, `module: "ESNext"`, Node-appropriate settings, `"include": ["src/server"]`), exclude `src/server` from `tsconfig.app.json`, and add it as a third `path` entry in the root `tsconfig.json`'s `references` array.
**Warning signs:** `tsc -b` (the project's `build` script) either fails obscurely on server files or silently type-checks them against the wrong `lib`, masking real errors.

### Pitfall 6: ESLint's browser+worker globals don't cover Node globals in `src/server/**`
**What goes wrong:** `eslint.config.js` (verified this session) sets `languageOptions.globals: {...globals.browser, ...globals.worker}` for all `**/*.{ts,tsx}` files — no `globals.node`. Lint will flag `process`, `__dirname`, etc. as undefined in `src/server/**` files (or, depending on the specific rule set, simply fail to recognize legitimate Node-only patterns).
**How to avoid:** Add a second ESLint config block scoped to `files: ['src/server/**/*.ts']` with `globals: globals.node` (and no `globals.browser`/`globals.worker`, since server code should never reference `window`/`self`).
**Warning signs:** `npm run lint` reports `no-undef`-style errors on `process`/`__dirname` inside `src/server/**`.

## Code Examples

### McpServer + registerTool + StdioServerTransport (verified against the actual published SDK)
```typescript
// src/server/index.ts
// Source: verified directly against @modelcontextprotocol/sdk@1.30.0's published
// dist/esm/server/mcp.d.ts and dist/esm/server/stdio.d.ts (downloaded and read this
// session — NOT from a WebSearch summary, which incorrectly referenced a nonexistent
// "@modelcontextprotocol/server" package name for this same API).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod';

const server = new McpServer({ name: 'dxf-demo', version: '0.1.0' });

server.registerTool(
  'list_layers',
  {
    description: 'List all layers in the currently loaded DXF drawing, with color, entity count, and frozen/locked state.',
    inputSchema: {}, // zero-argument tool -- empty raw shape, per verified ZodRawShapeCompat = Record<string, AnySchema>
  },
  async () => {
    const layers = await requestFromEngine('list_layers', {});
    return { content: [{ type: 'text', text: JSON.stringify(layers, null, 2) }] };
  },
);

server.registerTool(
  'apply_cleanup_rule',
  {
    description: 'Preview a delete/hide rule against layer and/or entity type filters. Returns a proposal_id -- call confirm_proposal to apply.',
    inputSchema: {
      action: z.enum(['delete', 'hide']),
      filter: z.object({
        layer: z.string().optional(),
        entityType: z.string().optional(),
      }),
    },
  },
  async ({ action, filter }) => {
    const preview = await requestFromEngine('apply_cleanup_rule', { action, filter });
    return { content: [{ type: 'text', text: JSON.stringify(preview, null, 2) }] };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport); // "assumes ownership of the Transport" -- verified mcp.d.ts docstring
}

main().catch((err) => {
  console.error(err); // stderr -- safe, does NOT corrupt the stdout JSON-RPC channel (Pitfall 1)
  process.exit(1);
});
```

### `fs.writeFile`-based `export_dxf` (server-side, replaces browser's `saveDxf`)
```typescript
// src/server/tools/exportDxf.ts
import { writeFile } from 'node:fs/promises';
import { filterDxfText, validateExport } from '../../dxf/exportDxf'; // reused, pure functions only

async function handleExportDxf(filePath: string) {
  if (!documentModel.rawFileText) {
    return errorResult('No drawing loaded. Please load a DXF file in the viewer first.'); // verbatim CONTEXT.md string
  }
  const filtered = filterDxfText(documentModel.rawFileText, documentModel.entityRanges, documentModel.deletedEntityIndices);
  const expectedCount = documentModel.dxfData.entities.length - documentModel.deletedEntityIndices.size;
  if (!validateExport(filtered, expectedCount)) {
    return errorResult('Export validation failed -- the filtered DXF did not re-parse to the expected entity count. No file was written.');
  }
  await writeFile(filePath, filtered, 'utf-8'); // Node fs -- NOT the browser's showSaveFilePicker/saveDxf
  return successResult(`Exported cleaned DXF to ${filePath}.`);
}
```

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `apply_cleanup_rule`'s `filter` accepts an `entityType` field in addition to CONTEXT.md's literal `{layer: "..."}` example | Architecture Patterns Pattern 3 | Low — additive, backward-compatible with the locked example; if the user only ever wants layer-based rules, the extra field is simply unused, no rework needed |
| A2 | Two-process design (Engine Server + thin stdio MCP relay) correctly satisfies CONTEXT.md's "Shared Node process... same in-memory Document Model" decision | Summary, Architecture Patterns Pattern 1 | **Medium-High** — this is a judgment call reconciling a literal wording conflict (see Summary); if the user intended something more literal (e.g., accepting that `npm run dev` and Claude Desktop usage are mutually exclusive, always running the identical single-process script), the planner should confirm this interpretation explicitly before building, since it affects the file layout of nearly every Phase 3 task |
| A3 | The MCP tool set is 6 tools (5 named in MCP-01 plus `confirm_proposal` named separately in CONTEXT.md's Decisions/Specific Ideas) | Phase Requirements, Open Question 1 | **High** — if the intended reading is literally 5 tools with confirmation folded into `apply_cleanup_rule`/`remove_selection` via a `confirmed: boolean` parameter instead of a separate tool, several Architecture Patterns (3, 4) and Code Examples need restructuring; flagged prominently, see Open Question 1 |
| A4 | The Engine Server's WS port (`4000` used in examples) is arbitrary and not otherwise constrained by CONTEXT.md | Architecture Patterns diagram | Low — trivial to change to any free local port; recommend an env var override (`ENGINE_PORT`) regardless |
| A5 | A `version: number` counter (incremented on every browser-side commit to `deletedEntityIndices`/`hiddenEntityIndices`) is an acceptable, sufficient staleness signal for Pattern 4's confirm-time check, rather than a more granular per-entity or hash-based diff | Architecture Patterns Pattern 4 | Low-Medium — a simple monotonic counter cannot distinguish "the document changed in a way that doesn't affect this proposal's entities" from "the document changed in a way that does," so it will occasionally force an unnecessary re-preview (safe but mildly annoying) rather than ever silently applying a stale proposal (the failure mode that actually matters for MCP-03) |

**If this table is empty:** N/A — see entries above.

## Open Questions

1. **Is `confirm_proposal` a 6th named MCP tool, or should confirmation be folded into `apply_cleanup_rule`/`remove_selection` as a `confirmed`/`proposal_id` parameter, keeping the tool count at exactly 5?**
   - What we know: MCP-01 in REQUIREMENTS.md literally enumerates 5 tools by name and does not mention `confirm_proposal`. CONTEXT.md's Decisions and Specific Ideas sections both explicitly name `confirm_proposal` as its own tool ("a second `confirm_proposal` call applies it"; "The `confirm_proposal` tool is the key safety mechanism").
   - What's unclear: Whether "5 MCP tools" in MCP-01/CONTEXT.md's Decisions section is a stale summary written before the two-step flow was fully designed out in the same discussion, or a hard constraint the planner must preserve (e.g., by making `apply_cleanup_rule`/`remove_selection` themselves accept an optional `confirmed: boolean` + `proposal_id` to close the loop without a 6th tool name).
   - Recommendation: This research (and all Code Examples/Architecture Patterns above) assumes `confirm_proposal` is a genuine 6th tool, since that reading is unambiguous in CONTEXT.md's own explanatory text and is the simpler, more MCP-idiomatic design (each tool call does one clear thing). Confirm this explicitly with the user before planning locks in the tool list — this is the single highest-leverage ambiguity in the phase.

2. **Should the browser require an active Engine Server WS connection before allowing file load, or should the WS sync happen best-effort/asynchronously?**
   - What we know: CONTEXT.md says the app "pushes current drawing state when loaded" — implying sync happens automatically after load succeeds, not that load is blocked on the Engine Server being reachable.
   - What's unclear: Whether the UI should surface a visible "not connected to engine server" state (so the user knows AI tools won't work yet) or fail silently until the user actually tries to use Claude Desktop.
   - Recommendation: Best-effort, non-blocking sync (file loading/manual cleanup must keep working even if `engine.ts` isn't running, per Phase 1/2's client-only design) but surface a small, unobtrusive connection-status indicator — low cost, meaningfully improves the "why isn't Claude seeing my drawing" debugging experience. Not a locked decision; flag for planner discretion.

3. **Single active browser session assumption**
   - What we know: PROJECT.md scopes this as a single-user local tool; nothing in CONTEXT.md addresses multiple simultaneous browser tabs/connections to the Engine Server.
   - What's unclear: Desired behavior if a second browser tab connects while a first is already syncing a document (reject the second, or let it silently replace the first as "the" active session).
   - Recommendation: MVP-scope this as "last-connected browser tab wins" (a single `activeConnection` reference in `engine.ts`, replaced on new connection) — document as an accepted limitation, not a bug, consistent with the single-user premise.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Engine Server, MCP relay process | Yes | v22.19.0 [VERIFIED: `node -e "console.log(process.version)"`, run this session] | CLAUDE.md targets 24.x (Active LTS); 22.19.0 exceeds `@modelcontextprotocol/sdk`'s own `"engines": {"node": ">=18"}` [VERIFIED: SDK `package.json`] and `ws`/`tsx`/`concurrently`'s typical minimums — no functional blocker, only a version-label mismatch against CLAUDE.md's stated target |
| Claude Desktop | End-to-end MCP integration testing (manual, human-in-the-loop) | Not verified this session — no automated check possible for a separate desktop application | — | This is inherently a manual/human verification step; the planner should schedule a `checkpoint:human-verify` or equivalent for "connect Claude Desktop and confirm all 6 tools appear/respond" |
| A free local TCP port for the Engine Server (e.g. 4000) | `engine.ts` binding | Not checked this session (no reliable way to probe "is this port free right now" meaningfully in research — state at execution time may differ) | — | Use an env var (`ENGINE_PORT`) with a documented default, so a conflict is a one-line fix rather than a hardcoded blocker |

**Missing dependencies with no fallback:** None — every new npm dependency is available on the registry and version-verified.
**Missing dependencies with fallback:** Node version mismatch (22.19.0 vs. CLAUDE.md's 24.x target) — no functional fallback needed, purely a label mismatch per the `engines` check above.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Single-user local tool; no auth surface introduced by adding a local WS/MCP bridge |
| V3 Session Management | Partial | The Engine Server's "single active browser connection" (Open Question 3) is a lightweight session concept, not a security session — no credentials involved |
| V4 Access Control | Yes | The Engine Server's HTTP/WS listener **must bind to `127.0.0.1` only, never `0.0.0.0`** — binding to all interfaces would expose the Document Model's mutation API (including `export_dxf`'s filesystem write) to anyone else on the same local network/Wi-Fi, which is out of scope for a "single-user local tool" (PROJECT.md constraint) |
| V5 Input Validation | Yes | Zod schemas already required by CONTEXT.md validate tool *shape*; additionally, `export_dxf`'s `filePath` argument is Claude-Desktop-controlled and writes to the local filesystem — see Known Threat Patterns below |
| V6 Cryptography | No | No cryptographic operations introduced |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| WebSocket connections do not enforce the same-origin policy the way `fetch`/`XMLHttpRequest` do — any page open in the same browser (including a malicious one, if the user has it open in another tab) can attempt to open a WS connection to `ws://localhost:4000` from client-side JS [CITED: well-documented general WebSocket security consideration — "localhost WS hijack" — training-knowledge/aggregated, not independently verified against a single primary source this session, MEDIUM confidence] | Spoofing / Elevation of Privilege | The Engine Server's `ws` `WebSocketServer` should implement `verifyClient` checking the `Origin` header against the known Vite dev server origin (e.g. `http://localhost:5173`) before accepting the browser-leg connection, rejecting anything else |
| `export_dxf`'s `filePath` is an LLM-controlled string that results in a real filesystem write | Tampering (unintended overwrite) | Validate before writing: require the path to end in `.dxf`; resolve to an absolute, normalized path and reject any resulting path that traverses outside a reasonable base (e.g., reject paths containing `..` after normalization, or explicitly confirm with the user via the MCP-03 "no unreviewed destructive change" principle that arbitrary-path writes are acceptable for this local single-user tool). At minimum: never silently overwrite the currently-loaded source file without it being unambiguous from the tool's description/preview that this is what will happen |
| A pathologically large `entityIndices` array in `remove_selection`'s input | Denial of Service | Bound the zod schema: `z.array(z.number().int().nonnegative()).max(50_000)` (well above any realistic structural-drawing entity count per this project's own scalability research, but bounded nonetheless) |
| `apply_cleanup_rule`'s `filter` matching zero entities is treated as a valid (empty) proposal, not an error | (N/A — correctness, not security) | Note only: an empty-match preview should say so clearly ("0 entities match this filter") rather than silently succeeding with nothing to confirm, avoiding user/Claude confusion about whether the rule "worked" |
| Malformed/adversarial `rawFileText` re-parsed server-side (same input class Phase 1/2 already treat as untrusted) | Denial of Service | Same mitigation already established in Phase 1/2: wrap `dxf-parser.parseSync()` and the raw-tag scan in try/catch, never let a parse failure crash `engine.ts` — a crashed Engine Server drops both the browser connection and every in-flight MCP tool call |

## Project Constraints (from CLAUDE.md)

- MCP server stack is locked: `@modelcontextprotocol/sdk@1.30.0`, `zod@4.4.3`, `StdioServerTransport`, Node.js 24.x (Active LTS) — all confirmed current and mutually compatible this session; local dev Node is 22.19.0 (functionally sufficient, see Environment Availability).
- Frontend stack unchanged: React 19.2.8, TypeScript 6.0.3 (not 7.x), Vite 8.2.2, `@vitejs/plugin-react-swc` 4.3.3 — no new frontend build-tool decisions needed this phase.
- DXF parsing/export: `dxf-parser@1.1.2` and Phase 1/2's pure modules (`rawTagScan.ts`, `resolveColors.ts`, `entityTagRanges.ts`, `exportDxf.ts`'s filter/validate functions) reused server-side verbatim — no new parsing/export library.
- State: `zustand@5.0.15` + `zundo@2.3.0` — extended with one new action (`applyIndices`), not replaced or restructured.
- GSD workflow enforcement: file-changing work must go through a GSD command (`/gsd-execute-phase` etc.), not direct ad-hoc edits.

## Sources

### Primary (HIGH confidence)
- `@modelcontextprotocol/sdk@1.30.0`'s actual published package — downloaded via `npm pack` and read directly this session: `dist/esm/server/mcp.d.ts` (`McpServer`, `registerTool` full signature), `dist/esm/server/stdio.d.ts` (`StdioServerTransport`, its stdin/stdout docstring), `dist/esm/server/zod-compat.d.ts` (`ZodRawShapeCompat`/`AnySchema` — confirms both raw-shape and full-`z.object()` inputs are accepted), `dist/esm/server/index.d.ts` (confirms `McpServer` is NOT re-exported from `./server`, must be imported from `./server/mcp.js` directly), `package.json` (`peerDependencies.zod`, `engines.node`, full `exports` map)
- `registry.npmjs.org` via `npm view` — direct version checks this session for `@modelcontextprotocol/sdk`, `zod`, `ws`, `concurrently`, `tsx`
- This project's own source, read directly this session: `src/store/drawingStore.ts`, `src/dxf/exportDxf.ts`, `src/dxf/entityTagRanges.ts`, `src/dxf/rawTagScan.ts`, `src/dxf/resolveColors.ts`, `src/dxf/dxf.worker.ts`, `vite.config.ts`, `tsconfig.json`/`tsconfig.app.json`/`tsconfig.node.json`, `eslint.config.js`, `package.json`, `.planning/research/ARCHITECTURE.md`
- `node --input-type=module -e "import DxfParser from 'dxf-parser'; ..."` — direct confirmation this session that `dxf-parser` loads under plain Node (not just inside a browser Worker)

### Secondary (MEDIUM confidence)
- WebSearch aggregation on current `claude_desktop_config.json` schema fields (`command`/`args`/`env`, no consistently-documented `cwd`) — cross-checked across multiple non-primary sources, not a single official schema document

### Tertiary (LOW confidence)
- WebSearch/general-knowledge on WebSocket same-origin-policy behavior ("localhost WS hijack") — well-established security consideration, not independently verified against a single primary source this session
- An initial WebFetch attempt against the SDK's GitHub README returned a plausible-looking but **incorrect** import path (`@modelcontextprotocol/server` instead of the real `@modelcontextprotocol/sdk`) — discarded in favor of directly reading the actual published package (see Primary sources); flagged here as a caution against trusting AI-summarized fetches for exact import paths without cross-checking against the real package

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every new dependency version verified directly against the live npm registry this session; MCP SDK API verified against the actual downloaded/extracted package, not documentation summaries
- Architecture (two-process relay design, proposal/version staleness check): MEDIUM-HIGH — this is this researcher's synthesis resolving a genuine wording conflict in CONTEXT.md (see Open Question 1 and Assumption A2), grounded in verified SDK mechanics (`StdioServerTransport`'s stdin/stdout ownership) and this project's actually-read existing code, but it is a design judgment call, not a documented external best practice — flagged prominently for user/planner confirmation
- Pitfalls: HIGH for Pitfalls 1, 5, 6 (directly source-verified against the SDK/this project's actual config files this session); MEDIUM for Pitfalls 2, 3 (reasoned from verified building blocks, not exercised end-to-end against a running Claude Desktop instance); MEDIUM for Pitfall 4 (WebSearch-aggregated, not a single primary source)

**Research date:** 2026-08-24
**Valid until:** 30 days (MCP SDK is a fast-moving package — re-verify `registerTool`/`StdioServerTransport` signatures if upgrading past 1.30.0; DXF-side reused modules are stable per Phase 1/2's own 30-day validity windows)
