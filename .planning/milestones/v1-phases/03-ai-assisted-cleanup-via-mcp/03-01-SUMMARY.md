---
phase: 03-ai-assisted-cleanup-via-mcp
plan: 01
subsystem: api
tags: [mcp, websocket, node, dxf-parser, tsx, concurrently, modelcontextprotocol-sdk]

# Dependency graph
requires:
  - phase: 02-manual-cleanup-and-export
    provides: "rawTagScan.ts, resolveColors.ts, aciColorIndex.ts (pure, Node-safe DXF domain modules) reused verbatim server-side"
provides:
  - "Two-process MCP architecture: Engine Server (WS host, owns DocumentModel) + stateless MCP relay (stdio, Claude-Desktop-spawned)"
  - "src/server/documentModel.ts server-side document mirror re-parsing synced rawFileText"
  - "src/server/wsProtocol.ts typed WS message contract (sync_state / tool_request / tool_response)"
  - "list_layers tool proven end-to-end through the full relay path"
  - "tsconfig.server.json + eslint.config.js Node-only scope for src/server"
  - "npm run dev running Vite + Engine Server together via concurrently"
affects: ["03-02 (remaining 5 MCP tools build on this same relay/dispatch pattern)"]

# Actuals (#2632)
actuals:
  tokens: 5500
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: ["@modelcontextprotocol/sdk@1.30.0", "ws@8.21.3", "concurrently@10.0.5", "tsx@4.23.12", "@types/ws"]
  patterns:
    - "Two cooperating OS processes (Engine Server + MCP relay) instead of one, to reconcile Claude Desktop's stdio spawn model with a browser-facing dev server on the same machine"
    - "Server never receives a serialized IDxf over the wire -- it re-parses the browser's exact rawFileText bytes independently, so entity-index alignment is guaranteed by identical input rather than a custom wire format"
    - "tool_request/tool_response WS message pairing via requestId, resolved through a pending-request Map on the relay side"

key-files:
  created:
    - src/server/engine.ts
    - src/server/index.ts
    - src/server/documentModel.ts
    - src/server/wsProtocol.ts
    - src/server/tools/listLayers.ts
    - tsconfig.server.json
  modified:
    - package.json
    - tsconfig.json
    - tsconfig.app.json
    - eslint.config.js
    - .gitignore

key-decisions:
  - "Reused dxf-parser + rawTagScan + resolveAllColors verbatim server-side, matching RESEARCH Pattern 2 -- no custom serialization format needed"
  - "verifyClient accepts localhost/127.0.0.1 origins on any port plus no-origin connections (covers the plain Node ws client used by the MCP relay)"
  - "tsx requires --tsconfig to be passed AFTER the `watch` subcommand, not before -- corrected in a follow-up commit after literally running npm run dev caught the bug"

patterns-established:
  - "Tool dispatch in engine.ts is a single switch statement keyed on tool name, checked against documentModel.isLoaded first -- every future tool (Plan 02) slots into this same dispatch point"
  - "ESLint scopes browser/worker globals out of src/server/** via ignores on the general block plus a dedicated Node-globals block, since flat-config languageOptions.globals merge additively across matching blocks rather than override"

requirements-completed: []  # MCP-01 is shared with 03-02 (not yet summarized) -- see Requirements note below; not marked complete yet per shared-ID gate

