import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Stage as KonvaStage, Layer as KonvaLayer, Rect } from 'react-konva';
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
// Minimum screen-space drag distance (px) to treat a mouse-down/up pair on
// the background as a box-select drag rather than a click-to-deselect
// (RESEARCH Pattern 3 / Common Pitfall 5).
const DRAG_THRESHOLD_PX = 3;

type ColoredEntity = IEntity & { resolvedColor?: string };

interface ScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

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
  const setSelection = useDrawingStore((state) => state.setSelection);

  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  // Pan (Space+drag) and box-select (plain drag on background) both live as
  // local/ref state -- never in the zustand store (RESEARCH Pitfall 5): the
  // rubber band's live coordinates would otherwise spam the undo history
  // with one entry per mousemove frame. Only the box-select's *final* result
  // is committed via setSelection() on mouseup.
  const spaceHeldRef = useRef(false);
  const panStateRef = useRef<{
    startPointerX: number;
    startPointerY: number;
    startStageX: number;
    startStageY: number;
  } | null>(null);
  const rubberStartRef = useRef<{ x: number; y: number } | null>(null);
  const [rubberRect, setRubberRect] = useState<ScreenRect | null>(null);

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

  // Space-held tracking for the pan-mode migration (RESEARCH: panning moves
  // from native stage dragging to Space+left-drag, freeing plain left-drag
  // for box-select). Ignore repeats from OS key-repeat and guard against
  // stealing Space from text inputs elsewhere in the app.
  useEffect(() => {
    function isTypingTarget(target: EventTarget | null): boolean {
      const el = target as HTMLElement | null;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.code !== 'Space' || isTypingTarget(e.target)) return;
      spaceHeldRef.current = true;
      e.preventDefault(); // prevent page-scroll from breaking the pan gesture
    }
    function handleKeyUp(e: KeyboardEvent) {
      if (e.code !== 'Space') return;
      spaceHeldRef.current = false;
    }
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
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

  // Pan (Space+drag) and box-select share the same mousedown/mousemove/mouseup
  // trio on the Stage itself -- the KonvaStage `draggable` prop is removed so
  // plain left-drag on empty canvas is free for the rubber band instead
  // (RESEARCH Pattern 3, Common Pitfall 3: the official Konva rubber-band
  // recipe's `haveIntersection` would select too much, so this project uses
  // full-containment bbox checks against computeBoundsForEntity() instead).
  const handleStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = stageRef.current;
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    if (spaceHeldRef.current) {
      panStateRef.current = {
        startPointerX: pointer.x,
        startPointerY: pointer.y,
        startStageX: stage.x(),
        startStageY: stage.y(),
      };
      return;
    }

    // Only start a rubber band from the background -- a mousedown that lands
    // on a shape is left alone so Konva's own click detection on that shape
    // keeps working for click/shift-click select (unchanged from Task 1).
    if (e.target !== stage) return;

    rubberStartRef.current = { x: pointer.x, y: pointer.y };
    setRubberRect({ x: pointer.x, y: pointer.y, width: 0, height: 0 });
  };

  const handleStageMouseMove = () => {
    const stage = stageRef.current;
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    if (panStateRef.current) {
      const pan = panStateRef.current;
      const dx = pointer.x - pan.startPointerX;
      const dy = pointer.y - pan.startPointerY;
      stage.position({ x: pan.startStageX + dx, y: pan.startStageY + dy });
      stage.batchDraw();
      return;
    }

    if (rubberStartRef.current) {
      const start = rubberStartRef.current;
      setRubberRect({
        x: Math.min(start.x, pointer.x),
        y: Math.min(start.y, pointer.y),
        width: Math.abs(pointer.x - start.x),
        height: Math.abs(pointer.y - start.y),
      });
    }
  };

  const handleStageMouseUp = () => {
    const stage = stageRef.current;
    if (!stage) return;

    if (panStateRef.current) {
      setViewerTransform({ x: stage.x(), y: stage.y(), scale: stage.scaleX() });
      panStateRef.current = null;
      return;
    }

    if (rubberStartRef.current) {
      rubberStartRef.current = null;
      const rect = rubberRect;
      setRubberRect(null);

      // Below the drag threshold -- treat as a plain click on empty canvas
      // (deselect), not a box-select (CONTEXT.md D-01).
      if (!rect || (rect.width <= DRAG_THRESHOLD_PX && rect.height <= DRAG_THRESHOLD_PX)) {
        clearSelection();
        return;
      }

      // Screen-space rectangle -> world (canvas) space, using the same
      // inverse-transform math as handleWheel (RESEARCH Pattern 3).
      const scale = stage.scaleX();
      const worldMinX = (rect.x - stage.x()) / scale;
      const worldMinY = (rect.y - stage.y()) / scale;
      const worldMaxX = (rect.x + rect.width - stage.x()) / scale;
      const worldMaxY = (rect.y + rect.height - stage.y()) / scale;

      const matches: number[] = [];
      (dxfData?.entities ?? []).forEach((entity, index) => {
        if (deletedEntityIndices.has(index)) return;
        if (!layerVisibility[entity.layer]) return;
        const box = computeBoundsForEntity(entity);
        if (!box) return; // unrendered types (no bbox) can never be box-selected
        const fullyContained =
          box.minX >= worldMinX && box.maxX <= worldMaxX && box.minY >= worldMinY && box.maxY <= worldMaxY;
        if (fullyContained) matches.push(index);
      });
      setSelection(matches);
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
          onWheel={handleWheel}
          onMouseDown={handleStageMouseDown}
          onMouseMove={handleStageMouseMove}
          onMouseUp={handleStageMouseUp}
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
          {rubberRect && (
            <KonvaLayer listening={false}>
              <Rect
                x={rubberRect.x}
                y={rubberRect.y}
                width={rubberRect.width}
                height={rubberRect.height}
                stroke={ACCENT_COLOR}
                strokeWidth={1}
                fill={ACCENT_COLOR}
                opacity={0.1}
              />
            </KonvaLayer>
          )}
        </KonvaStage>
      )}
    </div>
  );
});
