import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Stage as KonvaStage, Layer as KonvaLayer } from 'react-konva';
import type Konva from 'konva';
import type { IEntity } from 'dxf-parser';
import { useDrawingStore } from '@/store/drawingStore';
import { EntityRenderer } from './entities/EntityRenderer';
import { computeBoundsForEntities, computeBoundsForEntity } from '@/dxf/entityBounds';

export interface StageHandle {
  fitToView: () => void;
}

const ACCENT_COLOR = '#3B82F6';

type ColoredEntity = IEntity & { resolvedColor?: string };

export const Stage = forwardRef<StageHandle>(function Stage(_props, ref) {
  const dxfData = useDrawingStore((state) => state.dxfData);
  const layerVisibility = useDrawingStore((state) => state.layerVisibility);
  const setViewerTransform = useDrawingStore((state) => state.setViewerTransform);
  const hoverEntityIndex = useDrawingStore((state) => state.hoverEntityIndex);
  const setHoverEntityIndex = useDrawingStore((state) => state.setHoverEntityIndex);
  const selectedEntityIndex = useDrawingStore((state) => state.selectedEntityIndex);

  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const fitToView = useCallback(() => {
    const stage = stageRef.current;
    if (!stage || !dxfData || size.width === 0 || size.height === 0) return;

    const bbox = computeBoundsForEntities(dxfData.entities);
    if (!bbox) return;

    const contentW = bbox.maxX - bbox.minX || 1;
    const contentH = bbox.maxY - bbox.minY || 1;
    // 0.9 factor = 10% padding around the fitted content.
    const scale = Math.min(size.width / contentW, size.height / contentH) * 0.9;
    const x = size.width / 2 - (bbox.minX + contentW / 2) * scale;
    const y = size.height / 2 - (bbox.minY + contentH / 2) * scale;

    stage.scale({ x: scale, y: scale });
    stage.position({ x, y });
    stage.batchDraw();
    setViewerTransform({ x, y, scale });
  }, [dxfData, size, setViewerTransform]);

  useImperativeHandle(ref, () => ({ fitToView }), [fitToView]);

  // Fit-to-extents on initial load, once the stage has a measured size.
  useEffect(() => {
    if (dxfData && size.width > 0 && size.height > 0) {
      fitToView();
    }
    // Only re-run when a new file loads or the container is first measured --
    // not on every fitToView identity change (it changes with `size` too).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dxfData, size.width > 0 && size.height > 0]);

  // Zoom to and center the selected entity (structure-browser click-to-zoom, VIEW-04).
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !dxfData || selectedEntityIndex === null || size.width === 0 || size.height === 0) return;

    const entity = dxfData.entities[selectedEntityIndex];
    if (!entity) return;

    const bbox = computeBoundsForEntity(entity);
    if (!bbox) return;

    const contentW = bbox.maxX - bbox.minX || 1;
    const contentH = bbox.maxY - bbox.minY || 1;
    // Frame the entity with generous padding; cap zoom so a tiny entity
    // doesn't zoom in absurdly far relative to the current view.
    const rawScale = Math.min(size.width / contentW, size.height / contentH) * 0.5;
    const scale = Number.isFinite(rawScale) && rawScale > 0 ? Math.min(rawScale, stage.scaleX() * 8) : stage.scaleX();
    const x = size.width / 2 - (bbox.minX + contentW / 2) * scale;
    const y = size.height / 2 - (bbox.minY + contentH / 2) * scale;

    stage.scale({ x: scale, y: scale });
    stage.position({ x, y });
    stage.batchDraw();
    setViewerTransform({ x, y, scale });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEntityIndex]);

  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    const direction = e.evt.deltaY > 0 ? 1 : -1;
    const scaleBy = 1.05;
    const newScale = direction > 0 ? oldScale / scaleBy : oldScale * scaleBy;

    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    };

    stage.scale({ x: newScale, y: newScale });
    stage.position(newPos);
    stage.batchDraw();
    setViewerTransform({ ...newPos, scale: newScale });
  };

  const handleDragEnd = () => {
    const stage = stageRef.current;
    if (!stage) return;
    setViewerTransform({ x: stage.x(), y: stage.y(), scale: stage.scaleX() });
  };

  const layerNames = dxfData ? Object.keys(dxfData.tables?.layer?.layers ?? {}) : [];

  // Identify hovered/selected entities by array index, not `entity.handle` --
  // dxf-parser only sets `handle` when the raw DXF has a group-5 code, which
  // is not guaranteed (confirmed absent in this project's own test fixture);
  // an undefined/duplicate handle would break hover matching (Rule 1 fix).
  const hoveredEntity =
    dxfData && hoverEntityIndex !== null ? (dxfData.entities[hoverEntityIndex] ?? null) : null;
  const selectedEntity =
    dxfData && selectedEntityIndex !== null ? (dxfData.entities[selectedEntityIndex] ?? null) : null;

  return (
    <div ref={containerRef} className="h-full w-full">
      {size.width > 0 && size.height > 0 && (
        <KonvaStage
          ref={stageRef}
          width={size.width}
          height={size.height}
          draggable
          onWheel={handleWheel}
          onDragEnd={handleDragEnd}
        >
          {layerNames.map((layerName) => {
            if (!layerVisibility[layerName]) return null;
            const entities = (dxfData?.entities ?? [])
              .map((entity, index) => ({ entity, index }))
              .filter(({ entity }) => entity.layer === layerName);
            return (
              <KonvaLayer key={layerName}>
                {entities.map(({ entity, index }) => (
                  <EntityRenderer
                    key={index}
                    entity={entity}
                    color={(entity as ColoredEntity).resolvedColor ?? '#FFFFFF'}
                    dxfData={dxfData!}
                    onMouseEnter={() => setHoverEntityIndex(index)}
                    onMouseLeave={() => setHoverEntityIndex(null)}
                  />
                ))}
              </KonvaLayer>
            );
          })}
          {dxfData && (hoveredEntity || selectedEntity) && (
            <KonvaLayer listening={false}>
              {hoveredEntity && (
                <EntityRenderer entity={hoveredEntity} color={ACCENT_COLOR} dxfData={dxfData} strokeWidth={2} />
              )}
              {selectedEntity && selectedEntity !== hoveredEntity && (
                <EntityRenderer entity={selectedEntity} color={ACCENT_COLOR} dxfData={dxfData} strokeWidth={2} />
              )}
            </KonvaLayer>
          )}
        </KonvaStage>
      )}
    </div>
  );
});
