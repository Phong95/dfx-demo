# Phase 2: Manual Cleanup & Export - Context

**Gathered:** 2026-08-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Engineer can select unwanted entities in the loaded drawing, remove or hide them with full undo/redo safety, and export a cleaned DXF file that preserves everything else exactly as it was. This phase completes the core load-clean-export loop entirely by hand, without AI involvement.

</domain>

<decisions>
## Implementation Decisions

### Entity Selection & Properties Panel
- Click entity to select, click empty space to deselect — standard CAD behavior with konva hit detection
- Properties panel shows: entity type, layer, color, key geometry (coordinates/radius/text content)
- Box-select via click-drag rubber band, selects all entities fully inside the box
- Selected entities shown with accent-color outline/stroke plus count badge in toolbar

### Delete/Hide & Undo/Redo
- Separate buttons: Delete (removes from export) and Hide (visual only, still included in export)
- Linear undo/redo stack with Ctrl+Z / Ctrl+Shift+Z keyboard shortcuts
- No confirmation for individual deletes (undo is the safety net), batch confirmation dialog for 10+ entities
- Hidden entities rendered at 20% opacity with dashed outline — visible but clearly distinct

### DXF Export
- "Export DXF" button in toolbar opens a save dialog
- Surgical tag-stream filter: line-by-line filter over raw DXF text, skip entity group-code blocks for deleted entities, pass everything else unchanged (byte-for-byte fidelity per EXPORT-01)
- Hidden (not deleted) entities ARE included in export — hiding is a view state, not a data mutation
- Export validation: re-parse exported file with dxf-parser, compare entity count (original minus deleted = expected) per EXPORT-02

### Claude's Discretion
No items deferred to Claude's discretion — all grey areas resolved.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Zustand `drawingStore.ts` — already manages layers, entities, visibility; extend with selection, undo, delete state
- Konva `Stage.tsx` — already has hover highlight; extend with click-select, box-select, selection overlay
- Entity renderers (`EntityRenderer.tsx` + 9 shape components) — add selection styling
- `rawTagScan.ts` — preserves raw tag positions; key for surgical export filter
- UI primitives (Button, Badge, ScrollArea, Tooltip, Separator) — reuse for properties panel and toolbar

### Established Patterns
- Entity rendering: dispatcher pattern in EntityRenderer.tsx routes by entity type
- State management: zustand with immer-style updates, shared between canvas and panels
- Layer visibility: toggle pattern already working — extend for entity-level hide/show
- Dark theme with UI-SPEC color tokens (#1E1E1E/#2A2A2E/#3B82F6/#EF4444)

### Integration Points
- Selection state in drawingStore feeds both canvas (highlight) and properties panel (details)
- Undo/redo stack wraps drawingStore mutations
- Export reads raw file text from drawingStore, cross-references deleted entity positions from rawTagScan
- Delete/hide actions dispatch through undo stack, update both drawingStore and canvas rendering

</code_context>

<specifics>
## Specific Ideas

- The raw tag stream (PARSE-04) stored from Phase 1 is the foundation for surgical export — the filter operates on the original text, not a re-serialization
- Undo/redo must cover: select, delete, hide, unhide (not layer visibility toggles — those are view state)
- Box-select needs a visual rubber band rectangle during drag
- Properties panel could share the left sidebar space with layer panel and structure browser (tabbed or stacked)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
