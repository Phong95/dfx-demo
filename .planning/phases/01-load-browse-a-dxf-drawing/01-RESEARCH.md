# Phase 1: Load & Browse a DXF Drawing - Research

**Researched:** 2026-08-24
**Domain:** Client-side DXF parsing (dxf-parser) + Konva/react-konva canvas rendering + zustand state, in a Vite/React/TypeScript web app
**Confidence:** MEDIUM-HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**DXF File Loading & Data Model**
- Drag-and-drop plus a file picker button for loading DXF files — covers mouse and keyboard users
- Parsed DXF model lives in a zustand store — shared between viewer and panels without prop-drilling
- Use a Web Worker for parsing to keep UI responsive during multi-MB structural DXF files
- Store the original file text in zustand alongside the parsed data for Phase 2 export — no IndexedDB complexity

**Canvas Viewer Layout & Interactions**
- Left sidebar (layer panel + structure browser) with right canvas — matches CAD tool conventions engineers already know
- Zoom via mouse wheel plus a fit-to-view button — konva supports wheel zoom natively, MVP-sufficient
- Initial view after loading: fit-to-extents — shows the full drawing so the user orients before zooming in
- Highlight entities on hover (color shift) — visual confirmation of what's under the cursor, needed for Phase 2 selection

**Layer Panel Design**
- Flat list sorted alphabetically — DXF layer names are flat strings, tree grouping is premature for MVP
- Each row shows: color swatch + layer name + entity count — swatch confirms color resolution (PARSE-02), count aids browsing
- Show all / hide all buttons for bulk layer operations — high utility when drawings have 50+ layers
- Frozen/locked DXF layer states shown as badges but all layers treated as visible — engineers expect to see everything when reviewing

**Structure Browser Design**
- Tree hierarchy: layers > entity types > entities — matches how engineers think about drawings
- Virtualize the entity list from the start — structural drawings can have 10k+ entities
- Clicking an entity in the structure browser: zoom to it + highlight it on canvas — bridges panel and viewer
- Unknown/unsupported entities: warning banner at top of structure browser with count, plus a dedicated "Unknown" section — satisfies PARSE-03

