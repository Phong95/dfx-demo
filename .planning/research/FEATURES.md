# Feature Landscape

**Domain:** DXF file processing/viewer tool for civil engineers (with AI-assisted cleanup via MCP)
**Researched:** 2026-08-24

## Table Stakes

Features users expect from any DXF viewer. Missing = the tool feels broken or unusable, and engineers will bounce back to AutoCAD/a free online viewer.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Load/parse a DXF file and render it | This is the entire premise of the tool | Med | `dxf-parser` (npm) covers header, most 2D entities, layers, ltype/block tables, inserts, text/some MTEXT — matches project's Active requirement. Does NOT cover 3DSolids or all leader types (acceptable gap for civil 2D drawings). |
| Pan (drag) and zoom (scroll wheel) | Baseline navigation in every viewer surveyed (mustafakbaser/DXF-Viewer, mlightcad/cad-viewer, online viewers) | Low | Add Fit-to-view / Zoom-reset button — appears in every competitor. |
| Layer panel with per-layer show/hide | Universal in every DXF viewer reviewed; layers are the primary DXF organizing concept and directly needed for the cleanup workflow (PROJECT.md: "select by layer name") | Low-Med | Include Show-All / Hide-All / Invert — small addition, consistently present, cheap to add. |
| Render by layer color | PROJECT.md explicitly calls this out as required baseline fidelity ("shapes and layer colors") | Low | DXF layers carry ACI color codes; straightforward to map to RGB. |
| Click-to-select an entity + inspect its properties | Universal pattern — hover-highlight then click, with a properties panel showing layer/type/handle/geometry | Med | Required for the "select elements for cleanup by object type" requirement — user needs to confirm what they're selecting before deleting it. |
| Multi-select (rubber-band or ctrl-click) | Present in every full-featured viewer; without it, layer-scale cleanup of individual objects (not just whole layers) is painful | Med | Needed to support "select by object type" across a drawing, not just click-one-at-a-time. |
| Browse structure by layer / entity type / block | PROJECT.md Active requirement directly | Low-Med | A simple tree/list view (layers → entity type counts) is sufficient; does not need full CAD-style layout/xref tree. |
| Delete/hide selected entities | This is the core "cleanup" action | Low | Straightforward once selection model exists. |
| Export cleaned DXF back to disk | PROJECT.md Active requirement — without this the tool has no output | Med | Must preserve DXF structure (header, tables, blocks) for entities that remain; re-serializing a valid DXF is the highest-risk table-stakes item (see PITFALLS). |
| Common 2D entity rendering (LINE, CIRCLE, ARC, LWPOLYLINE, TEXT, MTEXT, INSERT/block, HATCH, DIMENSION) | Structural drawings are dominated by these entity types; missing any makes the drawing look broken/incomplete | Med-High | DIMENSION (30+ group codes, multiple subtypes) and HATCH (recursive boundary paths) are the hardest to get right — budget extra time. Mid-fidelity is explicitly acceptable per PROJECT.md (no line weights/advanced styling required). |
| Undo/redo for cleanup actions | Present in both OSS competitors reviewed (mustafakbaser/DXF-Viewer, mlightcad/cad-viewer); users doing bulk/AI-driven deletion need a safety net | Low-Med | Especially important once AI is doing the deleting — a single undo stack makes AI mistakes recoverable without reloading the file. |

## Differentiators

