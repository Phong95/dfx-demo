import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { DxfViewer } from 'dxf-viewer';
import * as THREE from 'three';
import { useDrawingStore } from '@/store/drawingStore';

const DARK_BG = 0x111113;
const LIGHT_BG = 0xf5f5f5;

function isDarkMode(): boolean {
  const cl = document.documentElement.classList;
  if (cl.contains('dark')) return true;
  if (cl.contains('light')) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export interface DxfViewerCanvasHandle {
  fitToView: () => void;
}

export const DxfViewerCanvas = forwardRef<DxfViewerCanvasHandle>(
  function DxfViewerCanvas(_props, ref) {
    const rawFileText = useDrawingStore((s) => s.rawFileText);
    const layerVisibility = useDrawingStore((s) => s.layerVisibility);
    const setViewerTransform = useDrawingStore((s) => s.setViewerTransform);

    const containerRef = useRef<HTMLDivElement>(null);
    const viewerRef = useRef<DxfViewer | null>(null);

    useImperativeHandle(ref, () => ({
      fitToView: () => {
        const viewer = viewerRef.current;
        if (!viewer) return;
        const bounds = viewer.GetBounds();
        if (bounds) {
          viewer.FitView(bounds.minX, bounds.maxX, bounds.minY, bounds.maxY, 0.1);
        }
      },
    }));

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;

      const dark = isDarkMode();
      const viewer = new DxfViewer(el, {
        autoResize: true,
        clearColor: new THREE.Color(dark ? DARK_BG : LIGHT_BG),
        clearAlpha: 1,
        antialias: true,
        colorCorrection: true,
        blackWhiteInversion: dark,
        pointSize: 2,
        sceneOptions: {
          wireframeMesh: true,
        },
      });

      viewerRef.current = viewer;

      viewer.Subscribe('viewChanged', () => {
        const cam = viewer.GetCamera();
        if (cam) {
          setViewerTransform({
            x: cam.position.x,
            y: cam.position.y,
            scale: 2 / (cam.right - cam.left),
          });
        }
      });

      return () => {
        viewerRef.current = null;
        try {
          viewer.Destroy();
        } catch {
          // Viewer may already be partially torn down in strict mode
        }
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Sync background color with theme changes
    useEffect(() => {
      const apply = () => {
        const renderer = viewerRef.current?.GetRenderer();
        if (!renderer) return;
        const dark = isDarkMode();
        renderer.setClearColor(new THREE.Color(dark ? DARK_BG : LIGHT_BG), 1);
        viewerRef.current!.Render();
      };

      const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.attributeName === 'class') {
            apply();
            return;
          }
        }
      });
      observer.observe(document.documentElement, { attributes: true });

      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', apply);

      return () => {
        observer.disconnect();
        mq.removeEventListener('change', apply);
      };
    }, []);

    useEffect(() => {
      const viewer = viewerRef.current;
      if (!viewer || !rawFileText) return;

      const url = URL.createObjectURL(
        new Blob([rawFileText], { type: 'text/plain' }),
      );
      let cancelled = false;

      viewer.Clear();
      viewer
        .Load({ url })
        .then(() => {
          URL.revokeObjectURL(url);
          if (cancelled) return;
          const { layerVisibility: vis } = useDrawingStore.getState();
          const layers = viewer.GetLayers();
          for (const layer of layers) {
            if (vis[layer.name] === false) {
              viewer.ShowLayer(layer.name, false);
            }
          }
        })
        .catch(() => {
          URL.revokeObjectURL(url);
        });

      return () => {
        cancelled = true;
        URL.revokeObjectURL(url);
      };
    }, [rawFileText]);

    useEffect(() => {
      const viewer = viewerRef.current;
      if (!viewer) return;
      for (const [name, visible] of Object.entries(layerVisibility)) {
        viewer.ShowLayer(name, visible);
      }
    }, [layerVisibility]);

    return <div ref={containerRef} className="h-full w-full" />;
  },
);
