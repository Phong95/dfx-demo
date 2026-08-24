# Milestones

## v1 MVP (Shipped: 2026-08-24)

**Phases completed:** 3 phases, 6 plans, 11 tasks

**Key accomplishments:**

- All 9 DXF entity types (including custom ARC sceneFunc, bulge-aware LWPOLYLINE, and block-resolving INSERT/DIMENSION) rendering via a single EntityRenderer dispatcher, a complete layer panel with swatches/counts/badges, and a `@tanstack/react-virtual`-backed structure browser with click-to-zoom navigation.
- Click/shift-click/box-select entity selection, Delete/Hide actions, and Ctrl+Z/Ctrl+Shift+Z undo/redo via zundo temporal() middleware on the existing zustand drawingStore, plus an always-mounted Properties Panel and a new Cleanup Toolbar row.
- Polyline-aware entity boundary scanner + surgical byte-for-byte export filter with re-parse validation, native Save-As dialog, batch-delete confirmation, and export toasts — completing Phase 2's load-clean-export loop.
- Engine Server (WS host on 127.0.0.1:4000) + stateless MCP relay (stdio) proven end-to-end with a real list_layers round trip against a hand-built DXF fixture, resolving CONTEXT.md's single-process wording into the two-cooperating-processes design RESEARCH recommended.
- All six MCP tools (list_layers, get_structure, apply_cleanup_rule, remove_selection, confirm_proposal, export_dxf) wired end-to-end through the two-process relay, with a version-staleness-checked proposal/confirm flow and bidirectional browser sync so AI mutations render in the viewer in real time and are undoable via the existing zundo stack.

---
