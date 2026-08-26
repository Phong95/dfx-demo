import { useMemo } from 'react';
import { Eye, EyeOff, Lock, AlertTriangle, Layers } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDrawingStore } from '@/store/drawingStore';
import { aciToHex } from '@/dxf/aciColorIndex';

export function LayerPanel() {
  const dxfData = useDrawingStore((state) => state.dxfData);
  const layerVisibility = useDrawingStore((state) => state.layerVisibility);
  const layerFlags = useDrawingStore((state) => state.layerFlags);
  const unknownEntityReport = useDrawingStore((state) => state.unknownEntityReport);
  const toggleLayerVisibility = useDrawingStore((state) => state.toggleLayerVisibility);
  const showAllLayers = useDrawingStore((state) => state.showAllLayers);
  const hideAllLayers = useDrawingStore((state) => state.hideAllLayers);

  const layers = dxfData?.tables?.layer?.layers ?? {};
  const layerNames = Object.keys(layers).sort((a, b) => a.localeCompare(b));

  const entityCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const entity of dxfData?.entities ?? []) {
      counts[entity.layer] = (counts[entity.layer] ?? 0) + 1;
    }
    return counts;
  }, [dxfData]);

  const unknownCount = unknownEntityReport?.unknown.reduce((sum, [, count]) => sum + count, 0) ?? 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Layers className="size-3.5" />
          Layers
        </div>
        {layerNames.length > 0 && (
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={showAllLayers}
                  className="flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
                  aria-label="Show all layers"
                >
                  <Eye className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Show All</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={hideAllLayers}
                  className="flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
                  aria-label="Hide all layers"
                >
                  <EyeOff className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Hide All</TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>

      {unknownCount > 0 && (
        <div className="mx-3 mb-2 flex items-start gap-2 rounded-md bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {unknownCount} unsupported entity type(s) found — won&apos;t render. See Unknown section below.
          </span>
        </div>
      )}

      <ScrollArea className="flex-1">
        {layerNames.length === 0 ? (
          <p className="px-3 text-xs text-muted-foreground">No layers found.</p>
        ) : (
          <ul>
            {layerNames.map((name) => {
              const layer = layers[name];
              const visible = layerVisibility[name] ?? true;
              const flags = layerFlags[name];
              const swatchColor = aciToHex(layer?.colorIndex ?? 7);
              const count = entityCounts[name] ?? 0;

              return (
                <li
                  key={name}
                  className="group flex h-8 items-center gap-2 px-3 transition-colors hover:bg-surface-hover"
                >
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: swatchColor }}
                    aria-hidden="true"
                  />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs">
                        {name}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{name}</TooltipContent>
                  </Tooltip>

                  {flags?.frozen && (
                    <Badge variant="outline" className="h-4 px-1 text-[10px]">
                      Frozen
                    </Badge>
                  )}
                  {flags?.locked && (
                    <Badge variant="outline" className="h-4 px-1">
                      <Lock className="size-2.5" />
                    </Badge>
                  )}

                  <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{count}</span>

                  <button
                    type="button"
                    onClick={() => toggleLayerVisibility(name)}
                    className="shrink-0 cursor-pointer text-muted-foreground opacity-0 transition-all hover:text-foreground group-hover:opacity-100"
                    aria-label={visible ? `Hide layer ${name}` : `Show layer ${name}`}
                  >
                    {visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}