coverage:
  - id: D1
    description: "Engine Server binds ws://127.0.0.1:4000 (ENGINE_PORT-overridable), logs a ready message to stderr, rejects non-localhost WS origins with HTTP 401"
    requirement: "MCP-01"
    verification:
      - kind: manual_procedural
        ref: "npx tsx --tsconfig tsconfig.server.json src/server/engine.ts (stderr showed '[engine] ready on ws://127.0.0.1:4000', stdout empty); ws client connect with Origin: http://evil.example.com rejected with status 401"
        status: pass
    human_judgment: false
  - id: D2
    description: "MCP relay (src/server/index.ts) is a stateless stdio process registering list_layers via McpServer + StdioServerTransport, relaying calls to the Engine Server over a ws client connection"
    requirement: "MCP-01"
    verification:
      - kind: manual_procedural
        ref: "npx tsx --tsconfig tsconfig.server.json src/server/index.ts with empty stdin pipe -- stdout stayed empty (no JSON-RPC corruption), process blocked correctly awaiting stdio input; npm run build type-checked registerTool() call against the real SDK's published .d.ts"
        status: pass
    human_judgment: true
    rationale: "The literal MCP JSON-RPC handshake with a real Claude Desktop instance was not exercised -- no automated check is possible for a separate desktop application (RESEARCH Environment Availability). The relay's WS-client leg to the engine was verified via D3's round trip using the identical tool_request/tool_response shape the relay's handler sends."
  - id: D3
    description: "list_layers returns real layer names, ACI-resolved colors, live entity counts (excluding deleted), and frozen/locked flags, computed server-side from a synced rawFileText"
    requirement: "MCP-01"
    verification:
      - kind: integration
        ref: "WS client sent sync_state with test/fixtures/simple.dxf (2 LINEs on LAYER_RED, 1 on LAYER_BLUE) then tool_request list_layers -- response: LAYER_RED #FF0000 count=2, LAYER_BLUE #0000FF count=1, frozen/locked both false, matching the fixture exactly"
        status: pass
      - kind: integration
        ref: "tool_request list_layers sent to a fresh engine with no prior sync_state -- response error text exactly 'No drawing loaded. Please load a DXF file in the viewer first.' (verbatim CONTEXT.md string)"
        status: pass
      - kind: integration
        ref: "sync_state sent with deliberately malformed DXF text ('not a valid dxf at all !!! $$$') -- engine survived, documentModel stayed unloaded, subsequent list_layers correctly reported 'No drawing loaded' rather than crashing (T-03-05 mitigation)"
        status: pass
    human_judgment: false
  - id: D4
    description: "npm run dev starts both Vite and the Engine Server together via concurrently"
    requirement: "MCP-01"
    verification:
      - kind: manual_procedural
        ref: "npm run dev -- stdout showed '[engine] ready on ws://127.0.0.1:4000' and Vite's 'ready in 450 ms' / Local http://localhost:5173/ lines together; a first attempt with --tsconfig placed before the watch subcommand crashed the engine leg, fixed in commit f4c5451 and re-verified"
        status: pass
    human_judgment: false

duration: 55min
completed: 2026-08-24
status: complete
---

# Phase 3 Plan 01: Two-Process MCP Architecture with list_layers Tracer Summary

**Engine Server (WS host on 127.0.0.1:4000) + stateless MCP relay (stdio) proven end-to-end with a real list_layers round trip against a hand-built DXF fixture, resolving CONTEXT.md's single-process wording into the two-cooperating-processes design RESEARCH recommended.**

## Performance

- **Duration:** ~55 min (across a package-legitimacy checkpoint and a tracer-verification checkpoint, both approved)
- **Started:** 2026-08-24T13:00:00Z (approx)
- **Completed:** 2026-08-24T13:56:00Z
- **Tasks:** 2 (Task 1: package-legitimacy checkpoint; Task 2: tracer implementation)
- **Files modified:** 12 (6 created, 6 modified)

## Accomplishments
- Engine Server (`src/server/engine.ts`) binds `127.0.0.1:4000`, owns a single in-memory `DocumentModel`, rejects non-localhost WS origins, never crashes on malformed DXF input
- MCP relay (`src/server/index.ts`) is a stateless stdio process that would be spawned by Claude Desktop -- registers `list_layers` via `McpServer`/`registerTool`, relays every call over a `ws` client connection to the engine, never writes to stdout
- `documentModel.ts` re-parses the browser's synced `rawFileText` server-side using the exact same `dxf-parser` + `rawTagScan` + `resolveAllColors` pipeline `dxf.worker.ts` already runs client-side -- verified index-aligned via a real fixture round trip
- `npm run dev` runs Vite and the Engine Server together via `concurrently`
- TypeScript (`tsconfig.server.json`, third project reference) and ESLint (`src/server/**/*.ts` Node-only block) correctly separate browser and server type-check/lint scopes

## Task Commits

1. **Task 1: Verify package legitimacy before installing new dependencies** - checkpoint only (no code commit) - user approved all 5 packages
2. **Task 2: End-to-end "list_layers" tracer** - `ef7f7be` (feat)
3. **Follow-up fix found while verifying `npm run dev` end-to-end** - `f4c5451` (fix)

