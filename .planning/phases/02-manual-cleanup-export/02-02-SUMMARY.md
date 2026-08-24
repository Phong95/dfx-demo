---
phase: 02-manual-cleanup-export
plan: 02
subsystem: export
tags: [dxf-parser, sonner, radix-alert-dialog, surgical-text-filter, export-validation]

# Dependency graph
requires:
  - phase: 02-manual-cleanup-export
    plan: 01
    provides: "drawingStore with selectedEntityIndices/deletedEntityIndices/hiddenEntityIndices, rawFileText, dxfData, CleanupToolbar with Delete/Hide/Undo/Redo"
provides:
  - "Polyline-aware entity boundary scanner (buildEntityTagRanges) producing character-offset ranges index-aligned 1:1 with dxfData.entities"
  - "Surgical export pipeline (filterDxfText/validateExport/saveDxf) preserving untouched DXF content byte-for-byte with re-parse validation before save"
  - "Export DXF button with in-progress state, success/failure toasts via sonner"
  - "Batch-delete AlertDialog confirmation for 10+ entity selections"
  - "Fixed SEQEND/VERTEX false-positive in rawTagScan.ts's unknown-entity report"
affects: []

# Actuals (#2632)
actuals:
  tokens: 21000
  tasks: 2
  commits: 1

# Tech tracking
tech-stack:
  added: ["sonner@2.0.8", "radix-ui@1.6.7", "next-themes@0.4.6 (transitive, sonner Toaster theme prop)"]
  patterns:
    - "Character-offset (never line-array-index) boundary scanning for any DXF text mutation, to preserve original CRLF/LF bytes exactly"
    - "POLYLINE compound-entity awareness: VERTEX/SEQEND fold into the preceding entity's range rather than starting new ranges, matching dxf-parser's actual parse-loop consumption behavior"
    - "Export validation gate: never trust the boundary scanner's output without a re-parse-and-count check; any mismatch or parse error blocks the save entirely"
    - "showSaveFilePicker with AbortError-as-silent-noop, Blob+anchor download fallback for browsers without File System Access API"
    - "Controlled AlertDialog (open/onOpenChange) with a conditional branch in the Delete handler, rather than an AlertDialogTrigger, so 1-9 deletes bypass the dialog entirely"

key-files:
  created:
    - src/dxf/entityTagRanges.ts
    - src/dxf/exportDxf.ts
    - src/components/ui/alert-dialog.tsx
    - src/components/ui/sonner.tsx
  modified:
    - src/dxf/rawTagScan.ts
    - src/components/CleanupToolbar.tsx
    - src/App.tsx
    - package.json
    - package-lock.json

key-decisions:
  - "shadcn's current alert-dialog registry component imports from the consolidated `radix-ui` umbrella package rather than the individually-scoped `@radix-ui/react-alert-dialog` RESEARCH.md cited -- verified `radix-ui`'s npm metadata resolves to the identical github.com/radix-ui/primitives source already vetted OK in RESEARCH.md's Package Legitimacy Audit, so it was installed directly (Rule 3: blocking-issue fix, not a new unvetted package)"
  - "The Windows/git-bash `npx shadcn add` invocation wrote the 3 new component files to a literal `./@/components/ui/` directory instead of resolving the `@` path alias to `src/components/ui/` -- files were moved to the correct location and the stray `@/` directory removed before continuing"
  - "sonner's Toaster wrapper (from shadcn's registry) internally calls next-themes' useTheme(); rather than adding a ThemeProvider, the explicit `theme=\"dark\"` prop passed to <Toaster> in App.tsx overrides the internal computed theme via prop-spread order in the generated component, matching UI-SPEC's 'dark theme prop' instruction with no extra provider wiring"

patterns-established:
  - "DXF export/mutation code must slice the original string by character offset, never split-into-lines-and-rejoin"
  - "Any new export-adjacent validation must fail closed (block save) on ambiguity, never fail open"

requirements-completed: [EXPORT-01, EXPORT-02]

