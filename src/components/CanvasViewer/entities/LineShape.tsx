import { Line } from 'react-konva';
import type { ILineEntity } from 'dxf-parser';
import type Konva from 'konva';

interface LineShapeProps {
  entity: ILineEntity;
  color: string;
  strokeWidth?: number;
  opacity?: number;
  dash?: number[];
  onMouseEnter?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onMouseLeave?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onClick?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
}

export function LineShape({
  entity,
  color,
  strokeWidth = 1,
  opacity = 1,
  dash,
  onMouseEnter,
  onMouseLeave,
  onClick,
}: LineShapeProps) {
  const points = entity.vertices.flatMap((vertex) => [vertex.x, -vertex.y]);

  return (
    <Line
      points={points}
      stroke={color}
      strokeWidth={strokeWidth}
      strokeScaleEnabled={false}
      hitStrokeWidth={10}
      opacity={opacity}
      dash={dash}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
    />
  );
}
