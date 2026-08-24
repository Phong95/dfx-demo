---
phase: 01-load-browse-a-dxf-drawing
plan: 02
subsystem: ui
tags: [react, konva, react-konva, dxf-parser, tanstack-react-virtual, zustand]

# Dependency graph
requires:
  - phase: 01-load-browse-a-dxf-drawing (Plan 01)
    provides: DXF parsing pipeline (Web Worker, rawTagScan, resolveColors), zustand store, Konva canvas with LINE rendering, LayerPanel skeleton, UI primitives
provides:
  - Full 9-entity-type DXF canvas renderer (LINE, ARC, CIRCLE, LWPOLYLINE, TEXT, MTEXT, INSERT, DIMENSION, SPLINE)
  - Complete layer panel (swatch, count, Frozen/Lock badges, Show All/Hide All, unknown-entity warning banner)
  - Virtualized structure browser tree (layers > entity types > entities) with click-to-zoom navigation
  - Canvas hover highlighting and selection highlighting via accent color overlay
affects: [phase-02-cleanup-and-export]

# Actuals (#2632)
actuals:
  tokens: 14945
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: ["@tanstack/react-virtual@3.14.10"]
  patterns:
    - "Entity type dispatch via a single EntityRenderer switch component, one shape component per DXF entity type"
    - "DXF Y-up to canvas Y-down via per-point/per-position negation (never a global Layer/Stage scale flip)"
    - "INSERT/DIMENSION render by resolving dxf.blocks[name] and recursing through EntityRenderer with a depth guard"
    - "Hover/selection state identified by array index into dxfData.entities, not DXF group-5 handle (handle is not guaranteed present)"

key-files:
  created:
    - src/dxf/bulgeToArc.ts
    - src/dxf/flattenSpline.ts
    - src/dxf/stripMTextFormatting.ts
    - src/dxf/entityBounds.ts
    - src/components/CanvasViewer/entities/ArcShape.tsx
    - src/components/CanvasViewer/entities/CircleShape.tsx
    - src/components/CanvasViewer/entities/LwpolylineShape.tsx
    - src/components/CanvasViewer/entities/TextShape.tsx
    - src/components/CanvasViewer/entities/MtextShape.tsx
    - src/components/CanvasViewer/entities/InsertShape.tsx
    - src/components/CanvasViewer/entities/DimensionShape.tsx
    - src/components/CanvasViewer/entities/SplineShape.tsx
    - src/components/CanvasViewer/entities/EntityRenderer.tsx
    - src/components/StructureBrowser.tsx
    - src/components/ui/separator.tsx
  modified:
    - src/components/CanvasViewer/entities/LineShape.tsx
    - src/components/CanvasViewer/Stage.tsx
    - src/store/drawingStore.ts
    - src/components/LayerPanel.tsx
    - src/dxf/rawTagScan.ts
    - src/App.tsx
    - package.json

key-decisions:
  - "Extended bounding-box computation to cover all 9 entity types (not just LINE) so fit-to-view and zoom-to-entity work correctly for drawings dominated by non-LINE geometry"
  - "Renamed hoverEntityHandle to hoverEntityIndex and switched to array-index identity: dxf-parser only sets entity.handle from a raw group-5 code, which this project's own test fixture omits -- an undefined/duplicate handle would break hover matching"
  - "Hand-built a dependency-free Separator (styled div, no @radix-ui/react-separator) to avoid an unreviewed new package install for a purely decorative divider"
  - "Text/MText render with per-position Y negation and negated rotation only, no scaleY=-1 flip -- consistent with this codebase's per-point negation convention (not a global Stage/Layer flip), verified via concrete-angle derivation to avoid introducing mirrored glyph rendering"

patterns-established:
  - "Pattern: every entity shape component accepts (entity, color, strokeWidth?, onMouseEnter?, onMouseLeave?) and negates Y itself; EntityRenderer is the single type-switch dispatcher all call sites (Stage, InsertShape, DimensionShape) route through"
  - "Pattern: highlight overlays (hover/selection) render on a separate top listening={false} Konva Layer, reusing EntityRenderer with an accent color + strokeWidth=2 rather than a bespoke highlight component"

requirements-completed: [VIEW-01, VIEW-03, VIEW-04]

