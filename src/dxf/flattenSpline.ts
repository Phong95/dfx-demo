import type { ISplineEntity } from 'dxf-parser';

/**
 * SPLINE control/fit points -> renderable polyline points (RESEARCH Pitfall #4,
 * Assumption A3). dxf-parser exposes raw NURBS definition data with no curve
 * evaluator; at the project's stated mid-fidelity bar, this approximates the
 * curve as a polyline through `fitPoints` when present (usually a smoother,
 * denser approximation), falling back to `controlPoints` when only those exist.
 */
export function flattenSpline(entity: ISplineEntity): { x: number; y: number }[] {
  if (entity.fitPoints && entity.fitPoints.length > 0) {
    return entity.fitPoints.map((p) => ({ x: p.x, y: p.y }));
  }
  return (entity.controlPoints ?? []).map((p) => ({ x: p.x, y: p.y }));
}
