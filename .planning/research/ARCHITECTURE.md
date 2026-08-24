# Architecture Patterns

**Domain:** DXF file processing/viewer tool with MCP (Claude Desktop) integration for civil engineers
**Researched:** 2026-08-24

## Recommended Architecture

The central architectural decision for this project is **where the source of truth lives** and **how Claude Desktop (via MCP) and the browser viewer both act on the same DXF document without duplicating parsing/mutation logic.**

Recommendation: **a single local Node.js process that owns one in-memory Document Model per open file, exposes it two ways — HTTP/WebSocket API for the React viewer, and MCP tools for Claude Desktop — and treats "cleanup" as filtering, never reconstruction.**

```
                    ┌─────────────────────────────────────────────┐
                    │           Node "Engine Server" process        │
                    │                                               │
  Claude Desktop     │   ┌───────────────┐        ┌───────────────┐ │      React Viewer
  (MCP client) ─────►│   │  MCP Tool      │        │  HTTP/WS API   │◄├───── (browser)
  stdio transport    │   │  Layer         │        │  Layer         │ │      fetch + WS
                    │   └──────┬────────┘        └──────┬────────┘ │
                    │          │                          │          │
                    │          ▼                          ▼          │
                    │        ┌────────────────────────────────┐      │
                    │        │   Document Model (in-memory)    │      │
                    │        │   layers / entities / blocks /   │      │
                    │        │   selection & removal state      │      │
                    │        └───────────┬──────────┬──────────┘      │
                    │                    │          │                 │
                    │        ┌───────────▼──┐   ┌───▼───────────┐    │
                    │        │ DXF Reader    │   │ DXF Filter/    │    │
                    │        │ (tag-stream)  │   │ Writer (surgical│    │
                    │        │               │   │ text edit)     │    │
                    │        └───────────────┘   └────────────────┘    │
                    └─────────────────────────────────────────────┘
                                     │
                                     ▼
                          working DXF file on disk
```

Both Claude and the browser are **clients of the same running server** — neither owns the data. This avoids the two hardest failure modes in this domain: (1) two independent copies of the document drifting out of sync, and (2) re-deriving DXF export logic twice (once for AI-driven edits, once for manual UI edits).

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| **DXF Reader** (tag-stream parser) | Reads the raw DXF file into a group-code tag stream *and* a semantic structure (layers, entity index, blocks) for browsing. Never discards unrecognized tags. | Document Model (write-once on load) |
| **Document Model** (in-memory session) | Canonical, mutable state for one open file: entity list with layer/type/handle, layer table, current selection, removed/retained flags, undo log. Single source of truth. | DXF Reader (init), Mutation Engine, MCP Tool Layer, HTTP/WS API Layer |
| **Mutation Engine** | Applies rule-based operations: "remove by layer", "remove by object type", "retain despite rule" overrides. Pure functions over the Document Model; every mutation is diffable/undoable. | Document Model only |
| **DXF Filter/Writer** (export) | Produces the cleaned DXF file. Recommended approach: **surgical text-level filtering** — walk the original tag stream and omit only the tag ranges belonging to removed entities, re-emitting everything else (headers, tables, blocks, unsupported entities like HATCH/DIMENSION) byte-for-byte. Avoids the parser/writer library mismatch (see Anti-Pattern below). | Document Model (reads final removal state), DXF Reader's original tag stream |
| **HTTP/WS API Layer** | REST endpoints for load/structure/render-geometry/apply-cleanup/export; WebSocket (or SSE) channel that pushes Document Model change events so the viewer updates live when Claude makes edits. | Document Model, React frontend |
| **MCP Tool Layer** | Exposes `list_layers`, `get_structure`, `describe_entities`, `apply_cleanup_rule`, `remove_selection`, `export_dxf` as MCP tools (via `@modelcontextprotocol/sdk`, stdio transport for Claude Desktop). Talks only to the Document Model/Mutation Engine — never touches the raw DXF file directly. | Document Model, Claude Desktop (stdio) |
| **React Frontend — Structure Browser** | Tree/list view of layers, object types, block counts. Drives layer/type-based selection. | HTTP/WS API Layer |
| **React Frontend — Viewer Canvas** | Renders entities (lines, polylines, circles, arcs, text) with layer colors at mid-fidelity; highlights selected/removed entities. | HTTP/WS API Layer (consumes a pre-processed "render geometry" payload, does not parse DXF itself) |
| **React Frontend — Cleanup Controls / Status** | Layer/type selection for manual cleanup; shows AI-applied changes as they arrive over WebSocket; triggers export. | HTTP/WS API Layer |