coverage:
  - id: D1
    description: "All 9 DXF entity types (LINE, ARC, CIRCLE, LWPOLYLINE, TEXT, MTEXT, INSERT, DIMENSION, SPLINE) render on canvas via EntityRenderer dispatch, with hover highlighting"
    requirement: VIEW-01
    verification:
      - kind: other
        ref: "npm run build (tsc -b && vite build) -- zero TypeScript errors"
        status: pass
    human_judgment: true
    rationale: "Visual rendering correctness (arc sweep direction, bulge-to-arc curvature sign, INSERT/DIMENSION block transform, SPLINE polyline fidelity) requires a human looking at a real structural DXF fixture on canvas; no browser automation tooling is available in this execution environment to capture and assert on rendered pixels."
  - id: D2
    description: "Layer panel shows color swatch, entity count, name truncation+tooltip, Frozen/Lock badges (from raw group-70 bit 4), Show All/Hide All bulk toggle, and unknown-entity warning banner"
    requirement: VIEW-03
    verification:
      - kind: other
        ref: "npm run build -- zero TypeScript errors"
        status: pass
    human_judgment: true
    rationale: "Visual layout (swatch color correctness, truncation/tooltip behavior, badge rendering) is a UI judgment call; the plan's own Task 2 acceptance criteria are visual and were not exercised in a browser in this environment."
  - id: D3
    description: "Virtualized structure browser (layers > entity types > entities, collapsed by default) with click-to-zoom-and-highlight navigation to the canvas"
    requirement: VIEW-04
    verification:
      - kind: other
        ref: "npm run build -- zero TypeScript errors"
        status: pass
    human_judgment: true
    rationale: "Plan's own Task 3 <verify> block includes an explicit <human-check> step (expand/collapse, click-to-zoom, scroll smoothness under virtualization, tooltip overflow, Unknown section) -- this is a designed manual verification point, not something this executor's tooling can automate."

duration: 25min
completed: 2026-08-24
status: complete
---

# Phase 1 Plan 2: Full Entity Rendering, Layer Panel, and Structure Browser Summary

**All 9 DXF entity types (including custom ARC sceneFunc, bulge-aware LWPOLYLINE, and block-resolving INSERT/DIMENSION) rendering via a single EntityRenderer dispatcher, a complete layer panel with swatches/counts/badges, and a `@tanstack/react-virtual`-backed structure browser with click-to-zoom navigation.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-08-24T13:50:00+07:00 (approx, first entity renderer commit at 13:56)
- **Completed:** 2026-08-24T14:05:56+07:00
- **Tasks:** 3
- **Files modified:** 23 (15 created, 7 modified, package.json/package-lock.json for one dependency)

