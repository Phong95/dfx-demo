<!-- GSD:project-start source:PROJECT.md -->

## Project

**DXF Demo**

A DXF file processing tool for civil engineers who receive structural drawings and need to clean them up before adding their own work. The application combines a web-based DXF viewer (React + TypeScript) with an MCP server that lets Claude Desktop assist with intelligent cleanup operations. Users can browse the DXF structure, select layers or object types to clean, describe their intent to the AI, and export the cleaned DXF file.

**Core Value:** Engineers can load a structural DXF drawing, clean up unwanted annotations/dimensions/notes through a mix of layer/object selection and AI-assisted decisions, and export a clean DXF ready for their own work.

### Constraints

- **Platform**: MCP server for Claude Desktop integration
- **Frontend**: React + TypeScript web application
- **Scope**: Working demo / proof of concept — not production-grade yet
- **File format**: DXF files only (the standard exchange format for CAD)

<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->

## Technology Stack

## Recommended Stack

### Core Frontend Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| React | 19.2.8 | UI framework | Already decided in PROJECT.md; current stable, mature ecosystem for interactive viewer + panel UI |
| TypeScript | **6.0.3** (NOT 7.x) | Type safety | TypeScript 7.0 (Project Corsa, native Go compiler, stable since July 2026) is now `npm install typescript`'s default `latest`, but it ships **without a stable programmatic compiler API**. `typescript-eslint`'s supported range is `>=4.8.4 <6.1.0` and a TS7-support issue was explicitly closed as "not planned." Using TS7 today breaks `typescript-eslint`, and by extension type-aware ESLint rules. TS 6.0.3 is the last line with full tooling compatibility. Revisit TS7 once `typescript-eslint`/ESLint ship 7.x support (tracked for TS 7.1's new API). |
| Vite | 8.2.2 | Build tool / dev server | Fast HMR for iterating on canvas rendering; native ESM |
| @vitejs/plugin-react-swc | 4.3.3 | Vite React plugin (SWC) | SWC-based transform is faster than Babel-based `@vitejs/plugin-react` for dev refresh; no reason to prefer Babel here since no custom Babel plugins are needed |

### DXF Parsing

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **dxf-parser** | 1.1.2 | Parse DXF text into structured JS/TS object (header, tables, layers, blocks, entities) | Dominant library: **~670k npm downloads/month**, TypeScript-native source, used as the parsing backbone by other popular tools (`three-dxf`, several viewer projects). Last published 2021 but the DXF group-code schema for these entity types is stable — staleness here is not a real risk. Its supported entity set (`LINE`, `ARC`, `CIRCLE`, `ELLIPSE`, `LWPOLYLINE`, `POLYLINE`, `POINT`, `SOLID`, `SPLINE`, `TEXT`, `MTEXT`, `MLEADER`, `DIMENSION`, `INSERT`, `ATTDEF`, `3DFACE`) covers everything a structural drawing needs. Notably it does **not** parse `HATCH` — which is fine, since hatches are explicitly out of scope ("Full CAD-quality rendering... hatches... mid-fidelity is sufficient"). |

### DXF Export / Cleanup-Write Path

### DXF Viewer / Rendering (Frontend)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **konva** | 10.3.1 | 2D canvas scene graph | Purpose-built for exactly this class of app — Konva's own guidance names "interactive applications, UI elements, design editors, annotation tools" as its sweet spot. Gives per-shape hit-testing/click/hover out of the box, which the "select elements for cleanup by layer name or object type" requirement needs without hand-rolling hit detection. |
| **react-konva** | 19.2.5 | React bindings for Konva | Declarative `<Layer>`/`<Line>`/`<Arc>`/`<Circle>` components map naturally onto DXF layers → entities; React-idiomatic vs imperative Canvas 2D API |

### MCP Server

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| @modelcontextprotocol/sdk | 1.30.0 | Official MCP server/client SDK | Official Anthropic SDK, implements the full MCP spec; `McpServer` class + `registerTool()` is the standard pattern for exposing DXF read/analyze/modify tools to Claude Desktop |
| zod | 4.4.3 | Tool input schema validation | MCP TypeScript SDK tool schemas use Standard Schema — Zod is the de facto default and most-documented option in MCP examples |
| StdioServerTransport (from SDK) | — | Transport | Claude Desktop launches MCP servers as a local subprocess and communicates over stdio — this is the correct transport for this project's "Claude Desktop integration" constraint (not the HTTP/Streamable transport, which targets remote/multi-client servers) |
| Node.js | 24.x (Active LTS) | Runtime | Current Active LTS as of August 2026 (Node 22 is Maintenance LTS, Node 26 becomes LTS in October 2026) |

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

# Frontend (React + Vite + TypeScript + viewer)

# Frontend dev dependencies

# MCP server

# MCP server dev dependencies

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

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
