# Requirements: DXF Demo

**Defined:** 2026-08-24
**Core Value:** Engineers can load a structural DXF drawing, clean up unwanted annotations/dimensions/notes through a mix of layer/object selection and AI-assisted decisions, and export a clean DXF ready for their own work.

## v1 Requirements

### DXF Parsing

- [x] **PARSE-01**: Parse DXF file into structured layers, entities, and blocks
- [x] **PARSE-02**: Resolve BYLAYER/BYBLOCK color inheritance centrally at parse time
- [x] **PARSE-03**: Report unsupported/unknown entities with counts (never silently drop)
- [x] **PARSE-04**: Preserve raw DXF tag stream alongside semantic structure for lossless export

### Viewer

- [x] **VIEW-01**: Render DXF entities on canvas with layer colors (LINE, ARC, CIRCLE, LWPOLYLINE, TEXT, MTEXT, INSERT, DIMENSION, SPLINE)
- [x] **VIEW-02**: Pan, zoom, and fit-to-view navigation
- [x] **VIEW-03**: Layer panel with show/hide toggles per layer
- [x] **VIEW-04**: Structure browser to navigate by layers and entity types

### Selection & Cleanup

- [ ] **CLEAN-01**: Click-to-select entities with properties panel showing entity details
- [ ] **CLEAN-02**: Multi-select via box select and shift-click
- [ ] **CLEAN-03**: Delete or hide selected entities from the drawing
- [ ] **CLEAN-04**: Undo/redo stack for all cleanup actions

### Export

- [ ] **EXPORT-01**: Export cleaned DXF file via surgical tag-stream filtering (preserving untouched structure byte-for-byte)
- [ ] **EXPORT-02**: Validate export by verifying re-parseable output

### MCP Server

- [ ] **MCP-01**: MCP server with stdio transport for Claude Desktop (list_layers, get_structure, apply_cleanup_rule, remove_selection, export_dxf tools)
- [ ] **MCP-02**: Natural language cleanup — user describes intent, AI proposes structured operations
- [ ] **MCP-03**: Preview/dry-run mode showing proposed changes before applying destructive operations

## v2 Requirements

### Viewer Enhancements

- **VIEW-05**: Measurement tool (distance, area)
- **VIEW-06**: "Explain this drawing" read-only structural summary via MCP

### Advanced Cleanup

- **CLEAN-05**: Rule-based selection presets (save and reuse cleanup rule sets)
- **CLEAN-06**: Batch cleanup across multiple DXF files

### AI Enhancements

- **MCP-04**: Audit log of all AI-initiated tool calls with timestamps
- **MCP-05**: Live sync — viewer reflects Claude's edits in real-time via WebSocket

## Out of Scope

| Feature | Reason |
|---------|--------|
| Adding new structural elements programmatically | User does this manually in CAD software |
| Full CAD-quality rendering (hatches, line weights) | Mid-fidelity sufficient for cleanup workflow |
| DWG file support | DXF only for v1; DWG requires proprietary libraries |
| Multi-user collaboration / cloud storage | Single-user local tool |
| Mobile app | Desktop/browser tool for professional use |
| Full CAD editing (trim, extend, fillet) | Out of scope — this is a cleanup tool, not a CAD editor |
| Text-to-CAD generation | Beyond project scope |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PARSE-01 | Phase 1 | Complete |
| PARSE-02 | Phase 1 | Complete |
| PARSE-03 | Phase 1 | Complete |
| PARSE-04 | Phase 1 | Complete |
| VIEW-01 | Phase 1 | Complete |
| VIEW-02 | Phase 1 | Complete |
| VIEW-03 | Phase 1 | Complete |
| VIEW-04 | Phase 1 | Complete |
| CLEAN-01 | Phase 2 | Pending |
| CLEAN-02 | Phase 2 | Pending |
| CLEAN-03 | Phase 2 | Pending |
| CLEAN-04 | Phase 2 | Pending |
| EXPORT-01 | Phase 2 | Pending |
| EXPORT-02 | Phase 2 | Pending |
| MCP-01 | Phase 3 | Pending |
| MCP-02 | Phase 3 | Pending |
| MCP-03 | Phase 3 | Pending |

**Coverage:**
- v1 requirements: 17 total
- Mapped to phases: 17
- Unmapped: 0

---
*Requirements defined: 2026-08-24*
*Last updated: 2026-08-24 after Phase 1 Plan 02 execution (all 8 Phase 1 requirements complete)*
</content>