coverage:
  - id: D5
    description: "Export DXF button generates a byte-for-byte-preserving cleaned DXF, re-parse-validates before save, and shows success/failure toasts"
    requirement: "EXPORT-01, EXPORT-02"
    verification:
      - kind: other
        ref: "npm run build (0 TS errors); npm run lint (0 errors, 6 pre-existing warnings unrelated to this plan); standalone tsx round-trip script against a hand-built CRLF fixture with LINE/CIRCLE/POLYLINE(+VERTEX+SEQEND)/TEXT confirmed buildEntityTagRanges produces 4 ranges 1:1 type-aligned with dxf-parser's 4 parsed entities, filterDxfText removing indices [0,2] (LINE, POLYLINE) preserved the CIRCLE and TEXT blocks byte-for-byte including \\r\\n terminators, validateExport returned true for the correct expected count, and re-parsing the filtered output yielded exactly [CIRCLE, TEXT] in original order"
        status: pass
    human_judgment: true
    rationale: "The native Save-As dialog / Blob-download fallback, the Exporting… button state timing, and the actual on-disk saved file cannot be exercised without a running browser in this execution environment -- the round-trip logic (boundary detection, surgical filtering, validation) was verified programmatically instead, which is the highest-risk piece per RESEARCH.md; the browser-only save mechanics are lower-risk (standard, well-documented Web APIs) and listed under human-check."
  - id: D6
    description: "Deleting 10+ entities shows an AlertDialog (count, Ctrl+Z reminder, destructive confirm, Cancel); under-10 deletes proceed immediately"
    requirement: "part of CLEAN-03 (batch-confirmation, CONTEXT.md D-07)"
    verification:
      - kind: other
        ref: "npm run build (0 TS errors); grep -c AlertDialog src/components/CleanupToolbar.tsx == 22 (component imports + JSX usage)"
        status: pass
    human_judgment: true
    rationale: "Dialog appearance, copy rendering with the live count, and the Cancel/Confirm interaction require a browser to observe -- no automated UI test exists in this repo."
  - id: D7
    description: "Loading a DXF with POLYLINE entities no longer reports SEQEND as an unknown entity type"
    requirement: "byproduct fix, RESEARCH.md Pitfall 1"
    verification:
      - kind: other
        ref: "standalone tsx script against a CRLF fixture with LINE/POLYLINE(+2 VERTEX+SEQEND)/HATCH confirmed rawTagScan's typeCounts no longer contains SEQEND or VERTEX, while HATCH (a genuinely unsupported type) still correctly appears in the unknown list"
        status: pass
    human_judgment: false
    rationale: "Fully verified programmatically -- pure string-processing logic with no UI/browser dependency."

duration: ~35min (active work, includes package-install troubleshooting and round-trip verification)
completed: 2026-08-24
status: complete
---

# Phase 2 Plan 2: DXF Export Pipeline Summary

**Polyline-aware entity boundary scanner + surgical byte-for-byte export filter with re-parse validation, native Save-As dialog, batch-delete confirmation, and export toasts — completing Phase 2's load-clean-export loop.**

## Performance

- **Duration:** ~35 min active execution (includes a blocking-human checkpoint pause for sonner package approval, a Windows/npx shadcn path-alias workaround, and a standalone round-trip verification script)
- **Completed:** 2026-08-24T09:45:01Z
- **Tasks:** 2 (1 checkpoint:human-verify + 1 auto)
- **Files modified:** 9 (4 created, 5 modified)

## Accomplishments
- Built `entityTagRanges.ts`: a character-offset (not line-index) raw-text boundary scanner that folds POLYLINE's trailing VERTEX/SEQEND groups into the POLYLINE's own range, keeping the output index-aligned 1:1 with `dxfData.entities`
- Built `exportDxf.ts`: `filterDxfText` (surgical slice-based removal, byte-for-byte preservation including CRLF), `validateExport` (re-parse + entity-count gate, fails closed), `saveDxf` (native `showSaveFilePicker` with `AbortError`-as-noop, Blob+anchor download fallback)
- Fixed the pre-existing SEQEND/VERTEX false-positive in `rawTagScan.ts`'s unknown-entity report, in both the ENTITIES and BLOCKS sections; removed VERTEX from `SUPPORTED_TYPES` since it was never a real top-level handler
- Wired an Export DXF button into `CleanupToolbar` (accent/default variant, `Download` icon, disabled with no file loaded, "Exporting…" in-progress label) with success and validation-failure toasts via sonner
- Added a batch-delete `AlertDialog` (controlled `open`/`onOpenChange`) gating deletes of 10+ entities behind an explicit confirm step; 1-9 deletes still proceed immediately
- Mounted sonner's `Toaster` in `App.tsx` with the dark theme
- Verified the entire boundary-scan → filter → validate → reparse pipeline programmatically against a hand-built CRLF fixture containing a compound POLYLINE, confirming byte-for-byte fidelity and correct entity-count validation

## Task Commits

Each task was committed atomically:

1. **Task 1 (checkpoint:human-verify): sonner package legitimacy** — no commit (checkpoint only; user replied "approved")
2. **Task 2: Export pipeline, batch-delete confirmation, and export toasts** - `7db2ec2` (feat)

**Plan metadata:** (pending — this commit)

