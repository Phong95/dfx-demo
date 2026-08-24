import { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronRight, AlertTriangle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDrawingStore } from '@/store/drawingStore';
import { cn } from '@/lib/utils';
import type { IEntity } from 'dxf-parser';

const ROW_HEIGHT = 32;

interface TypeGroup {
  type: string;
  entities: number[]; // indices into dxfData.entities
}

interface LayerGroup {
  name: string;
  types: TypeGroup[];
  entityCount: number;
}

type Row =
  | { id: string; kind: 'layer'; depth: 0; label: string; count: number; expanded: boolean }
  | {
      id: string;
      kind: 'type';
      depth: 1;
      label: string;
      count: number;
      expanded: boolean;
    }
  | { id: string; kind: 'entity'; depth: 2; label: string; entityIndex: number }
  | { id: string; kind: 'unknown-root'; depth: 0; label: string; count: number; expanded: boolean }
  | { id: string; kind: 'unknown-type'; depth: 1; label: string; count: number };

// layers (sorted alphabetically) > entity type groups > individual entities
// (CONTEXT.md Structure Browser Design decision 1).
function buildLayerGroups(entities: IEntity[]): LayerGroup[] {
  const byLayer = new Map<string, Map<string, number[]>>();
  entities.forEach((entity, index) => {
    let typeMap = byLayer.get(entity.layer);
    if (!typeMap) {
      typeMap = new Map();
      byLayer.set(entity.layer, typeMap);
    }
    const list = typeMap.get(entity.type) ?? [];
    list.push(index);
    typeMap.set(entity.type, list);
  });

  const layerNames = [...byLayer.keys()].sort((a, b) => a.localeCompare(b));
  return layerNames.map((name) => {
    const typeMap = byLayer.get(name)!;
    const types = [...typeMap.keys()]
      .sort((a, b) => a.localeCompare(b))
      .map((type) => ({ type, entities: typeMap.get(type)! }));
    const entityCount = types.reduce((sum, t) => sum + t.entities.length, 0);
    return { name, types, entityCount };
  });
}

export function StructureBrowser() {
  const dxfData = useDrawingStore((state) => state.dxfData);
  const unknownEntityReport = useDrawingStore((state) => state.unknownEntityReport);
  const zoomToEntity = useDrawingStore((state) => state.zoomToEntity);
  const selectedEntityIndex = useDrawingStore((state) => state.selectedEntityIndex);

  // Layer nodes start collapsed; clicking expands entity-type children, then
  // individual entities (CONTEXT.md Structure Browser Design decision 2).
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const parentRef = useRef<HTMLDivElement>(null);

  const layerGroups = useMemo(() => (dxfData ? buildLayerGroups(dxfData.entities) : []), [dxfData]);
  const unknownGroups = useMemo(() => unknownEntityReport?.unknown ?? [], [unknownEntityReport]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];

    for (const layer of layerGroups) {
      const layerId = `layer:${layer.name}`;
      const layerExpanded = expanded.has(layerId);
      out.push({
        id: layerId,
        kind: 'layer',
        depth: 0,
        label: layer.name,
        count: layer.entityCount,
        expanded: layerExpanded,
      });
      if (!layerExpanded) continue;

      for (const typeGroup of layer.types) {
        const typeId = `type:${layer.name}:${typeGroup.type}`;
        const typeExpanded = expanded.has(typeId);
        out.push({
          id: typeId,
          kind: 'type',
          depth: 1,
          label: typeGroup.type,
          count: typeGroup.entities.length,
          expanded: typeExpanded,
        });
        if (!typeExpanded) continue;

        for (const entityIndex of typeGroup.entities) {
          const entity = dxfData?.entities[entityIndex];
          out.push({
            id: `entity:${entityIndex}`,
            kind: 'entity',
            depth: 2,
            label: entity?.handle !== undefined ? `#${entity.handle}` : `#${entityIndex}`,
            entityIndex,
          });
        }
      }
    }

    // Unknown/unsupported entities get a dedicated section (PARSE-03, CONTEXT.md decision 4).
    if (unknownGroups.length > 0) {
      const unknownRootId = 'unknown-root';
      const unknownExpanded = expanded.has(unknownRootId);
      const totalUnknown = unknownGroups.reduce((sum, [, count]) => sum + count, 0);
      out.push({
        id: unknownRootId,
        kind: 'unknown-root',
        depth: 0,
        label: 'Unknown',
        count: totalUnknown,
        expanded: unknownExpanded,
      });
      if (unknownExpanded) {
        for (const [type, count] of unknownGroups) {
          out.push({ id: `unknown-type:${type}`, kind: 'unknown-type', depth: 1, label: type, count });
        }
      }
    }

    return out;
  }, [layerGroups, unknownGroups, expanded, dxfData]);

  // Structural drawings can have 10k+ entities -- virtualize from the start
  // (CONTEXT.md Structure Browser Design decision 3, VIEW-04).
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  if (!dxfData) return null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <h2 className="px-4 py-3 text-base font-semibold">Structure</h2>
      <div ref={parentRef} className="flex-1 overflow-y-auto">
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index];
            const indent = row.depth * 8;
            const isSelected = row.kind === 'entity' && row.entityIndex === selectedEntityIndex;

            return (
              <div
                key={row.id}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: ROW_HEIGHT,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className={cn(
                  'flex items-center gap-1 px-4 text-sm hover:bg-surface',
                  isSelected && 'bg-surface font-semibold text-accent',
                )}
              >
                <div style={{ paddingLeft: indent }} className="flex min-w-0 flex-1 items-center gap-1">
                  {row.kind === 'layer' || row.kind === 'type' || row.kind === 'unknown-root' ? (
                    <button
                      type="button"
                      onClick={() => toggle(row.id)}
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                      aria-label={row.expanded ? `Collapse ${row.label}` : `Expand ${row.label}`}
                    >
                      <ChevronRight className={cn('size-4 transition-transform', row.expanded && 'rotate-90')} />
                    </button>
                  ) : (
                    <span className="size-4 shrink-0" />
                  )}

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => {
                          if (row.kind === 'layer' || row.kind === 'type' || row.kind === 'unknown-root') {
                            toggle(row.id);
                          } else if (row.kind === 'entity') {
                            zoomToEntity(row.entityIndex);
                          }
                        }}
                        className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left"
                      >
                        {row.kind === 'type' || row.kind === 'unknown-type'
                          ? `${row.label} (${row.count})`
                          : row.label}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{row.label}</TooltipContent>
                  </Tooltip>
                </div>

                {row.kind === 'layer' || row.kind === 'unknown-root' ? (
                  <span className="shrink-0 text-xs text-muted-foreground">{row.count}</span>
                ) : null}
                {row.kind === 'unknown-root' && <AlertTriangle className="size-3.5 shrink-0 text-[#EF4444]" />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
