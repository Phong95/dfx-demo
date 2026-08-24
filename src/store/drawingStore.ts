import { create } from 'zustand';
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
  selectedEntityIndex: number | null;

  loadFile: (file: File) => Promise<void>;
  toggleLayerVisibility: (layerName: string) => void;
  showAllLayers: () => void;
  hideAllLayers: () => void;
  setViewerTransform: (transform: ViewerTransform) => void;
  setHoverEntityIndex: (index: number | null) => void;
  zoomToEntity: (entityIndex: number) => void;
}

export const useDrawingStore = create<DrawingState>((set) => ({
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
  selectedEntityIndex: null,

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
    set({ selectedEntityIndex: entityIndex });
  },
}));
