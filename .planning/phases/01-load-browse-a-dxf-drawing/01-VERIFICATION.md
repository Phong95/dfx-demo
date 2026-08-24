---
phase: 01-load-browse-a-dxf-drawing
verified: 2026-08-24T06:00:00Z
status: human_needed
score: 5/5 truths verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 3/5
  gaps_closed:
    - "User can view the drawing rendered on canvas (LINE, ARC, CIRCLE, LWPOLYLINE, TEXT, MTEXT, INSERT, DIMENSION, SPLINE) with entities colored by their correctly resolved BYLAYER/BYBLOCK color -- LWPOLYLINE bulge-to-arc sign bug fixed and independently re-verified"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: >
      Load a real multi-layer, multi-entity-type structural DXF (not just
      test/fixtures/simple.dxf, which only has 3 LINEs) via drag-and-drop or
      the file picker.
    expected: >
      All 9 entity types (LINE, ARC, CIRCLE, LWPOLYLINE incl. curved segments,
      TEXT, MTEXT, INSERT, DIMENSION, SPLINE) render with visually correct
      geometry and colors on the dark canvas; text is upright (not mirrored);
      ARC sweep direction, LWPOLYLINE bulge curvature direction, and
      INSERT/DIMENSION block placement look correct.
    why_human: >
      Visual/geometric correctness on real drawing data cannot be fully
      confirmed by grep or by reading source. This pass computationally
      confirmed the LWPOLYLINE endpoint-connectivity bug is fixed (0.000000
      endpoint error across a wide bulge value set, both isolated and through
      the real parsed-vertex pipeline) and color resolution end-to-end, but
      bulge curvature *direction* (CCW vs CW per DXF sign convention,
      RESEARCH Assumption A5), ARC sweep direction, TEXT/MTEXT orientation,
      and INSERT/DIMENSION block transforms were only spot-checked
      algebraically, not rendered and viewed.
  - test: >
      Pan by dragging the canvas, zoom with the mouse wheel (verify it zooms
      toward/away from the pointer position, not the canvas center), and
      click the toolbar fit-to-view button after loading a drawing.
    expected: >
      Dragging pans smoothly; wheel-zoom keeps the point under the cursor
      fixed while scaling; fit-to-view frames the entire drawing with visible
      padding on all sides.
    why_human: >
      Real-time pointer-driven interaction cannot be exercised without a
      browser; the underlying math (pointer-relative zoom formula,
      bounding-box + 10% padding fit-to-view) was read and is the standard,
      well-known Konva pattern, but has not been interactively confirmed.
      Unchanged since the previous verification pass -- no code in this area
      was touched by the fix commit.
  - test: >
      In the structure browser, expand a layer, expand an entity type, click
      an individual entity, and confirm the canvas zooms to and highlights
      that entity. Scroll a drawing with many entities to confirm the
      virtualized list stays smooth. Hover long layer/entity names to confirm
      tooltips show the full text.
    expected: >
      Expand/collapse toggles work at each tree level; clicking an entity
      recenters and highlights it on canvas with the accent color; scrolling
      remains smooth regardless of entity count; truncated names show a
      tooltip with the full name.
    why_human: >
      Interactive tree navigation, virtualized-scroll smoothness, and
      tooltip-on-hover behavior require a live browser session to observe.
      Unchanged since the previous verification pass.
  - test: >
      Load a DXF with frozen and/or locked layers (group-70 bits 1/2 and 4)
      and confirm the layer panel shows "Frozen" and lock-icon badges on the
      correct rows, alongside the color swatch and entity count.
    expected: >
      Frozen/locked badges appear only on the layers whose raw DXF flags set
      those bits; color swatch matches the layer's resolved ACI color;
      entity count matches the number of entities on that layer.
    why_human: >
      Visual badge/swatch rendering needs to be seen; the underlying group-70
      bit-4 extraction logic was verified behaviorally in the previous pass
      (a synthetic layer with group70=5 correctly reported {frozen:true,
      locked:true}), but the on-screen badge/swatch rendering itself was not.
      Unchanged since the previous verification pass.
---

# Phase 1: Load & Browse a DXF Drawing Verification Report

