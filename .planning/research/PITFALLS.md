# Domain Pitfalls

**Domain:** DXF file processing/viewer tool for civil engineers (React + TS viewer, MCP-driven AI cleanup, DXF export)
**Researched:** 2026-08-24

## Critical Pitfalls

Mistakes that cause rewrites or major issues.

### Pitfall 1: Treating DXF as a fully-specified, uniform format
**What goes wrong:** Teams build a parser/renderer against the "happy path" entities (LINE, CIRCLE, ARC, basic LWPOLYLINE) and it breaks the first time a real-world drawing arrives with LEADER/MULTILEADER, 3DSOLIDs, ACIS REGION bodies, OLE objects, proxy entities, or vendor-specific extended data (XDATA). `dxf-parser` (the most common JS/npm option) explicitly does not support 3DSolids, most Leader types, and other less-common entities, and undocumented sections like ACIS `REGION` bodies aren't even in the DXF spec.
**Why it happens:** DXF is "documented" but AutoCAD itself is extremely forgiving of malformed/ambiguous data on read, so drawings in the wild contain constructs no library models cleanly. Civil/structural drawings from other firms are exactly the kind of "in the wild" files most likely to hit this.
**Consequences:** Viewer silently drops or mis-renders entities; cleanup logic operates on an incomplete picture of the drawing (an object the AI thinks doesn't exist can't be selected/removed, and worse, might vanish from export even though it was never "handled").
**Prevention:** Build an explicit "unsupported/unknown entity" bucket in the parser output from day one — never silently swallow entities the parser can't fully model. Surface unknown entity counts/types to the user (viewer badge: "12 entities not rendered") and to the AI (so it can tell the user "I can't evaluate these"). Treat parsing as best-effort + honest, not complete.
**Detection:** Compare entity count parsed vs. raw `ENTITIES` section count in the source file; any mismatch is a red flag surfaced immediately, not discovered later during export.
**Phase mapping:** DXF parsing/loading phase (Phase 1 territory) — build the "unknown entity" reporting mechanism at the same time as the parser, not bolted on later.

### Pitfall 2: Losing or corrupting data on export (round-trip fidelity)
**What goes wrong:** The tool parses a DXF into an internal model, removes some entities, and re-serializes — but the writer doesn't preserve entities/sections it didn't understand (HEADER variables, VPORT/UCS tables, extended entity data, block definitions referenced by surviving INSERTs, line-type/style tables). The output DXF opens in AutoCAD with "Invalid or incomplete DXF input" or silently drops line weights/colors/hatch patterns.
**Why it happens:** It's tempting to build a "parse → mutate → regenerate from scratch" pipeline, but any writer that regenerates the whole file from a lossy internal model will drop anything the model doesn't represent. AutoCAD itself refuses to export to older DXF versions if the drawing has unresolved errors (recommends running AUDIT first).
**Consequences:** The exported "clean" DXF fails to open, or opens with missing dimension styles/hatch patterns/text styles that the engineer still needed — actively worse than the original for the user's actual workflow (they open CAD to keep working, not to discover breakage).
**Prevention:** Prefer a **surgical edit** strategy over "parse fully, rebuild from model": keep entities/sections you don't touch as raw/pass-through data rather than round-tripping them through a lossy internal representation. Only entities explicitly targeted for removal should be excised; everything else should be preserved byte-for-byte where possible (tables, styles, header vars, untouched blocks). Test every export by re-opening it in a real DXF reader (or at minimum re-parsing it with the same parser) before calling the feature done.
**Detection:** Round-trip test: load a real drawing, remove nothing, export, diff against source — any unexpected structural change is a bug in the pipeline, not a "cleanup."
**Phase mapping:** Export phase — needs its own dedicated design pass before implementation; this is the single highest-risk phase for "looks done, actually corrupts real files."

