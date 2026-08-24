---
phase: 02-manual-cleanup-export
verified: 2026-08-24T00:00:00Z
status: passed
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Click an entity on the canvas"
    expected: "Entity gets an accent-color (#3B82F6) outline and its details (type, layer, color swatch, key geometry) appear in the Properties Panel"
    why_human: "Visual rendering correctness (outline color/width, panel field layout) cannot be confirmed by static analysis — requires a browser with a loaded DXF file"
  - test: "Click empty canvas background"
    expected: "Selection clears and the Properties Panel reverts to its empty-state message"
    why_human: "Requires observing the rendered canvas and panel in a browser"
  - test: "Shift-click a second entity, then box-select (click-drag) over a group of entities"
    expected: "Shift-click toggles entities in/out of the selection with all selected entities outlined simultaneously; box-select selects only entities fully contained in the rubber-band rectangle (partial overlaps excluded), and a visible rubber-band rectangle (1px accent stroke, 10% accent fill) tracks the drag"
    why_human: "Full-containment vs. partial-overlap selection semantics and the rubber-band visual require interactive mouse-drag verification in a browser"
  - test: "Click Delete on a small selection (<10), then Ctrl+Z"
    expected: "Entities vanish from the canvas immediately (no dialog); Ctrl+Z brings them back"
    why_human: "Visual canvas removal/reappearance requires observing rendered output"
  - test: "Select entities and click Hide, then Ctrl+Z"
    expected: "Selected entities dim to ~20% opacity with a dashed outline while remaining visible; Ctrl+Z undoes the hide"
    why_human: "Visual dimming/dashing correctness requires observing rendered output"
  - test: "Press Ctrl+Z / Ctrl+Shift+Z repeatedly across a sequence of select/delete/hide actions"
    expected: "Undo/redo walks the history correctly in both directions; toolbar Undo/Redo buttons enable/disable based on temporal history state"
    why_human: "Real keyboard-event-driven interaction sequencing in a live browser session; the underlying temporal() state-transition logic itself was independently verified programmatically (see Behavioral Spot-Checks)"
  - test: "Hold Space and drag to pan; use the mouse wheel to zoom"
    expected: "Space+drag pans the canvas (no rubber band starts); wheel zoom continues to work exactly as in Phase 1"
    why_human: "Requires a live browser session with pointer/keyboard input"
  - test: "Select 10+ entities (e.g. box-select a dense area) and click Delete"
    expected: "A confirmation AlertDialog appears with the live count and a Ctrl+Z reminder; Cancel leaves the selection untouched; the destructive confirm button deletes them"
    why_human: "Dialog appearance, live count rendering, and Cancel/Confirm interaction require a browser to observe — no automated UI test exists in this repo"
  - test: "Click Export DXF on a drawing with some entities deleted"
    expected: "Button shows 'Exporting…' briefly, then the native Save-As dialog opens (or the file auto-downloads in Firefox/Safari); after saving, a success toast shows the filename and removed-entity count; re-loading the saved file in the app parses correctly with the expected entity count"
    why_human: "The native `showSaveFilePicker` dialog / Blob-download fallback and toast rendering cannot be exercised without a running browser; the underlying boundary-scan → filter → validate → reparse pipeline was independently re-verified programmatically against a hand-built CRLF/POLYLINE fixture (see Behavioral Spot-Checks) — this is the highest-risk logic and it passed"
  - test: "Force an export validation failure (if reproducible) — e.g. by corrupting rawFileText state"
    expected: "A destructive-styled toast reading the exact validation-failure copy appears and no file is written"
    why_human: "Requires triggering the failure path in a live browser session; validateExport's fail-closed behavior was independently verified programmatically (count mismatch and parse-error cases both correctly return false)"
---

# Phase 2: Manual Cleanup & Export Verification Report

**Phase Goal:** Engineer can select unwanted entities in the loaded drawing, remove or hide them with full undo/redo safety, and export a cleaned DXF file that preserves everything else exactly as it was — delivering a complete, usable load-clean-export workflow without needing AI.

