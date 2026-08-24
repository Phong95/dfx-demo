import { Text } from 'react-konva';
import type { ITextEntity } from 'dxf-parser';
import type Konva from 'konva';

interface TextShapeProps {
  entity: ITextEntity;
  color: string;
  opacity?: number;
  dash?: number[];
  onMouseEnter?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onMouseLeave?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onClick?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
}

// Note: entities in this codebase negate each coordinate individually (DXF
// Y-up -> canvas Y-down) rather than applying a global -1 Y scale on a parent
// Layer/Stage. Under that convention, glyphs must NOT be mirrored (no scaleY
// on the Text node itself) -- per-point negation already preserves the visual
// layout correctly; an additional -1 scale on the node would flip the glyphs
// upside down. Rotation, however, does need to be negated: DXF measures
// rotation counter-clockwise in Y-up space, which maps to a clockwise rotation
// in canvas's Y-down space (Konva's positive-rotation-is-clockwise convention).
//
// `dash` has no visual effect on unstroked text (Text has no default stroke)
// but is still accepted/forwarded for prop-shape consistency with the other
// shape components (EntityRenderer's uniform dispatch contract).
export function TextShape({ entity, color, opacity = 1, dash, onMouseEnter, onMouseLeave, onClick }: TextShapeProps) {
  if (!entity.startPoint) return null;

  return (
    <Text
      x={entity.startPoint.x}
      y={-entity.startPoint.y}
      text={entity.text ?? ''}
      fontSize={entity.textHeight || 1}
      fill={color}
      rotation={-(entity.rotation ?? 0)}
      opacity={opacity}
      dash={dash}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
    />
  );
}
