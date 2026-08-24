import { Line } from 'react-konva';
import type { ISplineEntity } from 'dxf-parser';
import type Konva from 'konva';
import { flattenSpline } from '@/dxf/flattenSpline';

interface SplineShapeProps {
  entity: ISplineEntity;
  color: string;
  strokeWidth?: number;
  opacity?: number;
  dash?: number[];
  onMouseEnter?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onMouseLeave?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onClick?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
}

export function SplineShape({
  entity,
  color,
  strokeWidth = 1,
  opacity = 1,
  dash,
  onMouseEnter,
  onMouseLeave,
  onClick,
}: SplineShapeProps) {
  const flatPoints = flattenSpline(entity);
  if (flatPoints.length < 2) return null;

  const points = flatPoints.flatMap((p) => [p.x, -p.y]);

  return (
    <Line
      points={points}
      stroke={color}
      strokeWidth={strokeWidth}
      hitStrokeWidth={10}
      opacity={opacity}
      dash={dash}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
    />
  );
}
