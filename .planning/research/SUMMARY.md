# Project Research Summary

**Project:** DXF Demo — DXF processing tool for civil engineers (React viewer + MCP server)
**Domain:** CAD file (DXF) viewer/cleanup tool with AI-assisted editing via Claude Desktop (MCP)
**Researched:** 2026-08-24
**Confidence:** MEDIUM-HIGH

## Executive Summary

This project is a single-user, local desktop-adjacent tool: a React-based DXF viewer for civil engineers, paired with an MCP server that lets Claude Desktop inspect and clean up drawings on the user's behalf. Experts building this class of tool converge on a specific shape: parse once, keep the raw tag stream around, render a simplified geometry payload to the browser, and, critically, implement the cleanup export as surgical filtering of the original DXF text, never a full parse-mutate-regenerate pipeline. No existing competitor ships the MCP/Claude-Desktop distribution model this project uses, making that its clearest differentiator; the closest analog (cad-ai-agent) validates the "LLM proposes structured operations, never touches raw file directly" pattern this project should also adopt.

The recommended approach is a single Node "Engine Server" process holding one in-memory Document Model per open file, exposed simultaneously via stdio (MCP, for Claude Desktop) and HTTP/WebSocket (for the React viewer), both clients act on the same state, avoiding drift and duplicate parse/export logic. The stack is settled with high confidence: React 19 + Vite + TypeScript 6.0.3 (not 7.x, breaks typescript-eslint) on the frontend, dxf-parser for parsing, Konva/react-konva for canvas rendering, and modelcontextprotocol/sdk + Zod for the MCP layer. No off-the-shelf DXF writer library should be used for export; a custom ~100-150 LOC surgical tag-stream filter is the right build-vs-buy call given the project's "remove only, never add" scope.

The two biggest risks are both data-fidelity risks, not integration risks: (1) real-world DXFs contain entities (HATCH, DIMENSION, 3DSOLID, XDATA, nested blocks) that dxf-parser does not fully model, and naively regenerating a DXF from a lossy parsed object will corrupt or drop those entities on export; (2) an AI-driven deletion tool with no preview/undo path is a data-loss and trust risk on professional engineering drawings. Both are mitigated architecturally (surgical filtering; plan-then-execute MCP tools with dry-run/confirm/undo) rather than being late-stage bugs to fix, this must be designed in from Phase 1, not retrofitted.

## Key Findings

### Recommended Stack