### Claude's Discretion
No items deferred to Claude's discretion — all grey areas resolved.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PARSE-01 | Parse DXF file into structured layers, entities, and blocks | `dxf-parser@1.1.2` verified output shape: `{header, entities[], blocks{}, tables.layer.layers{}}` — see Code Examples & Standard Stack |
| PARSE-02 | Resolve BYLAYER/BYBLOCK color inheritance centrally at parse time | Verified gap: dxf-parser does NOT resolve entity-level BYLAYER(256)/BYBLOCK(0) sentinels correctly — see Common Pitfalls #1 and Code Examples for the required resolver |
| PARSE-03 | Report unsupported/unknown entities with counts (never silently drop) | Verified gap: dxf-parser silently drops unrecognized entity types from its output entirely — see Common Pitfalls #2 for the required raw-tag pre-scan approach |
| PARSE-04 | Preserve raw DXF tag stream alongside semantic structure for lossless export | Same raw-tag pre-scan module serves both PARSE-03 and PARSE-04 — see Architecture Patterns |
| VIEW-01 | Render DXF entities on canvas with layer colors (LINE, ARC, CIRCLE, LWPOLYLINE, TEXT, MTEXT, INSERT, DIMENSION, SPLINE) | Per-entity-type Konva rendering mapping in Code Examples; DIMENSION/SPLINE require special handling (see Common Pitfalls #3, #4) |
| VIEW-02 | Pan, zoom, and fit-to-view navigation | Verified react-konva wheel-zoom pattern (official Konva docs) + fit-to-view bounding-box formula in Code Examples |
| VIEW-03 | Layer panel with show/hide toggles per layer | Standard React + zustand pattern; layer `frozen`/`locked` badge gap documented in Common Pitfalls #5 |
| VIEW-04 | Structure browser to navigate by layers and entity types | `@tanstack/react-virtual` for the flattened, virtualized tree — see Standard Stack |

</phase_requirements>

## Summary

Phase 1 is entirely client-side: no backend/MCP server is built yet (that's Phase 3), so the project-level architecture research's "Engine Server" design does not apply here — DXF parsing, color resolution, and rendering all happen in the browser, inside a Web Worker for the parse step. This is a deliberate, sound narrowing of scope per CONTEXT.md's locked decisions, and it is safe: `dxf-parser@1.1.2`'s actual published bundle has exactly one dependency (`loglevel`, pure JS) and no Node built-in imports, so it runs in a Web Worker without polyfills — confirmed by inspecting the real compiled package, not just the source repo.

The single most load-bearing finding of this research is that **`dxf-parser` does not do the two things Phase 1's core requirements need most** (PARSE-02 color resolution and PARSE-03 unknown-entity reporting) — it only gets you partway there, and doing what the requirements ask for requires deliberate application code on top of it:

1. **BYLAYER/BYBLOCK color is broken in dxf-parser's own output.** When an entity's raw color code is 256 (BYLAYER, the DXF default) or 0 (BYBLOCK), dxf-parser still writes something into `entity.color` — it just writes the wrong thing (`AUTO_CAD_COLOR_INDEX[256]` is `undefined`; `AUTO_CAD_COLOR_INDEX[0]` is a reserved placeholder, not a color). The app must never read `entity.color` directly; it must resolve color centrally per PARSE-02, per Common Pitfalls #1.
2. **Unsupported entity types are silently dropped, not reported.** dxf-parser's entity loop only pushes entities it has a registered handler for; anything else triggers a suppressed `console.warn` (log level defaults to `'error'`) and is discarded — it never appears anywhere in the returned object. PARSE-03 ("never silently drop") cannot be satisfied by inspecting `dxf.entities` after the fact; it requires an independent raw-tag pre-scan of the `ENTITIES` section, done once, that also directly serves PARSE-04 (raw tag preservation). See Common Pitfalls #2 and Architecture Patterns.

Beyond that gap, this research also verified: exact field shapes for all nine entities VIEW-01 must render (pulled from the actual npm-published 1.1.2 package, not just the GitHub source, which is ahead of what npm serves); that DIMENSION entities carry no ready-made graphic and must be rendered by resolving their referenced anonymous block; that dxf-parser's `ILayer` has no `locked` field at all (only `frozen`, and it conflates two distinct DXF flag bits into that one field); and a verified, official Konva wheel-zoom pattern for VIEW-02.

**Primary recommendation:** Parse in a Web Worker with `dxf-parser@1.1.2` as planned, but wrap its output with two small application-owned modules before it ever reaches the zustand store: a **color resolver** (walks every entity, overrides `color` for BYLAYER/BYBLOCK sentinels using the already-correctly-resolved layer color) and a **raw-tag scanner** (a lightweight independent pass over the original DXF text that counts every `0`-code entity type seen in `ENTITIES`/`BLOCKS`, diffed against what dxf-parser actually returned, to build the unknown-entity report and preserve the tag stream). Treat these as first-class parser-output-shaping steps, not afterthoughts bolted onto the UI layer.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| DXF file parsing (dxf-parser) | Browser / Client (Web Worker) | — | CONTEXT.md locks parsing into a Web Worker; no backend exists yet in Phase 1 (MCP/backend arrives Phase 3) |
| Color resolution (BYLAYER/BYBLOCK) | Browser / Client (Web Worker, at parse time) | — | Must happen once, centrally, immediately after raw parse — before the result ever reaches the store or a render call, per PARSE-02 |
| Unknown-entity detection + raw tag preservation | Browser / Client (Web Worker, at parse time) | — | Same raw-tag scan pass serves both PARSE-03 and PARSE-04; must run alongside dxf-parser, not after, since dxf-parser discards the evidence |
| Application state (parsed model, layer visibility, selection) | Browser / Client (zustand store, main thread) | — | CONTEXT.md locks this; single store shared between viewer canvas and side panels |
| Canvas rendering (Konva/react-konva) | Browser / Client (main thread) | — | Konva requires DOM canvas access; cannot run in a Worker in this architecture |
| Structure browser virtualization | Browser / Client (main thread) | — | `@tanstack/react-virtual` operates on the rendered React tree |
| File I/O (drag-drop, file picker) | Browser / Client (main thread) | — | Browser File API; text handed to the Worker via `postMessage` |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| dxf-parser | 1.1.2 [VERIFIED: npm registry `npm view dxf-parser version` → `1.1.2`, published 2021-11-12; ~183k weekly downloads] | DXF text → structured `{header, entities, blocks, tables}` object | Dominant JS/TS DXF parser; confirmed zero Node built-in dependencies in its actual published bundle (only `loglevel`), safe for Web Worker use |
| konva | 10.3.1 [VERIFIED: npm registry `npm view konva version` → `10.3.1`; already vetted project-wide in `.planning/research/STACK.md`] | 2D canvas scene graph with per-shape hit-testing | Purpose-built for exactly this "select elements" interaction class |
| react-konva | 19.2.5 [VERIFIED: npm registry `npm view react-konva version` → `19.2.5`] | React bindings for Konva | Declarative shape components map onto DXF entities per layer |
| zustand | 5.0.15 [VERIFIED: npm registry `npm view zustand version` → `5.0.15`] | Shared client state: parsed model, raw file text, layer visibility, selection, viewer transform | Locked by CONTEXT.md; lightweight, no prop-drilling between canvas and panels |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @tanstack/react-virtual | 3.14.10 [VERIFIED: npm registry `npm view @tanstack/react-virtual version` → `3.14.10`; TanStack org, ~22M weekly downloads via `@tanstack/virtual-core` dependency chain] | Virtualize the structure-browser tree (10k+ entities) | Flatten the visible tree (layer > entity-type > entity rows, driven by expand/collapse state) into one array and feed it to `useVirtualizer`; natively supports variable-sized rows, unlike `react-window` [ASSUMED: comparison drawn from WebSearch aggregation, not a primary source read — low-risk choice given TanStack's scale, but flag if planner wants a second opinion] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @tanstack/react-virtual | react-window | Simpler API but fixed/estimated row sizing requires more workaround for a nested tree with expand/collapse; @tanstack's headless variable-size support is a better fit for this exact shape |
| Custom raw-tag pre-scan module | Trusting `dxf-parser`'s console warnings for PARSE-03 | Does not work: log level defaults to `'error'`, so `log.warn('Unhandled entity ...')` never surfaces even to the console, and even if it did, no counts/types are aggregated anywhere in the return value |
| Central color resolver | Trusting `entity.color` as returned by dxf-parser | Verified broken for BYLAYER(256)/BYBLOCK(0) sentinel values — see Common Pitfalls #1 |

**Installation:**
```bash
npm install dxf-parser@1.1.2 konva@10.3.1 react-konva@19.2.5 zustand@5.0.15 @tanstack/react-virtual@3.14.10
```

**Version verification:** All versions above were checked against the live npm registry on 2026-08-24 via `npm view <pkg> version`; dxf-parser's actual field shapes and dependency-free-ness were verified by fetching its real published `dist/` files from `unpkg.com` (not just its GitHub source, which — confirmed by comparing `package.json` `main`/`module`/`exports` fields between the two — is ahead of what's on npm at 1.1.2).

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| dxf-parser | npm | published 2021-11-12 (~5 yrs) | ~183k/wk | github.com/gdsestimating/dxf-parser | OK | Approved |
| react-konva | npm | established (konvajs org) | ~2.1M/wk | github.com/konvajs/react-konva | OK | Approved |
| react | npm | established (Meta) | ~170M/wk | github.com/react/react | OK | Approved |
| react-dom | npm | established (Meta) | ~160M/wk | github.com/react/react | OK | Approved |
| typescript | npm | established (Microsoft) | ~269M/wk | github.com/microsoft/TypeScript | OK | Approved |
| konva | npm | established (konvajs org) | ~2.7M/wk | github.com/konvajs/konva | SUS ("too-new") | Flagged — see note below |
| zustand | npm | established (pmndrs org) | ~52M/wk | github.com/pmndrs/zustand | SUS ("too-new") | Flagged — see note below |
| @tanstack/react-virtual | npm | established (TanStack org, created 2022) | ~22M/wk | github.com/TanStack/virtual | SUS ("too-new") | Flagged — see note below |
| vite | npm | established (vitejs org) | ~169M/wk | github.com/vitejs/vite | SUS ("too-new") | Flagged — see note below |
| @vitejs/plugin-react-swc | npm | established (vitejs org) | ~12.5M/wk | github.com/vitejs/vite-plugin-react | SUS ("too-new") | Flagged — see note below |

**Note on the five "too-new" SUS verdicts:** the legitimacy gate's `too-new` signal is keyed off the **latest published version's** timestamp, not the package's first-publish date — every flagged package here was updated within the last ~2-4 weeks (routine patch/minor releases) but has multi-million-to-hundred-million weekly downloads, an established GitHub org, and was already vetted at project level in `.planning/research/STACK.md`. This reads as a false-positive pattern of the heuristic, not a real risk signal. Per the Package Legitimacy Protocol these are still tagged `[WARNING: flagged as suspicious — verify before using.]` and the planner must add a `checkpoint:human-verify` task before the first install step regardless of this assessment.

**Packages removed due to `[SLOP]` verdict:** none.
**Packages flagged as suspicious `[SUS]`:** `konva`, `zustand`, `@tanstack/react-virtual`, `vite`, `@vitejs/plugin-react-swc` — all judged likely false positives (see note above), but still gate behind `checkpoint:human-verify` per protocol.

## Architecture Patterns

### System Architecture Diagram

```
   ┌─────────────────────────────┐        ┌──────────────────────────────────────┐
   │   Drop zone / file picker   │        │              Web Worker               │
   │   (main thread)             │        │                                        │
   │   reads File → raw text ────┼───────►│  1. dxf-parser.parseSync(text)         │
   └─────────────────────────────┘        │     → raw entities/blocks/tables       │
                                            │  2. rawTagScan(text)                  │
                                            │     → {typeCounts, unknownTypes,      │
                                            │        tagStream}  (PARSE-03/04)      │
                                            │  3. resolveColors(entities, layers)   │
                                            │     → color-correct entities          │
                                            │        (PARSE-02)                     │
                                            └──────────────┬─────────────────────────┘
                                                            │ postMessage(result)
                                                            ▼
                              ┌───────────────────────────────────────────────┐
                              │              zustand store (main thread)        │
                              │  rawFileText · layers{} · entities[] · blocks{} │
                              │  unknownEntityReport · layerVisibility{}        │
                              │  selection · viewerTransform                    │
                              └───────┬───────────────────┬─────────────────────┘
                                      │                   │
                        ┌─────────────▼───────┐   ┌───────▼─────────────────────┐
                        │   Left sidebar        │   │   Right canvas (react-konva) │
                        │   Layer panel          │   │   Stage → Layer per DXF layer│
                        │   Structure browser     │   │   pan/zoom/fit-to-view       │
                        │   (@tanstack/virtual)  │   │   hover highlight            │
                        └────────────────────────┘   └───────────────────────────────┘
```

### Recommended Project Structure
```
src/
├── dxf/
│   ├── dxf.worker.ts          # entry point run inside the Web Worker
│   ├── rawTagScan.ts          # independent ENTITIES/BLOCKS pre-scan → unknown-entity report + tag stream
│   ├── resolveColors.ts       # BYLAYER/BYBLOCK-safe color resolver (PARSE-02)
│   ├── aciColorIndex.ts       # local copy of the 256-entry ACI→RGB table (not exported by dxf-parser)
│   └── flattenSpline.ts       # SPLINE control/fit points → renderable polyline points
├── store/
│   └── drawingStore.ts        # zustand: rawFileText, parsed model, layer visibility, selection, viewer transform
├── components/
│   ├── DropZone.tsx
│   ├── LayerPanel.tsx
│   ├── StructureBrowser.tsx   # @tanstack/react-virtual flattened tree
│   └── CanvasViewer/
│       ├── Stage.tsx           # react-konva Stage, wheel zoom, fit-to-view
│       ├── entities/
│       │   ├── LineShape.tsx
│       │   ├── ArcShape.tsx        # custom Konva.Shape sceneFunc (see Code Examples)
│       │   ├── CircleShape.tsx
│       │   ├── LwpolylineShape.tsx # bulge-to-arc conversion per vertex
│       │   ├── TextShape.tsx
│       │   ├── MtextShape.tsx      # strips \P \H \S formatting codes before render
│       │   ├── InsertShape.tsx     # resolves block definition + transform
│       │   ├── DimensionShape.tsx  # resolves referenced anonymous block's entities
│       │   └── SplineShape.tsx     # renders flattenSpline() output as a Line
└── ...
```

### Pattern 1: Raw-tag pre-scan runs alongside dxf-parser, not after it
**What:** A small independent function walks the same raw DXF text (split into `{code, value}` group pairs — the well-documented, mechanical DXF tag format) once, in parallel with `dxf-parser.parse()`, tallying every `0`-code entity-type value it sees inside `ENTITIES` and `BLOCKS` sections. Diff that tally against `dxf.entities`'s actual type counts to get the unknown/dropped set.
**When to use:** Any time PARSE-03-style "never silently drop, report what we couldn't handle" is a requirement and the parsing library itself doesn't expose that data (confirmed true for dxf-parser — see Common Pitfalls #2).
**Example:**
```typescript
// Source: derived from dxf-parser's own DXF group-code tag format (verified: dist/DxfArrayScanner.js)
// and DxfParser.ts's parseEntities loop (verified: unpkg.com/dxf-parser@1.1.2/dist/DxfParser.js)
const SUPPORTED_TYPES = new Set([
  '3DFACE','ARC','ATTDEF','CIRCLE','DIMENSION','ELLIPSE',
  'INSERT','LINE','LWPOLYLINE','MTEXT','POINT','POLYLINE',
  'SOLID','SPLINE','TEXT','VERTEX',
]); // exact EntityName union from dist/entities/geomtry.d.ts

function rawTagScan(dxfText: string) {
  const lines = dxfText.split(/\r\n|\r|\n/);
  const typeCounts = new Map<string, number>();
  let inEntitiesOrBlocks = false;
  for (let i = 0; i < lines.length - 1; i += 2) {
    const code = Number(lines[i]);
    const value = lines[i + 1]?.trim();
    if (code === 0 && (value === 'ENTITIES' || value === 'BLOCK')) inEntitiesOrBlocks = true;
    if (code === 0 && (value === 'ENDSEC' || value === 'ENDBLK')) inEntitiesOrBlocks = false;
    if (inEntitiesOrBlocks && code === 0 && value && value !== 'ENTITIES' && value !== 'BLOCK') {
      typeCounts.set(value, (typeCounts.get(value) ?? 0) + 1);
    }
  }
  const unknown = [...typeCounts.entries()].filter(([type]) => !SUPPORTED_TYPES.has(type));
  return { typeCounts, unknown }; // unknown: [ [type, count], ... ] — feeds PARSE-03's warning banner
}
```

### Pattern 2: Central color resolver overrides dxf-parser's broken BYLAYER/BYBLOCK output
**What:** After `dxf-parser.parse()` returns, walk every entity once and recompute `resolvedColor`, never trusting the library's own `entity.color` when `colorIndex` is `256`, `0`, or `undefined`.
**When to use:** Always, immediately after parse, before the result reaches the zustand store — per PARSE-02's "centrally at parse time" requirement.
**Example:**
```typescript
// Source: derived from verified dxf-parser@1.1.2 behavior — unpkg.com/dxf-parser@1.1.2/dist/ParseHelpers.js:63-65
// `entity.color = getAcadColor(Math.abs(curr.value))` runs even for sentinel values 256/0,
// producing `undefined` (256 is out-of-bounds on the 256-entry ACI array) or a reserved
// placeholder (0). Layer colors ARE already correctly resolved by dxf-parser (no 256/0
// sentinels occur in the LAYER table), so BYLAYER resolution is a simple lookup.
import type { IDxf, IEntity } from 'dxf-parser';

function resolveEntityColor(entity: IEntity, dxf: IDxf): number {
  const layer = dxf.tables.layer.layers[entity.layer];
  if (entity.colorIndex === undefined || entity.colorIndex === 256) {
    // BYLAYER (implicit default, or explicit 256) — dxf-parser already resolved the layer's own color
    return layer?.color ?? 0xffffff;
  }
  if (entity.colorIndex === 0) {
    // BYBLOCK — no reliable per-entity source without walking the owning INSERT's context;
    // fall back to the layer color as a documented approximation (see Open Questions).
    return layer?.color ?? 0xffffff;
  }
  return entity.color; // explicit non-sentinel colorIndex (1-255) or TrueColor (group 420) — already correct
}
```

### Pattern 3: DIMENSION and INSERT both render by resolving a block, not their own fields
**What:** Neither `IDimensionEntity` nor `IInsertEntity` carries ready-made drawable geometry. `DIMENSION.block` and `INSERT.name` are both **names** into `dxf.blocks`; the actual lines/text/arrowheads live in `dxf.blocks[name].entities`, which must be rendered with the appropriate transform applied (position/rotation/scale for INSERT; the dimension's own anchor for DIMENSION's anonymous `*D…` block).
**When to use:** VIEW-01's DIMENSION and INSERT rendering.
**Example:**
```typescript
// Source: derived from verified dxf-parser@1.1.2 IDimensionEntity/IInsertEntity shapes
// (unpkg.com/dxf-parser@1.1.2/dist/entities/dimension.d.ts, insert.d.ts) — `block`/`name`
// are string references only; DXF anonymous dimension blocks are named "*D1", "*D2", etc.
function renderDimension(entity: IDimensionEntity, dxf: IDxf) {
  const block = dxf.blocks[entity.block]; // e.g. dxf.blocks['*D1']
  if (!block) return null; // block missing/malformed — bucket into "partial" per UI-SPEC backstop row
  return block.entities; // render these directly (LINE/SOLID/MTEXT), no further transform needed
}

function renderInsert(entity: IInsertEntity, dxf: IDxf) {
  const block = dxf.blocks[entity.name];
  if (!block) return null;
  // apply entity.position, entity.rotation (degrees), entity.xScale/yScale to each block.entities member
  return { block, transform: entity };
}
```

### Pattern 4: react-konva wheel zoom relative to pointer
**What:** The verified, official Konva pattern for VIEW-02's mouse-wheel zoom.
**When to use:** Stage-level `onWheel` handler.
**Example:**
```jsx
// Source: konvajs.org/docs/sandbox/Zooming_Relative_To_Pointer.html (official Konva docs, fetched 2026-08-24)
const handleWheel = (e) => {
  e.evt.preventDefault();
  const stage = stageRef.current;
  const oldScale = stage.scaleX();
  const pointer = stage.getPointerPosition();
  const mousePointTo = {
    x: (pointer.x - stage.x()) / oldScale,
    y: (pointer.y - stage.y()) / oldScale,
  };
  const direction = e.evt.deltaY > 0 ? 1 : -1; // invert if e.evt.ctrlKey for trackpad pinch
  const scaleBy = 1.01;
  const newScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy;
  stage.scale({ x: newScale, y: newScale });
  stage.position({
    x: pointer.x - mousePointTo.x * newScale,
    y: pointer.y - mousePointTo.y * newScale,
  });
};
```

### Pattern 5: Fit-to-view from a content bounding box
**What:** VIEW-02/UI-SPEC require the initial view (and a fit-to-view button) to frame the whole drawing. Compute this from the min/max of all resolved entity points, not from `$EXTMIN`/`$EXTMAX` header vars alone (those are often stale/unset in real-world files — a well-known DXF authoring inconsistency, consistent with PITFALLS.md's "don't trust header metadata blindly" theme).
**Example:**
```typescript
function fitToView(bbox: {minX: number; minY: number; maxX: number; maxY: number}, stageSize: {width: number; height: number}) {
  const contentW = bbox.maxX - bbox.minX || 1;
  const contentH = bbox.maxY - bbox.minY || 1;
  const scale = Math.min(stageSize.width / contentW, stageSize.height / contentH) * 0.9; // 10% padding
  const x = stageSize.width / 2 - (bbox.minX + contentW / 2) * scale;
  const y = stageSize.height / 2 + (bbox.minY + contentH / 2) * scale; // DXF Y-up vs canvas Y-down — flip
  return { scale, x, y };
}
```

### Pattern 6: Custom Konva.Shape for open ARC rendering
**What:** Konva's built-in `Arc` component draws a filled wedge/donut (inner/outer radius), not an open stroked arc segment matching a DXF `ARC` entity. Use a custom `Shape` with `sceneFunc` calling the native canvas `arc()` method instead.
**Example:**
```jsx
// Source: konvajs.org/docs/react/Custom_Shape.html pattern (official Konva docs)
<Shape
  sceneFunc={(ctx, shape) => {
    ctx.beginPath();
    ctx.arc(entity.center.x, -entity.center.y, entity.radius, -entity.startAngle, -entity.endAngle, true);
    ctx.strokeShape(shape);
  }}
  stroke={resolvedColorCss}
/>
```

### Anti-Patterns to Avoid
- **Reading `entity.color` straight off dxf-parser's output for rendering:** verified broken for BYLAYER(256)/BYBLOCK(0) — always route through the central resolver (Pattern 2).
- **Treating `dxf.entities.length` vs raw file entity count as the unknown-entity check after the fact:** dxf-parser gives no signal about what it dropped; the raw-tag scan (Pattern 1) must run independently, not as a post-hoc diff against something dxf-parser doesn't expose.
- **Parsing the DXF a second time on the main thread** "just to double check" — defeats the point of the Web Worker (CONTEXT.md decision) and creates two potentially-inconsistent copies of the parsed data (this mirrors Anti-Pattern 2 in the project-level ARCHITECTURE.md, still applicable even without a backend).
- **Rendering DIMENSION/INSERT by drawing their own defining points directly** instead of resolving the referenced block — produces an empty or wrong-looking dimension/block reference (Pattern 3).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| DXF group-code tokenizing for the main parse | A hand-rolled DXF grammar parser | `dxf-parser` | Already solved, TS-native, covers all nine required entity types |
| Tree/list virtualization for 10k+ entities | Manual windowing/scroll-position math | `@tanstack/react-virtual` | Variable-height row virtualization is easy to get subtly wrong (scroll jump, overscan bugs) |
| Shape hit-testing / click detection on canvas | Manual point-in-polygon / distance-to-line-segment math for every shape type | Konva's built-in per-shape hit detection | Konva already solves this for every shape type used here, needed later for Phase 2 selection but free to rely on now |
| ACI-256-index → RGB lookup | Re-deriving the AutoCAD color table from scratch | A local copy of dxf-parser's own `AutoCadColorIndex.ts` array (not exported publicly, so copy the 256-entry array verbatim) | It's dxf-parser's own verified table; reinventing it risks transcription errors in exactly the data PARSE-02 depends on |

**Key insight:** The two hand-roll-shaped problems that genuinely must be built in this phase (raw-tag pre-scan for PARSE-03/04, and the BYLAYER/BYBLOCK resolver for PARSE-02) are not solved by any existing library — they exist specifically because `dxf-parser` doesn't do them. This is the opposite of "don't hand-roll": these two modules are Phase 1's actual hard problem, verified from the library's own source, and should be budgeted as first-class design/test work, not incidental glue code.

## Common Pitfalls

### Pitfall 1: Trusting dxf-parser's `entity.color` for BYLAYER/BYBLOCK entities
**What goes wrong:** Entities with no explicit color (the DXF default, "BYLAYER") or `colorIndex === 256`/`0` get a nonsense `entity.color` value from dxf-parser (`undefined` or a reserved placeholder), which — if rendered directly — shows as black, transparent, or a JS error when passed to Konva's `stroke`/`fill` props.
**Why it happens:** dxf-parser's `checkCommonEntityProperties` calls `getAcadColor(Math.abs(colorIndex))` unconditionally on group code 62, without special-casing the 256/0 sentinel values [VERIFIED: unpkg.com/dxf-parser@1.1.2/dist/ParseHelpers.js:63-65 — `case 62: entity.colorIndex = curr.value; entity.color = getAcadColor(Math.abs(curr.value));`].
**How to avoid:** Central resolver per Pattern 2 above — resolve at parse time, before the store, never at render time per call site.
**Warning signs:** Entities rendering black/invisible on the dark canvas despite their layer clearly having a non-black color in the layer panel swatch.

### Pitfall 2: Assuming "entities dxf-parser didn't parse" is discoverable from its output
**What goes wrong:** A naive PARSE-03 implementation tries to diff "expected entity count" (e.g. from a DXF header variable) against `dxf.entities.length`, or scrapes console output for `dxf-parser`'s warnings. Neither works reliably.
**Why it happens:** `dxf-parser`'s entity loop only does `entities.push(entity)` for types with a registered handler; unrecognized types hit `log.warn('Unhandled entity ' + curr.value)` and are dropped, with `curr = scanner.next(); continue;` [VERIFIED: unpkg.com/dxf-parser@1.1.2/dist/DxfParser.js:646 — the exact warn call, inside a loop that never appends anything for the unhandled case]. The default `loglevel` level is `'error'`, so this warning is suppressed by default and would require the app to reconfigure `loglevel` globally (fragile, and still gives no counts/types, just a stream of console lines).
**How to avoid:** Independent raw-tag pre-scan per Pattern 1 — count `0`-code type values in the raw text directly, independent of what dxf-parser does with them.
**Warning signs:** A drawing with known HATCH/LEADER/3DSOLID content shows "0 unknown entities" in the UI — this is a false negative, not a clean file.

### Pitfall 3: DIMENSION and INSERT rendered from their own fields instead of their referenced block
**What goes wrong:** Code tries to draw a dimension line directly from `entity.anchorPoint`/`entity.linearOrAngularPoint1`/`entity.linearOrAngularPoint2`, or draws nothing for INSERT beyond a marker at `entity.position`.
**Why it happens:** `IDimensionEntity` and `IInsertEntity` both look like they contain enough geometry to render directly (multiple point fields), but they're the entity's *placement/definition* data, not its graphic — the graphic lives in the block they name (Pattern 3).
**How to avoid:** Always resolve `dxf.blocks[entity.block]` (DIMENSION) or `dxf.blocks[entity.name]` (INSERT) and render its `entities` array.
**Warning signs:** Dimension lines/arrowheads missing entirely from the render, or INSERT-placed content (which in structural drawings is often titleblocks, north arrows, or repeated details) simply absent from the canvas.

### Pitfall 4: SPLINE rendered as a straight line between endpoints
**What goes wrong:** A naive renderer treats SPLINE like LINE (draw from first to last point), producing a visibly wrong straight segment instead of a curve.
**Why it happens:** `dxf-parser` gives raw NURBS definition data (`controlPoints`, `fitPoints`, `degreeOfSplineCurve`, `knotValues`) with no tessellation/evaluation helper [VERIFIED: unpkg.com/dxf-parser@1.1.2/dist/entities/spline.d.ts] — turning that into drawable points is left entirely to the app.
**How to avoid:** At this project's stated mid-fidelity bar, approximate by rendering a polyline through `fitPoints` when present (usually smoother/denser), falling back to `controlPoints` when only those are present. Flag this as an approximation, not full NURBS evaluation (see Open Questions).
**Warning signs:** Curved elements in the source drawing appear as straight/faceted chords in the viewer.

### Pitfall 5: Assuming dxf-parser exposes a `locked` layer flag
**What goes wrong:** UI-SPEC calls for a "Lock" badge per CONTEXT.md's "Frozen/locked DXF layer states shown as badges" decision, but code that reads `layer.locked` from dxf-parser's output will always get `undefined`.
**Why it happens:** `ILayer` only has `{name, visible, colorIndex, color, frozen}` [VERIFIED: unpkg.com/dxf-parser@1.1.2/dist/DxfParser.d.ts]. Per the DXF LAYER table's group code 70 bit-flags — `1 = frozen`, `2 = frozen by default in new viewports`, `4 = locked` [CITED: DXF LAYER table group-code reference, cross-checked via WebSearch aggregation of Autodesk-derived documentation] — dxf-parser's own parsing logic only checks bits 1 and 2 (both folded into `frozen`) and never checks bit 4 at all [VERIFIED: unpkg.com/dxf-parser@1.1.2/dist/DxfParser.js:573-574 — `layer.frozen = ((curr.value & 1) != 0 || (curr.value & 2) != 0);` — no `& 4` check anywhere in the file].
**How to avoid:** The app's own raw-tag scan (already needed for PARSE-03/04) can read the LAYER table's raw group-70 value directly and compute `locked = (rawFlags & 4) !== 0` itself, rather than relying on dxf-parser's incomplete extraction. This is an explicit gap to flag to the user/planner — see Open Questions.
**Warning signs:** Locked-layer badge never appears in the layer panel even for a source file with genuinely locked layers.

## Code Examples

### MTEXT formatting-code stripping (before display)
```typescript
// Source: pattern corroborated across Autodesk Developer Blog / ezdxf plain_text() approach
// (WebSearch aggregation, cross-checked against multiple independent sources — CITED, not primary-read)
function stripMTextFormatting(raw: string): string {
  return raw
    .replace(/\\P/g, '\n')           // paragraph break
    .replace(/\\p[^;]*;/g, '\n')     // paragraph properties
    .replace(/\\[A-Za-z][^;\\]*;/g, '') // \Hheight; \Ccolor; \Ffont; \Wwidth; etc — strip code + arg
    .replace(/\\[{}]/g, '')          // grouping braces
    .replace(/\\~/g, ' ');           // non-breaking space code
}
```

### LWPOLYLINE bulge-to-arc conversion
```typescript
// Source: standard CAD bulge formula, cross-checked (ezdxf docs + Lee Mac Programming) — CITED.
// Sign convention (positive = CCW) should be empirically verified against a real fixture
// before shipping — see PITFALLS.md Moderate Pitfall #2, already flagged at project level.
function bulgeToArcPoints(p1: {x:number;y:number}, p2: {x:number;y:number}, bulge: number, segments = 16) {
  if (bulge === 0) return [p1, p2]; // straight segment
  const theta = 4 * Math.atan(bulge);
  const chord = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const radius = chord / (2 * Math.sin(theta / 2));
  const midX = (p1.x + p2.x) / 2, midY = (p1.y + p2.y) / 2;
  const sagitta = (bulge * chord) / 2;
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const nx = -dy / chord, ny = dx / chord; // unit normal to chord
  const centerX = midX - nx * (radius - sagitta * Math.sign(bulge));
  const centerY = midY - ny * (radius - sagitta * Math.sign(bulge));
  const startAngle = Math.atan2(p1.y - centerY, p1.x - centerX);
  const points: {x:number;y:number}[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = startAngle + (theta * i) / segments;
    points.push({ x: centerX + radius * Math.cos(a), y: centerY + radius * Math.sin(a) });
  }
  return points;
}
```

## Runtime State Inventory

Not applicable — this is a greenfield phase with no rename/refactor/migration scope.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `@tanstack/react-virtual` is the right virtualization choice over `react-window` for the tree | Standard Stack, Don't Hand-Roll | Low — both are mature, swap cost is contained to `StructureBrowser.tsx`; recommend confirming with a quick spike if planner wants certainty before committing |
| A2 | BYBLOCK (colorIndex 0) entities can be approximated with the entity's layer color as a fallback rather than resolving the owning INSERT's actual color context | Code Examples (Pattern 2) | Medium — BYBLOCK is rare for entities placed directly in modelspace and mainly matters for entities *inside* block definitions; if real structural drawings use BYBLOCK heavily inside blocks, colors on INSERT-placed content could be wrong. Flag for validation against real sample files (echoes the project-level "no real sample DXF files tested yet" gap in `.planning/research/SUMMARY.md`) |
| A3 | SPLINE entities should render as a polyline approximation through `fitPoints`/`controlPoints` rather than a true NURBS curve evaluation | Common Pitfalls #4, Code Examples | Low-Medium — acceptable at the project's stated "mid-fidelity" bar, but if structural drawings contain many splines (uncommon for structural work, more common in civil/site-grading drawings) the visual difference could be noticeable. No PROJECT.md/CONTEXT.md statement explicitly confirms this tradeoff — worth a one-line confirmation |
| A4 | Locked-layer detection requires a custom raw group-70-bit-4 read in the app's own scan, since dxf-parser never parses it | Common Pitfalls #5 | Low — UI-SPEC's "Lock" badge (lucide `Lock` icon) will simply never render without this; low implementation cost once the raw-tag scan module exists anyway for PARSE-03/04 |
| A5 | The bulge-to-arc sign convention (positive = CCW) presented in Code Examples is correct as written | Code Examples | Medium — sign errors in bulge conversion are a well-documented category of bug (PITFALLS.md Moderate Pitfall #2); must be verified against a real fixture with known arcs before considering LWPOLYLINE rendering done |

**If this table is empty:** N/A — see entries above.

## Open Questions

1. **BYBLOCK color resolution fidelity**
   - What we know: dxf-parser doesn't resolve BYBLOCK (colorIndex 0) correctly, and neither does a naive layer-color fallback capture the true DXF semantics (BYBLOCK should inherit the color active when the block was *inserted*, not the block-internal entity's own layer).
   - What's unclear: How often real structural DXF files from other firms actually use BYBLOCK vs. BYLAYER for entities inside block definitions.
   - Recommendation: Ship the layer-color fallback (Assumption A2) for Phase 1; note it as a known approximation in the UI or dev docs; revisit if real sample files (once available — flagged as a gap in project-level research) show visible color mismatches on INSERT-placed content.

2. **SPLINE fidelity bar**
   - What we know: dxf-parser gives raw control/fit point data with no curve evaluator; polyline approximation is the practical MVP path.
   - What's unclear: Whether the "mid-fidelity" bar from PROJECT.md is meant to extend to true curve smoothness for splines specifically, given they weren't called out individually in that constraint.
   - Recommendation: Proceed with the fitPoints/controlPoints polyline approximation (Assumption A3); flag to the user during plan review if this feels insufficient once real files are tested.

## Environment Availability

Skipped — this phase has no external service/runtime dependencies beyond the npm packages already covered in Standard Stack (no database, no external API, no CLI tool beyond Node/npm which is already the project's baseline toolchain).

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Single-user local tool, no auth surface in this phase |
| V3 Session Management | No | No session/auth state in this phase |
| V4 Access Control | No | No multi-user/access-control surface |
| V5 Input Validation | Yes | User-supplied DXF file is untrusted input — must not crash the app on malformed/adversarial input; parse failures must be caught and shown via the UI-SPEC's "Error state" copy, never an unhandled exception. The Web Worker boundary itself is a reasonable initial fault-isolation control (a parser crash terminates the worker, not the main UI thread) |
| V6 Cryptography | No | No cryptographic operations in this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed/adversarial DXF causing parser crash or infinite loop | Denial of Service | Wrap `dxf-parser.parse()` and the raw-tag scan in try/catch inside the worker; post a structured error message back to the main thread rather than letting the worker throw uncaught; add a reasonable file-size sanity check/warning before parsing (PITFALLS.md Minor Pitfall #3 — JS string size limits on very large files) |
| Extremely large/pathological DXF causing the Web Worker or main thread to hang | Denial of Service | The Worker boundary already prevents a hang from freezing the UI thread; consider a parse timeout the UI can react to (not a P0 for Phase 1's stated file sizes — structural DXFs are KB-low MB range per `.planning/research/ARCHITECTURE.md`'s scalability analysis) |
| MTEXT/TEXT content containing script-like strings rendered into the DOM (e.g., tooltip on hover, layer name display) | Cross-Site Scripting-adjacent | React's default JSX text-content escaping already neutralizes this as long as entity text/layer names are rendered as React children (not via `dangerouslySetInnerHTML`) — explicit guard: never use `dangerouslySetInnerHTML` anywhere in the DXF text-rendering path |

## Project Constraints (from CLAUDE.md)

- Frontend stack is locked: React 19.2.8, TypeScript **6.0.3 (not 7.x — breaks typescript-eslint)**, Vite 8.2.2, `@vitejs/plugin-react-swc` 4.3.3.
- DXF parsing: `dxf-parser@1.1.2` — confirmed still current and correct per this research.
- Rendering: `konva@10.3.1` + `react-konva@19.2.5` — confirmed current.
- State: `zustand@5.0.15` — confirmed current.
- MCP server (Phase 3, not this phase): `@modelcontextprotocol/sdk@1.30.0`, `zod@4.4.3`, stdio transport, Node 24.x LTS.
- Linting: `eslint@10.9.0` + `typescript-eslint@8.67.0` (forces the TypeScript 6.0.3 pin above).
- GSD workflow enforcement: file-changing work must go through a GSD command (`/gsd-execute-phase` etc.), not direct ad-hoc edits.

## Sources

### Primary (HIGH confidence)
- `unpkg.com/dxf-parser@1.1.2/dist/*` — actual published package contents (entity `.d.ts` files, `DxfParser.js`, `ParseHelpers.js`, `AutoCadColorIndex.ts`) — fetched and read directly this session; all entity field shapes, the silent-unknown-entity-drop behavior, the BYLAYER/BYBLOCK color bug, the missing `locked` layer field, and the zero-Node-builtin-dependency finding are all confirmed against this, not against the (newer) GitHub `master` source
- `registry.npmjs.org` via `npm view` — direct version checks for dxf-parser, konva, react-konva, zustand, @tanstack/react-virtual, react, react-dom, typescript, vite, @vitejs/plugin-react-swc
- `konvajs.org/docs/sandbox/Zooming_Relative_To_Pointer.html` — official Konva docs, fetched directly, wheel-zoom code pattern quoted verbatim
- `konvajs.org/docs/react/Custom_Shape.html` — official Konva docs, custom Shape/sceneFunc pattern for open-arc rendering

### Secondary (MEDIUM confidence)
- `vite.dev/guide/features.html#web-workers` — official Vite docs, Web Worker import syntax (fetched via WebFetch, AI-summarized extraction rather than verbatim read)
- `github.com/gdsestimating/dxf-parser` (master branch) — used to confirm the published 1.1.2 dist is a subset/earlier snapshot of this source, and to double-check field shapes matched before falling back to the published dist as the authoritative citation

### Tertiary (LOW confidence)
- WebSearch aggregation: bulge-to-arc formula (ezdxf docs + Lee Mac Programming, cross-checked but not directly read verbatim), DXF LAYER table group-70 flag bit meanings (Autodesk-derived documentation, aggregated), DIMENSION anonymous-block naming convention (`*D…`), MTEXT formatting-code stripping approach, `@tanstack/react-virtual` vs `react-window` variable-height comparison

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every version verified directly against the live npm registry this session
- Architecture: HIGH — the two critical parser gaps (color resolution, unknown-entity reporting) are verified against the actual published package source, not inferred or assumed
- Pitfalls: HIGH for Pitfalls 1, 2, 3, 5 (all directly source-verified); MEDIUM for Pitfall 4 (SPLINE — the "no evaluator" fact is verified, the recommended mitigation is a judgment call)

**Research date:** 2026-08-24
**Valid until:** 30 days (stable domain; dxf-parser hasn't published since 2021, Konva/React/Vite move faster but versions are pinned by CLAUDE.md)
