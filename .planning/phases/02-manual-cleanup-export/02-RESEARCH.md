# Phase 2: Manual Cleanup & Export - Research

**Researched:** 2026-08-24
**Domain:** Client-side entity selection/undo-redo (Konva + zustand) and surgical DXF tag-stream export filtering, extending Phase 1's browser-only architecture
**Confidence:** MEDIUM-HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Entity Selection & Properties Panel**
- Click entity to select, click empty space to deselect — standard CAD behavior with konva hit detection
- Properties panel shows: entity type, layer, color, key geometry (coordinates/radius/text content)
- Box-select via click-drag rubber band, selects all entities fully inside the box
- Selected entities shown with accent-color outline/stroke plus count badge in toolbar

**Delete/Hide & Undo/Redo**
- Separate buttons: Delete (removes from export) and Hide (visual only, still included in export)
- Linear undo/redo stack with Ctrl+Z / Ctrl+Shift+Z keyboard shortcuts
- No confirmation for individual deletes (undo is the safety net), batch confirmation dialog for 10+ entities
- Hidden entities rendered at 20% opacity with dashed outline — visible but clearly distinct

**DXF Export**
- "Export DXF" button in toolbar opens a save dialog
- Surgical tag-stream filter: line-by-line filter over raw DXF text, skip entity group-code blocks for deleted entities, pass everything else unchanged (byte-for-byte fidelity per EXPORT-01)
- Hidden (not deleted) entities ARE included in export — hiding is a view state, not a data mutation
- Export validation: re-parse exported file with dxf-parser, compare entity count (original minus deleted = expected) per EXPORT-02

