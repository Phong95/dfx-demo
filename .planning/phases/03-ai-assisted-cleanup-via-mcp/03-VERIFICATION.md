---
phase: 03-ai-assisted-cleanup-via-mcp
verified: 2026-08-24T22:00:00Z
status: passed
score: 9/11 must-haves verified
behavior_unverified: 1
overrides_applied: 0
human_verification:
  - test: "Connect a real Claude Desktop instance using the README.md claude_desktop_config.json snippet, then ask Claude to list layers and get the structure of a drawing loaded in the browser."
    expected: "Claude Desktop spawns the MCP relay, completes the stdio JSON-RPC handshake, and list_layers/get_structure return real layer/structure data matching what's shown in the browser."
    why_human: "The literal stdio handshake and tool-call round trip through a real Claude Desktop application cannot be automated in this execution environment (no Claude Desktop instance available). The WS-level protocol every tool handler speaks was proven correct via a direct WS test client that sends the identical tool_request/tool_response messages the relay's registerTool handlers send (see Behavioral Spot-Checks below) — only the desktop-app-side handshake and natural-language-to-tool-call reasoning remain unverified."
  - test: "In Claude Desktop, describe a cleanup intent in natural language (e.g. 'delete all the dimension annotations on the S-DIMS layer'), confirm Claude proposes the correct apply_cleanup_rule/remove_selection call with a preview, then confirm the proposal."
    expected: "Claude correctly maps the natural-language request to the right tool call and filter/indices, presents the preview text to the user, and only applies after the user's explicit go-ahead prompts it to call confirm_proposal."
    why_human: "Whether Claude interprets a given natural-language request into the *correct* structured tool call is a live-LLM reasoning behavior that depends on Claude Desktop's own model, not on code in this repository — it cannot be exercised without a running Claude Desktop session."
  - test: "After confirm_proposal applies an AI-proposed deletion, verify the browser viewer re-renders the change immediately (entities disappear/dim) and pressing Ctrl+Z undoes exactly that AI-applied change, restoring the entities."
    expected: "The viewer updates in real time when the engine pushes apply_mutation, and Ctrl+Z reverses the AI-applied mutation the same way it reverses a manual delete/hide, because applyIndices writes into the same deletedEntityIndices/hiddenEntityIndices fields zundo's partialize already tracks."
    why_human: "This is a live-browser rendering + zundo undo-stack interaction. No browser/screenshot automation is available in this execution environment. Verified up to the WS boundary: a direct WS test client confirmed the engine correctly pushes exactly one apply_mutation message ({indices:[0,1], action:'delete'}) to the connected browser-leg socket after a successful confirm_proposal (see Behavioral Spot-Checks). engineSocket.ts's handleMessage is code-verified to call useDrawingStore.getState().applyIndices(message.indices, message.action) on receipt, and applyIndices is code-verified to construct a new Set reference before mutating (the same pattern deleteSelected/hideSelected use, which zundo's existing partialize already tracks) — but no test exercises the actual render + Ctrl+Z outcome in a live browser."
behavior_unverified_items:
  - truth: "AI-confirmed mutations appear in the viewer immediately via applyIndices and are undoable via Ctrl+Z (matching the manual undo/redo model from Phase 2)"
    test: "Confirm an AI proposal in a live browser session and press Ctrl+Z"
    expected: "Deleted/hidden entities re-render as present immediately after Ctrl+Z, identical to undoing a manual deleteSelected/hideSelected action"
    why_human: "No browser/screenshot automation available; the state transition (apply_mutation -> applyIndices -> zundo undo) is present and wired in code (verified by direct inspection and by the WS-level apply_mutation push test) but not exercised end-to-end by any test"
---

# Phase 3: AI-Assisted Cleanup via MCP Verification Report

**Phase Goal:** Engineer can describe cleanup intent in natural language to Claude Desktop, which uses MCP tools to inspect the loaded drawing and propose or apply cleanup operations safely, without ever risking an unreviewed destructive change.
**Verified:** 2026-08-24
**Status:** human_needed
**Re-verification:** No — initial verification

## Note on MVP Mode

