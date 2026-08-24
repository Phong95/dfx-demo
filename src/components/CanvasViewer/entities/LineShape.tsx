import { Line } from 'react-konva';
import type { ILineEntity } from 'dxf-parser';

interface LineShapeProps {
  entity: ILineEntity;
  color: string;
}

export function LineShape({ entity, color }: LineShapeProps) {
  const points = entity.vertices.flatMap((vertex) => [vertex.x, -vertex.y]);

  return (
    <Line points={points} stroke={color} strokeWidth={1} hitStrokeWidth={10} />
  );
}