### Claude's Discretion
No items deferred to Claude's discretion — all grey areas resolved.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CLEAN-01 | Click-to-select entities with properties panel showing entity details | Reuses Phase 1's `onMouseEnter`/`onMouseLeave` prop-drilling convention for `onClick`; field mapping per entity type in Code Examples; store model change in Architecture Patterns Pattern 1 |
| CLEAN-02 | Multi-select via box select and shift-click | World-space bounding-box containment algorithm (not Konva's built-in intersection helper) — see Pattern 3; shift-click toggles a `Set<number>` |
| CLEAN-03 | Delete or hide selected entities from the drawing | Store model extension (`deletedEntityIndices`, `hiddenEntityIndices`); render-time filtering in Stage.tsx |
| CLEAN-04 | Undo/redo stack for all cleanup actions | `zundo@2.3.0` `temporal()` middleware with `partialize` scoped to selection/delete/hide state only — see Pattern 2 and Common Pitfalls #5 |
| EXPORT-01 | Export cleaned DXF file via surgical tag-stream filtering (preserving untouched structure byte-for-byte) | Verified entity-boundary raw-text-range scanner design (Pattern 4) built on dxf-parser's actual parse-loop behavior, verified against local `node_modules/dxf-parser` source this session |
| EXPORT-02 | Validate export by verifying re-parseable output | Re-parse-and-diff-count validation pattern, Code Examples |

</phase_requirements>

## Summary

Phase 2 stays entirely client-side, consistent with how Phase 1 was actually built — not the project-level `ARCHITECTURE.md`'s original "Node Engine Server" design (which envisioned a backend process owning the Document Model and exposing it to both the browser and MCP). CONTEXT.md's Phase 2 decisions (a plain "Export DXF" button that opens a save dialog, no mention of a server round-trip) confirm this: cleanup, undo/redo, and export all happen in the browser, operating on the same `dxfData`/`rawFileText` already held in the Phase 1 zustand store. This is a deliberate, low-risk narrowing that Phase 3 (MCP) will need to reconcile — noted here so the planner doesn't reintroduce a server dependency this phase doesn't need.

Two findings are load-bearing for this phase, both verified directly against the locally-installed `dxf-parser@1.1.2` source (`node_modules/dxf-parser/dist/*`), not inferred:

1. **The surgical export filter's entity-boundary problem is solvable, but only if the boundary scanner is "compound-entity aware."** `dxf-parser`'s own `parseEntities()` loop pushes exactly one entity into `dxf.entities` per registered `(0, TYPE)` marker it encounters, in file order — **except** `POLYLINE`, whose handler internally consumes all following `(0, VERTEX)` groups and the terminating `(0, SEQEND)` before returning control to the outer loop [VERIFIED: `node_modules/dxf-parser/dist/entities/polyline.js` — `parsePolylineVertices()` loops `while (!scanner.isEOF())` consuming `VERTEX`/`SEQEND` internally; `node_modules/dxf-parser/dist/DxfParser.js:625-659` — outer loop only sees the next top-level `(0, ...)` after that consumption]. `VERTEX` has no registered top-level handler at all — it is explicitly commented out of registration [VERIFIED: `DxfParser.js:42` — `//dxfParser.registerEntityHandler(require('./entities/vertex'));`]. This means a raw-text entity-boundary scanner that treats every `(0, code)` group as a new entity boundary (which is exactly what Phase 1's `rawTagScan.ts` currently does) will incorrectly split one `POLYLINE` into three or more "entities" (`POLYLINE`, `VERTEX`×N, `SEQEND`) — misaligning the boundary list against `dxfData.entities`' index order and, worse, already causes a **pre-existing Phase 1 bug**: any file with a `POLYLINE` will report a false `SEQEND` entry under "unknown entities" in the layer panel banner, because `SEQEND` isn't in `rawTagScan.ts`'s `SUPPORTED_TYPES` set. Phase 2's new boundary scanner must be polyline-aware (Pattern 4), and fixing `rawTagScan.ts`'s existing false-positive is a natural, low-cost byproduct of building it correctly.
2. **CONTEXT.md's box-select "fully inside the box" requirement is a different algorithm than the official Konva rubber-band recipe.** The documented Konva pattern (`konvajs.org/docs/select_and_transform/Basic_demo.html`) uses `Konva.Util.haveIntersection()` — ANY-overlap semantics — not full containment [CITED: konvajs.org, fetched this session]. Copying that recipe verbatim would select entities that only partially cross the rubber band, contradicting the locked decision. The correct approach for this codebase is not to query rendered Konva nodes at all, but to reuse Phase 1's own `computeBoundsForEntity()` (already built for fit-to-view/zoom-to-entity) against a screen→world-space-converted rubber-band rectangle, using the same inverse-transform math `Stage.tsx`'s wheel-zoom handler already uses. This sidesteps needing per-shape refs/ids entirely and is more consistent with the codebase's existing "entity index is the source of truth" convention.

**Primary recommendation:** Extend the existing zustand `drawingStore` (do not introduce a second store) with `selectedEntityIndices: Set<number>`, `deletedEntityIndices: Set<number>`, `hiddenEntityIndices: Set<number>`, wrap the store creator in `zundo@2.3.0`'s `temporal()` middleware with `partialize` scoped to exactly those three fields (never `layerVisibility`, `viewerTransform`, or `hoverEntityIndex` — CONTEXT.md explicitly excludes view-state from undo), and build the export filter as a new polyline-aware entity-boundary scanner that produces character-offset (not just line-index) ranges into the *original* `rawFileText` string, so the byte-for-byte guarantee holds even if the source file uses CRLF line endings.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Entity selection (click, shift-click, box-select) | Browser / Client (main thread, zustand store) | — | No backend exists (Phase 1 precedent); selection is pure client state driving both canvas highlight and properties panel |
| Undo/redo history | Browser / Client (zustand + zundo, main thread) | — | `zundo` operates directly on the zustand store in-memory; no persistence requirement stated |
| Delete/hide state | Browser / Client (zustand store) | — | Non-destructive flags on the existing `dxfData`/index model, consistent with Phase 1's array-index entity identity |
| Properties panel rendering | Browser / Client (React, main thread) | — | Reads directly from `dxfData.entities[i]` + `resolvedColor`, already in the store |
| Surgical DXF export filter | Browser / Client (main thread, synchronous string ops on `rawFileText`) | — | `rawFileText` already lives in the browser store (Phase 1 decision: "no IndexedDB complexity"); no backend to delegate to. Consider a Web Worker only if profiling shows main-thread jank on very large files (see Common Pitfalls #7) |
| Export validation (re-parse + count check) | Browser / Client (main thread, reuses `dxf-parser`) | — | Same `dxf-parser` instance already bundled client-side per Phase 1; no new dependency |
| File save (native Save-As dialog) | Browser / Client (File System Access API, with `<a download>` fallback) | — | No backend to write to disk on the user's behalf; this is a browser-native capability |

## Standard Stack

### Core (unchanged from Phase 1, reused)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| dxf-parser | 1.1.2 [VERIFIED: locally installed, confirmed via Phase 1 research] | Already-loaded parse result (`dxfData`) is read for selection/properties; re-invoked for EXPORT-02 validation | No new parse dependency needed |
| konva / react-konva | 10.3.1 / 19.2.5 [VERIFIED: Phase 1 research, unchanged] | Click/hover hit-testing already wired; extend with `onClick` + rubber-band overlay | Same rendering layer, no new library |
| zustand | 5.0.15 [VERIFIED: Phase 1 research, unchanged] | Existing `drawingStore` extended, not replaced | Consistency with established pattern |

### New for Phase 2
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zundo | 2.3.0 [VERIFIED: npm registry `npm view zundo version` → `2.3.0`, published 2024-11-17, ~383k weekly downloads] | Undo/redo middleware wrapping the zustand store's `temporal()` history | Purpose-built for exactly "undo/redo middleware for zustand"; zero-dependency, <1kB, officially supports zustand v5 [CITED: github.com/charkour/zundo README, fetched this session] which matches the project's pinned `zustand@5.0.15`. Hand-rolling a command-pattern undo stack on top of zustand would duplicate what this library already solves correctly (deep-equality skip-on-no-change, configurable history limit, `partialize` to scope tracked state) |
| @radix-ui/react-alert-dialog | 1.1.23 [VERIFIED: npm registry `npm view @radix-ui/react-alert-dialog version`] | Batch-delete (10+) confirmation dialog, installed transitively via `npx shadcn add alert-dialog` | Locked by `02-UI-SPEC.md`; Radix primitive, same family as Phase 1's Tooltip/ScrollArea |
| sonner | 2.0.8 [VERIFIED: npm registry `npm view sonner version`] | Export success / validation-failure toast, installed via `npx shadcn add sonner` | Locked by `02-UI-SPEC.md`; shadcn's default toast solution (shadcn does not ship its own `Toast` primitive anymore — Sonner is the current recommended component) [CITED: ui.shadcn.com/docs/components/radix/sonner, fetched this session] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| zundo | Hand-rolled `{past: State[], future: State[]}` array in the store | Reinvents deep-equality checks, history limits, and pause/resume semantics zundo already provides; only reason to hand-roll would be avoiding a dependency, not worth it for a well-scoped, tiny (<1kB), actively-maintained library |
| zundo | `use-undo` / `use-undoable` (generic React hooks, not zustand-specific) | Would require lifting selection/delete/hide state out of the zustand store into a separate hook, breaking the single-store pattern Phase 1 established and complicating the canvas/panel state-sharing that motivated zustand in the first place |
| Konva `haveIntersection`-based box-select | World-space bbox containment against `computeBoundsForEntity()` | The official Konva recipe requires per-shape node refs/classes and gives ANY-overlap semantics; CONTEXT.md explicitly requires full-containment, and the codebase already has a bbox-per-entity function built for a different purpose (fit-to-view) that a containment check can reuse directly |
| File System Access API `showSaveFilePicker` | Always fall back to `<a download>` Blob anchor (no picker) | `showSaveFilePicker` gives a real native "Save As" dialog matching CONTEXT.md's "opens a save dialog" wording, but only works in Chromium browsers [CITED: developer.chrome.com/docs/capabilities/web-apis/file-system-access, fetched this session] — must feature-detect and fall back, not assume availability |

**Installation:**
```bash
npm install zundo@2.3.0
npx shadcn add alert-dialog sonner
```

**Version verification:** All versions above were checked against the live npm registry on 2026-08-24 via `npm view <pkg> version`. `dxf-parser`/`konva`/`react-konva`/`zustand` versions are unchanged from Phase 1 (already verified there) and were re-confirmed present in this project's own `node_modules` and `package.json` this session.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| zundo | npm | published 2024-11-17 (~2 yrs) | ~383k/wk | github.com/charkour/zundo | OK | Approved |
| @radix-ui/react-alert-dialog | npm | established (Radix primitives org) | ~49M/wk | github.com/radix-ui/primitives | OK | Approved |
| sonner | npm | established (emilkowalski) | ~52M/wk | github.com/emilkowalski/sonner | SUS ("too-new") | Flagged — see note below |

**Note on the `sonner` "too-new" SUS verdict:** identical false-positive pattern to Phase 1's five SUS flags — the legitimacy gate keys off the *latest published version's* timestamp (2026-08-09, a routine patch), not first-publish date. 52M weekly downloads and an established, non-anonymous maintainer make this a near-certain false positive. Per protocol, still tagged `[WARNING: flagged as suspicious — verify before using.]` and the planner must add a `checkpoint:human-verify` task before this install step.

**Packages removed due to `[SLOP]` verdict:** none.
**Packages flagged as suspicious `[SUS]`:** `sonner` — judged a likely false positive (see note above), but still gate behind `checkpoint:human-verify` per protocol.

## Architecture Patterns

### System Architecture Diagram

```
  ┌───────────────────────────────────────────────────────────────────────┐
  │                     drawingStore (zustand, extended)                   │
  │                                                                         │
  │  Phase 1 (unchanged, untracked by undo):                               │
  │    dxfData · rawFileText · layerVisibility · viewerTransform ·         │
  │    hoverEntityIndex · unknownEntityReport                              │
  │                                                                         │
  │  Phase 2 (NEW — wrapped by zundo temporal(), partialize'd to these 3): │
  │    selectedEntityIndices: Set<number>                                  │
  │    deletedEntityIndices:  Set<number>                                  │
  │    hiddenEntityIndices:   Set<number>                                  │
  └───────────┬──────────────────────────────────┬─────────────────────────┘
              │                                    │
   ┌──────────▼───────────┐            ┌──────────▼──────────────────────┐
   │  Stage.tsx (canvas)    │            │  Properties Panel (new)          │
   │  - onClick → toggle    │            │  reads selectedEntityIndices →   │
   │    selection (shift)   │            │  dxfData.entities[i] fields      │
   │  - rubber-band drag    │            └───────────────────────────────────┘
   │    (LOCAL React state,           ┌──────────────────────────────────┐
   │    never in the store) │────────►│  Cleanup Toolbar (new)            │
   │  - filters out deleted;│         │  Delete / Hide / Undo / Redo      │
   │    dims+dashes hidden  │         │  buttons; Ctrl+Z / Ctrl+Shift+Z   │
   └─────────────────────────┘         │  → useDrawingStore.temporal      │
                                        │    .getState().undo()/.redo()    │
                                        └──────────────┬────────────────────┘
                                                        │ on "Export DXF"
                                                        ▼
                              ┌──────────────────────────────────────────────┐
                              │  Export pipeline (new, src/dxf/exportDxf.ts)   │
                              │  1. buildEntityTagRanges(rawFileText)          │
                              │     → char-offset ranges, 1:1 with             │
                              │       dxfData.entities order (polyline-aware)  │
                              │  2. filter out ranges for deletedEntityIndices │
                              │  3. reconstruct string by SLICING rawFileText  │
                              │     (never split+rejoin — preserves exact      │
                              │     original line-ending bytes)                │
                              │  4. re-parse output with dxf-parser (EXPORT-02)│
                              │     compare entity count vs (original - N)     │
                              │  5. showSaveFilePicker() or <a download>       │
                              │     fallback                                   │
                              └──────────────────────────────────────────────┘
```

### Recommended Project Structure (additions to Phase 1's layout)
```
src/
├── dxf/
│   ├── entityTagRanges.ts     # NEW — polyline-aware raw-text entity boundary scanner (Pattern 4)
│   ├── exportDxf.ts           # NEW — filter + reconstruct + validate (EXPORT-01/02)
│   ├── rawTagScan.ts          # EXISTING — fix SEQEND false-"unknown" using entityTagRanges' polyline-aware walk (bonus fix, see Common Pitfalls #1)
│   └── entityBounds.ts        # EXISTING — reused unchanged for box-select containment (Pattern 3)
├── store/
│   └── drawingStore.ts        # EXTENDED — add selection/delete/hide state, wrap with zundo temporal()
├── components/
│   ├── CleanupToolbar.tsx     # NEW — Delete/Hide/Undo/Redo buttons, selection-count badge, Export DXF button
│   ├── PropertiesPanel.tsx    # NEW — always-mounted, empty-state + single + multi-select summary (per UI-SPEC)
│   ├── ui/
│   │   ├── alert-dialog.tsx   # NEW — via `npx shadcn add alert-dialog`
│   │   └── sonner.tsx         # NEW — via `npx shadcn add sonner`
│   └── CanvasViewer/
│       └── Stage.tsx          # EXTENDED — onClick select, rubber-band overlay (local state), render loop skips deleted, dims hidden
```

### Pattern 1: Selection/delete/hide state lives in the same store, keyed by the same array index as Phase 1
**What:** Do not introduce entity IDs, handles, or a separate selection store. `selectedEntityIndices`, `deletedEntityIndices`, `hiddenEntityIndices` are all `Set<number>` keyed by the exact same index into `dxfData.entities` that Phase 1's `hoverEntityIndex`/`selectedEntityIndex` (singular) already used.
**When to use:** Every read/write of selection, delete, or hide state.
**Why:** Phase 1 already established and documented (in `STATE.md`) that array index — not `entity.handle` — is the stable identity, specifically because `dxf-parser`'s `ensureHandle()` auto-assigns a synthetic incrementing handle when the raw file has no group-5 code [VERIFIED: `DxfParser.js:686-691` — `if (!entity.handle) entity.handle = lastHandle++;`], which is not guaranteed collision-free against real handles and was already rejected as an identity source in Phase 1. Continue that convention.
**Note — naming collision to resolve during planning:** Phase 1's `zoomToEntity(entityIndex)` action (called from the Structure Browser) currently sets the singular `selectedEntityIndex` used only for canvas highlight-on-zoom. Phase 2 needs a *plural*, cleanup-purpose selection (`selectedEntityIndices`). These are semantically different ("what am I looking at" vs "what will Delete/Hide act on") — the plan must either (a) rename Phase 1's field to something like `focusedEntityIndex` and keep it fully separate from the new cleanup selection, or (b) deliberately unify structure-browser clicks into the cleanup selection too. CONTEXT.md does not address this explicitly; flagged as an Open Question below.

### Pattern 2: zundo `temporal()` wraps the store, `partialize` scopes tracked state to exactly 3 fields
**What:** Wrap the existing `create<DrawingState>(...)` call with zundo's `temporal(config, options)`, where `options.partialize` returns only `{ selectedEntityIndices, deletedEntityIndices, hiddenEntityIndices }`.
**When to use:** Store setup, once.
**Example:**
```typescript
// Source: derived from zundo README usage pattern (github.com/charkour/zundo, fetched this session)
// and zustand's own middleware composition docs. zundo requires zustand v4.2+/v5 for TS —
// project is pinned to zustand@5.0.15.
import { create } from 'zustand';
import { temporal } from 'zundo';

interface DrawingState {
  // ...Phase 1 fields (rawFileText, dxfData, layerVisibility, viewerTransform, hoverEntityIndex, ...)
  selectedEntityIndices: Set<number>;
  deletedEntityIndices: Set<number>;
  hiddenEntityIndices: Set<number>;
  // actions: toggleSelect, clearSelection, setSelection (box-select finalize),
  // deleteSelected, hideSelected, unhideSelected
}

export const useDrawingStore = create<DrawingState>()(
  temporal(
    (set, get) => ({
      // ...existing Phase 1 state/actions unchanged...
      selectedEntityIndices: new Set(),
      deletedEntityIndices: new Set(),
      hiddenEntityIndices: new Set(),
      // actions mutate these three fields only, always via `set()`
    }),
    {
      partialize: (state) => ({
        selectedEntityIndices: state.selectedEntityIndices,
        deletedEntityIndices: state.deletedEntityIndices,
        hiddenEntityIndices: state.hiddenEntityIndices,
      }),
      limit: 100, // reasonable cap; CONTEXT.md doesn't specify a limit, flagged in Open Questions
    },
  ),
);

// Component usage:
// const { undo, redo } = useDrawingStore.temporal.getState();
```
**Critical caveat (see Common Pitfalls #5):** CONTEXT.md's "Undo/redo must cover: select, delete, hide, unhide" literally includes *selection changes* in the undo history, not just destructive actions. Since `partialize` tracks `selectedEntityIndices` too, every commit to that field becomes a history entry — including intermediate states during a drag. The rubber-band rectangle's live coordinates during a drag must therefore **never** be written to the store (keep them as local `useState`/`useRef` in `Stage.tsx`); only the *final* resulting index set is committed to `selectedEntityIndices` on `mouseup`, so a box-select drag produces exactly one undo step, not dozens.

### Pattern 3: Box-select uses world-space bbox containment, not Konva's `haveIntersection`
**What:** On rubber-band `mouseup`, convert the screen-space selection rectangle into the same coordinate space `computeBoundsForEntity()` already operates in (canvas space, Y already DXF-negated — see `entityBounds.ts`'s own doc comment), using the Stage's current transform. Then test each visible, non-deleted entity's bbox for **full containment**, not intersection.
**When to use:** Rubber-band `mouseup` handler.
**Example:**
```typescript
// Source: coordinate-inversion formula matches Stage.tsx's existing handleWheel
// (verified in this codebase, src/components/CanvasViewer/Stage.tsx:117-120);
// containment check derived from CONTEXT.md's explicit "fully inside the box" requirement,
// which the official Konva rubber-band recipe (haveIntersection, ANY-overlap) does not satisfy.
function screenRectToWorld(rect: {x: number; y: number; width: number; height: number}, stage: Konva.Stage) {
  const scale = stage.scaleX();
  return {
    minX: (rect.x - stage.x()) / scale,
    minY: (rect.y - stage.y()) / scale,
    maxX: (rect.x + rect.width - stage.x()) / scale,
    maxY: (rect.y + rect.height - stage.y()) / scale,
  };
}

function isFullyContained(entityBox: BoundingBox, world: ReturnType<typeof screenRectToWorld>): boolean {
  return (
    entityBox.minX >= world.minX &&
    entityBox.maxX <= world.maxX &&
    entityBox.minY >= world.minY &&
    entityBox.maxY <= world.maxY
  );
}

// In the mouseup handler:
const world = screenRectToWorld(rubberBandRect, stageRef.current!);
const newlySelected = dxfData.entities
  .map((entity, index) => ({ entity, index }))
  .filter(({ entity, index }) => {
    if (deletedEntityIndices.has(index)) return false;
    if (!layerVisibility[entity.layer]) return false;
    const box = computeBoundsForEntity(entity);
    return box !== null && isFullyContained(box, world); // entities with no bbox (unrendered types) never match
  })
  .map(({ index }) => index);
```

### Pattern 4: Polyline-aware entity-boundary scanner for the surgical export filter
**What:** A raw-text walker, structurally similar to `rawTagScan.ts`'s existing SECTION/TABLE tracking, that emits one `{startOffset, endOffset}` **character-offset** range per entity in `ENTITIES`, in the exact order `dxf-parser` pushes them into `dxfData.entities` — meaning `POLYLINE` consumes its trailing `VERTEX`/`SEQEND` groups into the same range, and unsupported types are also range-tracked (so they can be verified as untouched, even though they're never deletable).
**When to use:** Built once per loaded file (can run in the Web Worker alongside the existing parse, or lazily on first Export click — file sizes are KB–low MB per project research, so this is not perf-critical).
**Why character offsets, not line-array indices:** `rawTagScan.ts` currently does `dxfText.split(/\r\n|\r|\n/)`, which **discards the actual separator bytes**. Rejoining with a single assumed separator (e.g., always `\n`) after array manipulation would silently normalize a CRLF-authored file (the common case for Windows-authored AutoCAD/Civil3D DXFs) to LF — violating EXPORT-01's explicit "byte-for-byte" requirement for untouched content. Track offsets into the *original string* and use `.slice()` to reconstruct, never split-mutate-join.
**Example:**
```typescript
// Source: derived from this session's direct verification of node_modules/dxf-parser/dist/DxfParser.js
// (parseEntities loop, lines 625-659) and node_modules/dxf-parser/dist/entities/polyline.js
// (parsePolylineVertices, consumes VERTEX/SEQEND internally) — NOT from dxf-parser's public API,
// since it exposes no boundary/offset information itself.
const SUPPORTED_TYPES = new Set([
  '3DFACE', 'ARC', 'ATTDEF', 'CIRCLE', 'DIMENSION', 'ELLIPSE',
  'INSERT', 'LINE', 'LWPOLYLINE', 'MTEXT', 'POINT', 'POLYLINE',
  'SOLID', 'SPLINE', 'TEXT',
]); // matches dxf-parser's registered _entityHandlers exactly (VERTEX excluded — never a top-level handler)

interface EntityRange { startOffset: number; endOffset: number; type: string }

function buildEntityTagRanges(dxfText: string): EntityRange[] {
  // Tokenize preserving offsets: alternating (code, value) pairs, each tracked with
  // its start offset in the ORIGINAL string (not the split array).
  const tokenRe = /([^\r\n]*)(\r\n|\r|\n|$)/g;
  const tokens: { text: string; offset: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(dxfText)) !== null) {
    if (match[0].length === 0) break; // avoid infinite loop at end
    tokens.push({ text: match[1], offset: match.index });
    if (match[2] === '') break;
  }

  const ranges: EntityRange[] = [];
  let inEntities = false;
  let current: EntityRange | null = null;
  let inPolyline = false;

  for (let i = 0; i < tokens.length - 1; i += 2) {
    const code = Number(tokens[i].text);
    const value = tokens[i + 1]?.text.trim();
    if (Number.isNaN(code) || value === undefined) continue;

    if (code === 0 && value === 'SECTION') {
      const next = tokens[i + 2]?.text.trim();
      inEntities = Number(tokens[i + 2]?.text) === 2 && next !== undefined
        ? tokens[i + 3]?.text.trim() === 'ENTITIES'
        : false;
      continue;
    }
    if (code === 0 && value === 'ENDSEC') {
      if (current) { current.endOffset = tokens[i].offset; ranges.push(current); current = null; }
      inEntities = false;
      continue;
    }
    if (!inEntities || code !== 0) continue;

    if (value === 'VERTEX' || value === 'SEQEND') {
      // Continuation of the preceding POLYLINE range -- do NOT close/start a range.
      continue;
    }

    // New top-level entity marker.
    if (current) { current.endOffset = tokens[i].offset; ranges.push(current); }
    current = { startOffset: tokens[i].offset, endOffset: -1, type: value };
    inPolyline = value === 'POLYLINE';
    void inPolyline; // VERTEX/SEQEND handled above regardless of this flag
  }

  // Only SUPPORTED_TYPES ranges align 1:1 with dxfData.entities, in order.
  return ranges.filter((r) => SUPPORTED_TYPES.has(r.type));
}

// Export filter: given deletedEntityIndices and the SUPPORTED_TYPES-filtered ranges
// (which are index-aligned with dxfData.entities), slice out deleted ranges and
// concatenate everything else UNCHANGED.
function filterDxfText(dxfText: string, ranges: EntityRange[], deletedIndices: Set<number>): string {
  let result = '';
  let cursor = 0;
  ranges.forEach((range, index) => {
    if (deletedIndices.has(index)) {
      result += dxfText.slice(cursor, range.startOffset); // keep everything BEFORE the deleted range
      cursor = range.endOffset; // skip the deleted range itself
    }
  });
  result += dxfText.slice(cursor); // keep the remainder (all untouched content, byte-for-byte)
  return result;
}
```
**Verification requirement before trusting this in production:** This pattern is derived from reading the parser's actual control flow, not from a published spec for "how to safely edit a DXF's ENTITIES section." Test against a real multi-entity, mixed-type (including at least one `POLYLINE`) fixture and diff the exported bytes outside the deleted ranges against the original file — this is the single highest-risk piece of Phase 2 and should get dedicated round-trip test coverage (per `STATE.md`'s already-logged concern: "Surgical tag-stream filter/writer has no reference implementation to draw from").

### Pattern 5: Export validation re-parses in-memory, never writes-then-checks
**What:** Before invoking the save dialog, run `new DxfParser().parseSync(filteredText)` on the in-memory filtered string and compare `result.entities.length` against `originalDxfData.entities.length - deletedEntityIndices.size`. Only proceed to the save dialog if they match (per EXPORT-02 and the UI-SPEC's export-failure toast/no-file-written contract).
**Example:**
```typescript
import DxfParser from 'dxf-parser';

function validateExport(filteredText: string, expectedEntityCount: number): boolean {
  try {
    const parser = new DxfParser();
    const reparsed = parser.parseSync(filteredText);
    return reparsed !== undefined && reparsed !== null && reparsed.entities.length === expectedEntityCount;
  } catch {
    return false; // malformed output -- treat as validation failure, per UI-SPEC
  }
}
```

### Pattern 6: Save dialog with feature detection and fallback
**What:** Prefer `showSaveFilePicker()` (native Save-As, matches CONTEXT.md's "opens a save dialog" wording); fall back to a Blob + `<a download>` anchor click when unavailable (Firefox, Safari) [CITED: developer.chrome.com/docs/capabilities/web-apis/file-system-access, fetched this session].
**Example:**
```typescript
async function saveDxf(text: string, suggestedName: string): Promise<void> {
  if ('showSaveFilePicker' in window) {
    const handle = await (window as any).showSaveFilePicker({
      suggestedName,
      types: [{ description: 'DXF Drawing', accept: { 'application/dxf': ['.dxf'] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
    return;
  }
  // Fallback: Blob + anchor download (no picker UI -- browser auto-saves to Downloads).
  const blob = new Blob([text], { type: 'application/dxf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName;
  a.click();
  URL.revokeObjectURL(url);
}
```
**Note:** `showSaveFilePicker` throws `AbortError` if the user cancels the dialog — this must be caught and treated as "no-op," not an export failure/toast.

### Anti-Patterns to Avoid
- **Treating every `(0, code)` group in `ENTITIES` as a new entity boundary:** breaks on `POLYLINE`/`VERTEX`/`SEQEND` — this is the exact pre-existing bug in `rawTagScan.ts`'s type-counting logic (Pattern 4, Common Pitfalls #1).
- **Split-then-rejoin line arrays for the export filter:** loses the source file's exact line-ending bytes, violating "byte-for-byte" for untouched content even when nothing was deleted from that region.
- **Reusing the official Konva rubber-band `haveIntersection` recipe verbatim:** wrong selection semantics for this project's locked "fully inside" requirement (Pattern 3).
- **Storing the live rubber-band rectangle in the zustand store:** would either spam the undo history with every drag-move frame, or require excluding it from `partialize` in a way that's easy to get wrong — keep it as ephemeral local React state instead.
- **Assuming `entity.handle` is a safe undo-command identity key:** `dxf-parser` synthesizes handles when absent from the source file; continue using array index (Pattern 1), consistent with Phase 1.
- **Calling `showSaveFilePicker` without a feature check:** throws a `ReferenceError`/`TypeError` in Firefox/Safari, not a graceful rejection — must feature-detect first (Pattern 6).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Undo/redo history bookkeeping (deep-equal skip, history limit, past/future arrays) | A custom `{past, future}` reducer on top of zustand | `zundo@2.3.0`'s `temporal()` middleware | Purpose-built, tiny, zustand-v5-compatible, already solves the deep-equality-skip and limit concerns correctly |
| Batch-delete confirmation dialog | A hand-rolled modal/overlay | `@radix-ui/react-alert-dialog` via `npx shadcn add alert-dialog` | Locked by `02-UI-SPEC.md`; accessible-by-default Radix primitive, consistent with Phase 1's Tooltip/ScrollArea sourcing |
| Export success/failure notification | A hand-rolled toast component | `sonner` via `npx shadcn add sonner` | Locked by `02-UI-SPEC.md`; shadcn's current standard toast solution |
| DXF entity-boundary detection for the export filter | Regenerating DXF text from the semantic parse tree (a "writer" approach) | The polyline-aware raw-text offset scanner (Pattern 4) | Confirmed at the project-architecture level (`ARCHITECTURE.md` Anti-Pattern 1) that JS DXF parser/writer libraries have incompatible object models — surgical text filtering is the only approach that guarantees byte-for-byte preservation of untouched content, including entity types the app doesn't even render (HATCH, LEADER, etc., if present) |

**Key insight:** Unlike Phase 1 (where the two hand-roll-shaped problems were forced by `dxf-parser` gaps), this phase's genuinely-must-hand-roll piece is narrower and more precisely scoped: the entity-boundary scanner (Pattern 4). Everything else — undo/redo, dialogs, toasts — has a solid off-the-shelf answer and should not be reimplemented.

## Common Pitfalls

### Pitfall 1: `SEQEND` false-positive in the existing "unknown entity" report
**What goes wrong:** Any loaded file containing a `POLYLINE` entity shows a spurious `SEQEND` entry in the Phase 1 "unsupported entity" warning banner and Structure Browser's "Unknown" section.
**Why it happens:** `rawTagScan.ts`'s `typeCounts` treats every `(0, code)` inside `ENTITIES` as a distinct type, including `SEQEND` — but `SEQEND` has no registered top-level handler in `dxf-parser` [VERIFIED: `DxfParser.js` handler registration list — no `SEQEND` handler exists; it's only consumed inside `Polyline.parseEntity()`'s internal loop], so it's absent from `rawTagScan.ts`'s `SUPPORTED_TYPES` set and gets misclassified as "unknown."
**How to avoid:** Build Pattern 4's polyline-aware scanner as the shared source of truth; either extend `rawTagScan.ts` to use the same VERTEX/SEQEND-skip logic, or have both modules call a shared low-level tokenizer.
**Warning signs:** A test fixture with a `POLYLINE` shows "1 unsupported entity type(s) found" for `SEQEND` even though the file is fully supported.

### Pitfall 2: Byte-for-byte fidelity broken by line-array split/rejoin
**What goes wrong:** A CRLF-authored DXF (common for Windows-based CAD tools) gets its untouched-content line endings silently normalized to LF (or vice versa) in the exported file, technically satisfying "re-parses correctly" (EXPORT-02) but failing the stricter "byte-for-byte" wording of EXPORT-01/CONTEXT.md.
**Why it happens:** JavaScript's `.split(/\r\n|\r|\n/)` discards the matched separator; naive re-joining with `.join('\n')` picks one convention regardless of the source.
**How to avoid:** Character-offset slicing directly against the original string (Pattern 4's `filterDxfText`), never array split/rejoin, for the export path specifically (the existing `rawTagScan.ts` split-based approach remains fine for its own read-only counting purpose, since it never re-serializes).
**Warning signs:** A byte-diff of the exported file against the original (outside deleted ranges) shows differences even when nothing near that region was touched.

### Pitfall 3: Konva's official rubber-band recipe selects too much
**What goes wrong:** Implementing box-select with `Konva.Util.haveIntersection()` (the documented pattern) selects entities that merely cross the rubber band's edge, not just ones fully inside it — directly contradicting CONTEXT.md's locked "fully inside the box" requirement.
**Why it happens:** The official Konva demo is written for a generic shape-editor use case (select-to-transform), where partial-overlap selection is the expected UX; this project's requirement is different.
**How to avoid:** Use Pattern 3's full-containment bbox check instead of copying the demo's `haveIntersection` call.
**Warning signs:** Dragging a small box that only clips the corner of a large LWPOLYLINE still selects it.

### Pitfall 4: Unrendered entity types can never be selected
**What goes wrong:** `ATTDEF`, `3DFACE`, `ELLIPSE`, `POINT`, and `SOLID` entities are parsed by `dxf-parser` into `dxfData.entities` (so they count toward layer entity counts in the Layer Panel) but have no `case` in `EntityRenderer.tsx`'s switch [VERIFIED: `src/components/CanvasViewer/entities/EntityRenderer.tsx:41-142` — `default: return null;`] and no `case` in `entityBounds.ts`'s `expandBoundsForEntity` [VERIFIED: `src/dxf/entityBounds.ts:38-97` — no case for these 5 types, falls to `default: return false`]. They render nothing, so they have no click target and no bbox — they can never be selected via click or box-select, and therefore can never be deleted/hidden manually in this phase.
**Why it happens:** Phase 1's VIEW-01 requirement scoped rendering to exactly 9 entity types; these 5 are parsed (because `dxf-parser` supports them) but were out of Phase 1's rendering scope.
**How to avoid:** This is a known, pre-existing scope boundary, not a Phase 2 bug — Pattern 3's containment check already handles it gracefully (`computeBoundsForEntity` returning `null` naturally excludes them from box-select results). Document this as an accepted MVP limitation; do not attempt to add rendering for these types in Phase 2 unless the planner decides to scope it in explicitly (out of CONTEXT.md's stated decisions).
**Warning signs:** A user reports "I can see a POINT/SOLID entity count in the layer panel but can't click on anything to select it."

### Pitfall 5: `zundo`'s tracked-state scope must exclude selection-drag noise, but CONTEXT.md wants selection itself tracked
**What goes wrong:** Two competing requirements collide: CONTEXT.md says undo must cover "select" as an action, but if every intermediate mouse-move during a box-select drag were written to the tracked store field, the undo history would fill with dozens of near-identical selection states per drag.
**Why it happens:** `zundo`'s `partialize` tracks a field's *committed* value on every `set()` call to that field — it has no concept of "in-progress" vs "final" unless the app itself only commits final values.
**How to avoid:** Keep the rubber-band rectangle's live coordinates in local component state (never in the zustand store); only call the store's `setSelection(indices)` action once, on `mouseup`, with the final result (Pattern 2's caveat).
**Warning signs:** Pressing Ctrl+Z once after a box-select drag doesn't fully undo the selection, or requires many presses.

### Pitfall 6: `showSaveFilePicker` cancellation must not be treated as an error
**What goes wrong:** User clicks "Export DXF," the native picker opens, they click Cancel — if the code treats the resulting `AbortError` the same as a validation failure, the export-failure toast fires incorrectly.
**Why it happens:** `showSaveFilePicker()` rejects its promise with `DOMException: AbortError` on user cancellation, which looks like any other thrown error to a generic `catch`.
**How to avoid:** Check `error.name === 'AbortError'` and treat it as a silent no-op (button returns to "Export DXF" with no toast), distinct from the validation-failure path.
**Warning signs:** Toast reads "Couldn't validate the exported file" every time a user simply changes their mind about the save location.

### Pitfall 7: Very large selections make per-entity bbox containment checks a linear scan
**What goes wrong:** Box-select on a drawing with 10k+ entities recomputes `computeBoundsForEntity()` for every entity on every `mouseup` — acceptable for MVP file sizes but worth flagging.
**Why it happens:** No spatial index exists (none was needed for Phase 1's hover/fit-to-view, which only computes bounds once per interaction, not on every frame).
**How to avoid:** For this project's stated scale (structural DXFs, KB–low MB per `ARCHITECTURE.md`'s scalability analysis), a single linear scan on `mouseup` (not per `mousemove` frame) is fine — do not add a spatial index (R-tree/quadtree) unless profiling on a real large fixture shows a problem. Flagged here only so a future phase doesn't need to rediscover this tradeoff.
**Warning signs:** Visible input lag between releasing the mouse button and the selection highlight appearing, on a real large structural drawing.

## Code Examples

### Properties Panel field mapping per entity type
```typescript
// Source: field names verified against this codebase's existing EntityRenderer.tsx /
// entityBounds.ts usage this session (ILineEntity.vertices, IArcEntity.center/radius,
// ICircleEntity.center/radius, ITextEntity.startPoint/text, IMtextEntity.position,
// per src/components/CanvasViewer/entities/*.tsx and src/dxf/entityBounds.ts read this session).
// CONTEXT.md: "entity type, layer, color, key geometry (coordinates/radius/text content)";
// UI-SPEC.md: missing fields render as em-dash "—", not omitted.
function getKeyGeometryFields(entity: IEntity): Array<[label: string, value: string]> {
  switch (entity.type) {
    case 'LINE': {
      const [a, b] = (entity as ILineEntity).vertices;
      return [['Start', `${a.x.toFixed(2)}, ${a.y.toFixed(2)}`], ['End', `${b?.x.toFixed(2)}, ${b?.y.toFixed(2)}`]];
    }
    case 'CIRCLE':
    case 'ARC': {
      const e = entity as ICircleEntity | IArcEntity;
      return [['Center', `${e.center.x.toFixed(2)}, ${e.center.y.toFixed(2)}`], ['Radius', String(e.radius)]];
    }
    case 'TEXT':
    case 'MTEXT': {
      const text = (entity as ITextEntity | IMtextEntity).text ?? '—';
      return [['Text', text]];
    }
    default:
      return []; // UI-SPEC: unmatched fields render "—" via the caller, not omitted rows
  }
}
```

### Keyboard shortcut wiring (Ctrl+Z / Ctrl+Shift+Z only, no Ctrl+Y)
```typescript
// Source: CONTEXT.md explicitly specifies only Ctrl+Z / Ctrl+Shift+Z -- do not also
// bind Ctrl+Y (a common alternate redo shortcut) since it's not in the locked decision.
useEffect(() => {
  function handleKeydown(e: KeyboardEvent) {
    const isMod = e.ctrlKey || e.metaKey;
    if (!isMod || e.key.toLowerCase() !== 'z') return;
    e.preventDefault(); // prevent native browser undo (e.g., in an unrelated text input)
    const { undo, redo } = useDrawingStore.temporal.getState();
    if (e.shiftKey) redo();
    else undo();
  }
  window.addEventListener('keydown', handleKeydown);
  return () => window.removeEventListener('keydown', handleKeydown);
}, []);
```

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | "Delete" removes the entity both visually (from the canvas render) and from export, not just from export while remaining visible | Architecture Patterns, Summary | Low — CONTEXT.md's parenthetical only says "(removes from export)" but ROADMAP.md's Phase 2 success criteria #3 ("select the entities from the drawing") and ordinary CAD-tool conventions strongly imply visual removal too; if wrong, the fix is a one-line render-filter change |
| A2 | `zundo`'s `limit` option (history depth cap) should default to something reasonable (e.g., 100) since CONTEXT.md doesn't specify a cap | Architecture Patterns Pattern 2 | Low — an unbounded history is also acceptable for a demo/PoC scope; worth a one-line confirmation during planning |
| A3 | Structure Browser's existing `zoomToEntity`/`selectedEntityIndex` (Phase 1, singular, "focus/zoom" semantics) should remain a **separate** concept from the new plural cleanup-selection state, not be merged into it | Architecture Patterns Pattern 1 | Medium — if the planner assumes these are meant to unify (clicking a Structure Browser row also marks it for deletion), the UI/UX and state shape differ meaningfully; CONTEXT.md is silent on this interaction, listed as Open Question 1 |
| A4 | `showSaveFilePicker`'s MIME type for `.dxf` should be `application/dxf` even though DXF has no IANA-registered official MIME type | Architecture Patterns Pattern 6 | Low — browsers use this value cosmetically for file-type filtering in the picker dialog; an incorrect/unregistered MIME type does not affect file content or the resulting `.dxf` extension |

**If this table is empty:** N/A — see entries above.

## Open Questions

1. **Does clicking an entity in the Structure Browser (Phase 1's `zoomToEntity`) participate in the new cleanup selection, or stay a separate "focus" concept?**
   - What we know: Phase 1 built a singular `selectedEntityIndex` purely for zoom+highlight from the Structure Browser. CONTEXT.md's Phase 2 decisions describe selection only in terms of canvas click/box-select/shift-click, never mentioning the Structure Browser.
   - What's unclear: Whether a Structure Browser click should now also add the entity to `selectedEntityIndices` (making it deletable via the toolbar), or remain purely a "look at this" navigation aid.
   - Recommendation: Default to keeping them separate (rename the Phase 1 field to `focusedEntityIndex` to avoid confusion) unless the planner has reason to unify them — this is the lower-risk, less-surprising interpretation and requires no CONTEXT.md re-litigation.

2. **Undo history depth limit**
   - What we know: CONTEXT.md specifies "linear undo/redo stack," no cap mentioned.
   - What's unclear: Whether an unbounded history is acceptable, or whether a cap (memory/perf consideration for very long cleanup sessions) is expected.
   - Recommendation: Default to zundo's `limit: 100` (Assumption A2); trivial to change later since it's a single config value.

3. **Does the properties panel's "Color" field show the resolved hex value, the DXF colorIndex/ACI number, or both?**
   - What we know: CONTEXT.md says "layer, color" as a field; `02-UI-SPEC.md` doesn't specify format beyond a generic field-label/value row.
   - What's unclear: Whether engineers reviewing the panel expect the raw ACI index (a number CAD users are often familiar with, e.g., "7" for white) alongside or instead of the swatch/hex.
   - Recommendation: Show a color swatch (reusing `LayerPanel.tsx`'s existing swatch pattern) plus the resolved hex value; this matches the Layer Panel's existing convention and needs no new data (already have `resolvedColor` per entity).

## Environment Availability

Skipped — this phase has no external service/runtime/CLI dependency beyond the npm packages already covered in Standard Stack (all client-side, matching Phase 1's precedent). Browser API availability (`showSaveFilePicker`) is a *per-end-user-browser* runtime concern, not a development-machine dependency, and is addressed via feature-detection + fallback in Architecture Patterns Pattern 6 rather than this section.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Single-user local tool, no auth surface (unchanged from Phase 1) |
| V3 Session Management | No | No session/auth state |
| V4 Access Control | No | No multi-user/access-control surface |
| V5 Input Validation | Yes | The export filter operates on user-supplied, potentially adversarial/malformed DXF text; a boundary-detection bug must fail safe (reject export, show the validation-failure toast) rather than silently produce corrupted output. Re-parse-and-count validation (Pattern 5/EXPORT-02) is the primary control |
| V6 Cryptography | No | No cryptographic operations in this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Entity-boundary scanner misidentifies a range (e.g., an unusual/malformed compound entity), silently deleting or corrupting unrelated content on export | Tampering (data-integrity, not classic security, but same fail-safe principle) | Never trust the boundary scanner's output without EXPORT-02's re-parse-and-count validation gate; a count mismatch must block the save entirely (already the locked UI-SPEC behavior) |
| Extremely large selection (near-total drawing) causing the batch-delete path or export filter to hang the main thread | Denial of Service | Linear-time algorithms only (Pattern 4's filter is a single O(n) pass; Pattern 3's containment check is O(entities) per box-select release, not per frame — see Common Pitfalls #7); no unbounded loops driven by user-controlled recursion |
| Malformed/adversarial DXF causing the new export-path re-parse (`dxf-parser.parseSync`) to throw uncaught | Denial of Service | Wrap in try/catch (Pattern 5 already does this); treat any thrown error as validation failure, never let it propagate to an unhandled exception in the UI thread |
| Properties panel rendering entity `text`/`layer` content that could contain script-like strings | Cross-Site Scripting-adjacent | Same guard as Phase 1: render as React children only, never `dangerouslySetInnerHTML` — carries forward unchanged, no new risk introduced by this phase's new panel |

## Project Constraints (from CLAUDE.md)

- Frontend stack is locked: React 19.2.8, TypeScript **6.0.3 (not 7.x — breaks typescript-eslint)**, Vite 8.2.2, `@vitejs/plugin-react-swc` 4.3.3 — unchanged, no new build-tool decisions needed this phase.
- DXF parsing: `dxf-parser@1.1.2` — reused for both the original parse and EXPORT-02's re-parse validation; no new parsing library.
- Rendering: `konva@10.3.1` + `react-konva@19.2.5` — extended (click handler, rubber-band overlay), not replaced.
- State: `zustand@5.0.15` — extended (existing store), wrapped with the new `zundo@2.3.0` dependency.
- GSD workflow enforcement: file-changing work must go through a GSD command (`/gsd-execute-phase` etc.), not direct ad-hoc edits.
- MCP server (Phase 3, not this phase): `@modelcontextprotocol/sdk@1.30.0`, `zod@4.4.3`, stdio transport, Node 24.x LTS — out of scope for Phase 2, noted only so the planner doesn't pull it in early.

## Sources

### Primary (HIGH confidence)
- `node_modules/dxf-parser/dist/DxfParser.js`, `entities/polyline.js`, `entities/text.js` — this project's actually-installed `dxf-parser@1.1.2` package, read directly this session; the `parseEntities()` loop, entity-handler registration list, `POLYLINE`'s internal `VERTEX`/`SEQEND` consumption, and `ensureHandle()`'s synthetic-handle behavior are all confirmed against this source, not inferred
- `registry.npmjs.org` via `npm view` — direct version checks this session for `zundo`, `sonner`, `@radix-ui/react-alert-dialog`, `shadcn` (CLI package)
- `src/store/drawingStore.ts`, `src/components/CanvasViewer/Stage.tsx`, `src/components/CanvasViewer/entities/EntityRenderer.tsx`, `src/dxf/entityBounds.ts`, `src/dxf/rawTagScan.ts`, `src/dxf/resolveColors.ts`, `src/components/LayerPanel.tsx`, `src/components/StructureBrowser.tsx`, `src/App.tsx`, `src/components/ui/button.tsx`, `components.json`, `package.json` — this project's own existing source, read directly this session to ground every Phase 2 pattern in the actual codebase rather than a generic recommendation

### Secondary (MEDIUM confidence)
- `github.com/charkour/zundo` README (fetched via WebFetch this session) — `temporal()` API shape, `partialize`/`limit`/`onSave`/`handleSet` options, component-usage pattern
- `konvajs.org/docs/select_and_transform/Basic_demo.html` (fetched via WebFetch this session) — official rubber-band recipe, cited specifically to explain why it does NOT match this project's containment requirement
- `developer.chrome.com/docs/capabilities/web-apis/file-system-access` (fetched via WebFetch this session) — `showSaveFilePicker` API shape, `createWritable`/`write`/`close`, browser support caveat
- `ui.shadcn.com/docs/components/radix/sonner` (fetched via WebFetch this session) — install command, `Toaster` mount pattern

### Tertiary (LOW confidence)
- WebSearch aggregation cross-checks for zundo's weekly-download/adoption figures and Firefox/Safari File System Access API non-support (corroborated by the primary Chrome-docs fetch above, but the WebSearch summary itself is aggregated, not a single authoritative source)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all new-dependency versions verified directly against the live npm registry this session; existing dependencies re-confirmed present in this project's own `package.json`/`node_modules`
- Architecture (entity-boundary scanner, Pattern 4): HIGH — derived from directly reading this project's actually-installed `dxf-parser` source code this session, not from documentation or inference; the polyline/VERTEX/SEQEND behavior and the pre-existing `rawTagScan.ts` SEQEND bug are both independently verifiable by re-reading the same files
- Architecture (box-select containment, undo/redo scoping): MEDIUM-HIGH — the containment algorithm is this researcher's synthesis grounded in the codebase's existing `computeBoundsForEntity`/transform-inversion code (verified), not a documented third-party pattern; zundo's API is CITED from its own README, not independently exercised in a running app this session
- Pitfalls: HIGH for Pitfalls 1, 2, 4 (directly source-verified against `dxf-parser`/this codebase); MEDIUM for Pitfalls 3, 5, 6, 7 (reasoned from verified building blocks plus CITED external docs, not exercised end-to-end)

**Research date:** 2026-08-24
**Valid until:** 30 days (stable domain; `dxf-parser` unchanged since Phase 1, `zundo`/`sonner`/`@radix-ui/react-alert-dialog` versions pinned; re-verify if `zustand` is upgraded past a major version zundo hasn't caught up to)