**Key boundary rule:** the browser never parses or writes raw DXF. It only ever talks to the Engine Server's API and renders whatever geometry payload it receives. This keeps parsing/export logic in exactly one place (Node), which matters because civil engineering DXFs can be large and because parser/writer correctness is the highest-risk part of this project.

### Data Flow

1. **Load** — User opens a file path (or uploads) → Engine Server's DXF Reader parses the file into a tag stream + Document Model (layers, entities, blocks) → session held in server memory keyed by file/session id.
2. **Browse** — Frontend requests structure tree + a render-geometry payload (already unit-converted, layer-colored, flattened to polylines/primitives) via REST → Viewer Canvas draws it.
3. **Manual select/cleanup** — User selects layers/object types in the Structure Browser → frontend calls `POST /cleanup` → Mutation Engine flags entities removed/retained in the Document Model (non-destructive; nothing is deleted from the tag stream yet).
4. **AI-assisted cleanup** — User describes intent to Claude Desktop → Claude calls MCP tools (`get_structure`, `apply_cleanup_rule`, etc.) → these call the **same Mutation Engine** functions the UI uses → Document Model updates.
5. **Live reflection** — Engine Server pushes a change event over WebSocket/SSE → Viewer Canvas re-renders to show what Claude just removed/kept, so the user sees AI actions without leaving the browser.
6. **Export** — User confirms and hits Export → DXF Filter/Writer walks the *original* tag stream, omits tag ranges for entities marked removed, re-serializes everything else unchanged → writes cleaned DXF to disk.

Data flows in one direction per action (UI or MCP → Mutation Engine → Document Model → broadcast → UI), never bypassing the Document Model. This is what keeps the two clients (Claude, browser) consistent.

## Patterns to Follow

