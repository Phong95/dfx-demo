import { create } from 'zustand';
import type { IDxf } from 'dxf-parser';
import type { RawTagScanResult } from '@/dxf/rawTagScan';
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
  isLoading: boolean;
  error: string | null;
  fileName: string | null;
  viewerTransform: ViewerTransform | null;

  loadFile: (file: File) => Promise<void>;
  toggleLayerVisibility: (layerName: string) => void;
  setViewerTransform: (transform: ViewerTransform) => void;
}

export const useDrawingStore = create<DrawingState>((set) => ({
  rawFileText: null,
  dxfData: null,
  unknownEntityReport: null,
  layerVisibility: {},
  isLoading: false,
  error: null,
  fileName: null,
  viewerTransform: null,

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

  setViewerTransform: (transform: ViewerTransform) => {
    set({ viewerTransform: transform });
  },
}));
