---
phase: 03-ai-assisted-cleanup-via-mcp
plan: 02
subsystem: api
tags: [mcp, websocket, zustand, zundo, zod, dxf-parser, node, browser-sync]

# Dependency graph
requires:
  - phase: 03-ai-assisted-cleanup-via-mcp
    provides: "03-01's two-process MCP architecture (Engine Server + stateless MCP relay), DocumentModel, WS protocol contract, and list_layers tracer"
provides:
  - "get_structure MCP tool (layer > entity-type > count tree + unknown-entity report)"
  - "apply_cleanup_rule and remove_selection MCP tools -- both resolve to a Proposal and return a preview, never applying directly"
  - "confirm_proposal MCP tool with version-staleness rejection (RESEARCH Pattern 4) -- the dry-run/confirm safety mechanism"
  - "export_dxf MCP tool reusing the Phase 2 surgical filter server-side via fs.writeFile"
  - "src/lib/engineSocket.ts: browser WS client with syncState push and incoming apply_mutation handling"
  - "drawingStore.applyIndices action -- AI mutations flow through the same zundo undo/redo stack as manual delete/hide"
  - "README.md with Claude Desktop configuration"
affects: []

# Actuals (#2632)
actuals:
  tokens: 11100
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: ["zod@4.4.3 (promoted from transitive peer dep to explicit dependency)"]
  patterns:
    - "Proposal/confirm two-step flow: apply_cleanup_rule/remove_selection both resolve to number[] indices handed to a shared createProposal(), differing only in how the indices are computed"
    - "Server bumps documentModel.version synchronously on confirm, before the browser's own re-sync arrives -- biases toward extra (safe) staleness rejections rather than ever silently applying a stale proposal"
    - "Pure vs. browser-only DXF export code split into separate files (exportDxf.ts / saveDxf.ts) so a Node-only tsconfig project can import the pure functions without pulling DOM globals into its type-check scope"
    - "Engine Server tracks a single active browser WS connection (last-connected-wins), used to push apply_mutation after a confirmed proposal"

key-files:
  created:
    - src/server/proposals.ts
    - src/server/tools/getStructure.ts
    - src/server/tools/applyCleanupRule.ts
    - src/server/tools/removeSelection.ts
    - src/server/tools/confirmProposal.ts
    - src/server/tools/exportDxf.ts
    - src/lib/engineSocket.ts
    - src/dxf/saveDxf.ts
    - README.md
  modified:
    - src/server/documentModel.ts
    - src/server/engine.ts
    - src/server/index.ts
    - src/server/wsProtocol.ts
    - src/store/drawingStore.ts
    - src/dxf/exportDxf.ts
    - src/components/CleanupToolbar.tsx
    - package.json

key-decisions:
  - "confirm_proposal bumps documentModel.version itself immediately (not waiting for the browser's next sync_state) so two confirms in a row correctly detect staleness against each other -- the browser's own later re-sync then overwrites version again with its own counter, which is fine since version is an opaque monotonic staleness signal, not a shared numbering scheme (RESEARCH Assumption A5)"
  - "Split src/dxf/exportDxf.ts into a pure module (filterDxfText/validateExport, importable by the Node-only server) and a new src/dxf/saveDxf.ts (window/document-dependent, browser-only) -- required to unblock the server build once export_dxf imported the pure functions and pulled the whole original file (including its Window type augmentation) into tsconfig.server.json's DOM-less type-check scope"
  - "zod promoted from an implicit transitive peer dependency (via @modelcontextprotocol/sdk) to an explicit pinned dependency (4.4.3) once src/server/index.ts started importing it directly for tool input schemas"

patterns-established:
  - "Tool handlers returning a discriminated union (success shape | {error: string}) that engine.ts's dispatch narrows with an 'error' in result check, keeping error-vs-result branching uniform across all six tools"
  - "get_structure/getLayerInfo convention: exclude deletedEntityIndices from counts, but never exclude hiddenEntityIndices (hiding is view-only, never a data mutation)"

requirements-completed: [MCP-01, MCP-02, MCP-03]

