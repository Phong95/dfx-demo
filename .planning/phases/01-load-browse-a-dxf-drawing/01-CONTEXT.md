# Phase 1: Load & Browse a DXF Drawing - Context

**Gathered:** 2026-08-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Engineer can load a structural DXF file and visually browse its layers, entities, and structure in the web viewer, with confidence that colors are correct and nothing was silently dropped. This phase delivers: DXF parsing (with raw tag preservation), canvas rendering of supported entities with correct color resolution, pan/zoom navigation, a layer panel with visibility toggles, and a structure browser showing layers, entity types, and unknown entity counts.

</domain>

<decisions>
## Implementation Decisions

### DXF File Loading & Data Model
- Drag-and-drop plus a file picker button for loading DXF files — covers mouse and keyboard users
- Parsed DXF model lives in a zustand store — shared between viewer and panels without prop-drilling
- Use a Web Worker for parsing to keep UI responsive during multi-MB structural DXF files
- Store the original file text in zustand alongside the parsed data for Phase 2 export — no IndexedDB complexity

### Canvas Viewer Layout & Interactions
- Left sidebar (layer panel + structure browser) with right canvas — matches CAD tool conventions engineers already know
- Zoom via mouse wheel plus a fit-to-view button — konva supports wheel zoom natively, MVP-sufficient
- Initial view after loading: fit-to-extents — shows the full drawing so the user orients before zooming in
- Highlight entities on hover (color shift) — visual confirmation of what's under the cursor, needed for Phase 2 selection

### Layer Panel Design
- Flat list sorted alphabetically — DXF layer names are flat strings, tree grouping is premature for MVP
- Each row shows: color swatch + layer name + entity count — swatch confirms color resolution (PARSE-02), count aids browsing
- Show all / hide all buttons for bulk layer operations — high utility when drawings have 50+ layers
- Frozen/locked DXF layer states shown as badges but all layers treated as visible — engineers expect to see everything when reviewing

### Structure Browser Design
- Tree hierarchy: layers > entity types > entities — matches how engineers think about drawings
- Virtualize the entity list from the start — structural drawings can have 10k+ entities
- Clicking an entity in the structure browser: zoom to it + highlight it on canvas — bridges panel and viewer
- Unknown/unsupported entities: warning banner at top of structure browser with count, plus a dedicated "Unknown" section — satisfies PARSE-03

### Claude's Discretion
No items deferred to Claude's discretion — all grey areas resolved.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- No existing source code — greenfield project
- Technology stack decided: React 19, TypeScript 6.0.3, Vite 8.2.2, konva 10.3.1 / react-konva 19.2.5, dxf-parser 1.1.2, zustand 5.0.15

### Established Patterns
- No established patterns yet — this phase sets the conventions
- MCP server will use @modelcontextprotocol/sdk with stdio transport (Phase 3)

### Integration Points
- Zustand store will be the shared state bus between viewer canvas, layer panel, and structure browser
- dxf-parser output structure (header, tables, blocks, entities array) defines the data model shape
- Konva Stage/Layer components map to DXF layers for rendering

</code_context>

<specifics>
## Specific Ideas

- DXF color resolution (BYLAYER/BYBLOCK) must happen centrally at parse time, not per-render — requirement PARSE-02
- Raw tag stream preservation (PARSE-04) enables surgical export in Phase 2 — store the full original text
- Entity types to render: LINE, ARC, CIRCLE, LWPOLYLINE, TEXT, MTEXT, INSERT, DIMENSION, SPLINE
- HATCH is explicitly out of scope per PROJECT.md ("mid-fidelity is sufficient")

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
