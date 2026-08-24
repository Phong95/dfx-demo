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
// Hidden entities render dimmed + dashed but stay visible/included in export
// (CONTEXT.md D-08: hiding is a view state, not a data mutation).
const HIDDEN_OPACITY = 0.2;
const HIDDEN_DASH = [6, 4];

type ColoredEntity = IEntity & { resolvedColor?: string };

export const Stage = forwardRef<StageHandle>(function Stage(_props, ref) {
  const dxfData = useDrawingStore((state) => state.dxfData);
  const layerVisibility = useDrawingStore((state) => state.layerVisibility);
  const setViewerTransform = useDrawingStore((state) => state.setViewerTransform);
  const hoverEntityIndex = useDrawingStore((state) => state.hoverEntityIndex);
  const setHoverEntityIndex = useDrawingStore((state) => state.setHoverEntityIndex);
  const focusedEntityIndex = useDrawingStore((state) => state.focusedEntityIndex);
  const selectedEntityIndices = useDrawingStore((state) => state.selectedEntityIndices);
  const deletedEntityIndices = useDrawingStore((state) => state.deletedEntityIndices);
  const hiddenEntityIndices = useDrawingStore((state) => state.hiddenEntityIndices);
  const toggleSelect = useDrawingStore((state) => state.toggleSelect);
  const clearSelection = useDrawingStore((state) => state.clearSelection);

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

  // Zoom to and center the focused entity (structure-browser click-to-zoom, VIEW-04).
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !dxfData || focusedEntityIndex === null || size.width === 0 || size.height === 0) return;

    const entity = dxfData.entities[focusedEntityIndex];
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
  }, [focusedEntityIndex]);

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

  const handleStageClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    // Background click (not a shape) deselects (CONTEXT.md D-01).
    if (e.target === e.target.getStage()) {
      clearSelection();
    }
  };

  const layerNames = dxfData ? Object.keys(dxfData.tables?.layer?.layers ?? {}) : [];

  // Identify hovered/focused entities by array index, not `entity.handle` --
  // dxf-parser only sets `handle` when the raw DXF has a group-5 code, which
  // is not guaranteed (confirmed absent in this project's own test fixture);
  // an undefined/duplicate handle would break hover matching (Rule 1 fix).
  const hoveredEntity =
    dxfData && hoverEntityIndex !== null ? (dxfData.entities[hoverEntityIndex] ?? null) : null;
  const focusedEntity =
    dxfData && focusedEntityIndex !== null ? (dxfData.entities[focusedEntityIndex] ?? null) : null;

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
          onClick={handleStageClick}
        >
          {layerNames.map((layerName) => {
            if (!layerVisibility[layerName]) return null;
            const entities = (dxfData?.entities ?? [])
              .map((entity, index) => ({ entity, index }))
              .filter(({ entity }) => entity.layer === layerName);
            return (
              <KonvaLayer key={layerName}>
                {entities.map(({ entity, index }) => {
                  // Deleted entities render nothing at all (CONTEXT.md D-05).
                  if (deletedEntityIndices.has(index)) return null;
                  const isHidden = hiddenEntityIndices.has(index);
                  return (
                    <EntityRenderer
                      key={index}
                      entity={entity}
                      color={(entity as ColoredEntity).resolvedColor ?? '#FFFFFF'}
                      dxfData={dxfData!}
                      opacity={isHidden ? HIDDEN_OPACITY : 1}
                      dash={isHidden ? HIDDEN_DASH : undefined}
                      onMouseEnter={() => setHoverEntityIndex(index)}
                      onMouseLeave={() => setHoverEntityIndex(null)}
                      onClick={(e) => toggleSelect(index, e.evt.shiftKey)}
                    />
                  );
                })}
              </KonvaLayer>
            );
          })}
          {dxfData && (hoveredEntity || focusedEntity || selectedEntityIndices.size > 0) && (
            <KonvaLayer listening={false}>
              {hoveredEntity && (
                <EntityRenderer entity={hoveredEntity} color={ACCENT_COLOR} dxfData={dxfData} strokeWidth={2} />
              )}
              {focusedEntity && focusedEntity !== hoveredEntity && (
                <EntityRenderer entity={focusedEntity} color={ACCENT_COLOR} dxfData={dxfData} strokeWidth={2} />
              )}
              {[...selectedEntityIndices].map((index) => {
                const entity = dxfData.entities[index];
                if (!entity) return null;
                return (
                  <EntityRenderer
                    key={`selected-${index}`}
                    entity={entity}
                    color={ACCENT_COLOR}
                    dxfData={dxfData}
                    strokeWidth={2}
                  />
                );
              })}
            </KonvaLayer>
          )}
        </KonvaStage>
      )}
    </div>
  );
});