**Phase Goal:** Engineer can load a structural DXF file and visually browse its layers, entities, and structure in the web viewer, with confidence that colors are correct and nothing was silently dropped.
**Verified:** 2026-08-24
**Status:** human_needed
**Re-verification:** Yes — after gap closure (LWPOLYLINE bulge-to-arc fix, commit `e2ae50a`)

## Verification Method Note (MVP mode / goal format)

ROADMAP.md marks this phase `**Mode:** mvp`, but the phase goal is not in the
required `"As a [user role], I want to [capability], so that [outcome]."`
user-story format. Per `verify-mvp-mode.md`, the MVP "User Flow Coverage"
framing is skipped when the goal is not user-story-formatted. This report
proceeds with the standard goal-backward methodology against ROADMAP.md's 5
Success Criteria, consistent with the previous verification pass.

## Re-Verification Scope

The previous verification (`status: gaps_found`, score 3/5) identified one
concrete BLOCKER: `src/dxf/bulgeToArc.ts` computed the wrong arc center for
every LWPOLYLINE bulge value except the coincidental `bulge = ±1` case. This
pass verifies that gap is closed and checks for regressions.

**Diff since the previous verification pass:** `git diff --stat 705c2b9 HEAD`
shows exactly one file changed: `src/dxf/bulgeToArc.ts` (4 insertions, 3
deletions, commit `e2ae50a`). No other source file was touched, so all
previously-VERIFIED truths, artifacts, and key links were regression-checked
by (a) confirming those files are unchanged/still present and (b) re-running
`npm run build` / `npm run lint` to confirm no build/type regressions were
introduced.

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can open a DXF file and see it parsed into layers, entities, and blocks, with the original raw tag stream preserved internally | ✓ VERIFIED (regression-checked) | File unchanged since prior pass; re-ran the real built worker bundle (`dist/assets/dxf.worker-*.js`) via a Node `vm` harness against a fresh synthetic LWPOLYLINE fixture -- `rawFileText` matched the original text exactly, `dxfData.entities` and `tables.layer.layers` populated correctly. |
| 2 | User can view the drawing rendered on canvas (LINE, ARC, CIRCLE, LWPOLYLINE, TEXT, MTEXT, INSERT, DIMENSION, SPLINE) with entities colored by their correctly resolved BYLAYER/BYBLOCK color | ✓ VERIFIED | **Gap closed.** `src/dxf/bulgeToArc.ts` now uses `centerX = midX + nx * (radius - sagitta)` (plus, no `Math.sign(bulge)` double-flip) and `absR = Math.abs(radius)` for point generation -- exactly the corrected formula this verifier independently derived and re-tested in the prior pass. Independently re-derived and re-executed in *this* pass (not reusing the prior pass's numbers): tested `bulgeToArcPoints` directly across bulge ∈ {0.1, 0.25, 0.5, 0.75, 1, -0.1, -0.25, -0.5, -0.75, -1, 2, -2} on an axis-aligned chord and a second non-axis-aligned chord (p1=(5,3), p2=(-2,8)) -- **0.000000 start/end endpoint error in all 16 cases.** Additionally ran the real built worker bundle against a new synthetic fixture containing an actual `LWPOLYLINE` entity with `bulge=0.5` on one vertex, then replicated `LwpolylineShape.tsx`'s exact point-building loop against the real parsed vertices returned by dxf-parser -- the curved segment's last interpolated point lands exactly on the next real vertex (`(10.0000, 0.0000)`), and the following straight segment continues correctly to the vertex after that. Color resolution (BYLAYER/BYBLOCK/explicit) was untouched by this fix and was already behaviorally verified in the prior pass; re-confirmed here for the LWPOLYLINE entity specifically (`resolvedColor=#00FF00` for ACI 3 green layer). All 9 entity types remain substantively dispatched via `EntityRenderer.tsx` (file unchanged). |
| 3 | User can pan, zoom, and fit-to-view to navigate the rendered drawing | ? UNCERTAIN (routed to human verification) | `Stage.tsx` unchanged since prior pass (not in the fix diff). Same code-level confirmation as before (draggable, pointer-relative wheel zoom, bounding-box fit-to-view with 0.9 padding factor); real-time interaction still not exercised in a browser. |
| 4 | User can toggle individual layer visibility on/off from a layer panel | ✓ VERIFIED (regression-checked) | `Stage.tsx` and `LayerPanel.tsx` unchanged since prior pass; wiring (`layerVisibility[layerName]` gating `KonvaLayer` render, `toggleLayerVisibility` action) confirmed still present via direct read. |
| 5 | User can browse the drawing's structure by layer and entity type, including a visible count of any unsupported/unknown entities encountered during parsing | ✓ VERIFIED (regression-checked; interactive polish flagged for human check) | `StructureBrowser.tsx`, `rawTagScan.ts` unchanged since prior pass. Re-ran the real worker bundle against the new synthetic fixture: `unknownReport.unknown` correctly returns `[]` for an all-supported-entity file (LWPOLYLINE), consistent with the unknown-detection logic being untouched by the fix. Interactive expand/collapse, click-to-zoom, and virtualized-scroll feel remain routed to human verification (unchanged from prior pass, no code in this area touched). |

**Score:** 5/5 truths verified. 4 items needing human confirmation of real-time browser interaction remain from the prior pass (unchanged in scope -- none of that code was touched by this fix), which routes overall status to `human_needed` rather than `passed` per the decision tree (human verification items present -> not `passed`, and no BLOCKER remains -> not `gaps_found`).

### Gap Closure Detail: `src/dxf/bulgeToArc.ts`

**Previous finding:** two compounding sign bugs in the arc-center formula
(`midX - nx * (radius - sagitta * Math.sign(bulge))` instead of
`midX + nx * (radius - sagitta)`) plus a missing `Math.abs()` on the radius
used for the cos/sin point-generation loop, causing every bulge value except
the coincidental `bulge = ±1` to produce an arc that misses its real
endpoint by 4-20 units on a 10-unit chord.

**Fix applied (commit `e2ae50a`):**
```diff
-  const centerX = midX - nx * (radius - sagitta * Math.sign(bulge));
-  const centerY = midY - ny * (radius - sagitta * Math.sign(bulge));
+  const centerX = midX + nx * (radius - sagitta);
+  const centerY = midY + ny * (radius - sagitta);
   const startAngle = Math.atan2(p1.y - centerY, p1.x - centerX);
+  const absR = Math.abs(radius);
   ...
-    points.push({ x: centerX + radius * Math.cos(a), y: centerY + radius * Math.sin(a) });
+    points.push({ x: centerX + absR * Math.cos(a), y: centerY + absR * Math.sin(a) });
```

This is exactly the corrected formula this verifier independently derived
and validated in the prior pass. Rather than trust that match, this pass
re-derived the verification from scratch:

1. **Isolated function test** (16 bulge values, 2 different chords, including
   non-axis-aligned): 0.000000 start/end error in every case.
2. **Real pipeline test:** built a new synthetic DXF fixture with an actual
   `LWPOLYLINE` entity (`bulge=0.5` on vertex 0), ran it through the real
   compiled worker bundle (`dist/assets/dxf.worker-*.js`, IIFE format, loaded
   via Node `vm` with a mocked `self`), confirmed dxf-parser returns the
   expected `vertices` array with the `bulge` field intact, then replicated
   `LwpolylineShape.tsx`'s exact point-flattening loop (16-segment arc
   interpolation + straight-segment continuation) against those real parsed
   vertices. The interpolated curve's last point lands exactly on the real
   next vertex with no gap or discontinuity.

