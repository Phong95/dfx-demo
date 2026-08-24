# Technology Stack

**Project:** DXF Demo — DXF processing tool for civil engineers (React viewer + MCP server)
**Researched:** 2026-08-24

## Recommended Stack

### Core Frontend Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| React | 19.2.8 | UI framework | Already decided in PROJECT.md; current stable, mature ecosystem for interactive viewer + panel UI |
| TypeScript | **6.0.3** (NOT 7.x) | Type safety | TypeScript 7.0 (Project Corsa, native Go compiler, stable since July 2026) is now `npm install typescript`'s default `latest`, but it ships **without a stable programmatic compiler API**. `typescript-eslint`'s supported range is `>=4.8.4 <6.1.0` and a TS7-support issue was explicitly closed as "not planned." Using TS7 today breaks `typescript-eslint`, and by extension type-aware ESLint rules. TS 6.0.3 is the last line with full tooling compatibility. Revisit TS7 once `typescript-eslint`/ESLint ship 7.x support (tracked for TS 7.1's new API). |
| Vite | 8.2.2 | Build tool / dev server | Fast HMR for iterating on canvas rendering; native ESM |
| @vitejs/plugin-react-swc | 4.3.3 | Vite React plugin (SWC) | SWC-based transform is faster than Babel-based `@vitejs/plugin-react` for dev refresh; no reason to prefer Babel here since no custom Babel plugins are needed |

**Confidence: HIGH** (versions verified directly against npm registry `dist-tags.latest` as of 2026-08-24; TS7/typescript-eslint incompatibility corroborated by two independent sources — Microsoft's own announcement and the typescript-eslint issue tracker)

### DXF Parsing

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **dxf-parser** | 1.1.2 | Parse DXF text into structured JS/TS object (header, tables, layers, blocks, entities) | Dominant library: **~670k npm downloads/month**, TypeScript-native source, used as the parsing backbone by other popular tools (`three-dxf`, several viewer projects). Last published 2021 but the DXF group-code schema for these entity types is stable — staleness here is not a real risk. Its supported entity set (`LINE`, `ARC`, `CIRCLE`, `ELLIPSE`, `LWPOLYLINE`, `POLYLINE`, `POINT`, `SOLID`, `SPLINE`, `TEXT`, `MTEXT`, `MLEADER`, `DIMENSION`, `INSERT`, `ATTDEF`, `3DFACE`) covers everything a structural drawing needs. Notably it does **not** parse `HATCH` — which is fine, since hatches are explicitly out of scope ("Full CAD-quality rendering... hatches... mid-fidelity is sufficient"). |

**Alternative considered and rejected for now:** `dxf-json` (0.14.1, actively maintained, published July 2026, TS-native, 50+ entity types including `HATCH`/`SPLINE`) — only ~6k downloads/month, and its own README warns "not in stable state yet... may often change name or type of the variables" before v1.0. Keep as an escape hatch only if real-world test files expose entity types `dxf-parser` mishandles.

**Do NOT use:** `dxf-parsing` (last published 2015, effectively abandoned) or hand-rolling a full DXF grammar parser — reinvents a solved problem.

**Confidence: HIGH** (download counts and publish dates from npm registry API; entity list verified from source tree)

### DXF Export / Cleanup-Write Path

**Do NOT use a DXF *generator* library** (`@tarikjabiri/dxf` 2.8.9, `dxf-writer`, `dxf-doc`) for the export feature. These libraries are built to construct a DXF file from scratch out of a JS entity model. Since this project's scope explicitly excludes adding new entities ("Adding new structural elements or annotations programmatically... user does this manually in CAD" — Out of Scope), the export path is always **filter, never generate**. Regenerating the file through a writer library would silently drop everything the writer doesn't model — header variables, `LTYPE`/`DIMSTYLE`/`STYLE` tables, XDATA, block definitions not touched by cleanup — which is a real fidelity/data-loss risk for drawings received from other firms.

**Recommended approach:** implement a small custom module (~100-150 LOC) that:
1. Tokenizes the raw DXF text into its group-code tag stream (`{code, value}` pairs) — this is a well-documented, mechanical format (pairs of lines: code, then value), not a project to reinvent a parser for.
2. Uses the already-parsed `dxf-parser` output (entity handles/layers) to identify which raw `ENTITY` tag blocks fall inside layers/types marked for removal.
3. Re-serializes the original tag stream with only those blocks excised, leaving every other byte-equivalent group untouched.

This is a **build, not buy** decision — no npm package does "parse DXF, remove some entities by criteria, write back losslessly" out of the box for JS/TS. Treat this as a first-class module in the MCP server, not a UI concern.

**Confidence: MEDIUM** (this is an architectural judgment call driven by the project's stated scope, not a verified third-party library recommendation — flag for validation once real sample DXF files are available)

### DXF Viewer / Rendering (Frontend)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **konva** | 10.3.1 | 2D canvas scene graph | Purpose-built for exactly this class of app — Konva's own guidance names "interactive applications, UI elements, design editors, annotation tools" as its sweet spot. Gives per-shape hit-testing/click/hover out of the box, which the "select elements for cleanup by layer name or object type" requirement needs without hand-rolling hit detection. |
| **react-konva** | 19.2.5 | React bindings for Konva | Declarative `<Layer>`/`<Line>`/`<Arc>`/`<Circle>` components map naturally onto DXF layers → entities; React-idiomatic vs imperative Canvas 2D API |

**Rendering approach:** Reuse the single `dxf-parser` output for both the structure-browser tree (layers, object-type counts) and the canvas render — one parse, two consumers. Map DXF `LINE`/`ARC`/`CIRCLE`/`LWPOLYLINE`/`POLYLINE`/`TEXT` entities onto Konva shapes, colored by resolved layer color (DXF ACI color index → RGB). This directly matches the stated mid-fidelity bar ("shapes + layer colors, not full CAD").

**Alternative considered and rejected:** `dxf-viewer` (vagran, 1.0.48, actively maintained June 2026, ~144k downloads/month) — a purpose-built WebGL/three.js DXF viewer with excellent large-file performance. Rejected because (a) it does **not** depend on `dxf-parser` — it bundles its own internal parser, which would force double-parsing or fighting its API to extract structured layer/entity data for the browse-structure panel; (b) it pulls in `three.js` + `opentype.js` + `earcut` for WebGL rendering, `hatches`/font-glyph precision this project explicitly doesn't need at mid-fidelity; (c) no built-in React bindings. **Revisit this if** structural drawings turn out to have tens of thousands+ entities and Konva's scene-graph overhead becomes a measured bottleneck — that is the scenario `dxf-viewer` is built for.

**Do NOT use:** plain `<canvas>` 2D API by hand, `PixiJS`, or `Fabric.js`. Plain canvas would mean re-implementing shape hit-testing for selection from scratch (Konva already solves this). PixiJS is WebGL-first and optimized for thousands of moving sprites (games) — irrelevant for a static/pannable technical drawing. Fabric.js's strength (image manipulation, freeform design-tool object model) doesn't match "render fixed DXF geometry with per-entity click-to-select."

**Confidence: HIGH** for the Konva choice (verified download volume: konva 9.9M/month, react-konva 8.3M/month — far larger ecosystem than any DXF-specific viewer; matches stated use case per Konva's own docs). **MEDIUM** on ruling out `dxf-viewer` — worth a spike if entity counts in real sample files are very large.

### MCP Server

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| @modelcontextprotocol/sdk | 1.30.0 | Official MCP server/client SDK | Official Anthropic SDK, implements the full MCP spec; `McpServer` class + `registerTool()` is the standard pattern for exposing DXF read/analyze/modify tools to Claude Desktop |
| zod | 4.4.3 | Tool input schema validation | MCP TypeScript SDK tool schemas use Standard Schema — Zod is the de facto default and most-documented option in MCP examples |
| StdioServerTransport (from SDK) | — | Transport | Claude Desktop launches MCP servers as a local subprocess and communicates over stdio — this is the correct transport for this project's "Claude Desktop integration" constraint (not the HTTP/Streamable transport, which targets remote/multi-client servers) |
| Node.js | 24.x (Active LTS) | Runtime | Current Active LTS as of August 2026 (Node 22 is Maintenance LTS, Node 26 becomes LTS in October 2026) |

**Note on versioning:** GitHub's `main` branch docs for `modelcontextprotocol/typescript-sdk` reference an in-progress "v2" release line (targeting the 2026-07-28 MCP spec revision), but the npm registry's published `latest` tag is still `1.30.0` as of 2026-08-24 — build against 1.30.0 now; treat v2 as a near-term upgrade to track, not a current dependency.

**Confidence: HIGH** for SDK choice/transport (official, unambiguous). **MEDIUM** on the v2 timeline detail (sourced from an AI-summarized GitHub README fetch, not independently cross-checked against a second source).

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zustand | 5.0.15 | Client state (selected layers, selected entities, viewer pan/zoom, cleanup intent) | Lighter than Redux for a demo/PoC; good fit for state shared between the structure-browser panel and the canvas viewer without prop-drilling |
| eslint | 10.9.0 | Linting | Pin alongside TypeScript 6.0.3 (see note above) |
| typescript-eslint | 8.67.0 | Type-aware lint rules | Requires TypeScript `<6.1.0` — this is the forcing function behind the TS 6.0.3 pin above |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| DXF parsing | dxf-parser | dxf-json | 100x smaller adoption, explicitly pre-1.0/API-unstable; only pick up if entity-coverage gaps appear |
| DXF parsing | dxf-parser | dxf (skymakerolof) | Actively maintained and does parse+SVG-render+polylines in one package, but its combined parse/render API is less battle-tested for the "structured entity data → both tree UI and canvas" split this project needs; dxf-parser's plain object output is simpler to consume from two places |
| DXF export | Custom filter-and-preserve module | @tarikjabiri/dxf / dxf-writer / dxf-doc | All are generators (build-from-scratch), not filters — wrong shape for a "remove existing entities, preserve everything else" tool |
| DXF viewer | Konva + react-konva | dxf-viewer (three.js/WebGL) | Own bundled parser (double-parse problem), heavier dependency footprint, no React bindings, built for scale this project doesn't need at mid-fidelity |
| DXF viewer | Konva + react-konva | PixiJS | WebGL-first, optimized for high-frame-rate sprite workloads (games), not needed for a mostly-static pannable technical drawing |
| TypeScript | 6.0.3 | 7.0.2 (latest) | Breaks typescript-eslint (unsupported per its own compat range); no stable programmatic compiler API yet |

## Installation

```bash
# Frontend (React + Vite + TypeScript + viewer)
npm install react@19.2.8 react-dom@19.2.8 dxf-parser@1.1.2 konva@10.3.1 react-konva@19.2.5 zustand@5.0.15

# Frontend dev dependencies
npm install -D typescript@6.0.3 vite@8.2.2 @vitejs/plugin-react-swc@4.3.3 eslint@10.9.0 typescript-eslint@8.67.0 @types/react@^19 @types/react-dom@^19

# MCP server
npm install @modelcontextprotocol/sdk@1.30.0 zod@4.4.3 dxf-parser@1.1.2

# MCP server dev dependencies
npm install -D typescript@6.0.3 @types/node@^24
```

## Sources

- npm registry API (`registry.npmjs.org`) — direct queries for `dist-tags`, publish dates, and `dependencies`/`peerDependencies` for: dxf-parser, dxf, dxf-viewer, three-dxf, @tarikjabiri/dxf, @dxfjs/parser, dxf-json, dxf-parsing, @modelcontextprotocol/sdk, konva, react-konva, zod, typescript, vite, react, react-dom, @vitejs/plugin-react, @vitejs/plugin-react-swc, eslint, typescript-eslint — HIGH confidence
- npm download-counts API (`api.npmjs.org/downloads`) — last-30-day download volume for dxf-parser, dxf, dxf-json, dxf-viewer, @modelcontextprotocol/sdk, konva, react-konva — HIGH confidence
- [github.com/gdsestimating/dxf-parser](https://github.com/gdsestimating/dxf-parser) — entity-type source listing — HIGH confidence
- [github.com/vagran/dxf-viewer](https://github.com/vagran/dxf-viewer) — README/architecture summary (via WebFetch) — MEDIUM confidence (AI-summarized fetch, cross-checked against registry `dependencies`)
- [github.com/skymakerolof/dxf](https://github.com/skymakerolof/dxf) — README summary (via WebFetch) — MEDIUM confidence
- [github.com/dotoritos-kim/dxf-json](https://github.com/dotoritos-kim/dxf-json) — README summary (via WebFetch) — MEDIUM confidence
- [github.com/modelcontextprotocol/typescript-sdk](https://github.com/modelcontextprotocol/typescript-sdk) — README summary (via WebFetch) — MEDIUM confidence (v2 timeline detail not independently cross-checked)
- [devblogs.microsoft.com/typescript/announcing-typescript-7-0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) — TS7 stable release, programmatic API gap — HIGH confidence
- [github.com/typescript-eslint/typescript-eslint issue #12518](https://github.com/typescript-eslint/typescript-eslint/issues/12518) — TS7 support explicitly "not planned" — HIGH confidence
- [konvajs.org/docs/guides/best-canvas-library.html](https://konvajs.org/docs/guides/best-canvas-library.html) — Konva vs Fabric vs PixiJS use-case guidance — MEDIUM confidence
- WebSearch aggregate results (Node.js LTS status, dxf-writer/generator library landscape, react-konva/pixi/fabric comparisons) — MEDIUM confidence, cross-checked against registry data where version-specific