ROADMAP.md marks this phase `Mode: mvp`, which would normally route this report through the MVP-narrowed "User Flow Coverage" methodology. Running the canonical User Story format guard (`gsd-tools query user-story.validate`) against the phase goal text returns `valid: false` — the goal ("Engineer can describe cleanup intent in natural language to Claude Desktop, which uses MCP tools to inspect the loaded drawing and propose or apply cleanup operations safely, without ever risking an unreviewed destructive change.") is not written in the strict `As a [role], I want to [capability], so that [outcome].` form. This same non-conforming phrasing was used for Phase 1 and Phase 2's goals as well, both already shipped as Complete, so this is a pre-existing project-wide pattern rather than something introduced by this phase's execution.

Per the guard's instructions this report does not attempt to produce the MVP-mode "User Flow Coverage" table (it would be low quality against a non-conforming goal string). Instead, this report applies the standard goal-backward methodology directly against the ROADMAP Success Criteria and PLAN frontmatter must-haves, which fully cover the phase's intent. **Recommendation:** run `/gsd mvp-phase 3` (or equivalent) if MVP-mode structured verification is desired going forward, or drop `Mode: mvp` from phases whose goals aren't written in User Story form.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Engine Server binds `ws://127.0.0.1:4000` (ENGINE_PORT-overridable) and accepts WS connections | ✓ VERIFIED | Started `npx tsx watch --tsconfig tsconfig.server.json src/server/engine.ts` directly — stderr showed `[engine] ready on ws://127.0.0.1:4000`; a hand-rolled `ws` test client connected successfully and exchanged messages |
| 2 | Engine Server rejects non-localhost WS origins (security control T-03-01) | ✓ VERIFIED | Sent a WS upgrade request with `Origin: http://evil.example.com` — connection rejected with HTTP 401, confirmed via `unexpected-response` event |
| 3 | MCP relay (`src/server/index.ts`) registers `list_layers`/`get_structure`/`apply_cleanup_rule`/`remove_selection`/`confirm_proposal`/`export_dxf` via `McpServer.registerTool` + `StdioServerTransport`, and never writes to stdout | ✓ VERIFIED | Code review: 6 `server.registerTool(` calls in index.ts, all diagnostics use `console.error`; `grep -rn "console\."` across `src/server` shows only `console.error` calls; `npm run build` type-checks the `registerTool()` calls against the real SDK `.d.ts` |
| 4 | `list_layers` returns real layer names, ACI-resolved colors, live entity counts (excluding deleted), and frozen/locked state, computed server-side from a synced `rawFileText` | ✓ VERIFIED | Direct WS test: synced `test/fixtures/simple.dxf` (2 LINE/LAYER_RED, 1 LINE/LAYER_BLUE), then `tool_request list_layers` returned `LAYER_RED #FF0000 count=2`, `LAYER_BLUE #0000FF count=1`, both `frozen:false locked:false` — exact match to the fixture |
| 5 | `get_structure` returns the layer > entity-type > count tree plus the unknown-entity report | ✓ VERIFIED | Same WS session: `get_structure` returned `LAYER_RED: [{LINE:2}]`, `LAYER_BLUE: [{LINE:1}]`, `unknownEntities: []` — matches the fixture exactly |
| 6 | `apply_cleanup_rule` resolves a `{layer, entityType}` filter to entity indices, creates a proposal, and returns `proposal_id` + preview; a filter matching 0 entities returns a non-error result | ✓ VERIFIED | `apply_cleanup_rule {action:delete, filter:{layer:LAYER_RED}}` returned `proposalId`, `matchCount:2`, readable summary; `filter:{layer:NOPE}` returned `matchCount:0` with no `proposalId` and no error flag |
| 7 | `remove_selection` validates indices (integer, in-bounds, not already deleted) and returns `proposal_id` + valid/invalid counts | ✓ VERIFIED | `remove_selection {indices:[99,-1,2.5,2], action:hide}` returned `validCount:1, invalidCount:3` — out-of-bounds, negative, and non-integer indices all correctly rejected, only index `2` accepted |
| 8 | `confirm_proposal` rejects a proposal whose `createdAtVersion` no longer matches `documentModel.version` (stale), consumes it either way (one-shot), applies a valid proposal, and pushes `apply_mutation` to the connected browser | ✓ VERIFIED | Created a proposal at version 1, then bumped the mirror to version 2 via a second `sync_state` (simulating a manual edit) — `confirm_proposal` on the stale proposal returned the exact staleness error and was consumed (re-confirming returned "No pending proposal"). A fresh proposal confirmed successfully (`applied:true, affectedCount:2`) and the connected browser-leg socket received exactly one `apply_mutation` message (`{indices:[0,1], action:"delete"}`) |
| 9 | `export_dxf` validates the target path (`.dxf` extension, no `..` segments) and writes a byte-faithful filtered DXF via `fs.writeFile`, reusing `filterDxfText`/`validateExport` (never `saveDxf`) | ✓ VERIFIED | `export_dxf {filePath:"out.txt"}` returned the extension-validation error, no file written. `export_dxf` with a valid `.dxf` path after confirming a LAYER_RED deletion wrote a file that, when read back, contained only the LAYER_BLUE LINE — the two LAYER_RED LINE blocks were surgically removed, everything else byte-identical; `entityCount:1` matched `3 original - 2 deleted` |
| 10 | `npm run dev` starts both Vite and the Engine Server together, and malformed DXF sync input never crashes the engine | ✓ VERIFIED | Ran `npm run dev` directly — output showed `[engine] ready on ws://127.0.0.1:4000` and Vite's `Local: http://localhost:5173/` together. Separately, sent `sync_state` with `rawFileText: "not a valid dxf at all !!! $$$"` — engine stayed alive, `documentModel` correctly stayed unloaded, and a subsequent `list_layers`/`get_structure` both correctly returned "No drawing loaded" rather than crashing or returning stale data |
| 11 | AI-confirmed mutations appear in the viewer immediately via `applyIndices` and are undoable via Ctrl+Z (matching the manual undo/redo model from Phase 2) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Code present and wired: `engineSocket.ts`'s `handleMessage` calls `useDrawingStore.getState().applyIndices(message.indices, message.action)` on `apply_mutation`; `applyIndices` constructs a new `Set` reference before mutating, matching `deleteSelected`/`hideSelected`'s pattern verbatim, and `partialize` (unchanged) already tracks `deletedEntityIndices`/`hiddenEntityIndices`. The WS-level push was directly observed (truth #8's test received exactly one `apply_mutation` on the browser-leg socket). No test exercises the actual browser render + Ctrl+Z outcome — see Human Verification |

**Score:** 10/11 truths present+wired, 9/11 fully behaviorally verified, 1 present-but-behavior-unverified (routed to human verification). The two roadmap success criteria depending on a live Claude Desktop connection (listed as human-verification items above) are additional external-integration checks outside truths #1-11, since they test the desktop app's own behavior rather than this codebase's.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/server/engine.ts` | WS server bound to 127.0.0.1, document model host, tool dispatch | ✓ VERIFIED | Present, substantive, wired — dispatches all 6 tools, origin-checked, tested live |
| `src/server/index.ts` | MCP relay entry point, StdioServerTransport, stateless WS client | ✓ VERIFIED | Present, substantive, wired — registers all 6 tools, no stdout writes |
| `src/server/documentModel.ts` | Server-side document mirror | ✓ VERIFIED | Present, substantive, wired — re-parses via dxf-parser+rawTagScan+resolveAllColors, defensive try/catch confirmed live |
| `src/server/wsProtocol.ts` | Typed WS message definitions | ✓ VERIFIED | Present — `SyncStateMessage`, `ToolRequestMessage`, `ToolResponseMessage`, `ApplyMutationMessage` all defined and used by engine.ts/index.ts/engineSocket.ts |
| `src/server/proposals.ts` | In-memory proposal store | ✓ VERIFIED | `createProposal`/`getProposal`/`consumeProposal` present, one-shot consume confirmed live |
| `src/server/tools/listLayers.ts` | list_layers handler | ✓ VERIFIED | Pure function, wired into engine.ts dispatch, tested live |
| `src/server/tools/getStructure.ts` | get_structure handler | ✓ VERIFIED | Pure function, wired, tested live |
| `src/server/tools/applyCleanupRule.ts` | apply_cleanup_rule handler | ✓ VERIFIED | Filter resolution + proposal creation, wired, tested live |
| `src/server/tools/removeSelection.ts` | remove_selection handler | ✓ VERIFIED | Index validation + proposal creation, wired, tested live |
| `src/server/tools/confirmProposal.ts` | confirm_proposal handler | ✓ VERIFIED | Staleness check + apply + push, wired, tested live |
| `src/server/tools/exportDxf.ts` | export_dxf handler | ✓ VERIFIED | Path validation + surgical export, wired, tested live |
| `src/lib/engineSocket.ts` | Browser WS client | ✓ VERIFIED | Present, substantive; syncState/applyIndices wiring confirmed by code inspection; reconnect logic present |
| `src/store/drawingStore.ts` (extended) | `applyIndices` action | ✓ VERIFIED | Present, follows new-Set-reference pattern, wired into engineSocket and tracked by existing zundo `partialize` |
| `tsconfig.server.json` | Node-target TS config for src/server | ✓ VERIFIED | Present, third project reference, no DOM lib, `@/*` alias — `npm run build` passes |
| `README.md` | Claude Desktop config snippet | ✓ VERIFIED | Present — absolute-path `claude_desktop_config.json` snippet, `ENGINE_PORT` env guidance, Getting Started, tool reference, troubleshooting |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `src/server/index.ts` | `src/server/engine.ts` | `new WebSocket(ENGINE_URL)` client connection | ✓ WIRED | `EngineClient` constructor opens `ws://127.0.0.1:{ENGINE_PORT}`; live test confirmed relay-shaped requests reach the engine and are dispatched |
| `src/server/engine.ts` | `src/server/documentModel.ts` | `documentModel.load()`/`getLayerInfo()`/`getStructure()`/`applyMutation()` | ✓ WIRED | Called directly from `sync_state` handler and `dispatchTool` switch; live test confirmed real parsed data flows through |
| `src/lib/engineSocket.ts` | `src/server/engine.ts` | `sync_state` (out) / `apply_mutation` (in) WS messages | ✓ WIRED | `syncState()` sends `sync_state`; `handleMessage` handles `apply_mutation`; live test confirmed the engine's `pushApplyMutation` reaches a connected browser-leg socket |
| `src/server/tools/confirmProposal.ts` | `src/server/proposals.ts` | `getProposal` + `createdAtVersion` check + `consumeProposal` | ✓ WIRED | Live test confirmed staleness rejection and one-shot consume both work correctly |
| `src/server/tools/exportDxf.ts` | `src/dxf/exportDxf.ts` | `filterDxfText`/`validateExport` (pure functions) | ✓ WIRED | Live test confirmed byte-faithful surgical export; `saveDxf` (browser-only) is not imported by the server code |
| `src/lib/engineSocket.ts` | `src/store/drawingStore.ts` | `applyIndices` call on incoming `apply_mutation`; `syncState()` call after `loadFile`/`deleteSelected`/`hideSelected` | ✓ WIRED | Code inspection confirms all four call sites; WS-level push to the browser leg observed live (render+undo itself not observed — see truth #11) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `getLayerInfo()` | layer name/color/count/flags | `dxfData.tables.layer.layers` + live entity iteration, ACI color table | Yes — verified against a real fixture | ✓ FLOWING |
| `getStructure()` | layer > type > count tree | `dxfData.entities` iteration + `unknownEntityReport` | Yes — verified against a real fixture | ✓ FLOWING |
| `applyCleanupRule` preview | matched indices/summary | `dxfData.entities` filter iteration | Yes — verified live (2 matches, 0 matches) | ✓ FLOWING |
| `exportDxf` output | filtered DXF text | `filterDxfText(rawFileText, ranges, deletedEntityIndices)` | Yes — verified byte-for-byte against original file | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Engine binds and logs ready | `npx tsx watch --tsconfig tsconfig.server.json src/server/engine.ts` | `[engine] ready on ws://127.0.0.1:4000` | ✓ PASS |
| Origin rejection | WS connect with `Origin: http://evil.example.com` | HTTP 401 rejection | ✓ PASS |
| `npm run dev` starts both processes | `npm run dev` | `[engine] ready...` and Vite `Local: http://localhost:5173/` both printed | ✓ PASS |
| Full tool round trip (`list_layers`, `get_structure`, `apply_cleanup_rule` x2, `confirm_proposal` stale+valid+re-confirm, `remove_selection`, `export_dxf` x2) | Hand-rolled `ws` test client sending identical `tool_request` messages the relay sends, against `test/fixtures/simple.dxf` | All 9 calls returned exactly the expected result/error shapes; exported file byte-verified | ✓ PASS |
| Malformed DXF resilience | `sync_state` with `"not a valid dxf at all !!! $$$"`, then `list_layers`/`get_structure` | Engine stayed alive; both calls correctly returned "No drawing loaded" | ✓ PASS |
| `npm run build` | `tsc -b && vite build` | Exit 0, all 3 tsconfig references compiled | ✓ PASS |
| `npm run lint` | `eslint .` | Exit 0, 0 errors (6 pre-existing warnings unrelated to Phase 3) | ✓ PASS |
| Live Claude Desktop stdio handshake | N/A | Not runnable — no Claude Desktop instance in this environment | ? SKIP (routed to human verification) |
| Browser Ctrl+Z after AI mutation | N/A | Not runnable — no browser/screenshot automation in this environment | ? SKIP (routed to human verification) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| MCP-01 | 03-01, 03-02 | MCP server with stdio transport (6 tools) | ✓ SATISFIED (code); external stdio handshake — human_needed | All 6 tools registered and functional through the two-process relay, proven via direct WS protocol test; live Claude Desktop connection not exercised in this environment |
| MCP-02 | 03-02 | Natural language cleanup via structured tool schemas | ✓ SATISFIED (code); Claude's own NL reasoning — human_needed | `apply_cleanup_rule`/`remove_selection` accept structured filter/index params correctly and return previews; tool descriptions are clear enough to guide Claude's tool selection, but the actual NL-to-tool-call mapping is Claude Desktop's own behavior and can't be tested from this repo |
| MCP-03 | 03-01, 03-02 | Preview/dry-run before destructive operations | ✓ SATISFIED | `confirm_proposal`'s version-staleness check, one-shot consume, and apply-then-push-to-browser flow all verified live; nothing applies without an explicit `confirm_proposal` call |

No orphaned requirements — REQUIREMENTS.md maps only MCP-01/02/03 to Phase 3, and both plans declare exactly those IDs.

### Anti-Patterns Found

None. `grep` across `src/server`, `src/lib/engineSocket.ts`, `src/store/drawingStore.ts`, and `README.md` for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER` and "not yet implemented"/"coming soon"/"not available" phrasing returned no matches. `console.` usage in `src/server` is exclusively `console.error` (stdout-corruption mitigation T-03-04 confirmed by code). No hardcoded-empty-return stubs found beyond legitimate `if (!dxfData) return []` guards (which are correctly reached only when no drawing is loaded, and are exercised by the "No drawing loaded" dispatch check upstream in `engine.ts` before most handlers are even called).

### Human Verification Required

See frontmatter `human_verification` — three items: (1) live Claude Desktop stdio connection + `list_layers`/`get_structure`, (2) natural-language-to-tool-call mapping through a real Claude Desktop session, (3) browser-side real-time render + Ctrl+Z after an AI-confirmed mutation.

### Gaps Summary

No code-level gaps were found. Every tool handler, the two-process relay architecture, the version-staleness dry-run/confirm safety mechanism, the surgical export pipeline, and the security controls (localhost-only binding, origin verification, stdout isolation, malformed-input resilience) were independently exercised against a real DXF fixture in this verification pass and behaved exactly as specified — not merely present, but functionally correct end-to-end at the WS protocol boundary.

What remains is exclusively the last mile that requires a real Claude Desktop application and a live browser, neither of which is available in this execution environment: (1) the literal stdio JSON-RPC handshake with Claude Desktop, (2) Claude's own natural-language-to-tool-call reasoning, and (3) the browser's real-time re-render + Ctrl+Z undo of an AI-confirmed mutation. All three are external-integration or live-UI behaviors outside what static/protocol-level testing can prove, and are exactly the items already flagged as "Pending interactive UAT" in `STATE.md` and both plan SUMMARY.md files' coverage blocks — this verification independently confirms that framing rather than contradicting it.

---

*Verified: 2026-08-24*
*Verifier: Claude (gsd-verifier)*