coverage:
  - id: D1
    description: "get_structure returns the layer > entity-type > count tree (excluding deleted entities) plus the unknown-entity report, matching the Structure Browser's own data shape"
    requirement: "MCP-01"
    verification:
      - kind: integration
        ref: "WS client synced test/fixtures/simple.dxf (2 LINE/LAYER_RED, 1 LINE/LAYER_BLUE) then tool_request get_structure -- response matched exactly: LAYER_RED entityTypes [{LINE:2}], LAYER_BLUE entityTypes [{LINE:1}], unknownEntities []"
        status: pass
    human_judgment: false
  - id: D2
    description: "apply_cleanup_rule resolves a {layer, entityType} filter to entity indices and returns a proposal_id + preview; a filter matching zero entities returns a clear '0 entities match' result, not an error"
    requirement: "MCP-02"
    verification:
      - kind: integration
        ref: "tool_request apply_cleanup_rule {action:delete, filter:{layer:LAYER_RED}} -- returned proposalId, matchCount:2, summary with per-type/per-layer breakdown; a second call with filter:{layer:NOPE} returned matchCount:0 with no proposalId and no error flag"
        status: pass
    human_judgment: false
  - id: D3
    description: "remove_selection validates caller-supplied indices (integer, in-bounds, not already deleted) and returns a proposal_id + preview reporting valid/invalid counts"
    requirement: "MCP-02"
    verification:
      - kind: integration
        ref: "tool_request remove_selection {indices:[2,99,-1,2.5], action:hide} -- validCount:1, invalidCount:3 (out-of-bounds, negative, non-integer all correctly rejected), proposalId returned for the one valid index"
        status: pass
    human_judgment: false
  - id: D4
    description: "confirm_proposal rejects a proposal whose createdAtVersion no longer matches documentModel.version (stale), consuming it either way (one-shot); applies a valid proposal and pushes apply_mutation to the connected browser"
    requirement: "MCP-03"
    verification:
      - kind: integration
        ref: "Proposal created at version 1; browser then sent sync_state with version 2 (simulating a manual edit); confirm_proposal on the stale proposal returned the exact staleness error text and the proposal was consumed (re-confirming it returns 'No pending proposal'). A fresh proposal confirmed successfully (applied:true, affectedCount:2) and the connected browser-leg WS socket received exactly one apply_mutation message ({indices:[0,1], action:delete}). Re-confirming the same (now-consumed) proposal id returned 'No pending proposal' -- one-shot verified. Confirming an unknown proposal id returned the correct not-found error."
        status: pass
    human_judgment: false
  - id: D5
    description: "export_dxf validates the target path (.dxf extension required, no .. segments after resolution) and writes the surgically filtered DXF via fs.writeFile, reusing filterDxfText/validateExport from Phase 2 (never saveDxf)"
    requirement: "MCP-03"
    verification:
      - kind: integration
        ref: "export_dxf with a .txt path returned the extension-validation error, no file written. export_dxf with a valid .dxf path after confirming the LAYER_RED deletion wrote a file whose content was byte-identical to the original except the two LAYER_RED LINE blocks were removed (verified by reading the written file back); re-parsed entity count matched expectedCount:1 (3 original - 2 deleted)."
        status: pass
    human_judgment: false
  - id: D6
    description: "drawingStore.applyIndices writes AI-confirmed mutations into the same deletedEntityIndices/hiddenEntityIndices fields deleteSelected/hideSelected use, tracked by the existing zundo partialize with no undo-stack changes, and engineSocket.ts applies incoming apply_mutation messages by calling it"
    requirement: "MCP-03"
    verification:
      - kind: unit
        ref: "Code review: applyIndices constructs new Set(state.X) before mutating (matches deleteSelected/hideSelected's established pattern verbatim), and partialize (unchanged) already covers deletedEntityIndices/hiddenEntityIndices"
        status: pass
      - kind: manual_procedural
        ref: "npm run build && npm run lint both exit 0"
        status: pass
    human_judgment: true
    rationale: "The literal browser-side Ctrl+Z-after-AI-mutation interaction and the real-time viewer re-render were not exercised in this execution environment (no browser/screenshot automation available). The WS-level round trip (D4) proves the engine correctly pushes apply_mutation to the browser leg; applyIndices' Set-reference pattern is code-identical to deleteSelected/hideSelected, which Phase 2 already established works with zundo's undo/redo. Flagging for interactive UAT alongside the Phase 1/2 human-check items already pending in STATE.md."
  - id: D7
    description: "All six MCP tools (list_layers, get_structure, apply_cleanup_rule, remove_selection, confirm_proposal, export_dxf) are registered in the MCP relay (src/server/index.ts) with Zod input schemas and dispatched in engine.ts"
    requirement: "MCP-01"
    verification:
      - kind: unit
        ref: "grep 'server.registerTool(' src/server/index.ts -- 6 matches"
        status: pass
    human_judgment: false
  - id: D8
    description: "README.md documents Claude Desktop configuration with an absolute-path claude_desktop_config.json snippet and a Getting Started section"
    requirement: "MCP-01"
    verification:
      - kind: manual_procedural
        ref: "README.md reviewed: contains a claude_desktop_config.json code block with an absolute-path placeholder, ENGINE_PORT env override guidance, and npm install / npm run dev getting-started steps"
        status: pass
      - kind: manual_procedural
        ref: "A literal Claude Desktop instance connecting via this exact config was not exercised (no Claude Desktop available in this execution environment, consistent with 03-01-SUMMARY.md's D2 rationale)"
        status: unknown
    human_judgment: true
    rationale: "Claude Desktop's actual stdio handshake against this README's config requires a real desktop app instance, which this execution environment cannot automate (RESEARCH Environment Availability). The relay's WS-client leg to the engine and every tool's request/response shape were verified end-to-end via a direct WS test client using the identical protocol the relay's handlers send (D1-D5)."

