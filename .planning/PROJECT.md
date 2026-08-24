# DXF Demo

## What This Is

A DXF file processing tool for civil engineers who receive structural drawings and need to clean them up before adding their own work. The application combines a web-based DXF viewer (React + TypeScript) with an MCP server that lets Claude Desktop assist with intelligent cleanup operations. Users can browse the DXF structure, select layers or object types to clean, describe their intent to the AI, and export the cleaned DXF file.

## Core Value

Engineers can load a structural DXF drawing, clean up unwanted annotations/dimensions/notes through a mix of layer/object selection and AI-assisted decisions, and export a clean DXF ready for their own work.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Load and parse DXF files, exposing layers, objects, and structure
- [ ] Render DXF in a web viewer with shapes and layer colors (not full CAD fidelity, but more than wireframe)
- [ ] Browse DXF structure by layers, object types, and categories
- [ ] Select elements for cleanup by layer name or object type
- [ ] AI-assisted cleanup via MCP server — user describes intent, AI executes removal/retention
- [ ] Export cleaned DXF file back to disk
- [ ] MCP server with tools for Claude Desktop to read, analyze, and modify DXF content

### Out of Scope

- Adding new structural elements or annotations programmatically — user does this manually in CAD
- Full CAD-quality rendering (hatches, line weights, advanced styling) — mid-fidelity is sufficient
- Multi-user collaboration or cloud storage — single-user local tool
- Support for file formats other than DXF — DXF only for v1

## Context

- Users are civil engineers working with structural drawings daily
- Input drawings come from other teams/firms with dimensions, annotations, and notes that need selective removal
- Some general notes and annotations should be preserved — cleanup is not a blanket "remove all"
- The decision of what stays vs. goes involves a mix of rules (by layer/object type) and manual/AI judgment
- DXF is a well-documented Autodesk format with libraries available for parsing (e.g., dxf-parser for JS)
- MCP (Model Context Protocol) enables Claude Desktop to call tools on the server

## Constraints

- **Platform**: MCP server for Claude Desktop integration
- **Frontend**: React + TypeScript web application
- **Scope**: Working demo / proof of concept — not production-grade yet
- **File format**: DXF files only (the standard exchange format for CAD)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| React + TypeScript frontend | User's preferred stack, good ecosystem for interactive viewers | — Pending |
| MCP server for AI integration | Claude Desktop is the target AI client | — Pending |
| Mid-fidelity rendering | Balance between useful visualization and implementation complexity | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-08-24 after initialization*
