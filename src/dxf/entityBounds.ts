import type {
  IEntity,
  ILineEntity,
  IArcEntity,
  ICircleEntity,
  ILwpolylineEntity,
  ITextEntity,
  IMtextEntity,
  IInsertEntity,
  IDimensionEntity,
  ISplineEntity,
} from 'dxf-parser';
import { flattenSpline } from './flattenSpline';

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function expand(box: BoundingBox, x: number, y: number): void {
  if (x < box.minX) box.minX = x;
  if (x > box.maxX) box.maxX = x;
  if (y < box.minY) box.minY = y;
  if (y > box.maxY) box.maxY = y;
}

/**
 * Expands `box` (in-place) to include the given entity's extent, in canvas
 * space (Y already negated: DXF Y-up -> canvas Y-down). Returns true if the
 * entity contributed any points. Coverage is approximate for curved/complex
 * types (ARC/CIRCLE use center +/- radius rather than the true swept arc;
 * INSERT/DIMENSION use only their anchor point, not the referenced block's
 * own extent) -- acceptable for fit-to-view/zoom-to-entity purposes, which
 * pad the viewport, per RESEARCH Pattern 5.
 */
export function expandBoundsForEntity(entity: IEntity, box: BoundingBox): boolean {
  switch (entity.type) {
    case 'LINE': {
      const line = entity as ILineEntity;
      for (const v of line.vertices ?? []) expand(box, v.x, -v.y);
      return (line.vertices?.length ?? 0) > 0;
    }
    case 'ARC': {
      const arc = entity as IArcEntity;
      if (!arc.center || typeof arc.radius !== 'number') return false;
      expand(box, arc.center.x - arc.radius, -(arc.center.y - arc.radius));
      expand(box, arc.center.x + arc.radius, -(arc.center.y + arc.radius));
      return true;
    }
    case 'CIRCLE': {
      const circle = entity as ICircleEntity;
      if (!circle.center || typeof circle.radius !== 'number') return false;
      expand(box, circle.center.x - circle.radius, -(circle.center.y - circle.radius));
      expand(box, circle.center.x + circle.radius, -(circle.center.y + circle.radius));
      return true;
    }
    case 'LWPOLYLINE': {
      const poly = entity as ILwpolylineEntity;
      for (const v of poly.vertices ?? []) expand(box, v.x, -v.y);
      return (poly.vertices?.length ?? 0) > 0;
    }
    case 'TEXT': {
      const text = entity as ITextEntity;
      if (!text.startPoint) return false;
      expand(box, text.startPoint.x, -text.startPoint.y);
      return true;
    }
    case 'MTEXT': {
      const mtext = entity as IMtextEntity;
      if (!mtext.position) return false;
      expand(box, mtext.position.x, -mtext.position.y);
      return true;
    }
    case 'SPLINE': {
      const spline = entity as ISplineEntity;
      const points = flattenSpline(spline);
      for (const p of points) expand(box, p.x, -p.y);
      return points.length > 0;
    }
    case 'INSERT': {
      const insert = entity as IInsertEntity;
      if (!insert.position) return false;
      expand(box, insert.position.x, -insert.position.y);
      return true;
    }
    case 'DIMENSION': {
      const dim = entity as IDimensionEntity;
      if (!dim.anchorPoint) return false;
      expand(box, dim.anchorPoint.x, -dim.anchorPoint.y);
      return true;
    }
    default:
      return false;
  }
}

export function computeBoundsForEntities(entities: IEntity[]): BoundingBox | null {
  const box: BoundingBox = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  let found = false;
  for (const entity of entities) {
    if (expandBoundsForEntity(entity, box)) found = true;
  }
  return found ? box : null;
}

export function computeBoundsForEntity(entity: IEntity): BoundingBox | null {
  return computeBoundsForEntities([entity]);
}
