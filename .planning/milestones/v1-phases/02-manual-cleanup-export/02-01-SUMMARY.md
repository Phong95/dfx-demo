---
phase: 02-manual-cleanup-export
plan: 01
subsystem: ui
tags: [zustand, zundo, konva, react-konva, undo-redo, selection]

# Dependency graph
requires:
  - phase: 01-dxf-viewer-foundation
    provides: "Working DXF viewer with drawingStore, Stage.tsx canvas, EntityRenderer dispatcher, all 9 entity shape components, StructureBrowser, LayerPanel"
provides:
  - "Extended drawingStore with selectedEntityIndices/deletedEntityIndices/hiddenEntityIndices Set<number> state, wrapped in zundo temporal() undo/redo"
  - "Click, shift-click, and full-containment box-select entity selection on the canvas"
  - "Delete and Hide actions with Ctrl+Z/Ctrl+Shift+Z undo/redo"
  - "Always-mounted PropertiesPanel with empty/single/multi-select states"
  - "Space+drag pan interaction model (frees plain left-drag for box-select)"
affects: [02-02-dxf-export]

# Actuals (#2632)
actuals:
  tokens: 14883
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: ["zundo@2.3.0"]
  patterns:
    - "Set<number> selection/delete/hide state keyed by dxfData.entities array index (not entity.handle), consistent with Phase 1's identity convention"
    - "zundo temporal() with partialize scoped to exactly 3 fields -- view state (layerVisibility, viewerTransform, hoverEntityIndex, focusedEntityIndex) excluded from undo history"
    - "onClick/opacity/dash prop-drilled through EntityRenderer's type dispatcher to all 9 shape components, mirroring the existing onMouseEnter/onMouseLeave pattern; INSERT/DIMENSION forward these down through their recursive EntityRenderer calls rather than applying to the wrapping Group"
    - "World-space bbox full-containment box-select (computeBoundsForEntity + screen-to-world inverse transform) instead of Konva's ANY-overlap haveIntersection recipe"
    - "Local React state (never the zustand store) for ephemeral drag state (rubber-band rectangle, pan tracking) to avoid spamming undo history with per-frame positions"

key-files:
  created:
    - src/components/CleanupToolbar.tsx
    - src/components/PropertiesPanel.tsx
  modified:
    - src/store/drawingStore.ts
    - src/components/CanvasViewer/Stage.tsx
    - src/components/CanvasViewer/entities/EntityRenderer.tsx
    - src/components/CanvasViewer/entities/LineShape.tsx
    - src/components/CanvasViewer/entities/ArcShape.tsx
    - src/components/CanvasViewer/entities/CircleShape.tsx
    - src/components/CanvasViewer/entities/LwpolylineShape.tsx
    - src/components/CanvasViewer/entities/TextShape.tsx
    - src/components/CanvasViewer/entities/MtextShape.tsx
    - src/components/CanvasViewer/entities/InsertShape.tsx
    - src/components/CanvasViewer/entities/DimensionShape.tsx
    - src/components/CanvasViewer/entities/SplineShape.tsx
    - src/App.tsx
    - src/components/StructureBrowser.tsx
    - src/components/ui/button.tsx
    - package.json
    - package-lock.json

key-decisions:
  - "Renamed Phase 1's singular selectedEntityIndex to focusedEntityIndex, keeping Structure Browser zoom-to-entity fully separate from the new plural cleanup selection (RESEARCH Open Question 1 recommendation)"
  - "Batch-delete confirmation for 10+ entities deferred to Plan 02-02 per the plan's explicit instruction -- Delete currently proceeds unconditionally regardless of selection size, with undo as the interim safety net"
  - "Added a destructive variant to the shared Button primitive (not previously defined) since the Delete button required it and no other Phase 1 button needed it"

patterns-established:
  - "Cleanup state (selection/delete/hide) lives in the same drawingStore as Phase 1's view state, never a separate store"
  - "zundo temporal() wraps the whole store creator; only 3 fields are partialize-tracked for undo"

requirements-completed: [CLEAN-01, CLEAN-02, CLEAN-03, CLEAN-04]

