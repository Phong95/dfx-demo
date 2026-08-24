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
import type { IEntity, ILineEntity } from 'dxf-parser';
import { useDrawingStore } from '@/store/drawingStore';
import { LineShape } from './entities/LineShape';

export interface StageHandle {
  fitToView: () => void;
}

interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

type ColoredEntity = IEntity & { resolvedColor?: string };

// Compute a bounding box in canvas space (Y already flipped: DXF Y-up -> canvas Y-down)
// from every LINE entity's vertices. Deliberately does not trust $EXTMIN/$EXTMAX header
// vars, which are often stale/unset in real-world DXF files (RESEARCH Pattern 5).
function computeBoundingBox(entities: IEntity[]): BoundingBox | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let found = false;

  for (const entity of entities) {
    if (entity.type !== 'LINE') continue;
    const line = entity as ILineEntity;
    for (const vertex of line.vertices) {
      const x = vertex.x;
      const y = -vertex.y;
      found = true;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  return found ? { minX, minY, maxX, maxY } : null;
}

export const Stage = forwardRef<StageHandle>(function Stage(_props, ref) {
  const dxfData = useDrawingStore((state) => state.dxfData);
  const layerVisibility = useDrawingStore((state) => state.layerVisibility);
  const setViewerTransform = useDrawingStore((state) => state.setViewerTransform);

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

    const bbox = computeBoundingBox(dxfData.entities);
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
            const entities = (dxfData?.entities ?? []).filter(
              (entity): entity is ILineEntity =>
                entity.layer === layerName && entity.type === 'LINE',
            );
            return (
              <KonvaLayer key={layerName}>
                {entities.map((entity, idx) => (
                  <LineShape
                    key={idx}
                    entity={entity}
                    color={(entity as ColoredEntity).resolvedColor ?? '#FFFFFF'}
                  />
                ))}
              </KonvaLayer>
            );
          })}
        </KonvaStage>
      )}
    </div>
  );
});