### Pitfall 3: BYLAYER/BYBLOCK color and property inheritance mishandled
**What goes wrong:** DXF entities frequently don't carry their own color/linetype — they say "BYLAYER" (256) or "BYBLOCK" (0), meaning "look up the layer's/block's actual color." A viewer or cleanup tool that reads the raw color code and renders/reasons about it literally will show black/white/wrong colors, and worse, an AI cleanup tool reasoning about "everything on layer X" needs to resolve inheritance correctly to know what an entity actually is.
**Why it happens:** It's the most common shortcut in a first-pass parser: read the color field, use it directly. Layer `0` also has special-cased behavior (a block entity on layer 0 with BYLAYER color takes the color of the layer the block is inserted on) that trips up even careful implementations.
**Consequences:** Miscolored viewer output erodes user trust in the tool immediately (civil engineers will notice a drawing "looks wrong" instantly); cleanup selection by "layer" can behave inconsistently for block-nested content.
**Prevention:** Resolve color/linetype inheritance at parse time into a fully-resolved "effective style" per entity (walk up: entity → block insert → layer → default), and keep the raw/unresolved value alongside it for round-trip export accuracy. Do this once, centrally — don't let every rendering/selection call site re-implement resolution logic.
**Detection:** Render a test drawing with mixed explicit/BYLAYER/BYBLOCK entities and visually confirm colors match what AutoCAD/a reference viewer shows.
**Phase mapping:** DXF parsing/loading phase — build resolution logic alongside the parser; viewer and selection features both depend on it.

### Pitfall 4: AI-assisted deletion with no undo/preview path
**What goes wrong:** The MCP tool executes removal operations directly against the loaded drawing based on the AI's interpretation of a natural-language instruction ("remove the old dimension lines"), with no dry-run, no diff preview, and no way to revert. The AI misinterprets scope (removes an entire layer instead of a subset, or removes entities the user wanted kept, like general notes described as preserved-not-blanket-removed in this project's own requirements) and the damage is already exported/saved before the user notices.
**Why it happens:** MCP tool design commonly wires the "delete/modify" tool directly to the action for simplicity. Industry pitfall research is explicit on this: an MCP server that exposes destructive tools without a confirmation/audit gate is "the single biggest source of production incident risk in the agent stack" — destructive tools need a `dry_run` mode that returns the *planned effect* (what would be removed/changed) before anything executes for real.
**Why it matters even more here:** The project's own domain context states cleanup is "not a blanket remove-all" — some general notes/annotations must be preserved and the decision is a mix of rule-based and judgment-based reasoning. That's exactly the ambiguous-intent scenario where an LLM will occasionally over- or under-select.
**Consequences:** Silent, hard-to-detect data loss in engineering drawings has real professional consequences (missing a note or dimension that mattered). Loss of user trust in the AI-assist feature specifically, which is the product's core differentiator.
<br>
**Prevention:**
- Every MCP mutation tool (remove/modify entities) should support a preview/plan mode: return "N entities matched on layers [X,Y], types [Z]" with a rendered/textual diff before applying.
- Require an explicit confirm step (user- or app-level) between "AI proposes" and "change is applied to the working document."
- Keep an in-memory undo stack / versioned document state so any AI-driven change can be reverted before export.
- Log every tool call (params, matched entity IDs, result) so both the user and future debugging can reconstruct what happened.
**Detection:** In manual testing, deliberately give ambiguous instructions ("clean up the annotations") and verify the tool asks for confirmation / shows a preview rather than silently acting.
**Phase mapping:** MCP server / AI cleanup workflow phase — this is an architectural decision (plan-then-execute pattern), not a detail to retrofit; design the tool contract this way from the first MCP tool you write.

## Moderate Pitfalls

### Pitfall 1: Assuming layer names are meaningful/standardized across drawings
**What goes wrong:** Cleanup-by-layer-name logic (rules, presets, or AI reasoning) assumes structured layer names (e.g., AIA-style `C-ANNO-DIMS`) but real-world civil drawings from other firms/teams routinely use inconsistent, legacy, or ad-hoc layer names. A rule like "remove layers starting with `DIM`" works for one firm's export and does nothing for another's `Dimensions`, `dim_lines`, or `A-DIMS-2024`.
**Prevention:** Don't hard-code layer-name pattern matching as the primary mechanism. Surface actual layer names/counts from the loaded file to the user for selection, and let the AI use both layer name *and* entity type/geometry heuristics (e.g., "this is a DIMENSION entity" is unambiguous regardless of what layer it's on) as a fallback signal. Treat layer-name presets as a convenience shortcut, not the source of truth.