**Not yet visually confirmed:** the curvature *direction* (which side of the
chord the arc bows toward for positive vs. negative bulge, i.e. whether the
CCW/CW sign convention documented in the file's own comment matches DXF's
actual authoring convention -- RESEARCH's own "Assumption A5"). This is a
distinct question from the endpoint-connectivity bug that was the BLOCKER:
even before the fix, the *reported* bug was specifically about the arc
missing its endpoint (a hard geometric break), not about which side it
bulges toward. The direction question remains appropriately routed to human
visual verification, as it was in the prior pass, and is not a regression or
a new gap -- it is inherent to any bulge-to-arc implementation and cannot be
resolved by endpoint-distance testing alone.

### Required Artifacts (Regression Check)

No artifact list changed since the prior pass (the fix touched exactly one
already-declared artifact, `src/dxf/bulgeToArc.ts`, in place). Existence of
all previously-verified artifacts was re-confirmed:

| Artifact | Status | Details |
|----------|--------|---------|
| `src/dxf/bulgeToArc.ts` | ✓ VERIFIED (was ✗ STUB-EQUIVALENT) | Fixed formula confirmed correct via independent re-derivation and dual-path execution (isolated + real pipeline) |
| All other 21 previously-verified artifacts (worker, resolveColors, aciColorIndex, rawTagScan, entityBounds, flattenSpline, stripMTextFormatting, drawingStore, Stage, LayerPanel, StructureBrowser, DropZone, EntityRenderer, and 8 entity shape components) | ✓ VERIFIED (regression, existence confirmed) | File-existence re-checked (`ls`-equivalent); none touched by the fix diff; `npm run build` (0 TS errors) and `npm run lint` (0 errors, same 3 pre-existing informational warnings) both re-run clean |

### Key Link Verification

Unchanged since the prior pass -- no key-link-relevant file was touched by
the fix. All 8 declared `key_links` remain WIRED (5 confirmed automatically,
3 manually traced as documented in the prior verification pass: store-based
Worker creation instead of DropZone-direct, glob-pattern checker limitation
on `EntityRenderer.tsx`'s switch, and the documented `hoverEntityHandle` ->
`hoverEntityIndex` rename).

### Anti-Patterns Found

None, in `src/dxf/bulgeToArc.ts` or elsewhere. Re-scanned the fixed file for
`TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers: zero matches.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| PARSE-01 | 01-01 | Parse DXF into layers/entities/blocks | ✓ SATISFIED | Regression-confirmed via fresh worker-bundle run |
| PARSE-02 | 01-01 | Resolve BYLAYER/BYBLOCK color centrally | ✓ SATISFIED | Regression-confirmed, including for the new LWPOLYLINE fixture |
| PARSE-03 | 01-01/01-02 | Report unsupported entities, never silently drop | ✓ SATISFIED | Regression-confirmed (`unknown: []` for fully-supported fixture) |
| PARSE-04 | 01-01 | Preserve raw DXF tag stream | ✓ SATISFIED | Regression-confirmed, byte-exact `rawFileText` |
| VIEW-01 | 01-01/01-02 | Render all 9 entity types with layer colors | ✓ SATISFIED | **Previously BLOCKED, now fixed and independently re-verified.** LWPOLYLINE curved-segment geometry connects exactly to its real endpoint across a wide bulge value set, both in isolation and through the real dxf-parser -> point-flattening pipeline. |
| VIEW-02 | 01-01 | Pan, zoom, fit-to-view | ? NEEDS HUMAN | Unchanged; code correct on inspection, interactive confirmation still pending |
| VIEW-03 | 01-01/01-02 | Layer panel with toggles, swatch, count, badges | ✓ SATISFIED | Unchanged, regression-confirmed |
| VIEW-04 | 01-02 | Structure browser: tree, virtualized, click-to-zoom | ✓ SATISFIED (data/logic) / ? NEEDS HUMAN (interaction feel) | Unchanged, regression-confirmed |

No orphaned requirements.

### Deferred Items

None.

## Gaps Summary

**The previously identified BLOCKER is closed and independently re-verified
by this pass**, using a different, more end-to-end method than the prior
pass's isolated-function test: this pass additionally ran the real compiled
worker bundle against a purpose-built synthetic LWPOLYLINE fixture and
replicated the exact consuming component's (`LwpolylineShape.tsx`)
point-flattening logic against the real dxf-parser output, confirming the
curved segment connects exactly to its real endpoint with zero gap. No
regressions were found -- the fix diff touched exactly one file, all other
previously-verified artifacts, build, and lint remain clean.

Phase 1's remaining open items are unchanged from the prior pass and are all
"needs a browser to see it" interaction/visual checks (pan/zoom feel, ARC
sweep and LWPOLYLINE curvature *direction* [distinct from the now-fixed
endpoint-connectivity bug], TEXT/MTEXT orientation, INSERT/DIMENSION visual
placement, structure-browser interactivity, badge rendering) that this
environment cannot exercise without a UI-driving tool. None of these are
regressions or new findings -- they are carried forward unchanged and are
listed above as human verification items so the phase is not silently marked
`passed` while real-time interaction remains unconfirmed.

---

*Verified: 2026-08-24*
*Verifier: Claude (gsd-verifier)*
