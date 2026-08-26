import { Shape } from 'react-konva';
import type { IArcEntity } from 'dxf-parser';
import type Konva from 'konva';

interface ArcShapeProps {
  entity: IArcEntity;
  color: string;
  strokeWidth?: number;
  opacity?: number;
  dash?: number[];
  onMouseEnter?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onMouseLeave?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onClick?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
}

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

// Konva's built-in Arc component draws a filled wedge/donut, not an open
// stroked arc segment. Use a custom Shape with sceneFunc calling the native
// canvas arc() method instead (RESEARCH Pattern 6).
export function ArcShape({
  entity,
  color,
  strokeWidth = 1,
  opacity = 1,
  dash,
  onMouseEnter,
  onMouseLeave,
  onClick,
}: ArcShapeProps) {
  if (!entity.center || typeof entity.radius !== 'number') return null;

  return (
    <Shape
      sceneFunc={(ctx, shape) => {
        ctx.beginPath();
        ctx.arc(
          entity.center.x,
          -entity.center.y,
          entity.radius,
          -toRadians(entity.startAngle ?? 0),
          -toRadians(entity.endAngle ?? 0),
          true,
        );
        ctx.strokeShape(shape);
      }}
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