### Pitfall 2: Non-uniform scaling / bulge (arc) direction errors in polylines
**What goes wrong:** LWPOLYLINE/POLYLINE entities encode arc segments via a "bulge" value (ratio of sagitta to half chord length; sign indicates direction). Viewers that get the sign convention wrong render arcs mirrored/wrong-side, and non-uniform scaling transforms break bulge-based arcs entirely (they're only valid under uniform scale).
**Prevention:** Use a well-tested library's bulge-to-arc conversion rather than reimplementing it; avoid applying non-uniform scale transforms to polylines with bulges without first converting bulges to explicit arc geometry.

### Pitfall 3: Units ambiguity
**What goes wrong:** DXF files don't reliably declare drawing units in a way every tool respects; a drawing authored in millimeters can be misread as inches/unitless, causing the viewer to render at the wrong scale (a 1:1 structural drawing looking either tiny or enormous), which matters a lot to engineers checking real-world dimensions.
**Prevention:** Read the `$INSUNITS` header variable explicitly and surface it in the UI ("drawing units: mm" or "units: not specified — verify scale"); never silently assume a default without telling the user.

### Pitfall 4: Nested block/INSERT complexity
**What goes wrong:** Selecting/removing "an object" is more complex than it looks once blocks are involved — an INSERT entity references a block definition that may itself contain nested INSERTs, and the same block can be inserted many times with different transforms. A naive cleanup tool that deletes a block *definition* because one instance seemed unwanted breaks every other instance of that block in the drawing.
**Prevention:** Clearly distinguish "remove this INSERT (one placement)" vs. "remove this block definition and all its instances" as separate, explicit operations, and never let AI-driven cleanup silently choose block-definition-level deletion when the user meant one instance.

### Pitfall 5: Large-drawing rendering performance in the browser
**What goes wrong:** A naive renderer that creates one SVG node (or one canvas draw call sequence) per DXF entity works fine on toy files and becomes a slideshow on a real structural drawing with thousands of entities — SVG struggles past a few hundred nodes, and canvas suffers from thousands of individual `beginPath`/`stroke` calls per frame.
**Prevention:** Batch/merge geometry by layer+color into fewer draw calls (or use a WebGL-based renderer for larger files) from the start rather than after performance complaints; offload parsing to a web worker so the UI thread stays responsive while a large file loads.

## Minor Pitfalls

### Pitfall 1: Text encoding and special characters (MTEXT formatting codes, non-ASCII)
**What goes wrong:** MTEXT contains inline formatting codes (`\P` for newline, font/height overrides, stacked fractions) that a naive renderer displays as literal text; older DXF files may use non-UTF-8 encodings (CP1252, etc.).
**Prevention:** Strip/interpret common MTEXT formatting codes before display rather than showing raw codes to the user; detect/handle encoding explicitly rather than assuming UTF-8.

### Pitfall 2: Color 7 (white/black) special-casing
**What goes wrong:** ACI color 7 means "white on dark background, black on light background" — rendering it as a literal RGB value produces invisible (white-on-white) entities on a light-background viewer.
**Prevention:** Special-case ACI 7 in the color resolver based on the viewer's actual background color.

### Pitfall 3: File size limits in JS-based parsers
**What goes wrong:** `dxf-parser`-style libraries buffer the entire file into memory before parsing rather than streaming, which can hit JS string size limits on very large (gigabyte-scale) DXF files.
**Prevention:** Not a concern for typical single structural-drawing files, but worth a sanity check/file-size warning in the UI if this tool is ever pointed at very large civil site plans.

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| DXF parsing/loading | Unsupported entity types silently dropped (Critical #1) | Build an explicit unknown-entity report from day one |
| DXF parsing/loading | BYLAYER/BYBLOCK color inheritance unresolved (Critical #3) | Centralize style resolution at parse time |
| DXF parsing/loading | Units ambiguity (Moderate #3) | Read and surface `$INSUNITS`; never assume silently |
| Viewer rendering | Bulge/arc direction bugs (Moderate #2) | Use a vetted bulge-to-arc conversion |
| Viewer rendering | Performance collapse on real-size drawings (Moderate #5) | Batch draw calls by layer/color; consider web worker for parse |
| Layer/object selection UX | Layer names not standardized across firms (Moderate #1) | Show actual layer names + entity-type fallback, don't hard-code presets |
| Layer/object selection UX | Block vs. block-instance ambiguity (Moderate #4) | Make instance-vs-definition deletion an explicit separate operation |
| MCP server / AI cleanup workflow | AI executes destructive changes with no preview/undo (Critical #4) | Plan-then-execute pattern: dry-run/preview tool + explicit confirm + undo stack + audit log |
| Export | Round-trip data loss / corrupted output (Critical #2) | Surgical edit (preserve untouched sections raw) over full regenerate-from-model; test every export by re-opening it |

## Sources

- [dxf-parser on npm](https://www.npmjs.com/package/dxf-parser) — MEDIUM confidence (cross-checked against GitHub issues and Lightrun discussion)
- [GitHub: skymakerolof/dxf](https://github.com/skymakerolof/dxf) — MEDIUM confidence
- [Lightrun: DXF file can NOT be parsed](https://lightrun.com/answers/skymakerolof-dxf-dxf-file-can-not-be-parser) — LOW confidence (single community thread)
- [ezdxf: Notes on Rendering DXF Content](https://ezdxf.readthedocs.io/en/stable/dxfinternals/rendering_of_dxf_content.html) — MEDIUM confidence (authoritative library docs, cross-checked with DXF Reference PDFs)
- [ezdxf: LWPolyline docs](https://ezdxf.readthedocs.io/en/stable/dxfentities/lwpolyline.html) — MEDIUM confidence
- [Lapas: Fix DXF Problems in Nesting Software](https://lapas.io/blog/dxf-problems-troubleshooting/) — LOW confidence (vendor blog, single source)
- [BricsCAD Forum: Polyline arc bulge going wrong way](https://forum.bricsys.com/discussion/37980/problems-with-polyline-arc-bulge-going-the-wrong-way) — LOW confidence (community forum)
- [Autodesk/comp.cad.autocad: Layer colours in DXF file](https://groups.google.com/g/comp.cad.autocad/c/onnSe9gdaV8) — LOW confidence (community thread, cross-checked with ezdxf docs)
- [AutoCAD DXF Reference (Autodesk official PDF)](https://images.autodesk.com/adsk/files/autocad_2012_pdf_dxf-reference_enu.pdf) — HIGH confidence (vendor primary source)
- [openscad/openscad Issue #6684: DXF export not compatible with AutoCAD](https://github.com/openscad/openscad/issues/6684) — MEDIUM confidence
- [CAD Forum: Unable to save to drawing / AUDIT before DXFOUT](https://www.cadforum.cz/en/unable-to-save-to-drawing-c-folder-filename-dxf-tip10820) — LOW confidence
- [MCP Server Anti-Patterns: Design Mistakes 2026 Guide](https://www.digitalapplied.com/blog/mcp-server-anti-patterns-design-mistakes-2026-developer-guide) — MEDIUM confidence (cross-checked against AWS MCP tool design blog and Inovaflow)
- [AWS: MCP tool design — Practical approaches and tradeoffs](https://aws.amazon.com/blogs/machine-learning/mcp-tool-design-practical-approaches-and-tradeoffs/) — HIGH confidence (vendor engineering blog)
- [Inovaflow: Design MCP Tools Your AI Agent Won't Misuse](https://www.inovaflow.io/insights/how-to-design-mcp-tools) — LOW confidence (single vendor blog, but consistent with AWS source)
- [dev.to: Building a CAD viewer — the DWG format is hostile by design](https://dev.to/rhovium/building-a-cad-viewer-the-dwg-format-is-hostile-by-design-3ie4) — LOW confidence (practitioner blog, single source)
- [dev.to: Rendering AutoCAD DXF files in the browser (dxf-render)](https://dev.to/arbaev/rendering-autocad-dxf-files-in-the-browser-how-and-why-i-built-dxf-render-1h6i) — LOW confidence (practitioner blog, single source, corroborates general Canvas/SVG performance findings)
- [Hacker News: SVG vs Canvas performance ceiling discussion](https://news.ycombinator.com/item?id=15024190) — LOW confidence (community discussion, cross-checked with general web graphics comparison)
- [AIA CAD Layer Guidelines (National CAD Standard)](https://www.nationalcadstandard.org/ncs5/pdfs/ncs5_clg_lnf.pdf) — HIGH confidence (official standards body document)