Features that set this tool apart from generic DXF viewers and from generic "text-to-CAD" tools. Not expected by default, but where this project's value proposition lives.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| AI-assisted cleanup via natural language intent (MCP + Claude Desktop) | Engineer describes *intent* ("remove all dimension text but keep general notes") instead of manually clicking through hundreds of entities — this is the core differentiator vs. every plain DXF viewer surveyed | High | Closest analog found: `jeremylongshore/cad-ai-agent` (AEC drawing intelligence platform) does exactly this pattern — LLM planner emits structured operations, never touches raw DXF directly. Validates the approach; also sets a feature bar to match/beat. |
| MCP server exposing read/analyze/modify tools to Claude Desktop | No competitor found ships this integration path (Claude Desktop as the AI surface, not an in-app chat panel) — genuinely differentiated distribution model | Med-High | Follow MCP filesystem-server pattern: scope writes, return structured tool results (not raw DXF text) so the model reasons over summarized structure, not raw entity codes. |
| Rule + AI hybrid selection ("by layer/type" rules AND AI judgment in the same pass) | PROJECT.md context explicitly frames this as hybrid, not blanket-remove — most competitor tooling is either pure-manual (AutoCAD PURGE/layer isolation) or pure-AI (cad-ai-agent). Combining deterministic rule-based selection with AI judgment for ambiguous cases is a genuine middle ground. | Med | Let AI narrow/confirm within a rule-scoped candidate set (e.g., "within layer DIM-*, keep any text that looks like a general note") rather than operating over the whole unconstrained drawing — reduces AI blast radius and cost. |
| Preview-before-apply for AI-proposed deletions | Prevents silent, hard-to-reverse AI mistakes on real engineering drawings; builds trust for a domain where errors are costly (stamped drawings, legal liability) | Med | cad-ai-agent's "safe edits" pattern (LLM emits structured ops, never touches raw DXF, protected layers) is directly relevant — adopt a similar diff/preview step before committing changes to the in-memory model. |
| "Explain this drawing" / structure summary via AI | Helps an engineer unfamiliar with a drawing from another firm quickly understand what layers/blocks mean before deciding what to remove | Med | Natural extension of MCP tool surface — an `analyze_drawing` tool that returns a plain-English layer/entity summary. Lower complexity than editing tools since it's read-only. |
| Measurement tool (distance between two points, snap to endpoints/vertices) | Common in dedicated viewers (Easy-DXF-Viewer, most online viewers) but not universal; useful for engineers verifying scale/dimensions of a drawing before cleanup | Low-Med | Not required for MVP cleanup workflow, but cheap to add and expected by engineers used to CAD tools — good post-MVP differentiator vs. viewers that omit it. |

## Anti-Features

Features to explicitly NOT build for this project.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|--------------------|
| Full CAD editing suite (trim/extend/offset/fillet, precise drafting, snapping to construction geometry) | Explicitly out of scope per PROJECT.md ("Adding new structural elements... user does this manually in CAD"); even mature OSS viewers (mlightcad/cad-viewer) still have these as "incomplete/WIP" — high effort, not the value prop | Keep editing scoped to select+delete/hide (cleanup only); point users back to AutoCAD/Civil3D for authoring new geometry |
| Full CAD-quality rendering (hatches with real patterns, line weights, plot styles, true font rendering) | Explicitly out of scope per PROJECT.md; competitors like mlightcad/cad-viewer invest heavily here (custom GPU shaders) for marginal cleanup-workflow value | Render mid-fidelity: correct geometry + layer color is enough to identify what to remove; approximate HATCH as solid fill or simple pattern |
| DWG support | PROJECT.md: "DXF only for v1"; DWG requires either GPL LibreDWG (license complication) or proprietary SDKs (cost) — both add real complexity, as seen in mlightcad/cad-viewer's opt-in DWG modules | Tell users to save-as DXF from their CAD tool before importing (nearly universal capability) |
| Multi-user / cloud collaboration, shared drawing sessions | Explicitly out of scope; single-user local tool | Local file open/export only; no backend persistence layer needed |
| General-purpose "text-to-CAD" generation (create new geometry from a text prompt) | Different product category (e.g., Zoo, Adam, Dzine AI) aimed at generating new designs, not cleaning existing drawings; would blur scope and compete against tools with much larger investment | Keep AI scope strictly to *removal/retention decisions* on existing entities, not authoring new geometry |
| Compliance checking (ADA/IBC/building code validation) | This is cad-ai-agent's differentiator, not this project's — building it well requires domain-specific rule libraries and legal-adjacent accuracy commitments well beyond "cleanup for reuse" | Out of scope; note as a possible future milestone only if users ask, not a v1 concern |
| Automated quantity takeoffs / area calculations | Adjacent but separate value prop (estimating, not cleanup); adds real complexity (closed-loop detection, unit handling) for a different workflow than "prep a drawing to build on" | Skip for v1; revisit only if user research shows takeoff is blocking adoption |
| Revision diff / compare-two-DXF-versions UI | Useful pattern (seen in cad-ai-agent) but solves a different problem (change tracking over time) than this project's single-pass cleanup | Skip; a single undo stack within one session covers the actual v1 need |

## Feature Dependencies