coverage:
  - id: D1
    description: "Click entity to select (accent outline) and view details in Properties Panel; click empty space deselects"
    requirement: "CLEAN-01"
    verification:
      - kind: other
        ref: "npm run build (0 TS errors); grep -c toggleSelect src/components/CanvasViewer/Stage.tsx >= 1"
        status: pass
    human_judgment: true
    rationale: "Visual selection outline correctness and Properties Panel field rendering require a human to load a real DXF file and observe the canvas/panel in a browser -- no automated UI test exists in this repo."
  - id: D2
    description: "Shift-click multi-select and click-drag box-select (full-containment) with per-type selection breakdown in Properties Panel"
    requirement: "CLEAN-02"
    verification:
      - kind: other
        ref: "npm run build (0 TS errors); grep -c computeBoundsForEntity src/components/CanvasViewer/Stage.tsx == 4; grep -c setSelection src/components/CanvasViewer/Stage.tsx == 3"
        status: pass
    human_judgment: true
    rationale: "Full-containment vs. partial-overlap selection semantics and the Space+drag pan migration require interactive mouse-drag verification in a browser."
  - id: D3
    description: "Delete (removes from canvas/export) and Hide (20% opacity, dashed outline, stays in export) actions on selected entities"
    requirement: "CLEAN-03"
    verification:
      - kind: other
        ref: "npm run build (0 TS errors); npm run lint (0 errors)"
        status: pass
    human_judgment: true
    rationale: "Visual dimming/dashing and canvas-removal correctness require observing rendered output."
  - id: D4
    description: "Ctrl+Z/Ctrl+Shift+Z undo/redo (no Ctrl+Y) covering select, delete, and hide actions, with toolbar Undo/Redo buttons reflecting temporal history state"
    requirement: "CLEAN-04"
    verification:
      - kind: other
        ref: "npm run build (0 TS errors); zundo temporal() wired with partialize scoped to selectedEntityIndices/deletedEntityIndices/hiddenEntityIndices, limit 100"
        status: pass
    human_judgment: true
    rationale: "Undo/redo stack correctness across a sequence of select/delete/hide actions requires interactive keyboard-driven verification."

duration: ~11min (active work; execution paused for a human-verification checkpoint between Task 1 and Task 2)
completed: 2026-08-24
status: complete
---

# Phase 2 Plan 1: Manual Cleanup Interaction Loop Summary

**Click/shift-click/box-select entity selection, Delete/Hide actions, and Ctrl+Z/Ctrl+Shift+Z undo/redo via zundo temporal() middleware on the existing zustand drawingStore, plus an always-mounted Properties Panel and a new Cleanup Toolbar row.**

## Performance

- **Duration:** ~11 min active execution (commits 10 min 32s apart; a human-verification checkpoint paused work between Task 1 and Task 2, not counted as active time)
- **Started:** 2026-08-24T08:40:00Z (approx.)
- **Completed:** 2026-08-24T08:58:49Z
- **Tasks:** 2 (1 tracer + 1 auto)
- **Files modified:** 17 (2 created, 15 modified)

## Accomplishments
- Extended `drawingStore.ts` with `selectedEntityIndices`/`deletedEntityIndices`/`hiddenEntityIndices` `Set<number>` fields, wrapped in `zundo@2.3.0`'s `temporal()` middleware (`partialize` scoped to exactly those 3 fields, `limit: 100`)
- Renamed Phase 1's `selectedEntityIndex` to `focusedEntityIndex` throughout the store, `Stage.tsx`, and `StructureBrowser.tsx` to keep "zoom-to" navigation separate from the new cleanup selection
- Click-to-select, shift-click multi-select, and click-drag box-select (full-containment, not partial-overlap) all wired end-to-end from canvas to store to Properties Panel
- Delete and Hide actions with a new `CleanupToolbar` (Delete/Hide/Undo/Redo buttons, selection-count badge, Ctrl+Z/Ctrl+Shift+Z keyboard shortcuts)
- New always-mounted `PropertiesPanel` with empty-state, single-entity detail (type/layer/color swatch/key geometry per entity type), and multi-select count+breakdown states
- Migrated canvas panning from native stage-drag to Space+left-drag, freeing plain left-drag for the box-select rubber band (1px accent stroke, accent fill, 10% opacity)
- Three-row `App.tsx` grid layout (header/toolbar/canvas) with sidebar spanning the toolbar and canvas rows; Layer Panel reduced to 240px, new 220px Properties Panel section

## Task Commits

Each task was committed atomically:

