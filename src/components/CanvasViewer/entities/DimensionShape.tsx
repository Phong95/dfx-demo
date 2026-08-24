import { Group } from 'react-konva';
import type { IDimensionEntity, IDxf, IEntity } from 'dxf-parser';
import type Konva from 'konva';
import { EntityRenderer } from './EntityRenderer';

interface DimensionShapeProps {
  entity: IDimensionEntity;
  dxfData: IDxf;
  onMouseEnter?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onMouseLeave?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  depth?: number;
}

type ColoredEntity = IEntity & { resolvedColor?: string };

// DIMENSION.block names an anonymous block ("*D1", "*D2", ...) containing the
// actual dimension line/arrowhead/text graphics -- the entity's own point
// fields (anchorPoint, linearOrAngularPoint1/2, etc.) are placement/definition
// data, not drawable geometry (RESEARCH Pattern 3, Pitfall #3). Dimension
// blocks are already authored in model-space coordinates, so no additional
// transform is applied here.
export function DimensionShape({ entity, dxfData, onMouseEnter, onMouseLeave, depth = 0 }: DimensionShapeProps) {
  const block = dxfData.blocks?.[entity.block];
  if (!block?.entities) return null;

  return (
    <Group>
      {block.entities.map((blockEntity, idx) => (
        <EntityRenderer
          key={idx}
          entity={blockEntity}
          color={(blockEntity as ColoredEntity).resolvedColor ?? '#FFFFFF'}
          dxfData={dxfData}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          depth={depth + 1}
        />
      ))}
    </Group>
  );
}