**Verified:** 2026-08-24
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can click an entity in the viewer to select it and see its details in a properties panel | ✓ VERIFIED | `Stage.tsx` wires `onClick={(e) => toggleSelect(index, e.evt.shiftKey)}` on every rendered `EntityRenderer`; `PropertiesPanel.tsx` reads `selectedEntityIndices`/`dxfData` and renders Type/Layer/Color/geometry fields for a single selection. Store-level click→select transition independently re-run and passed (see Behavioral Spot-Checks). Visual outline/panel rendering itself flagged for human confirmation. |
| 2 | User can select multiple entities at once via box-select or shift-click | ✓ VERIFIED | `toggleSelect(index, shiftKey=true)` toggles membership in a `Set<number>` (verified behaviorally); box-select in `Stage.tsx` `handleStageMouseUp` converts the screen-space rubber band to world space and calls `setSelection` with only indices whose `computeBoundsForEntity` bbox is fully contained (not merely overlapping) — full-containment math read and confirmed correct. Interactive mouse-drag confirmation flagged for human. |
| 3 | User can delete or hide the selected entities from the drawing | ✓ VERIFIED | `deleteSelected`/`hideSelected` re-run independently against the live store: both move every selected index into `deletedEntityIndices`/`hiddenEntityIndices` respectively and clear the selection — confirmed passing. `Stage.tsx` skips rendering entities in `deletedEntityIndices` entirely and renders `hiddenEntityIndices` at `opacity=0.2, dash=[6,4]`. Visual dimming/removal flagged for human. |
| 4 | User can undo and redo any cleanup action they've taken, in sequence | ✓ VERIFIED | zundo `temporal()` wraps the store with `partialize` scoped to exactly `selectedEntityIndices`/`deletedEntityIndices`/`hiddenEntityIndices`, `limit: 100`. Independently re-run against the live store: delete → undo restores the pre-delete state → redo restores the deleted state, with `pastStates`/`futureStates` lengths changing correctly at each step. `CleanupToolbar.tsx` binds Ctrl+Z/Ctrl+Shift+Z (no Ctrl+Y) and disables Undo/Redo buttons based on `pastStates.length`/`futureStates.length`. |
| 5 | User can export the cleaned drawing to a DXF file that re-parses correctly and preserves all untouched content byte-for-byte | ✓ VERIFIED | Independently re-ran a full round-trip test against a hand-built CRLF fixture containing LINE/CIRCLE/POLYLINE(+2 VERTEX+SEQEND)/TEXT: `buildEntityTagRanges` produced 4 ranges 1:1 type-aligned with dxf-parser's 4 parsed entities; `filterDxfText` removing indices [0,2] (LINE, POLYLINE) preserved the CIRCLE and TEXT blocks byte-for-byte including `\r\n` terminators; `validateExport` returned `true` for the correct count and `false` for both a wrong count and unparseable text (fail-closed, independently confirmed); re-parsing the filtered output yielded exactly `[CIRCLE, TEXT]` in original order. Native Save-As dialog / toast rendering flagged for human. |

