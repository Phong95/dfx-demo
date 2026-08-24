# Walking Skeleton -- DXF Demo

**Phase:** 1
**Generated:** 2026-08-24

## Capability Proven End-to-End

A civil engineer can drag-and-drop a DXF file, see it parsed in a Web Worker with correct BYLAYER color resolution and unknown-entity detection, and view LINE entities rendered on a Konva canvas alongside a layer panel with visibility toggles in the sidebar.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | React 19.2.8 + TypeScript 6.0.3 + Vite 8.2.2 (@vitejs/plugin-react-swc 4.3.3) | Locked in PROJECT.md; Vite fast HMR for canvas iteration, SWC faster than Babel, TS 6.0.3 pinned for typescript-eslint 8.67.0 compatibility |
| DXF parsing | dxf-parser 1.1.2 in a Web Worker | Dominant JS DXF parser (~183k/wk), zero Node built-in deps (verified from published dist), Web Worker keeps UI responsive (CONTEXT.md decision) |
| Color resolution | Custom resolveColors module (never dxf-parser entity.color) | dxf-parser BYLAYER(256)/BYBLOCK(0) color output is verified broken (RESEARCH Pitfall 1); central resolver runs once at parse time before store |
| Unknown entity detection | Custom rawTagScan module (independent tag-level scan) | dxf-parser silently drops unsupported entities (RESEARCH Pitfall 2); independent raw-tag scan counts all 0-code entity types from source text |
| Rendering | Konva 10.3.1 + react-konva 19.2.5 | 2D canvas scene graph with per-shape hit-testing for Phase 2 selection; declarative React bindings |
| State management | zustand 5.0.15 | Lightweight store shared between canvas and panels without prop-drilling (CONTEXT.md decision) |
| UI components | shadcn/ui (New York, Neutral, dark mode) + lucide-react | Accessible Radix primitives; dark theme matches CAD convention canvas |
| Tree virtualization | @tanstack/react-virtual 3.14.10 | Variable-height row support for nested tree with 10k+ entities |
| Directory layout | Feature-grouped: src/dxf/ (domain), src/store/ (state), src/components/ (UI) | Separates DXF domain logic from presentation; each module independently testable |
| Deployment target | Local dev server (npm run dev) | No deployment infra for this demo/PoC |

## Stack Touched in Phase 1

- [x] Project scaffold (Vite + React + TypeScript + ESLint + shadcn/ui)
- [x] File I/O -- drag-and-drop / file picker triggers Web Worker parse pipeline
- [x] Data processing -- DXF parsed, colors resolved, unknown entities detected, all in Web Worker
- [x] State -- zustand store holds parsed model, raw file text, layer visibility, viewer transform
- [x] Canvas rendering -- Konva/react-konva renders DXF entities with resolved colors
- [x] Panel UI -- layer panel with visibility toggles, structure browser with virtualized tree
- [x] Local dev -- npm run dev serves the full SPA at localhost

## Out of Scope (Deferred to Later Slices)

- Database (none needed -- pure client-side app)
- Server/API routes (no backend in Phase 1; MCP server arrives in Phase 3)
- Authentication (single-user local tool, no auth surface)
- Cloud deployment (local dev server only for demo/PoC)
- Entity selection / click-to-select (Phase 2: CLEAN-01, CLEAN-02)
- Delete/hide entities (Phase 2: CLEAN-03)
- Undo/redo (Phase 2: CLEAN-04)
- DXF export (Phase 2: EXPORT-01, EXPORT-02)
- MCP server / Claude Desktop integration (Phase 3: MCP-01 through MCP-03)
- Full NURBS spline evaluation (mid-fidelity polyline approximation is Phase 1 bar)
- HATCH entity rendering (explicitly out of scope per PROJECT.md)

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without altering its architectural decisions:

- Phase 2: Manual Cleanup and Export -- select entities by click/box, delete/hide with undo/redo, export cleaned DXF via surgical tag-stream filter preserving untouched content byte-for-byte
- Phase 3: AI-Assisted Cleanup via MCP -- Claude Desktop connects over MCP stdio, proposes cleanup from natural language, preview/dry-run before applying destructive changes
