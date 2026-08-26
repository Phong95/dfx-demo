import type { IEntity, ILineEntity, IArcEntity, ICircleEntity, ITextEntity, IMtextEntity } from 'dxf-parser';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Info } from 'lucide-react';
import { useDrawingStore } from '@/store/drawingStore';

type ColoredEntity = IEntity & { resolvedColor?: string };

function getKeyGeometryFields(entity: IEntity): Array<[label: string, value: string]> {
  switch (entity.type) {
    case 'LINE': {
      const [a, b] = (entity as ILineEntity).vertices ?? [];
      return [
        ['Start', a ? `${a.x.toFixed(2)}, ${a.y.toFixed(2)}` : '—'],
        ['End', b ? `${b.x.toFixed(2)}, ${b.y.toFixed(2)}` : '—'],
      ];
    }
    case 'CIRCLE':
    case 'ARC': {
      const e = entity as ICircleEntity | IArcEntity;
      return [
        ['Center', e.center ? `${e.center.x.toFixed(2)}, ${e.center.y.toFixed(2)}` : '—'],
        ['Radius', typeof e.radius === 'number' ? String(e.radius) : '—'],
      ];
    }
    case 'TEXT':
    case 'MTEXT': {
      const text = (entity as ITextEntity | IMtextEntity).text;
      return [['Text', text ?? '—']];
    }
    default:
      return [];
  }
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <span className="shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="min-w-0 max-w-[65%] overflow-hidden text-ellipsis whitespace-nowrap text-right text-xs font-medium">
            {value}
          </span>
        </TooltipTrigger>
        <TooltipContent>{value}</TooltipContent>
      </Tooltip>
    </div>
  );
}

export function PropertiesPanel() {
  const selectedEntityIndices = useDrawingStore((state) => state.selectedEntityIndices);
  const dxfData = useDrawingStore((state) => state.dxfData);

  const count = selectedEntityIndices.size;

  return (
    <div className="flex h-full flex-col overflow-hidden px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <Info className="size-3.5" />
        Properties
      </div>

      {count === 0 && (
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Click an entity in the drawing, or box-select multiple, to see details here.
        </p>
      )}

      {count === 1 &&
        dxfData &&
        (() => {
          const index = [...selectedEntityIndices][0];
          const entity = dxfData.entities[index] as ColoredEntity | undefined;
          if (!entity) return null;
          const color = entity.resolvedColor ?? '#FFFFFF';
          const geometryFields = getKeyGeometryFields(entity);
          return (
            <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
              <FieldRow label="Type" value={entity.type} />
              <FieldRow label="Layer" value={entity.layer} />
              <div className="flex items-center justify-between gap-2 py-1.5">
                <span className="shrink-0 text-[11px] text-muted-foreground">Color</span>
                <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: color }}
                    aria-hidden="true"
                  />
                  {color}
                </span>
              </div>
              {geometryFields.map(([label, value]) => (
                <FieldRow key={label} label={label} value={value} />
              ))}
            </div>
          );
        })()}

      {count >= 2 &&
        dxfData &&
        (() => {
          const typeCounts = new Map<string, number>();
          for (const index of selectedEntityIndices) {
            const entity = dxfData.entities[index];
            if (!entity) continue;
            typeCounts.set(entity.type, (typeCounts.get(entity.type) ?? 0) + 1);
          }
          const breakdown = [...typeCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([type, n]) => `${n} ${type}`)
            .join(' · ');
          return (
            <div className="mt-3">
              <p className="text-sm font-semibold">{count} entities selected</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{breakdown}</p>
            </div>
          );
        })()}
    </div>
  );
}
