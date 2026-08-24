import { Group } from 'react-konva';
import type { IInsertEntity, IDxf, IEntity } from 'dxf-parser';
import type Konva from 'konva';
import { EntityRenderer } from './EntityRenderer';

interface InsertShapeProps {
  entity: IInsertEntity;
  dxfData: IDxf;
  opacity?: number;
  dash?: number[];
  onMouseEnter?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onMouseLeave?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onClick?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  depth?: number;
}

type ColoredEntity = IEntity & { resolvedColor?: string };

// Recursion guard: a circular or deeply-nested chain of block references
// (INSERT pointing to a block that itself contains an INSERT) must not hang
// the renderer (RESEARCH threat T-01-04, Denial of Service).
const MAX_DEPTH = 5;

// Neither IDimensionEntity nor IInsertEntity carries ready-made drawable
// geometry -- INSERT.name is a name into dxf.blocks; the actual graphic lives
// in that block's entities array, rendered with position/rotation/scale
// applied (RESEARCH Pattern 3).
//
// `opacity`/`dash`/`onClick` are forwarded down into each recursive
// EntityRenderer call rather than applied to the wrapping Group -- Group has
// no `dash` concept, and this keeps a single click/select/dim policy applied
// consistently per rendered sub-shape (matches the existing per-child `color`
// forwarding pattern below).
export function InsertShape({
  entity,
  dxfData,
  opacity = 1,
  dash,
  onMouseEnter,
  onMouseLeave,
  onClick,
  depth = 0,
}: InsertShapeProps) {
  if (depth >= MAX_DEPTH) return null;
  if (!entity.position) return null;

  const block = dxfData.blocks?.[entity.name];
  if (!block?.entities) return null;

  return (
    <Group
      x={entity.position.x}
      y={-entity.position.y}
      rotation={-(entity.rotation ?? 0)}
      scaleX={entity.xScale || 1}
      scaleY={entity.yScale || 1}
    >
      {block.entities.map((blockEntity, idx) => (
        <EntityRenderer
          key={idx}
          entity={blockEntity}
          color={(blockEntity as ColoredEntity).resolvedColor ?? '#FFFFFF'}
          dxfData={dxfData}
          opacity={opacity}
          dash={dash}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          onClick={onClick}
          depth={depth + 1}
        />
      ))}
    </Group>
  );
}
