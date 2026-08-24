# Roadmap: DXF Demo

## Overview

DXF Demo takes an engineer from "I have a messy structural DXF from another firm" to "I have a clean DXF ready for my own work," in three vertical slices. Phase 1 proves the hardest domain risk first: parsing a real DXF into a trustworthy structure (correct colors, preserved raw data, no silently-dropped entities) and rendering it in a web viewer the engineer can actually browse. Phase 2 completes the core value loop entirely by hand — select, delete/hide, undo/redo, export a byte-faithful cleaned file — so the product is useful even before any AI is involved. Phase 3 adds the differentiator: Claude Desktop, via MCP, can inspect the same drawing and propose/apply cleanup through natural language, with a preview step so nothing destructive happens without the engineer's confirmation.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Load & Browse a DXF Drawing** - Parse a DXF into layers/entities/blocks with resolved colors and an unknown-entity report, and render it in a pannable, zoomable web viewer with a layer panel and structure browser.
- [ ] **Phase 2: Manual Cleanup & Export** - Select entities by click or box, delete/hide them with full undo/redo, and export a cleaned DXF that preserves everything untouched byte-for-byte — completing the core load-clean-export loop by hand.
- [ ] **Phase 3: AI-Assisted Cleanup via MCP** - Claude Desktop connects over MCP to inspect the loaded drawing, propose cleanup operations from natural-language intent, and apply them only after a preview/dry-run confirmation.

## Phase Details

### Phase 1: Load & Browse a DXF Drawing

**Goal**: Engineer can load a structural DXF file and visually browse its layers, entities, and structure in the web viewer, with confidence that colors are correct and nothing was silently dropped.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: PARSE-01, PARSE-02, PARSE-03, PARSE-04, VIEW-01, VIEW-02, VIEW-03, VIEW-04
**Success Criteria** (what must be TRUE):

  1. User can open a DXF file and see it parsed into layers, entities, and blocks, with the original raw tag stream preserved internally to support lossless export later
  2. User can view the drawing rendered on canvas (LINE, ARC, CIRCLE, LWPOLYLINE, TEXT, MTEXT, INSERT, DIMENSION, SPLINE) with entities colored by their correctly resolved BYLAYER/BYBLOCK color
  3. User can pan, zoom, and fit-to-view to navigate the rendered drawing
  4. User can toggle individual layer visibility on/off from a layer panel
  5. User can browse the drawing's structure by layer and entity type, including a visible count of any unsupported/unknown entities encountered during parsing

**Plans:** 2 plans
Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Walking Skeleton tracer: scaffold + DXF parsing pipeline + LINE rendering + layer panel + pan/zoom/fit

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — Full entity rendering (9 types) + complete layer panel + structure browser + hover/click interactions

**UI hint**: yes

### Phase 2: Manual Cleanup & Export

**Goal**: Engineer can select unwanted entities in the loaded drawing, remove or hide them with full undo/redo safety, and export a cleaned DXF file that preserves everything else exactly as it was — delivering a complete, usable load-clean-export workflow without needing AI.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: CLEAN-01, CLEAN-02, CLEAN-03, CLEAN-04, EXPORT-01, EXPORT-02
**Success Criteria** (what must be TRUE):

  1. User can click an entity in the viewer to select it and see its details in a properties panel
  2. User can select multiple entities at once via box-select or shift-click
  3. User can delete or hide the selected entities from the drawing
  4. User can undo and redo any cleanup action they've taken, in sequence
  5. User can export the cleaned drawing to a DXF file that re-parses correctly and preserves all untouched content byte-for-byte

**Plans**: TBD
**UI hint**: yes

### Phase 3: AI-Assisted Cleanup via MCP

**Goal**: Engineer can describe cleanup intent in natural language to Claude Desktop, which uses MCP tools to inspect the loaded drawing and propose or apply cleanup operations safely, without ever risking an unreviewed destructive change.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: MCP-01, MCP-02, MCP-03
**Success Criteria** (what must be TRUE):

  1. User can connect Claude Desktop to the MCP server (stdio transport) and have it list layers and get the structure of the currently loaded drawing
  2. User can describe a cleanup intent in natural language and have Claude propose structured operations (which layers/entities to remove) via apply_cleanup_rule or remove_selection
  3. User can preview AI-proposed changes in a dry-run before anything is applied, and only after confirming does the change take effect (matching the manual undo/redo model from Phase 2) and export via export_dxf

**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Load & Browse a DXF Drawing | 2/2 | Complete | 2026-08-24 |
| 2. Manual Cleanup & Export | 0/TBD | Not started | - |
| 3. AI-Assisted Cleanup via MCP | 0/TBD | Not started | - |
</content>