1. **Task 1 (tracer): End-to-end select, delete/hide, undo/redo, and properties panel** - `1c0c602` (feat)
2. **Task 2: Box-select rubber band with full-containment and pan mode migration** - `1f5b4ee` (feat)

**Plan metadata:** (pending — this commit)

## Files Created/Modified
- `src/store/drawingStore.ts` - Extended with selection/delete/hide Sets + zundo temporal(), renamed selectedEntityIndex → focusedEntityIndex, added toggleSelect/clearSelection/setSelection/deleteSelected/hideSelected actions
- `src/components/CanvasViewer/Stage.tsx` - Click/shift-click select, box-select rubber band (full-containment), Space+drag pan, deleted-entity filtering, hidden-entity dimming, multi-entity selection overlay
- `src/components/CanvasViewer/entities/EntityRenderer.tsx` - Added onClick/opacity/dash props threaded to all 9 shape components
- `src/components/CanvasViewer/entities/{Line,Arc,Circle,Lwpolyline,Text,Mtext,Insert,Dimension,Spline}Shape.tsx` - Accept and forward onClick/opacity/dash to their Konva elements (Insert/Dimension forward down through recursive block-entity rendering instead of onto their wrapping Group)
- `src/components/CleanupToolbar.tsx` (new) - Delete (destructive)/Hide (outline)/Undo/Redo buttons, selection-count badge, Ctrl+Z/Ctrl+Shift+Z keyboard shortcuts wired to `useDrawingStore.temporal`
- `src/components/PropertiesPanel.tsx` (new) - Always-mounted entity detail view (empty/single/multi-select states, per-entity-type geometry field mapping)
- `src/App.tsx` - Three-row grid (48px/48px/1fr), sidebar spans toolbar+canvas rows, Layer Panel 240px, new Properties Panel 220px section
- `src/components/StructureBrowser.tsx` - Renamed selectedEntityIndex → focusedEntityIndex (no logic change)
- `src/components/ui/button.tsx` - Added `destructive` variant (not previously defined)
- `package.json` / `package-lock.json` - Added `zundo@2.3.0`

## Decisions Made
- Kept `focusedEntityIndex` (Structure Browser zoom-to) and `selectedEntityIndices` (cleanup selection) as fully separate concepts per RESEARCH's recommended resolution to Open Question 1 -- lower-risk than unifying them, and CONTEXT.md never mentioned Structure Browser rows participating in cleanup selection
- Delete currently has no batch-confirmation gate at 10+ entities (that dialog is explicitly Plan 02-02's responsibility per the plan text); undo remains the safety net in the interim
- Added a `destructive` Button variant since it didn't exist in Phase 1's primitive but was required by the plan/UI-SPEC for the Delete button

## Deviations from Plan

None - plan executed exactly as written. The individual shape component files (LineShape.tsx, ArcShape.tsx, etc.) and `src/components/ui/button.tsx` were modified even though they weren't listed in the plan frontmatter's `files_modified` array -- this was explicitly required by the task's own `<action>` text ("Thread onClick, opacity, and dash through to every shape component... Each shape component receives and forwards these three new props") and by the plan's explicit instruction to use "the destructive Button variant" for the Delete button, so this is planned work executed per the task description, not scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The full manual cleanup interaction loop (select/delete/hide/undo/redo, Properties Panel) is complete and ready for Plan 02-02 (DXF export pipeline)
- Plan 02-02 will add the batch-delete confirmation dialog (AlertDialog, 10+ entities), the surgical tag-stream export filter, export validation (re-parse + count check), and the save dialog
- No blockers identified

## Self-Check: PASSED

- `src/components/CleanupToolbar.tsx` — FOUND
- `src/components/PropertiesPanel.tsx` — FOUND
- `src/store/drawingStore.ts` — FOUND (contains `temporal`, `selectedEntityIndices`, `focusedEntityIndex`)
- Commit `1c0c602` — FOUND in `git log --oneline --all`
- Commit `1f5b4ee` — FOUND in `git log --oneline --all`
- `npm run build` — exits 0 (0 TypeScript errors)
- `npm run lint` — exits 0 (0 errors; 3 pre-existing warnings unrelated to this plan)
- All plan-level `<verification>` checks re-run and passing

---
*Phase: 02-manual-cleanup-export*
*Completed: 2026-08-24*