duration: 65min
completed: 2026-08-24
status: complete
---

# Phase 3 Plan 02: Full MCP Tool Suite with Dry-Run/Confirm Safety Flow Summary

**All six MCP tools (list_layers, get_structure, apply_cleanup_rule, remove_selection, confirm_proposal, export_dxf) wired end-to-end through the two-process relay, with a version-staleness-checked proposal/confirm flow and bidirectional browser sync so AI mutations render in the viewer in real time and are undoable via the existing zundo stack.**

## Performance

- **Duration:** ~65 min
- **Started:** 2026-08-24T14:10:00Z (approx)
- **Completed:** 2026-08-24T15:15:00Z (approx)
- **Tasks:** 2
- **Files modified:** 17 (9 created, 8 modified)

## Accomplishments
- `get_structure` returns the same layer > entity-type > count tree the Structure Browser renders, plus the unknown-entity report, excluding deleted entities
- `apply_cleanup_rule` and `remove_selection` both resolve to entity indices and hand them to a shared `createProposal()`, returning a `proposal_id` and human-readable preview -- nothing is applied until `confirm_proposal`
- `confirm_proposal` rejects stale proposals (document version changed since the preview) via a `createdAtVersion` check, consumes every proposal exactly once, and pushes an `apply_mutation` WS message to the active browser connection on success
- `export_dxf` reuses Phase 2's `filterDxfText`/`validateExport` verbatim server-side, validates the target path, and writes via `fs.writeFile` -- verified byte-for-byte output against the original file
- `src/lib/engineSocket.ts` (browser WS client) and `drawingStore.applyIndices` close the loop: AI-confirmed mutations render in the viewer and are undoable via Ctrl+Z through the existing zundo undo/redo stack, with zero changes to the undo-stack wiring itself
- README.md documents Claude Desktop setup with an absolute-path config snippet
- Full request/response protocol for all four new tools verified end-to-end via a direct WS test client against `test/fixtures/simple.dxf`, including the stale-proposal rejection path and the one-shot consume guarantee

## Task Commits