**Plan metadata:** (this commit)

## Files Created/Modified
- `src/server/engine.ts` - Engine Server: WS host, origin verification, tool dispatch, sync_state/tool_request handling
- `src/server/index.ts` - MCP relay: StdioServerTransport, registerTool('list_layers'), WS client to engine with request/response pairing
- `src/server/documentModel.ts` - Server-side document mirror: re-parse, layer info computation, defensive try/catch around parsing
- `src/server/wsProtocol.ts` - Typed WS message definitions (sync_state, tool_request, tool_response)
- `src/server/tools/listLayers.ts` - Pure list_layers handler function
- `tsconfig.server.json` - Node-target TS config for src/server, `@/*` alias, no DOM lib
- `tsconfig.json` - Added tsconfig.server.json as a third project reference
- `tsconfig.app.json` - Excludes src/server from the browser type-check scope
- `eslint.config.js` - Added a Node-only `src/server/**/*.ts` block (globals.node, no browser/worker)
- `package.json` - New dependencies; `dev` script now runs Vite + Engine Server via concurrently
- `.gitignore` - Added `.claude/worktrees/` (discovered untracked and unignored this session)

## Decisions Made
- Two cooperating OS processes (not one) resolve the port-binding/stdio-ownership conflict between `npm run dev` and Claude Desktop's spawn model -- RESEARCH Pattern 1, confirmed as the correct reading of CONTEXT.md's "shared Node process" wording (Assumption A2)
- `verifyClient` accepts localhost/127.0.0.1 origins on any port (covers Vite's dev port) plus no-origin connections (the plain Node `ws` client the MCP relay uses never sends an Origin header)
- Server-side document model is always a fresh re-parse of synced raw text, never a serialized `IDxf` -- avoids designing/versioning a custom wire format

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `tsx` could not resolve the `@/*` tsconfig path alias at runtime**
- **Found during:** Task 2 (manual verification of `npx tsx src/server/engine.ts`)
- **Issue:** The root `tsconfig.json` has no `compilerOptions.paths` (only `references`); `tsx`'s `get-tsconfig`-based path resolution walked up from `src/server/` to the root and found no alias, so `import ... from '@/dxf/rawTagScan'` failed with `ERR_MODULE_NOT_FOUND`
- **Fix:** Pass `--tsconfig tsconfig.server.json` explicitly to every `tsx` invocation (the `dev` script's `tsx watch` command, and manual verification commands)
- **Files modified:** package.json
- **Verification:** Engine Server started cleanly and logged its ready message
- **Committed in:** ef7f7be (Task 2 commit)

**2. [Rule 1 - Bug] `--tsconfig` flag placed before the `watch` subcommand crashed the engine leg of `npm run dev`**
- **Found during:** post-commit verification of the actual `npm run dev` script (not just running `tsx` directly against `engine.ts`)
- **Issue:** `tsx`'s CLI requires `--tsconfig` to follow the `watch` subcommand (`tsx watch [flags...] <script>`), not precede it; with the flag first, `tsx` treated the literal string `"watch"` as the entry script path and crashed with `ERR_MODULE_NOT_FOUND: Cannot find module '.../watch'`
- **Fix:** Reordered to `tsx watch --tsconfig tsconfig.server.json src/server/engine.ts`
- **Files modified:** package.json
- **Verification:** Ran `npm run dev` end-to-end -- both `[engine] ready on ws://127.0.0.1:4000` and Vite's `Local: http://localhost:5173/` appeared together
- **Committed in:** f4c5451 (separate follow-up fix commit)

**3. [Rule 1 - Bug] ESLint flat-config globals merge additively, not by override, across matching blocks**
- **Found during:** Task 2, writing the Node-only ESLint block
- **Issue:** Simply adding a `src/server/**/*.ts` block with `globals.node` would NOT exclude `globals.browser`/`globals.worker` from also applying to those files, since ESLint flat config merges `languageOptions.globals` across every matching config object rather than letting a later, more-specific block override an earlier one -- contradicting RESEARCH Pitfall 6's intent ("WITHOUT globals.browser or globals.worker")
- **Fix:** Added `ignores: ['src/server/**']` to the general `**/*.{ts,tsx}` block so it no longer matches server files at all, and gave the new server block its own `extends` (js/tseslint recommended configs) so server files still get full linting, just with the correct (Node-only) global set
- **Files modified:** eslint.config.js
- **Verification:** `npm run lint` reports 0 errors; no `no-undef` on `process`/`Buffer` in `src/server/**`
- **Committed in:** ef7f7be (Task 2 commit)

**4. [Rule 2 - Missing Critical] `.claude/worktrees/` was untracked and not gitignored**
- **Found during:** pre-commit review, after this executor's original git worktree disappeared mid-session (see Issues Encountered)
- **Issue:** Stray, non-worktree directory copies under `.claude/worktrees/` were untracked but had no `.gitignore` rule, risking accidental commit of large scratch checkouts in a future `git add -A`
- **Fix:** Added `.claude/worktrees/` to `.gitignore`
- **Files modified:** .gitignore
- **Verification:** `git status --short` no longer lists the stray directories
- **Committed in:** ef7f7be (Task 2 commit)

---

**Total deviations:** 4 auto-fixed (2 blocking/bug in the `tsx` CLI invocation, 1 bug in the ESLint config's own intent, 1 missing-critical gitignore rule)
**Impact on plan:** All four were necessary for the tracer to actually run correctly end-to-end (not just type-check) and for the repo's git hygiene to stay correct. No scope creep -- all four are directly caused by, or discovered while verifying, Task 2's own deliverables.

## Issues Encountered

- **Worktree infrastructure anomaly (environment, not code):** this executor was originally dispatched into an isolated git worktree (`.claude/worktrees/agent-a2837f783afbbf3aa`, branch `worktree-agent-a2837f783afbbf3aa`) for the package-legitimacy checkpoint. Between that checkpoint being approved and this executor resuming, that worktree disappeared entirely -- `git worktree list` no longer showed it and `.git/worktrees/` was empty, replaced by two orphaned, non-worktree directory copies under the same parent path. All of Task 2's work was done directly on the main repository's `master` branch instead (this project's established `branching_strategy: "none"` pattern -- every prior Phase 1/2 commit is also directly on `master`). Both commits (`ef7f7be`, `f4c5451`) are on `master`. This is disclosed for transparency; it did not block or corrupt any work, but the orchestrator/user should be aware the isolated-worktree mode did not survive the checkpoint pause in this session.
- **`taskkill /IM node.exe /T` used once during verification** killed all `node.exe` processes system-wide (not scoped to this project) while cleaning up a background test process. No apparent harm to this session, but subsequent process cleanup was switched to PID-scoped `taskkill /PID <n>` to avoid repeating this.

## User Setup Required

None - no external service configuration required for this plan. A `claude_desktop_config.json` snippet documenting the `--tsconfig tsconfig.server.json` requirement for the relay's spawn command is still needed in the project README, but that is explicitly out of scope for 03-01 (no task in this plan covers README/Claude Desktop setup documentation) -- flag for Plan 02 or a dedicated docs task.

## Next Phase Readiness

- The two-process architecture, WS protocol contract, tool-dispatch pattern, and TS/ESLint scoping are all proven and ready for Plan 02 to add the remaining 5 tools (`get_structure`, `apply_cleanup_rule`, `remove_selection`, `confirm_proposal`, `export_dxf`) plus the proposal/version staleness check (RESEARCH Pattern 4) and the browser-side `engineSocket.ts` sync client
- MCP-01 is NOT marked complete in REQUIREMENTS.md yet -- it is declared by both this plan and 03-02 (shared-ID gate, #2388); it will flip to complete once 03-02 also finishes
- No blockers for Plan 02

---
*Phase: 03-ai-assisted-cleanup-via-mcp*
*Completed: 2026-08-24*

## Self-Check: PASSED

All created files verified present on disk (src/server/engine.ts, src/server/index.ts, src/server/documentModel.ts, src/server/wsProtocol.ts, src/server/tools/listLayers.ts, tsconfig.server.json). Both commits (ef7f7be, f4c5451) verified present in `git log --oneline --all`.
