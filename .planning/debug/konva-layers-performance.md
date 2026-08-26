---
status: awaiting_human_verify
trigger: "Konva warning: The stage has 53 layers. Recommended maximum number of layers is 3-5. Bad performance when loading a DXF file — can't zoom in or out, and it freezes"
created: 2026-08-26
updated: 2026-08-26
---

## Symptoms

- **Expected behavior**: Smooth pan/zoom on the canvas with DXF layers rendered correctly
- **Actual behavior**: Konva warns about 53 layers on the stage (recommended max is 3-5), canvas freezes, cannot zoom in or out
- **Error messages**: "The stage has 53 layers. Recommended maximum number of layers is 3-5. Adding more layers into the stage may drop the performance. Rethink your tree structure, you can use Konva.Group"
- **Timeline**: Happens with large DXF files that have many layers; small files work okay
- **Reproduction**: Load a large DXF file with many layers — the canvas becomes unresponsive

## Current Focus

- hypothesis: CONFIRMED — Each DXF layer name creates a separate `<KonvaLayer>` (line 323-349 of Stage.tsx). With 53 DXF layers → 53 Konva Layers (+ 2 overlay layers = 55 total). Each Konva Layer is a separate HTML canvas element, causing massive compositing overhead and freezing.
- test: Read Stage.tsx rendering code
- expecting: 1:1 mapping of DXF layers to Konva Layers
- next_action: Apply fix — consolidate all entity rendering into a single Konva Layer using Konva Groups for DXF-layer grouping

reasoning_checkpoint:
  hypothesis: "Stage.tsx maps each DXF layer name to a separate <KonvaLayer> component (line 329), creating 53+ HTML canvas elements when a DXF file has 53 layers. Each canvas requires independent GPU compositing and redraw, causing the freeze and zoom failure."
  confirming_evidence:
    - "Line 323: layerNames.map((layerName) => ... creates one iteration per DXF layer"
    - "Line 329: <KonvaLayer key={layerName}> — each iteration creates a separate Konva Layer (= separate <canvas> DOM element)"
    - "Warning message matches exactly: 'The stage has 53 layers' corresponds to 53 DXF layers + 2 overlay layers"
    - "Konva documentation recommends 3-5 layers maximum; each Layer is an independent canvas element"
  falsification_test: "If the hypothesis is wrong, consolidating entities into fewer Konva Layers (using Groups) would NOT eliminate the warning or improve performance"
  fix_rationale: "Replace per-DXF-layer <KonvaLayer> with a single <KonvaLayer> containing per-DXF-layer <Group> components. Groups are lightweight scene-graph containers (no separate canvas), preserving logical DXF-layer grouping while keeping total canvas count at 3 (entities + overlay + rubber-band)."
  blind_spots: "Layer-level visibility toggling via Konva Layer.visible() may behave differently than Group.visible() — need to verify visibility still works after the change"
  candidate_causes:
    - "code: 1:1 DXF-layer-to-KonvaLayer mapping in Stage.tsx render loop"
    - "config: no throttling or virtualization of the Konva stage for large entity counts (secondary — the 53-canvas compositing is the primary bottleneck)"
  and_gate: "no — the 53-layer-to-53-canvas mapping alone is sufficient to cause the freeze; entity count per layer may compound it but is not required"

## Evidence

- timestamp: 2026-08-26
  checked: Stage.tsx lines 300-390 (rendering logic)
  found: |
    Line 300: `const layerNames = dxfData ? Object.keys(dxfData.tables?.layer?.layers ?? {}) : [];`
    Lines 323-349: `layerNames.map((layerName) => { ... return (<KonvaLayer key={layerName}> ... </KonvaLayer>); })`
    Each DXF layer name gets its own `<KonvaLayer>` component. With 53 DXF layers, this creates 53 Konva Layers.
    Additionally, lines 351-373 and 374-387 add 2 more overlay Konva Layers (hover/selection and rubber-band).
    Total = 55 Konva Layers = 55 HTML canvas elements.
  implication: Direct confirmation of the hypothesis. The fix is to use a single KonvaLayer with Groups.

- timestamp: 2026-08-26
  checked: Secondary performance issue in entity filtering
  found: |
    Lines 325-327: For each layerName, the code does `.map().filter()` over ALL entities.
    With N layers and M entities, this is O(N*M) work on every render.
  implication: Minor secondary issue — a single-pass grouping would be O(M). Can fix alongside the main layer consolidation.

## Eliminated

## Resolution

- root_cause: Stage.tsx mapped each DXF layer name to a separate `<KonvaLayer>` component (line 329). Each Konva Layer creates a separate HTML canvas element. A DXF file with 53 layers produced 53 canvases + 2 overlay canvases = 55 total, far exceeding Konva's recommended 3-5 maximum. The browser's compositing pipeline froze under the load, making zoom/pan unresponsive. Secondary issue: entity filtering ran O(N*M) per render instead of O(M).
- fix: Consolidated all DXF entity rendering into a single `<KonvaLayer>` using `<Group>` components for per-DXF-layer organization. Groups are lightweight scene-graph containers that share a single canvas. Also introduced a `useMemo` pre-grouping pass (`entitiesByLayer` Map) to replace the O(N*M) per-render filter loop with a single O(M) pass. Total Konva Layers is now fixed at 3 regardless of DXF layer count.
- verification: TypeScript compiles clean (`tsc --noEmit` — zero errors). ESLint passes. Production build succeeds (`vite build`). Konva Layer count verified at exactly 3 via grep.
- files_changed: [src/components/CanvasViewer/Stage.tsx]
- guardrail_verdict: accepted