## Accomplishments
- Every DXF entity type required by VIEW-01 now renders: LINE, ARC (custom `Shape` `sceneFunc`, not Konva's filled wedge `Arc`), CIRCLE, LWPOLYLINE (bulge-to-arc curved segments), TEXT, MTEXT (formatting-code stripped), INSERT (block resolution + recursion-guarded), DIMENSION (anonymous block resolution), SPLINE (fitPoints/controlPoints polyline approximation)
- Layer panel is feature-complete per CONTEXT.md: color swatch, entity count, name truncation with tooltip, Frozen/Lock badges sourced from the raw DXF group-70 flag (dxf-parser never reads bit 4), Show All/Hide All bulk toggle, and an unknown-entity warning banner
- Structure browser renders a virtualized (`@tanstack/react-virtual`) collapsible tree -- layers > entity types > entities -- with a dedicated Unknown section, and clicking an entity zooms/highlights it on the canvas
- Canvas hover highlighting (accent color overlay on a separate top layer) now works across all entity types, not just LINE

## Task Commits

Each task was committed atomically:

1. **Task 1: Complete all entity type renderers with DXF geometry utilities** - `44d3548` (feat)
2. **Task 2: Complete layer panel with swatches, counts, badges, and warning banner** - `055a9f1` (feat)
3. **Task 3: Structure browser with virtualized tree and click-to-zoom navigation** - `8c6edd9` (feat)

_Note: this is a non-TDD `type: execute` plan; no separate test→feat→refactor gate commits apply._

## Files Created/Modified

**Created:**
- `src/dxf/bulgeToArc.ts` - LWPOLYLINE bulge-to-arc point interpolation
- `src/dxf/flattenSpline.ts` - SPLINE fitPoints/controlPoints to polyline points
- `src/dxf/stripMTextFormatting.ts` - MTEXT `\P \H \C` formatting-code stripper
- `src/dxf/entityBounds.ts` - Bounding-box computation across all 9 entity types (fit-to-view, zoom-to-entity)
- `src/components/CanvasViewer/entities/ArcShape.tsx` - ARC via custom Konva `Shape` `sceneFunc`
- `src/components/CanvasViewer/entities/CircleShape.tsx` - CIRCLE via Konva `Circle`
- `src/components/CanvasViewer/entities/LwpolylineShape.tsx` - LWPOLYLINE with bulge support
- `src/components/CanvasViewer/entities/TextShape.tsx` - TEXT entity renderer
- `src/components/CanvasViewer/entities/MtextShape.tsx` - MTEXT with formatting stripped + attachment-point alignment
- `src/components/CanvasViewer/entities/InsertShape.tsx` - Block reference resolver with `maxDepth=5` recursion guard
- `src/components/CanvasViewer/entities/DimensionShape.tsx` - Anonymous dimension block resolver
- `src/components/CanvasViewer/entities/SplineShape.tsx` - SPLINE as flattened polyline
- `src/components/CanvasViewer/entities/EntityRenderer.tsx` - Entity type dispatcher for all 9 types
- `src/components/StructureBrowser.tsx` - Virtualized tree (layers > entity types > entities)
- `src/components/ui/separator.tsx` - Hand-built dependency-free divider

**Modified:**
- `src/components/CanvasViewer/entities/LineShape.tsx` - Added `strokeWidth`/hover-handler props for dispatch consistency
- `src/components/CanvasViewer/Stage.tsx` - Renders via `EntityRenderer`, hover + selection highlight overlay layer, zoom-to-entity effect
- `src/store/drawingStore.ts` - Added `layerFlags`, `hoverEntityIndex`, `selectedEntityIndex`, `showAllLayers`, `hideAllLayers`, `zoomToEntity`, `setHoverEntityIndex`
- `src/components/LayerPanel.tsx` - Swatch, count, badges, Show All/Hide All, warning banner
- `src/dxf/rawTagScan.ts` - Extended to parse TABLES/LAYER group-70 raw flags (frozen + locked)
- `src/App.tsx` - Sidebar split into LayerPanel (300px) + Separator + StructureBrowser
- `package.json` / `package-lock.json` - Added `@tanstack/react-virtual@3.14.10`

## Decisions Made
- Extended `computeBoundsForEntities`/`computeBoundsForEntity` (new `src/dxf/entityBounds.ts`) to cover all 9 entity types rather than leaving it LINE-only from Plan 01 -- a drawing without LINE entities would otherwise fail to fit-to-view or zoom-to-entity correctly now that all types render.
- Renamed the store's hover-tracking field from `hoverEntityHandle` (as named in the plan's artifacts table) to `hoverEntityIndex`, and switched its value from `entity.handle` to the entity's array index. Verified against dxf-parser's own source (`ParseHelpers.js`) that `entity.handle` is only set when a raw group-5 code is present in the source DXF -- confirmed absent in this project's own `test/fixtures/simple.dxf` -- so relying on it would break hover matching (multiple entities sharing `undefined`) for exactly the kind of hand-authored/simplified DXF this project is likely to encounter.
- Chose not to install `@radix-ui/react-separator` for the sidebar divider; hand-built a plain styled `<div role="separator">` instead, matching Plan 01's precedent (hand-built primitives when full Radix machinery isn't needed) and avoiding an unreviewed package install for a purely decorative element.
- Verified (via a from-scratch coordinate-transform derivation, not just following the plan's literal wording) that TEXT/MTEXT should NOT apply a `scaleY={-1}` flip on top of per-position Y negation -- this codebase's Y-flip convention negates each coordinate individually rather than mirroring via a global Layer/Stage scale, so an additional glyph-level flip would render text upside down. Rotation is still negated (DXF CCW-in-Y-up maps to Konva's clockwise-positive convention in Y-down canvas space), confirmed via a concrete 90°-rotation worked example.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Hover/selection identity switched from `entity.handle` to array index**
- **Found during:** Task 1, discovered while sanity-checking against `test/fixtures/simple.dxf`
- **Issue:** The plan's artifact table names the store field `hoverEntityHandle`, implying identification by DXF `entity.handle`. Reading dxf-parser's source confirmed `entity.handle` is only populated from an explicit raw group-5 code -- this project's own test fixture has none, leaving `entity.handle` `undefined` for every entity. Using it as a `find()` key or React list key would produce duplicate/undefined matches, breaking hover highlighting (and rendering the wrong entity's highlight) for any DXF lacking handles.
- **Fix:** Renamed the field to `hoverEntityIndex` and changed its semantics to the entity's index in `dxfData.entities` (mirroring how `selectedEntityIndex` already worked), which is always unique and defined.
- **Files modified:** `src/store/drawingStore.ts`, `src/components/CanvasViewer/Stage.tsx`
- **Verification:** `npm run build` passes; traced the fixture's raw text by hand to confirm no group-5 codes are present, confirming the bug would have manifested.
- **Committed in:** `8c6edd9` (Task 3 commit, where the fix was made alongside `selectedEntityIndex` work)

**2. [Rule 3 exclusion - package install] Reverted an unreviewed `@radix-ui/react-separator` install, hand-built the divider instead**
- **Found during:** Task 3, planning the sidebar `Separator`
- **Issue:** UI-SPEC lists `Separator` as a planned shadcn primitive not yet installed. A first attempt installed `@radix-ui/react-separator` to match the existing shadcn-primitive pattern (button/badge/scroll-area/tooltip), but per the package-manager-install exclusion in the deviation rules, a *new* package install requires an explicit human-verify checkpoint that this executor's harness could not present (no `gsd-tools` available in this environment, so auto-mode status could not even be confirmed).
- **Fix:** Uninstalled `@radix-ui/react-separator` and hand-built `src/components/ui/separator.tsx` as a plain styled `<div role="separator">`, avoiding the new dependency entirely -- appropriate since a purely decorative sidebar divider does not need Radix's ARIA/orientation machinery.
- **Files modified:** `src/components/ui/separator.tsx` (created without the dependency); `package.json`/`package-lock.json` reverted to pre-install state before the final commit.
- **Verification:** `npm run build` and `npm run lint` pass; `package.json` diff confirmed only `@tanstack/react-virtual` (pre-approved in Plan 01's package-legitimacy checkpoint) was added.
- **Committed in:** `8c6edd9` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (1 bug fix, 1 package-install exclusion avoided by hand-building instead)
**Impact on plan:** Both changes improve correctness/policy-compliance with no scope creep; the hover-identity fix is a genuine correctness fix that would otherwise have shipped a UI bug reproducible with this project's own test fixture.

## Issues Encountered
- `gsd-tools.cjs` was not present anywhere in this worktree or the main repo checkout, so `gsd_run query init.execute-phase`/`state.*`/`windows append` etc. could not be invoked. Proceeded using direct `Read`/`Write`/`Edit`/`Bash` tool calls per the plan and this document's manual creation; STATE.md/ROADMAP.md/REQUIREMENTS.md updates and the final metadata commit are deferred to whatever orchestrator step has `gsd-tools` access, or must be applied manually.
- No browser/screenshot automation tooling is available in this environment, so Task 3's explicit `<human-check>` verification step (expand/collapse behavior, click-to-zoom, virtualized-scroll smoothness, tooltip overflow, Unknown section) was not exercised interactively. Static verification (build, lint, and a preview-server HTTP 200 smoke test) passed; the `coverage:` block above marks all three deliverables `human_judgment: true` accordingly so a later `/gsd-verify-work` pass will prompt for this.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 1's full feature set (VIEW-01, VIEW-03, VIEW-04) is implemented and builds cleanly; ready for interactive UAT against a real structural DXF fixture (beyond the minimal 3-LINE test fixture used for logic verification here) before Phase 2 (cleanup/export) planning begins.
- Recommend running `/gsd-verify-work` or an equivalent manual pass with a real multi-layer, multi-entity-type DXF file to close out the `human_judgment: true` coverage items above -- particularly bulge-to-arc curvature sign (RESEARCH Assumption A5) and INSERT/DIMENSION block rendering, which are the highest-risk visual-correctness areas per RESEARCH.
- `gsd-tools`-driven STATE.md/ROADMAP.md/REQUIREMENTS.md updates and the final `docs(01-02): complete...` metadata commit were not performed in this execution (tooling unavailable) -- these should be applied by whichever step in the pipeline has `gsd-tools` access before Phase 1 is considered fully closed out.

---
*Phase: 01-load-browse-a-dxf-drawing*
*Completed: 2026-08-24*

## Self-Check: PASSED

- All 15 created files verified present on disk (dxf utilities, 9 entity shape components + EntityRenderer, StructureBrowser, separator).
- All 3 task commits verified present in `git log`: `44d3548`, `055a9f1`, `8c6edd9`.
- `npm run build` and `npm run lint` both pass with zero errors as of the final commit.
