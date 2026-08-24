import { Circle } from 'react-konva';
import type { ICircleEntity } from 'dxf-parser';
import type Konva from 'konva';

interface CircleShapeProps {
  entity: ICircleEntity;
  color: string;
  strokeWidth?: number;
  onMouseEnter?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onMouseLeave?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
}

export function CircleShape({ entity, color, strokeWidth = 1, onMouseEnter, onMouseLeave }: CircleShapeProps) {
  if (!entity.center || typeof entity.radius !== 'number') return null;

  return (
    <Circle
      x={entity.center.x}
      y={-entity.center.y}
      radius={entity.radius}
      stroke={color}
      strokeWidth={strokeWidth}
      hitStrokeWidth={10}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    />
  );
}
