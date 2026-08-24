# Phase 3: AI-Assisted Cleanup via MCP - Context

**Gathered:** 2026-08-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Engineer can describe cleanup intent in natural language to Claude Desktop, which uses MCP tools to inspect the loaded drawing and propose or apply cleanup operations safely, without ever risking an unreviewed destructive change. This phase adds the MCP server, WebSocket state sync, and the two-step dry-run/confirm tool flow.

</domain>

<decisions>
## Implementation Decisions

### MCP Server Architecture
- Shared Node process: MCP server (stdio transport) + HTTP/WS server for the React app, both reading the same in-memory Document Model — per research decision in STATE.md
- 5 MCP tools: `list_layers`, `get_structure`, `apply_cleanup_rule`, `remove_selection`, `export_dxf` — matches MCP-01/02/03 requirements
- WebSocket for real-time state sync between React app and Node server — app pushes current drawing state when loaded, server pushes back changes from AI operations
- Zod schemas for tool input validation — Standard Schema integration with MCP SDK

### AI Cleanup Operations
- `apply_cleanup_rule`: accepts a rule object (e.g., {action: "delete", filter: {layer: "S-DIMS"}}), returns a preview of affected entities before applying — satisfies MCP-03 dry-run
- `remove_selection`: accepts an array of entity indices, validates they exist, returns preview, applies on confirmation — mirrors manual delete flow
- Two-step confirmation: tool returns a `proposal_id` with preview, a second `confirm_proposal` call applies it — explicit dry-run/confirm per MCP-03
- `export_dxf`: triggers the same surgical export pipeline from Phase 2, saves to a user-specified path — reuses existing code

### Integration & Claude Desktop Setup
- Single `npm run dev` starts both Vite dev server and the Node/MCP engine server
- Claude Desktop config: provide a `claude_desktop_config.json` snippet in README with stdio command
- No-drawing-loaded error: return clear message "No drawing loaded. Please load a DXF file in the viewer first."
- Real-time viewer sync: WebSocket pushes state changes from AI operations to the React app, viewer updates automatically

### Claude's Discretion
No items deferred to Claude's discretion — all grey areas resolved.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `drawingStore.ts` — zustand store with undo/redo (zundo), selection, delete/hide state — AI operations use the same mutations
- `exportDxf.ts` — surgical tag-stream filter for DXF export — reused by `export_dxf` MCP tool
- `entityTagRanges.ts` — entity boundary scanner for export — reused by removal tools
- `rawTagScan.ts` — raw tag scanner with unknown entity detection — reused by `get_structure`
- `resolveColors.ts` — BYLAYER/BYBLOCK color resolver — reused by structure reporting

### Established Patterns
- All mutations go through drawingStore actions (deleteSelected, hideSelected) with undo/redo
- Entity identification by array index (not handle) — consistent throughout Phase 1 and 2
- Surgical export via character-offset slicing of original raw text

### Integration Points
- MCP server reads from and writes to the same Document Model the React app uses
- WebSocket connection between the Node engine server and the React app for state sync
- MCP stdio transport connects to Claude Desktop as configured in claude_desktop_config.json
- AI-proposed deletions flow through the same undo/redo stack as manual deletions

</code_context>

<specifics>
## Specific Ideas

- The `confirm_proposal` tool is the key safety mechanism — nothing destructive happens without explicit confirmation via a second tool call
- `list_layers` should return layer names, colors, entity counts, and frozen/locked state — gives Claude enough context to propose intelligent cleanup
- `get_structure` should return the same tree structure the Structure Browser shows — layers > entity types > counts + unknown entity report
- The MCP server should be a separate entry point (`src/server/index.ts`) that imports from the shared domain modules

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
