import { create } from 'zustand';
import { temporal } from 'zundo';
import type { IDxf } from 'dxf-parser';
import type { RawTagScanResult, LayerFlags } from '@/dxf/rawTagScan';
import type {
  WorkerParseRequest,
  WorkerSuccessResponse,
  WorkerErrorResponse,
} from '@/dxf/dxf.worker';

export interface ViewerTransform {
  x: number;
  y: number;
  scale: number;
}

interface DrawingState {
  rawFileText: string | null;
  dxfData: IDxf | null;
  unknownEntityReport: RawTagScanResult | null;
  layerVisibility: Record<string, boolean>;
  layerFlags: Record<string, LayerFlags>;
  isLoading: boolean;
  error: string | null;
  fileName: string | null;
  viewerTransform: ViewerTransform | null;
  // Index into dxfData.entities, not the raw DXF `handle` field -- dxf-parser
  // only sets `entity.handle` when a group-5 code is present in the source
  // file, which is not guaranteed (undefined/duplicate handles would break
  // hover lookups). An array index is always unique and defined.
  hoverEntityIndex: number | null;
  // Structure Browser "zoom to / focus" target set by zoomToEntity -- kept
  // deliberately separate from the cleanup selection below (Phase 2 RESEARCH
  // Open Question 1 / Pattern 1 note): this is "what am I looking at", not
  // "what will Delete/Hide act on". Renamed from the Phase 1 field
  // `selectedEntityIndex` to avoid confusion with the new plural selection.
  focusedEntityIndex: number | null;

  // Cleanup selection/delete/hide state (Phase 2, CLEAN-01..04). All three
  // are Set<number> keyed by the same dxfData.entities array index used
  // throughout this store (Phase 1 convention -- entity.handle is not a safe
  // identity key, see resolveColors.ts / RESEARCH Pattern 1). Tracked by the
  // zundo temporal() middleware below via `partialize`, scoped to exactly
  // these three fields -- Phase 1 view-state fields (layerVisibility,
  // viewerTransform, hoverEntityIndex, focusedEntityIndex, etc.) are
  // deliberately excluded from undo history (CONTEXT.md D-06).
  selectedEntityIndices: Set<number>;
  deletedEntityIndices: Set<number>;
  hiddenEntityIndices: Set<number>;

  loadFile: (file: File) => Promise<void>;
  toggleLayerVisibility: (layerName: string) => void;
  showAllLayers: () => void;
  hideAllLayers: () => void;
  setViewerTransform: (transform: ViewerTransform) => void;
  setHoverEntityIndex: (index: number | null) => void;
  zoomToEntity: (entityIndex: number) => void;

  toggleSelect: (index: number, shiftKey: boolean) => void;
  clearSelection: () => void;
  setSelection: (indices: number[]) => void;
  deleteSelected: () => void;
  hideSelected: () => void;
}

export const useDrawingStore = create<DrawingState>()(
  temporal(
    (set) => ({
      rawFileText: null,
      dxfData: null,
      unknownEntityReport: null,
      layerVisibility: {},
      layerFlags: {},
      isLoading: false,
      error: null,
      fileName: null,
      viewerTransform: null,
      hoverEntityIndex: null,
      focusedEntityIndex: null,
      selectedEntityIndices: new Set(),
      deletedEntityIndices: new Set(),
      hiddenEntityIndices: new Set(),

      loadFile: async (file: File) => {
        set({ isLoading: true, error: null });

        let text: string;
        try {
          text = await file.text();
        } catch {
          set({ isLoading: false, error: "Couldn't read this file. Make sure it's a valid DXF file, then try again." });
          return;
        }

        const worker = new Worker(new URL('../dxf/dxf.worker.ts', import.meta.url), {
          type: 'module',
        });

        worker.onmessage = (event: MessageEvent<WorkerSuccessResponse | WorkerErrorResponse>) => {
          const data = event.data;
          if (data.type === 'success') {
            const layerNames = Object.keys(data.dxfData.tables?.layer?.layers ?? {});
            const layerVisibility: Record<string, boolean> = {};
            for (const name of layerNames) {
              layerVisibility[name] = true;
            }
            set({
              dxfData: data.dxfData,
              rawFileText: data.rawFileText,
              unknownEntityReport: data.unknownReport,
              fileName: data.fileName,
              layerVisibility,
              layerFlags: data.unknownReport.layerFlags,
              isLoading: false,
              error: null,
            });
          } else {
            set({
              isLoading: false,
              error: "Couldn't read this file. Make sure it's a valid DXF file, then try again.",
            });
          }
          worker.terminate();
        };

        worker.onerror = () => {
          set({
            isLoading: false,
            error: "Couldn't read this file. Make sure it's a valid DXF file, then try again.",
          });
          worker.terminate();
        };

        const request: WorkerParseRequest = { type: 'parse', text, fileName: file.name };
        worker.postMessage(request);
      },

      toggleLayerVisibility: (layerName: string) => {
        set((state) => ({
          layerVisibility: {
            ...state.layerVisibility,
            [layerName]: !state.layerVisibility[layerName],
          },
        }));
      },

      showAllLayers: () => {
        set((state) => {
          const layerVisibility: Record<string, boolean> = {};
          for (const name of Object.keys(state.layerVisibility)) {
            layerVisibility[name] = true;
          }
          return { layerVisibility };
        });
      },

      hideAllLayers: () => {
        set((state) => {
          const layerVisibility: Record<string, boolean> = {};
          for (const name of Object.keys(state.layerVisibility)) {
            layerVisibility[name] = false;
          }
          return { layerVisibility };
        });
      },

      setViewerTransform: (transform: ViewerTransform) => {
        set({ viewerTransform: transform });
      },

      setHoverEntityIndex: (index: number | null) => {
        set({ hoverEntityIndex: index });
      },

      zoomToEntity: (entityIndex: number) => {
        set({ focusedEntityIndex: entityIndex });
      },

      toggleSelect: (index: number, shiftKey: boolean) => {
        set((state) => {
          if (shiftKey) {
            const next = new Set(state.selectedEntityIndices);
            if (next.has(index)) {
              next.delete(index);
            } else {
              next.add(index);
            }
            return { selectedEntityIndices: next };
          }

          const isSoleSelected =
            state.selectedEntityIndices.size === 1 && state.selectedEntityIndices.has(index);
          if (isSoleSelected) {
            return { selectedEntityIndices: new Set() };
          }
          return { selectedEntityIndices: new Set([index]) };
        });
      },

      clearSelection: () => {
        set({ selectedEntityIndices: new Set() });
      },

      setSelection: (indices: number[]) => {
        set({ selectedEntityIndices: new Set(indices) });
      },

      deleteSelected: () => {
        set((state) => {
          const nextDeleted = new Set(state.deletedEntityIndices);
          for (const index of state.selectedEntityIndices) nextDeleted.add(index);
          return { deletedEntityIndices: nextDeleted, selectedEntityIndices: new Set() };
        });
      },

      hideSelected: () => {
        set((state) => {
          const nextHidden = new Set(state.hiddenEntityIndices);
          for (const index of state.selectedEntityIndices) nextHidden.add(index);
          return { hiddenEntityIndices: nextHidden, selectedEntityIndices: new Set() };
        });
      },
    }),
    {
      partialize: (state) => ({
        selectedEntityIndices: state.selectedEntityIndices,
        deletedEntityIndices: state.deletedEntityIndices,
        hiddenEntityIndices: state.hiddenEntityIndices,
      }),
      limit: 100,
    },
  ),
);