## Files Created/Modified
- `src/dxf/entityTagRanges.ts` (new) - Polyline-aware boundary scanner, `buildEntityTagRanges`
- `src/dxf/exportDxf.ts` (new) - `filterDxfText`, `validateExport`, `saveDxf`
- `src/dxf/rawTagScan.ts` - SEQEND/VERTEX skip guard in ENTITIES and BLOCKS sections; VERTEX removed from `SUPPORTED_TYPES`
- `src/components/CleanupToolbar.tsx` - Export DXF button + handler, batch-delete `AlertDialog`, `isExporting`/`isBatchDeleteOpen` local state
- `src/App.tsx` - Mounted `<Toaster theme="dark" />`
- `src/components/ui/alert-dialog.tsx` (new, via `npx shadcn add`) - shadcn AlertDialog primitive (built on the `radix-ui` umbrella package)
- `src/components/ui/sonner.tsx` (new, via `npx shadcn add`) - shadcn Sonner/toast primitive
- `package.json` / `package-lock.json` - Added `sonner@2.0.8`, `radix-ui@1.6.7`, `next-themes@0.4.6` (transitive, used by the sonner Toaster wrapper's theme prop)

## Decisions Made
- Installed the `radix-ui` umbrella package (not `@radix-ui/react-alert-dialog` as RESEARCH.md's Package Legitimacy Audit literally named) because shadcn's current registry-generated `alert-dialog.tsx` imports from it directly; verified via `npm view radix-ui repository.url` that it resolves to the identical `github.com/radix-ui/primitives` source already approved OK in RESEARCH.md — treated as a Rule 3 blocking-issue fix within an already-vetted package family, not a new unvetted dependency
- Manually relocated the 3 shadcn-generated component files from a stray literal `./@/components/ui/` directory (a Windows/git-bash path-alias resolution quirk in the shadcn CLI) into the correct `src/components/ui/` location, then removed the stray directory
- Kept the Export DXF button on the existing `default` Button variant (already accent-colored `bg-accent`) rather than adding a new "accent" variant, since `default` already satisfies the plan's "accent Button variant" instruction
- Used a controlled `AlertDialog` (`open`/`onOpenChange` state) with the Delete button's `onClick` branching on `selectionCount >= 10`, rather than an `AlertDialogTrigger`, so under-10 deletes can bypass the dialog and call `deleteSelected()` directly with zero dialog-mount overhead

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] `npx shadcn add alert-dialog sonner` wrote files to a stray `./@/` directory instead of `src/components/ui/`**
- **Found during:** Task 2, immediately after the shadcn install command
- **Issue:** On this Windows/git-bash environment, the shadcn CLI's `@` path-alias resolution failed and created a literal `@/components/ui/{alert-dialog,sonner,button}.tsx` directory tree at the repo root instead of writing into `src/components/ui/`
- **Fix:** Moved `alert-dialog.tsx` and `sonner.tsx` into `src/components/ui/`; confirmed `button.tsx` was byte-identical to the existing file (no diff) so it needed no action; deleted the stray `@/` directory
- **Files modified:** `src/components/ui/alert-dialog.tsx`, `src/components/ui/sonner.tsx`
- **Commit:** `7db2ec2`

**2. [Rule 3 - Blocking issue] shadcn's alert-dialog registry component depends on `radix-ui`, not `@radix-ui/react-alert-dialog`, and the CLI did not install it**
- **Found during:** Task 2, verifying `package.json`/`node_modules` after the shadcn install
- **Issue:** The generated `alert-dialog.tsx` imports `{ AlertDialog as AlertDialogPrimitive } from 'radix-ui'` (shadcn's current consolidated-package convention), but `npm view` / `node_modules` confirmed this package was never installed — the component would fail to resolve at build/runtime
- **Fix:** Verified via `npm view radix-ui repository.url` that this package resolves to `github.com/radix-ui/primitives`, the identical source repo RESEARCH.md already vetted OK for `@radix-ui/react-alert-dialog`; installed `radix-ui` directly (`npm install radix-ui`)
- **Files modified:** `package.json`, `package-lock.json`
- **Commit:** `7db2ec2`

### Auth Gates
None.

## Issues Encountered
None beyond the two auto-fixed shadcn CLI quirks documented above.

## User Setup Required
None - no external service configuration required. The native Save-As dialog (`showSaveFilePicker`) requires no user setup; it is a per-browser feature-detected capability with an automatic fallback.

## Next Phase Readiness
- Phase 2's full load-clean-export loop (select, delete, hide, undo/redo, export with validation) is now complete
- All Phase 2 requirements (CLEAN-01 through CLEAN-04, EXPORT-01, EXPORT-02) are implemented
- Human verification of the interactive UI (dialog appearance, toast rendering, native save dialog behavior across browsers) remains outstanding — see `<human-check>` items in `02-02-PLAN.md`, consistent with Plan 02-01's precedent
- No blockers identified for Phase 3 (MCP Server)

## Self-Check: PASSED

- `src/dxf/entityTagRanges.ts` — FOUND
- `src/dxf/exportDxf.ts` — FOUND
- `src/components/ui/alert-dialog.tsx` — FOUND
- `src/components/ui/sonner.tsx` — FOUND
- `src/dxf/rawTagScan.ts` — FOUND (SEQEND/VERTEX skip guards present in both ENTITIES and BLOCKS sections)
- `src/components/CleanupToolbar.tsx` — FOUND (contains `AlertDialog`, `handleExport`, `isExporting`)
- `src/App.tsx` — FOUND (contains `Toaster`)
- Commit `7db2ec2` — FOUND in `git log --oneline --all`
- `npm run build` — exits 0 (0 TypeScript errors)
- `npm run lint` — exits 0 (0 errors; 6 pre-existing warnings unrelated to this plan)
- All plan-level `<verification>` grep checks re-run and passing
- Standalone round-trip script (boundary scan → filter → validate → reparse) against a hand-built CRLF/POLYLINE fixture: all assertions passed

---
*Phase: 02-manual-cleanup-export*
*Completed: 2026-08-24*