```
Load/parse DXF (dxf-parser)
  → Render entities by layer color (viewer canvas)
    → Pan/zoom navigation
    → Click-to-select entity + properties panel
      → Multi-select
      → Browse by layer/entity type (tree/list, reads same parsed model)
    → Layer show/hide panel

Click-to-select + Multi-select + Browse by layer/type
  → Select elements for cleanup (rule-based: by layer name / object type)
    → Delete/hide selected entities (manual path)
    → Undo/redo (safety net for both manual and AI-driven deletion)

MCP server tools (read/analyze DXF model)
  → "Explain this drawing" / structure summary (read-only, no dependency on edit tools)
  → AI-assisted cleanup (describe intent → AI proposes selection)
    → Preview-before-apply diff (must exist before AI can safely delete anything)
    → Delete/hide selected entities (AI reuses the same delete path as manual cleanup)

Delete/hide entities (manual OR AI-driven, both converge on one edit model)
  → Export cleaned DXF to disk (must serialize whatever remains in the in-memory model)

Measurement tool — independent, only depends on Load/parse + render (no dependency on cleanup features)
```

**Key dependency insight:** Manual cleanup (select-by-layer/type, delete, export) and AI-assisted cleanup should converge on the *same* selection and edit model. Build the manual path first — it's the foundation the MCP tools call into, and it's also the fallback/escape hatch when the AI path isn't available or gets something wrong. Preview-before-apply is a hard dependency for AI-driven deletion (per cad-ai-agent's safety pattern) but optional for manual deletion where the user already made an explicit click.

## MVP Recommendation

Prioritize (in build order):
1. Load/parse DXF + render entities by layer color + pan/zoom — nothing else is possible without this
2. Layer panel (show/hide) + browse by layer/entity type — the primary structural navigation the cleanup workflow depends on
3. Click-to-select + multi-select + properties panel — required before any deletion (manual or AI) can be targeted safely
4. Delete/hide selected entities + undo/redo — completes the manual cleanup loop end-to-end
5. Export cleaned DXF to disk — closes the value loop (load → clean → get a usable file back)
6. MCP server with `analyze_drawing` (read-only) and `select`/`remove` tools that reuse the same selection/edit model built in steps 3-4 — this is the differentiator, but it should sit on top of a working manual cleanup loop, not replace it
7. Preview-before-apply for AI-proposed deletions — ship alongside the MCP tools, not after; this is a trust requirement, not a nice-to-have

Defer:
- Measurement tool: nice-to-have, zero coupling to the cleanup workflow, add once core loop ships
- "Explain this drawing" summary tool: valuable but not required for the core cleanup loop; easy to add once MCP read tools exist
- Anything from the Anti-Features table: compliance checks, takeoffs, DWG support, full CAD editing, revision diffing — explicitly deferred/out of scope, not just lower priority

## Sources

- [mustafakbaser/DXF-Viewer (GitHub)](https://github.com/mustafakbaser/DXF-Viewer) — MEDIUM confidence
- [mlightcad/cad-viewer (GitHub)](https://github.com/mlightcad/cad-viewer) — MEDIUM confidence (WebFetch direct read)
- [vagran/dxf-viewer (GitHub)](https://github.com/vagran/dxf-viewer) — MEDIUM confidence
- [georgeh1ll/Easy-DXF-Viewer (GitHub)](https://github.com/georgeh1ll/Easy-DXF-Viewer) — MEDIUM confidence
- [jeremylongshore/cad-ai-agent (GitHub)](https://github.com/jeremylongshore/cad-ai-agent) — MEDIUM confidence (WebFetch direct read) — closest direct analog to this project
- [dxf-parser (npm)](https://www.npmjs.com/package/dxf-parser) — MEDIUM confidence
- [ezdxf DXF Entities documentation](https://ezdxf.readthedocs.io/en/stable/dxfentities/index.html) — MEDIUM confidence
- [AutoCAD Drawing Cleanup Utility — CAD Forum](https://www.cadforum.cz/en/autocad-drawing-cleanup-utility-a-standalone-tool-to-purge-dwg-tip15017) — LOW confidence
- [Drawing Purge — AUGI](https://www.augi.com/articles/detail/drawing-purge-quick-efficient-clean-up) — LOW confidence
- [Five Efficient Ways of Cleaning AutoCAD Drawings — imaginiT](https://resources.imaginit.com/how-tos/five-efficient-ways-of-cleaning-autocad-drawings) — LOW confidence
- [Model Context Protocol — server concepts](https://modelcontextprotocol.io/docs/2026-07-28/learn/server-concepts) — LOW confidence
- [modelcontextprotocol/servers (GitHub, filesystem reference server)](https://github.com/modelcontextprotocol/servers) — LOW confidence