Frontend: React 19.2.8 + TypeScript 6.0.3 (pinned below 7.x for typescript-eslint compatibility) + Vite 8.2.2 + vitejs/plugin-react-swc. DXF parsing uses dxf-parser 1.1.2 (dominant library, ~670k downloads/month, TS-native, covers all entity types this project needs except HATCH, which is out of scope). Rendering uses Konva 10.3.1 + react-konva 19.2.5 for per-shape hit-testing/selection, chosen over WebGL-based dxf-viewer because that library bundles its own parser (double-parse problem) and pulls in three.js for fidelity this project does not need. State is managed with Zustand 5.0.15. The MCP server uses the official modelcontextprotocol/sdk 1.30.0 with Zod 4.4.3 schemas over stdio transport (the correct transport for Claude Desktop's local-subprocess model), on Node.js 24.x LTS.

**Core technologies:**
- dxf-parser: DXF text to structured entity/layer/block model, dominant, TS-native, matches project's entity coverage needs
- Konva + react-konva: 2D canvas rendering with built-in hit-testing, purpose-built for exactly this select-elements-for-cleanup interaction
- modelcontextprotocol/sdk (stdio): official MCP SDK, correct transport for Claude Desktop integration
- Custom surgical tag-stream filter (not a generator library): only build-vs-buy option that preserves DXF fidelity for a filter-only (never-generate) export path

### Expected Features

**Must have (table stakes):** load/parse/render a DXF; pan/zoom with fit-to-view; layer panel with show/hide; render by layer color; click-to-select with properties inspection; multi-select; browse structure by layer/entity type; delete/hide selected entities; export cleaned DXF to disk (preserving untouched structure); common 2D entity rendering (LINE/CIRCLE/ARC/LWPOLYLINE/TEXT/MTEXT/INSERT/HATCH/DIMENSION); undo/redo for cleanup actions.

**Should have (competitive differentiators):** AI-assisted cleanup via natural-language intent through MCP + Claude Desktop (the core value proposition, no competitor ships this distribution model); rule + AI hybrid selection (deterministic layer/type rules scoping AI judgment, not blanket AI reasoning over the whole drawing); preview-before-apply for AI-proposed deletions (trust-critical); "explain this drawing" read-only structure summary via MCP.

**Defer (v2+):** measurement tool (zero coupling to cleanup workflow, cheap to add later); full CAD editing (trim/extend/fillet, explicitly out of scope); DWG support; multi-user/cloud collaboration; general text-to-CAD generation; compliance checking; automated takeoffs; revision diffing.

### Architecture Approach

A single Node "Engine Server" process owns one in-memory Document Model per open file and exposes it two ways, MCP tools (stdio, for Claude Desktop) and HTTP/WebSocket API (for the React viewer), both clients mutate the same state through the same Mutation Engine functions, so manual UI edits and AI-driven edits can never diverge in behavior. Cleanup is modeled as non-destructive flagging (mark removed/retained), and export is a surgical text-level filter over the original tag stream, never a full regenerate-from-model, which preserves anything the parser does not fully understand (header vars, style tables, unsupported entities).

**Major components:**
1. **DXF Reader**: parses raw file into both a tag stream (preserved verbatim) and a semantic structure (layers/entities/blocks) for browsing; never silently discards unrecognized tags
2. **Document Model**: canonical in-memory session state: entities, layers, selection, removed/retained flags, undo log, single source of truth for both clients
3. **Mutation Engine**: pure, diffable/undoable functions applying rule-based removal; called identically by the HTTP API and the MCP tools
4. **DXF Filter/Writer**: surgical export: omits only the tag ranges belonging to removed entities, re-emits everything else byte-for-byte
5. **MCP Tool Layer**: thin wrappers (list_layers, get_structure, apply_cleanup_rule, remove_selection, export_dxf) over the Mutation Engine, never touching the raw file directly

Build order matters: prove parse fidelity and export correctness manually (through the UI) before adding the MCP/AI layer, the AI integration is comparatively low-risk; DXF fidelity is where the real domain risk lives.

### Critical Pitfalls

1. **Treating DXF as fully-specified/uniform**: real civil drawings contain entities (dxf-parser does not model 3DSOLID, most LEADER types, XDATA); build an explicit unsupported-entity bucket and surface counts to the user/AI from day one, don't silently drop them.
2. **Losing data on export (round-trip fidelity)**: never parse-mutate-regenerate from a lossy model; use surgical text-level filtering that preserves untouched sections byte-for-byte, and validate every export by re-opening/re-parsing it.
3. **BYLAYER/BYBLOCK color inheritance mishandled**: entities often don't carry their own color and must resolve through layer/block lookup; resolve once centrally at parse time (viewer color accuracy and layer-based selection both depend on this).
4. **AI-assisted deletion with no preview/undo path**: the single biggest risk to the product's core differentiator; every destructive MCP tool needs a dry-run/plan mode, explicit confirm step, and undo stack before any change is committed or exported.
5. **(Moderate) Assuming layer names are standardized**: don't hard-code layer-name pattern matching as primary logic; combine with entity-type heuristics since real-world layer naming varies wildly firm-to-firm.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: DXF Reader + Document Model (read-only foundation)
**Rationale:** This is where all domain-specific risk concentrates (parser entity coverage, color/units resolution); must be validated against real sample files before anything else is built on top.
**Delivers:** Parse a DXF into a tag stream + semantic structure (layers/entities/blocks), with resolved BYLAYER/BYBLOCK color, $INSUNITS surfaced, and an explicit unknown-entity report.
**Addresses:** "Load/parse a DXF file" table stake; foundation for structure browsing.
**Avoids:** Critical Pitfall 1 (unsupported entities silently dropped), Critical Pitfall 3 (color inheritance), Moderate Pitfall 3 (units ambiguity).

### Phase 2: Engine Server API + React Viewer (read-only)
**Rationale:** Validates the render-geometry payload design and the single-process/dual-transport architecture before mutation logic is added.
**Delivers:** REST endpoints for load/structure/render-geometry; Konva-based canvas rendering with pan/zoom, layer show/hide, layer coloring, and a structure-browser tree.
**Uses:** Konva/react-konva, Zustand for viewer state.
**Implements:** HTTP/WS API Layer, React Viewer Canvas + Structure Browser components.

### Phase 3: Selection + Manual Cleanup (Mutation Engine)
**Rationale:** Manual cleanup must work end-to-end and be the foundation the MCP tools call into later, de-risks the interaction model independent of AI.
**Delivers:** Click-to-select, multi-select, properties panel, layer/type-based rule selection, delete/hide with undo/redo, non-destructive flagging in the Document Model.
**Addresses:** Click-to-select, multi-select, browse by layer/type, delete/hide, undo/redo table stakes.
**Avoids:** Moderate Pitfall 1 (layer-name assumptions), Moderate Pitfall 4 (block instance vs. definition ambiguity).

### Phase 4: DXF Export (surgical filter/writer)
**Rationale:** Highest-risk component in the whole project ("looks done, actually corrupts real files"), must get dedicated design and round-trip validation before the AI layer is wired in, not deferred behind it.
**Delivers:** Export cleaned DXF via surgical tag-stream filtering; round-trip tested by re-opening/re-parsing exported files.
**Addresses:** "Export cleaned DXF" table stake, closes the core load-clean-export value loop.
**Avoids:** Critical Pitfall 2 (round-trip data loss), the single highest-risk pitfall in the project.

### Phase 5: MCP Server + AI-Assisted Cleanup
**Rationale:** Wraps already-proven Mutation Engine calls as MCP tools, the differentiator, but built last so it sits on a validated foundation.
**Delivers:** list_layers/get_structure/apply_cleanup_rule/remove_selection/export_dxf MCP tools via stdio transport, tested against Claude Desktop; preview/dry-run mode and confirm step for destructive tools; audit log of tool calls.
**Addresses:** AI-assisted cleanup via natural language, rule+AI hybrid selection, preview-before-apply differentiators.
**Avoids:** Critical Pitfall 4 (AI deletion with no preview/undo), must be designed as plan-then-execute from the first tool written, not retrofitted.

### Phase 6: Live Sync + Polish (optional/stretch)
**Rationale:** Nice-to-have once the core loop (manual + AI cleanup + export) works; not required to prove the product.
**Delivers:** WebSocket/SSE push so the viewer reflects Claude's edits live; "explain this drawing" read-only MCP tool; measurement tool.

### Phase Ordering Rationale

- Dependencies flow strictly: read (parse/render) to manual mutate to export to AI wraps mutate. Building AI integration before parse/export fidelity is proven means discovering DXF-format problems after the AI layer is already wired in, expensive to unwind.
- Export is deliberately its own phase before MCP, not bundled with MCP, because it is the single highest-risk component and needs dedicated round-trip validation time.
- Manual cleanup UI (Phase 3) must exist before MCP tools (Phase 5) because the MCP tools are required to call the same Mutation Engine functions, building AI-only mutation paths first would create the "two divergent edit models" anti-pattern flagged in ARCHITECTURE.md.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1 (DXF Reader):** entity-coverage gaps only surface against real sample files; flag /gsd-plan-phase --research-phase 1 if HATCH/DIMENSION/LEADER handling in real drawings needs closer investigation once sample files are available.
- **Phase 4 (Export):** surgical tag-stream filtering is this project's own architectural synthesis (no directly-documented JS library does this); validate the tag-boundary-detection approach early; may need a research/spike pass if real DXF files expose edge cases (nested blocks referenced by surviving INSERTs, XDATA boundaries).
- **Phase 5 (MCP server):** MCP tool design patterns (dry-run/confirm/undo for destructive tools) are documented but not DXF-specific; light research pass to confirm SDK v1.30.0 API specifics against the latest docs at implementation time (v2 SDK line is in progress upstream).

Phases with standard patterns (skip research-phase):
- **Phase 2 (Engine Server API + Viewer):** Konva/react-konva usage and REST/WebSocket patterns are well-documented, standard web app patterns.
- **Phase 3 (Manual cleanup):** selection/undo-redo UI patterns are standard, well-established in frontend development.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Versions verified directly against npm registry dist-tags; TS7 incompatibility corroborated by two independent sources |
| Features | MEDIUM | Cross-referenced against 5 competitor viewers/tools (mostly MEDIUM-confidence GitHub reads) plus one close analog (cad-ai-agent); no HIGH-confidence primary source for feature expectations |
| Architecture | MEDIUM | Synthesized from DXF format internals + MCP transport mechanics; no official DXF+MCP reference architecture exists, the "surgical filter export" and "single-process dual-transport" patterns are this research's own synthesis, not directly-documented best practice |
| Pitfalls | MEDIUM-HIGH | Critical pitfalls corroborated by official DXF Reference PDF, ezdxf docs (authoritative), and AWS/MCP anti-pattern guides; some moderate/minor pitfalls rest on single community-thread sources |

**Overall confidence:** MEDIUM-HIGH, stack decisions are solid; the architectural approach (surgical export, dual-transport single process) is a well-reasoned synthesis but unvalidated against this project's real sample DXF files. Recommend validating tag-stream filtering and entity-coverage assumptions against real civil engineering drawings early in Phase 1.

### Gaps to Address

- No real sample DXF files have been tested against dxf-parser's entity coverage yet, validate during Phase 1 build, not during planning.
- The custom surgical tag-stream filter/writer module has no existing reference implementation to draw from (build-vs-buy judgment call), treat as a first-class design task in Phase 4, budget extra time for round-trip testing.
- MCP TypeScript SDK v2 is in progress upstream (targeting 2026-07-28 MCP spec revision) but npm latest is still 1.30.0 as of research date, re-check SDK version at Phase 5 implementation time in case v2 has shipped.
- dxf-viewer (WebGL-based) was rejected for Konva based on mid-fidelity requirements; if real drawings turn out to have very large entity counts (10k+), revisit this decision as a spike rather than assuming Konva scales, flagged in STACK.md as MEDIUM confidence.

## Sources

### Primary (HIGH confidence)
- npm registry API (registry.npmjs.org), dist-tags, publish dates, dependencies for all core packages
- devblogs.microsoft.com/typescript/announcing-typescript-7-0, TS7 stable release, programmatic API gap
- github.com/typescript-eslint/typescript-eslint issue #12518, TS7 support explicitly not planned
- AutoCAD DXF Reference (Autodesk official PDF), vendor primary source on DXF format
- AWS: MCP tool design, practical approaches and tradeoffs, vendor engineering blog on destructive-tool design
- AIA CAD Layer Guidelines (National CAD Standard), official standards body document

### Secondary (MEDIUM confidence)
- github.com/gdsestimating/dxf-parser, entity-type source listing, download volume
- github.com/jeremylongshore/cad-ai-agent, closest direct analog for AI-assisted DXF cleanup
- github.com/vagran/dxf-viewer, mlightcad/cad-viewer, mustafakbaser/DXF-Viewer, competitor viewer feature surveys
- ezdxf documentation, DXF internals, tag-stream/round-trip preservation pattern, rendering notes
- konvajs.org best-canvas-library guide, Konva vs Fabric vs PixiJS use-case guidance
- modelcontextprotocol.io and MCP TypeScript SDK, server/tool/transport model

### Tertiary (LOW confidence)
- Various single-source community threads (Lightrun, BricsCAD forum, Hacker News, dev.to practitioner blogs), corroborate specific technical details (bulge sign conventions, canvas performance ceilings) but not independently cross-checked

---
*Research completed: 2026-08-24*
*Ready for roadmap: yes*