**Score:** 5/5 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/store/drawingStore.ts` | Selection/delete/hide `Set<number>` state wrapped in zundo `temporal()` | ✓ VERIFIED | Fields present; `temporal()` wraps the create call with `partialize` returning exactly the 3 fields, `limit: 100`; behaviorally re-tested (undo/redo, delete, hide, sole-toggle-off all pass) |
| `src/components/CanvasViewer/Stage.tsx` | Click-select, box-select rubber band, deleted filtering, hidden dimming | ✓ VERIFIED | All wired: onClick handler, mousedown/move/up rubber-band trio with full-containment math, `deletedEntityIndices.has(index)` skip, `opacity`/`dash` on hidden entities, Space+drag pan replacing native `draggable` |
| `src/components/CanvasViewer/entities/EntityRenderer.tsx` | `onClick`/`opacity`/`dash` threaded to all 9 shape components | ✓ VERIFIED | Confirmed for LINE (read directly, forwards to Konva `<Line onClick=.../>`), and by code inspection for INSERT/DIMENSION (forward down through recursive `EntityRenderer` calls onto sub-shapes rather than the wrapping `Group`, since `Group` has no `dash` concept) |
| `src/components/CleanupToolbar.tsx` | Delete/Hide/Undo/Redo/Export buttons, selection badge, batch-delete dialog | ✓ VERIFIED | Delete (destructive variant + `Trash2`), Hide (outline + `EyeOff`), Undo/Redo (icon-only + Tooltip, correctly gated on `pastCount`/`futureCount` via `useStore(useDrawingStore.temporal, ...)`), Export DXF (default/accent variant + `Download`, gated on `dxfData`/`isExporting`), `{N} selected` badge shown only when `selectionCount > 0`, `AlertDialog` gated at `selectionCount >= 10` |
| `src/components/PropertiesPanel.tsx` | Empty/single/multi-select states | ✓ VERIFIED | Always mounted (no conditional unmount — renders "Properties" heading regardless of state); empty-state, single-entity field list (Type/Layer/Color swatch/geometry per type with `—` fallback), multi-select count + per-type breakdown all present and copy-matched against UI-SPEC |
| `src/dxf/entityTagRanges.ts` | Polyline-aware character-offset boundary scanner, 1:1 aligned with `dxfData.entities` | ✓ VERIFIED | Independently re-run: produces exactly 4 ranges type-aligned with dxf-parser's 4 parsed entities for a POLYLINE+VERTEX+SEQEND fixture; VERTEX/SEQEND correctly folded into the preceding range, never starting a new one |
| `src/dxf/exportDxf.ts` | `filterDxfText`, `validateExport`, `saveDxf` | ✓ VERIFIED | Independently re-run: byte-for-byte preservation confirmed (including CRLF), fail-closed validation confirmed on both count-mismatch and parse-error paths, `saveDxf` correctly feature-detects `showSaveFilePicker` with Blob+anchor fallback and treats `AbortError` as a silent no-op (code-read confirmed, requires browser to exercise) |
| `src/dxf/rawTagScan.ts` | SEQEND/VERTEX false-positive fix in ENTITIES and BLOCKS sections | ✓ VERIFIED | Independently re-run: SEQEND/VERTEX no longer appear in `typeCounts` or the `unknown` list, while a genuinely unsupported type (HATCH) still correctly appears as unknown; VERTEX confirmed absent from `SUPPORTED_TYPES` |
| `src/components/ui/alert-dialog.tsx`, `src/components/ui/sonner.tsx` | shadcn primitives (via `npx shadcn add`) | ✓ VERIFIED | Both files exist at the correct `src/components/ui/` path; `radix-ui`, `sonner`, `next-themes` present in `package.json`; `AlertDialogAction`/`AlertDialogCancel` support the `variant` prop used by `CleanupToolbar.tsx` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `drawingStore.ts` | `Stage.tsx` | `selectedEntityIndices`/`deletedEntityIndices`/`hiddenEntityIndices` drive render filtering, overlay, click handlers | ✓ WIRED | `grep -c toggleSelect Stage.tsx` = 2, `grep -c computeBoundsForEntity Stage.tsx` = 4, `grep -c setSelection Stage.tsx` = 3 (all above plan's stated minimums) |
| `drawingStore.ts` | `CleanupToolbar.tsx` | `deleteSelected`/`hideSelected`/`temporal` for toolbar buttons | ✓ WIRED | Buttons call the store actions directly; `useStore(useDrawingStore.temporal, ...)` subscribes to `pastStates`/`futureStates` for enable/disable |
| `drawingStore.ts` | `PropertiesPanel.tsx` | `selectedEntityIndices` + `dxfData.entities` for detail display | ✓ WIRED | Both read directly from the store via `useDrawingStore` selectors |
| `entityTagRanges.ts` | `exportDxf.ts` | `buildEntityTagRanges` → `filterDxfText` | ✓ WIRED | `grep -c filterDxfText exportDxf.ts` = 3; independently re-run round-trip confirms correct data flow |
| `exportDxf.ts` | `drawingStore.ts` | Reads `rawFileText`/`deletedEntityIndices` | ✓ WIRED | `CleanupToolbar.tsx`'s `handleExport` reads both from the store and passes them through the pipeline |
| `CleanupToolbar.tsx` | `exportDxf.ts` | Export DXF button → export pipeline | ✓ WIRED | `handleExport` calls `buildEntityTagRanges` → `filterDxfText` → `validateExport` → (on success) `saveDxf`, with toasts on both branches |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `PropertiesPanel.tsx` single-entity view | `entity`, `color`, `geometryFields` | `dxfData.entities[index]` (live parsed data), `entity.resolvedColor` (Phase 1's BYLAYER/BYBLOCK resolution) | Yes — reads the actual parsed entity, not a mock | ✓ FLOWING |
| `CleanupToolbar.tsx` Export handler | `filteredText` | `rawFileText` from the store (the original file's raw text, preserved since Phase 1's PARSE-04) | Yes — real file text, not a placeholder | ✓ FLOWING |
| `Stage.tsx` selection overlay | Selected `EntityRenderer`s | `dxfData.entities[index]` for every index in `selectedEntityIndices` | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

All checks below were independently re-run by the verifier directly against the live source files (not copied from SUMMARY.md claims), using `npx tsx` against hand-built fixtures, then the scratch files were deleted.

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Click-select / shift-click / sole-toggle-off state transitions | Standalone script exercising `toggleSelect`, `clearSelection` against the live `useDrawingStore` | 2-entity multi-select, re-clicking the sole selected entity deselects it | ✓ PASS |
| Delete state transition + undo/redo | Standalone script: `deleteSelected()` → assert `deletedEntityIndices` populated, `selectedEntityIndices` cleared → `temporal.undo()` → assert reverted → `temporal.redo()` → assert restored | All assertions passed; `pastStates`/`futureStates` lengths changed correctly at each step | ✓ PASS |
| Hide state transition + undo | Standalone script: `hideSelected()` → assert `hiddenEntityIndices` populated → `temporal.undo()` → assert reverted | All assertions passed | ✓ PASS |
| Export round-trip: boundary scan → filter → validate → reparse | Standalone script against a CRLF POLYLINE+VERTEX+SEQEND fixture, using `buildEntityTagRanges`/`filterDxfText`/`validateExport` from the live source | 4 ranges 1:1 type-aligned; filtered output preserved CIRCLE/TEXT byte-for-byte including CRLF; reparsed to exactly `[CIRCLE, TEXT]`; `validateExport` correctly rejected both a wrong expected count and unparseable text | ✓ PASS |
| SEQEND/VERTEX false-positive fix | Standalone script against a fixture with LINE/POLYLINE(+VERTEX+SEQEND)/HATCH, using `rawTagScan` from the live source | SEQEND/VERTEX absent from both `typeCounts` and `unknown`; HATCH (genuinely unsupported) still correctly flagged unknown | ✓ PASS |
| `npm run build` | `npm run build` | 0 TypeScript errors, build succeeds | ✓ PASS |
| `npm run lint` | `npm run lint` | 0 errors, 6 pre-existing warnings unrelated to this phase | ✓ PASS |

### Probe Execution

Not applicable — this phase has no `scripts/*/tests/probe-*.sh` convention and none is declared in the PLAN/SUMMARY files. Step 7c: SKIPPED (no declared/conventional probes for this project).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| CLEAN-01 | 02-01 | Click-to-select with properties panel | ✓ SATISFIED | Click handler + Properties Panel wired and behaviorally re-tested |
| CLEAN-02 | 02-01 | Multi-select via box-select and shift-click | ✓ SATISFIED | `toggleSelect(shiftKey=true)` + full-containment box-select in `Stage.tsx` |
| CLEAN-03 | 02-01 / 02-02 | Delete or hide selected entities | ✓ SATISFIED | `deleteSelected`/`hideSelected` behaviorally re-tested; batch-delete AlertDialog wired for 10+ |
| CLEAN-04 | 02-01 | Undo/redo stack for all cleanup actions | ✓ SATISFIED | zundo `temporal()` behaviorally re-tested through a full delete→undo→redo cycle |
| EXPORT-01 | 02-02 | Surgical tag-stream filtering, byte-for-byte preservation | ✓ SATISFIED | Round-trip test independently re-run and passed |
| EXPORT-02 | 02-02 | Validate export by re-parseable output | ✓ SATISFIED | `validateExport` independently confirmed fail-closed on both count mismatch and parse error |

No orphaned requirements — `REQUIREMENTS.md`'s Phase 2 row set (CLEAN-01..04, EXPORT-01, EXPORT-02) exactly matches both plans' `requirements:` frontmatter.

### Anti-Patterns Found

None. Scanned all phase-modified files (`drawingStore.ts`, `Stage.tsx`, `CleanupToolbar.tsx`, `PropertiesPanel.tsx`, `entityTagRanges.ts`, `exportDxf.ts`, `rawTagScan.ts`, `App.tsx`, `StructureBrowser.tsx`, `EntityRenderer.tsx` + shape components) for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER`, empty handlers, hardcoded-empty stub patterns, and `console.log`-only implementations. The only "placeholder" string matches are documentation comments describing UI copy behavior (the em-dash placeholder value), not incomplete code.

### Human Verification Required

9 items — see YAML frontmatter `human_verification` list above for the full detail (test/expected/why-human for each). These are all browser-only visual/interactive confirmations (canvas rendering, mouse-drag box-select, native Save-As dialog, toast appearance, AlertDialog appearance) that cannot be exercised in this non-browser execution environment. The underlying state-transition logic and export pipeline for every one of these was independently re-verified programmatically by this verifier (not merely cited from SUMMARY.md) and passed in every case. This mirrors the exact gap both 02-01-SUMMARY.md and 02-02-SUMMARY.md and STATE.md's "Pending Todos" already flagged as outstanding interactive UAT.

### Gaps Summary

No gaps found. Every must-have truth, artifact, and key link from both plans' frontmatter, plus all 5 ROADMAP.md success criteria, is present, correctly wired, and — for every state-transition/behavior claim (select/delete/hide/undo/redo, the export round-trip, and the SEQEND/VERTEX fix) — independently re-confirmed by this verifier running fresh scripts against the live source files (not by trusting SUMMARY.md's own prior claims). `npm run build` and `npm run lint` both pass cleanly. The only outstanding work is interactive browser-based UAT of visual/mouse/native-dialog behavior, which no execution environment available to either the executor or this verifier can exercise — this is routed to human verification, not treated as a gap, per the existing Phase 1 precedent in this project.

---

*Verified: 2026-08-24*
*Verifier: Claude (gsd-verifier)*
