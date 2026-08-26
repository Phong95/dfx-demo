import { memo } from 'react';
import type {
  IEntity,
  IDxf,
  ILineEntity,
  IArcEntity,
  ICircleEntity,
  ILwpolylineEntity,
  ITextEntity,
  IMtextEntity,
  IInsertEntity,
  IDimensionEntity,
  ISplineEntity,
} from 'dxf-parser';
import type Konva from 'konva';
import { LineShape } from './LineShape';
import { ArcShape } from './ArcShape';
import { CircleShape } from './CircleShape';
import { LwpolylineShape } from './LwpolylineShape';
import { TextShape } from './TextShape';
import { MtextShape } from './MtextShape';
import { InsertShape } from './InsertShape';
import { DimensionShape } from './DimensionShape';
import { SplineShape } from './SplineShape';

export interface EntityRendererProps {
  entity: IEntity;
  color: string;
  dxfData: IDxf;
  strokeWidth?: number;
  onMouseEnter?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onMouseLeave?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onClick?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  opacity?: number;
  dash?: number[];
  depth?: number;
}

/**
 * Type dispatcher: switches on entity.type and renders the matching shape
 * component. Unrecognized types render nothing (they are surfaced separately
 * via the unknown-entity warning banner / Unknown structure-browser section,
 * PARSE-03 -- this dispatcher is not the source of truth for that reporting).
 *
 * `onClick`/`opacity`/`dash` follow the same optional prop-drilling pattern
 * established by `onMouseEnter`/`onMouseLeave` in Phase 1 (Phase 2 CLEAN-01,
 * CLEAN-03: click-to-select and hidden-entity dimming).
 */
export const EntityRenderer = memo(function EntityRenderer({
  entity,
  color,
  dxfData,
  strokeWidth,
  onMouseEnter,
  onMouseLeave,
  onClick,
  opacity = 1,
  dash,
  depth = 0,
}: EntityRendererProps) {
  switch (entity.type) {
    case 'LINE':
      return (
        <LineShape
          entity={entity as ILineEntity}
          color={color}
          strokeWidth={strokeWidth}
          opacity={opacity}
          dash={dash}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          onClick={onClick}
        />
      );
    case 'ARC':
      return (
        <ArcShape
          entity={entity as IArcEntity}
          color={color}
          strokeWidth={strokeWidth}
          opacity={opacity}
          dash={dash}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          onClick={onClick}
        />
      );
    case 'CIRCLE':
      return (
        <CircleShape
          entity={entity as ICircleEntity}
          color={color}
          strokeWidth={strokeWidth}
          opacity={opacity}
          dash={dash}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          onClick={onClick}
        />
      );
    case 'LWPOLYLINE':
      return (
        <LwpolylineShape
          entity={entity as ILwpolylineEntity}
          color={color}
          strokeWidth={strokeWidth}
          opacity={opacity}
          dash={dash}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          onClick={onClick}
        />
      );
    case 'TEXT':
      return (
        <TextShape
          entity={entity as ITextEntity}
          color={color}
          opacity={opacity}
          dash={dash}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          onClick={onClick}
        />
      );
    case 'MTEXT':
      return (
        <MtextShape
          entity={entity as IMtextEntity}
          color={color}
          opacity={opacity}
          dash={dash}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          onClick={onClick}
        />
      );
    case 'INSERT':
      return (
        <InsertShape
          entity={entity as IInsertEntity}
          dxfData={dxfData}
          opacity={opacity}
          dash={dash}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          onClick={onClick}
          depth={depth}
        />
      );
    case 'DIMENSION':
      return (
        <DimensionShape
          entity={entity as IDimensionEntity}
          dxfData={dxfData}
          opacity={opacity}
          dash={dash}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          onClick={onClick}
          depth={depth}
        />
      );
    case 'SPLINE':
      return (
        <SplineShape
          entity={entity as ISplineEntity}
          color={color}
          strokeWidth={strokeWidth}
          opacity={opacity}
          dash={dash}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          onClick={onClick}
        />
      );
    default:
      return null;
  }
});
