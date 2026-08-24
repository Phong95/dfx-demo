import { Line } from 'react-konva';
import type { ILwpolylineEntity } from 'dxf-parser';
import type Konva from 'konva';
import { bulgeToArcPoints } from '@/dxf/bulgeToArc';

interface LwpolylineShapeProps {
  entity: ILwpolylineEntity;
  color: string;
  strokeWidth?: number;
  onMouseEnter?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onMouseLeave?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
}

export function LwpolylineShape({
  entity,
  color,
  strokeWidth = 1,
  onMouseEnter,
  onMouseLeave,
}: LwpolylineShapeProps) {
  const vertices = entity.vertices;
  if (!vertices || vertices.length === 0) return null;

  const points: number[] = [vertices[0].x, -vertices[0].y];

  // A closed LWPOLYLINE (entity.shape) also has a curved/straight segment
  // wrapping from the last vertex back to the first.
  const segmentCount = entity.shape ? vertices.length : vertices.length - 1;
  for (let i = 0; i < segmentCount; i++) {
    const current = vertices[i];
    const next = vertices[(i + 1) % vertices.length];
    const bulge = current.bulge ?? 0;
    if (bulge === 0) {
      points.push(next.x, -next.y);
    } else {
      const arcPoints = bulgeToArcPoints(
        { x: current.x, y: current.y },
        { x: next.x, y: next.y },
        bulge,
      );
      // arcPoints[0] === current, already pushed -- skip it to avoid a duplicate point.
      for (let j = 1; j < arcPoints.length; j++) {
        points.push(arcPoints[j].x, -arcPoints[j].y);
      }
    }
  }

  return (
    <Line
      points={points}
      closed={entity.shape}
      stroke={color}
      strokeWidth={strokeWidth}
      hitStrokeWidth={10}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    />
  );
}