### Pattern 1: Single shared session, dual transport
**What:** One Node process holds the Document Model; expose it via MCP (stdio, for Claude Desktop) and HTTP/WS (for the React app) simultaneously, both hitting the same in-memory state.
**When:** Any local single-user tool where an AI agent and a human UI need to observe/mutate the same working data.
**Why:** Claude Desktop spawns MCP servers as local subprocesses over stdio — nothing prevents that same process from also binding a local HTTP port for the browser. Running the API and MCP tool layer in one process eliminates cross-process sync entirely for a POC. (If the frontend truly must run against a separately-started dev server, front the shared session behind a tiny persistent Node service both processes call into, but for this project's scope a single process is simplest and sufficient.)

### Pattern 2: Cleanup as filtering, not reconstruction
**What:** Model every cleanup operation as "mark entity removed/retained," never as "delete from parsed object and rebuild the file from a writer library."
**When:** Any DXF-modifying tool whose only mutation is removal (this project's explicit scope — no new geometry is added).
**Why:** JS DXF parser and writer libraries are not the same object model (see Anti-Pattern 1). Framing the operation purely as filtering makes "surgical text-level export" possible, which sidesteps that mismatch entirely.

### Pattern 3: Render-geometry payload, not raw DXF, to the browser
**What:** Engine Server pre-flattens entities (arcs/polylines/circles) into a simplified geometry payload (already layer-colored, unit-normalized) and sends that to the frontend, instead of shipping the raw DXF or the full semantic parse tree.
**When:** Any browser-based CAD-adjacent viewer, especially at "mid-fidelity" (not full CAD rendering).
**Why:** Keeps parsing logic in one runtime, keeps the payload small and canvas-ready, and matches how existing viewers (e.g., dxf-viewer/three-dxf) separate parsing/preparation from rendering — heavy work off the render thread.
**Example (payload shape):**
```typescript
type RenderEntity = {
  id: string;
  layer: string;
  type: 'LINE' | 'LWPOLYLINE' | 'CIRCLE' | 'ARC' | 'TEXT';
  color: string;       // resolved from layer/entity color
  points: [number, number][]; // pre-flattened to line segments for arcs/circles
  removed: boolean;
};
```

### Pattern 4: MCP tools are thin wrappers over existing operations
**What:** Every MCP tool (`apply_cleanup_rule`, `remove_selection`, etc.) calls the exact same Mutation Engine function the UI's "apply cleanup" button calls — no parallel AI-only mutation path.
**When:** Always, in this project.
**Why:** Guarantees the manual and AI-assisted cleanup paths can never diverge in behavior or produce inconsistent DXF output, and lets the manual UI path be built and validated first (Pattern 5).

### Pattern 5: Build the manual pipeline before the AI layer
**What:** Get parse → browse → select → filter → export working fully through the UI with zero MCP involvement first. Add the MCP Tool Layer last, as a wrapper around already-proven Mutation Engine calls.
**When:** Always, for this kind of project.
**Why:** De-risks the two hardest and most valuable parts (parser fidelity, export correctness) independently of the AI integration, which is comparatively low-risk (the official MCP SDK is straightforward). See Suggested Build Order below.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Parse with one library, rebuild with another
**What:** Using `dxf-parser` (or `dxf`) to parse into a semantic JS object, mutating that object, then feeding it to a *different* writer library (`dxf-writer`, `@tarikjabiri/dxf`, `dxf-doc`) expecting the writer to understand the parser's object shape.
**Why bad:** These libraries have independent, incompatible object models. None of the JS parsers/writers offer the round-trip tag preservation that Python's `ezdxf` provides for unsupported entity types. HATCH support is inconsistent/PR-only in `dxf-parser`; DIMENSION entities are commonly parsed-but-unsupported for output. Real civil engineering drawings use hatches (cross-sections) and dimension lines heavily — round-tripping them through a semantic rebuild risks silently dropping or corrupting exactly the entities users need preserved.
**Instead:** Use the surgical text-level filtering approach (Pattern 2) — read the original tag stream, use the semantic parse only for structure/browsing/selection, and export by omitting tag ranges from the *original* text rather than regenerating DXF from scratch.

### Anti-Pattern 2: Two independent state copies (frontend-parses + backend-parses)
**What:** Parsing the DXF a second time in the browser (e.g., with `dxf-parser` bundled client-side) so the frontend can render independently of the Node backend.
**Why bad:** Creates two sources of truth that must be kept in sync manually, doubles the surface area for parser bugs, and makes it unclear which copy Claude's MCP edits actually affected. Also risky for large civil drawings (parsing cost paid twice, once possibly on a slower device).
**Instead:** Parse once in the Engine Server; ship the frontend a pre-processed render/structure payload (Pattern 3).

### Anti-Pattern 3: MCP tools operating on the raw file directly
**What:** MCP tool handlers that open/re-parse/re-write the DXF file on disk independently of the running session (e.g., for every tool call).
**Why bad:** Bypasses the Document Model, discards in-flight manual UI selections, reintroduces the parse/write mismatch per call, and makes "live reflect AI changes in the viewer" impossible without polling the file for changes.
**Instead:** MCP tools call into the same in-process Document Model/Mutation Engine as the HTTP API (Pattern 4).

## Suggested Build Order

Dependencies flow from "can we correctly read and write a DXF" → "can a human control that" → "can Claude control that." Building AI integration first would be building on top of unproven parse/export fidelity.

1. **DXF Reader + Document Model** — Parse a file into tag stream + structure (layers/entities/blocks); no UI, no mutation. Validate against real civil engineering sample files early — this surfaces HATCH/DIMENSION/LEADER support gaps before anything else is built on top.
2. **Engine Server API (read-only)** — REST endpoints for load/structure/render-geometry; still no mutation.
3. **React Viewer (read-only)** — Canvas rendering + Structure Browser tree, consuming the read-only API. Validates the render-geometry payload design.
4. **Mutation Engine + manual cleanup UI** — Layer/type-based select-and-remove wired through the API and UI; non-destructive flagging in the Document Model, with undo.
5. **DXF Filter/Writer (export)** — Surgical text-level export of the current Document Model state; validate round-trip fidelity (open exported files in real CAD software / re-parse and diff) before moving on. This is the highest-risk component — do not defer it behind the MCP layer.
6. **MCP Tool Layer** — Wrap the already-working Mutation Engine calls as MCP tools (`list_layers`, `get_structure`, `apply_cleanup_rule`, `export_dxf`) via `@modelcontextprotocol/sdk`, stdio transport, tested with Claude Desktop.
7. **Live sync polish** — WebSocket/SSE push so the viewer reflects Claude's edits in real time; undo/redo UI; rendering fidelity improvements (better arc/text handling) as time allows.

**Why this order:** steps 1 and 5 are where domain-specific DXF risk concentrates (parser entity coverage, export fidelity) — resolving them early, independent of AI integration, means later phases (UI polish, MCP wrapping) build on a validated foundation rather than discovering fidelity problems after the AI layer is already wired in.

## Scalability Considerations

Given this is a single-user local POC, scalability is about **file size and drawing complexity**, not concurrent users.

| Concern | Small drawings (few hundred entities) | Large structural drawings (10k+ entities) | Very large / multi-block drawings |
|---------|--------------------------------------|--------------------------------------------|-------------------------------------|
| Parsing | Synchronous parse on request is fine | Consider async/streaming parse, done once server-side | Offload parse to a worker thread in the Engine Server to avoid blocking the API/MCP event loop |
| Rendering | Direct canvas redraw on every change | Batch draw calls by layer/color (as `dxf-viewer` does) to avoid one draw call per entity | Consider viewport culling (only render visible region) |
| Document Model | Whole model in memory, trivial | Whole model in memory still fine (structural DXFs are KB–low MB range, not millions of entities) | If ever needed, index entities by layer/type for O(1) filtered lookups instead of full scans per cleanup rule |
| Export | Single-pass text filter, negligible cost | Same — surgical filtering is O(n) over the tag stream regardless of complexity | Same |

For this project's stated scope (structural drawings, single user, POC), none of the "very large" mitigations are necessary up front — they're documented here only so a future phase doesn't have to re-derive them if a very large drawing surfaces performance issues.

## Sources

- [dxf-parser (gdsestimating) — GitHub](https://github.com/gdsestimating/dxf-parser) — entity/layer support and limitations (MEDIUM confidence, cross-checked)
- [dxf (bjnortier/skymakerolof) — GitHub](https://github.com/bjnortier/dxf) — tag parsing, toSVG, HATCH/DIMENSION parsed-but-unrendered (MEDIUM confidence)
- [dxf-viewer (vagran) — GitHub](https://github.com/vagran/dxf-viewer) — worker-offloaded parse, geometry batching architecture for large files (MEDIUM confidence)
- [MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/v2/) and [modelcontextprotocol.io build-server guide](https://modelcontextprotocol.io/docs/develop/build-server) — tool/resource/prompt model, stdio transport for local servers (MEDIUM confidence)
- [ezdxf documentation — DXF internals / tag preservation](https://ezdxf.readthedocs.io/en/stable/dxfinternals/dxftags.html) — group-code tag-stream structure and round-trip preservation pattern (referenced as the design precedent JS libraries lack) (MEDIUM confidence)
- npm/GitHub comparison of `dxf-writer`, `@tarikjabiri/dxf`, `dxf-doc` — independent writer object models (MEDIUM confidence)
- [react-konva / Konva docs](https://konvajs.org/docs/react/index.html) and npmtrends fabric vs konva vs pixi.js comparison — canvas library tradeoffs (MEDIUM confidence)

**Note on confidence:** All findings above are web-sourced and cross-checked across 2+ independent sources (GitHub repos, npm listings, official docs), yielding MEDIUM confidence per this project's classification scheme. No official DXF-specific architecture guide or MCP+CAD reference architecture exists (LOW-confidence gap) — the "surgical text-filter export" and "single-process dual-transport" patterns above are this researcher's synthesis from DXF format internals and MCP transport mechanics, not a directly-documented best practice. Recommend validating the tag-stream filtering approach against a real sample DXF early in Phase 1 build.
