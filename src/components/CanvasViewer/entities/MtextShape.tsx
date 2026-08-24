import { Text } from 'react-konva';
import type { IMtextEntity } from 'dxf-parser';
import type Konva from 'konva';
import { stripMTextFormatting } from '@/dxf/stripMTextFormatting';

interface MtextShapeProps {
  entity: IMtextEntity;
  color: string;
  onMouseEnter?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onMouseLeave?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
}

// attachmentPoint: 1=top-left 2=top-center 3=top-right
//                  4=mid-left 5=mid-center 6=mid-right
//                  7=bot-left 8=bot-center 9=bot-right
function alignFromAttachmentPoint(attachmentPoint: number | undefined): 'left' | 'center' | 'right' {
  if (!attachmentPoint) return 'left';
  const column = ((attachmentPoint - 1) % 3) + 1;
  if (column === 2) return 'center';
  if (column === 3) return 'right';
  return 'left';
}

function verticalAlignFromAttachmentPoint(attachmentPoint: number | undefined): 'top' | 'middle' | 'bottom' {
  if (!attachmentPoint) return 'top';
  if (attachmentPoint <= 3) return 'top';
  if (attachmentPoint <= 6) return 'middle';
  return 'bottom';
}

export function MtextShape({ entity, color, onMouseEnter, onMouseLeave }: MtextShapeProps) {
  if (!entity.position) return null;

  const text = stripMTextFormatting(entity.text ?? '');

  return (
    <Text
      x={entity.position.x}
      y={-entity.position.y}
      text={text}
      fontSize={entity.height || 1}
      width={entity.width || undefined}
      fill={color}
      rotation={-(entity.rotation ?? 0)}
      align={alignFromAttachmentPoint(entity.attachmentPoint)}
      verticalAlign={verticalAlignFromAttachmentPoint(entity.attachmentPoint)}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    />
  );
}