1. **Task 1: Browser WS sync + drawingStore applyIndices + get_structure tool** - `c775d86` (feat)
2. **Task 2: Mutation tools (apply_cleanup_rule, remove_selection, confirm_proposal, export_dxf) + proposals + Claude Desktop config** - `f8bd9a5` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `src/server/proposals.ts` - In-memory proposal store: createProposal/getProposal/consumeProposal, crypto.randomUUID ids, one-shot consume
- `src/server/tools/getStructure.ts` - get_structure tool handler
- `src/server/tools/applyCleanupRule.ts` - Filter-to-indices resolution, 0-match returns a valid non-error preview
- `src/server/tools/removeSelection.ts` - Index validation (bounds, not-already-deleted), invalid/valid count reporting
- `src/server/tools/confirmProposal.ts` - Version-staleness check, one-shot consume, pushes apply_mutation
- `src/server/tools/exportDxf.ts` - Path validation (.dxf extension, no .. after resolution) + fs.writeFile using the Phase 2 surgical filter
- `src/server/documentModel.ts` - Added getStructure() and applyMutation() methods
- `src/server/engine.ts` - Dispatches all 6 tools (now async, to await export_dxf's fs write); tracks the active browser WS connection for apply_mutation push
- `src/server/index.ts` - Registers apply_cleanup_rule, remove_selection, confirm_proposal, export_dxf with Zod schemas; shared callEngineTool() helper
- `src/server/wsProtocol.ts` - Added ApplyMutationMessage (engine -> browser)
- `src/lib/engineSocket.ts` - Browser WS client: syncState push, incoming apply_mutation handling, exponential-backoff reconnect
- `src/store/drawingStore.ts` - Added applyIndices action, wired syncState() into loadFile/deleteSelected/hideSelected
- `src/dxf/exportDxf.ts` - Reduced to the pure functions (filterDxfText, validateExport) only
- `src/dxf/saveDxf.ts` - New file: the browser-only saveDxf() (window/document globals), split out of exportDxf.ts
- `src/components/CleanupToolbar.tsx` - Updated import to the new saveDxf.ts location
- `package.json` - zod promoted to an explicit pinned dependency (4.4.3)
- `README.md` - Claude Desktop configuration, getting-started, tool reference, troubleshooting

## Decisions Made
- `confirm_proposal` bumps `documentModel.version` synchronously on apply (not waiting for the browser's async re-sync), so two confirms in rapid succession correctly detect staleness against each other -- accepted tradeoff per RESEARCH Assumption A5 (biases toward extra, safe re-preview requests rather than ever silently applying a stale proposal)
- Split `src/dxf/exportDxf.ts` into a pure module and a new `src/dxf/saveDxf.ts` for the browser-only `saveDxf()` function -- required because importing the original combined file into the Node-only `tsconfig.server.json` project (via `export_dxf`'s `filterDxfText`/`validateExport` import) pulled in `window`/`document` type references with no DOM lib available, breaking `npm run build`
- Promoted `zod` from an implicit transitive dependency to an explicit `package.json` entry pinned at `4.4.3`, since `src/server/index.ts` now imports it directly for four tools' input schemas rather than relying on hoisting behavior

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Grammar: "1 entities would be hided" instead of "hidden"**
- **Found during:** Manual end-to-end verification of `remove_selection`'s preview summary text
- **Issue:** `${action}d` string interpolation produces "deleted" correctly but "hided" (not "hidden") for the hide action, in both `applyCleanupRule.ts` and `removeSelection.ts`
- **Fix:** Replaced the interpolated `${action}d` with an explicit `pastTense = action === 'delete' ? 'deleted' : 'hidden'` in both files
- **Files modified:** src/server/tools/applyCleanupRule.ts, src/server/tools/removeSelection.ts
- **Verification:** Re-ran the WS test client; both delete and hide preview summaries now read correctly
- **Committed in:** f8bd9a5 (Task 2 commit)

**2. [Rule 3 - Blocking] tsconfig.server.json build failure importing exportDxf.ts's browser-only code**
- **Found during:** Task 2, `npm run build` after wiring `export_dxf`'s import of `filterDxfText`/`validateExport`
- **Issue:** `src/dxf/exportDxf.ts` also contained `saveDxf()` and a `declare global { interface Window ... }` augmentation referencing `window`/`document`. Importing the pure functions pulled the whole file (single TS module) into `tsconfig.server.json`'s program, which has no DOM lib -- `tsc -b` failed with `Cannot find name 'window'`/`'document'`
- **Fix:** Split the file: `src/dxf/exportDxf.ts` now contains only the pure, Node-safe `filterDxfText`/`validateExport`; the browser-only `saveDxf()` and its Window type augmentation moved to a new `src/dxf/saveDxf.ts`. Updated `src/components/CleanupToolbar.tsx`'s import accordingly (the only other consumer)
- **Files modified:** src/dxf/exportDxf.ts, src/dxf/saveDxf.ts (new), src/components/CleanupToolbar.tsx
- **Verification:** `npm run build` and `npm run lint` both exit 0; re-ran the full WS integration test, export_dxf still produces byte-correct output
- **Committed in:** f8bd9a5 (Task 2 commit)

**3. [Rule 2 - Missing Critical] zod not an explicit dependency**
- **Found during:** Task 2, before writing Zod schemas into src/server/index.ts
- **Issue:** `zod@4.4.3` was only present as a transitive peer dependency of `@modelcontextprotocol/sdk` -- not listed in this project's own `package.json`. Relying on hoisting for a directly-imported, version-sensitive library (CLAUDE.md explicitly pins `zod@4.4.3`) is fragile
- **Fix:** Added `"zod": "4.4.3"` to `package.json` dependencies and ran `npm install zod@4.4.3 --save-exact`
- **Files modified:** package.json, package-lock.json
- **Verification:** `node -e "console.log(require('./node_modules/zod/package.json').version)"` -> `4.4.3`; build/lint both pass
- **Committed in:** f8bd9a5 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 bug, 1 blocking build fix, 1 missing-critical dependency pin)
**Impact on plan:** All three were necessary for the plan's own deliverables to actually build and read correctly. No scope creep -- all three are directly caused by, or discovered while verifying, this plan's own tasks.

## Issues Encountered

None beyond the deviations above -- the two-process architecture, WS protocol contract, and tool-dispatch pattern from Plan 01 extended cleanly to all four new tools with no structural surprises.

## User Setup Required

None - no external service configuration required for this plan. `README.md` now documents the one-time Claude Desktop config step, but that is a user action (not an execution-time setup requirement) and is fully self-service via the README.

## Next Phase Readiness

- Phase 3's full scope (MCP-01, MCP-02, MCP-03) is implemented and verified via direct WS protocol testing against a real DXF fixture, covering every tool's success path, error path (0-match, invalid indices, unknown proposal, stale proposal, bad export path), and the one-shot proposal guarantee
- **Pending interactive UAT** (consistent with the pattern already established in STATE.md's Pending Todos for Phase 1/2): a literal Claude Desktop connection exercising the six tools through natural-language requests, and the browser-side Ctrl+Z-after-AI-mutation / real-time viewer re-render, were not exercised in this execution environment (no Claude Desktop instance or browser/screenshot automation available). The WS-level protocol these depend on is proven correct (see coverage D4/D6/D8); only the literal desktop-app and browser-UI interaction remains for a human to confirm.
- MCP-01, MCP-02, MCP-03 requirements are complete as of this plan (shared-ID gate with 03-01 now closed)
- No blockers for closing out Phase 3

---
*Phase: 03-ai-assisted-cleanup-via-mcp*
*Completed: 2026-08-24*

## Self-Check: PASSED

All created files verified present on disk (src/server/proposals.ts, src/server/tools/getStructure.ts, src/server/tools/applyCleanupRule.ts, src/server/tools/removeSelection.ts, src/server/tools/confirmProposal.ts, src/server/tools/exportDxf.ts, src/lib/engineSocket.ts, src/dxf/saveDxf.ts, README.md). Both commits (c775d86, f8bd9a5) verified present in `git log --oneline --all`.
