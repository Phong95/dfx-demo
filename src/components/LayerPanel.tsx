import { useMemo } from 'react';
import { Eye, EyeOff, Lock, AlertTriangle } from 'lucide-react';
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

  // Count entities per layer once per dxfData change, not once per row render.
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
      <h2 className="px-4 py-3 text-base font-semibold">Layers</h2>

      {unknownCount > 0 && (
        <div className="flex items-start gap-2 px-4 pb-3 text-xs text-[#EF4444]">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            {unknownCount} unsupported entity type(s) found — nothing was dropped, but these won&apos;t
            render. See Unknown section below.
          </span>
        </div>
      )}

      {layerNames.length > 0 && (
        <div className="flex items-center justify-between gap-2 px-4 pb-2">
          <Button variant="outline" size="sm" onClick={showAllLayers}>
            <Eye className="size-4" />
            Show All
          </Button>
          <Button variant="outline" size="sm" onClick={hideAllLayers}>
            <EyeOff className="size-4" />
            Hide All
          </Button>
        </div>
      )}

      <ScrollArea className="flex-1">
        {layerNames.length === 0 ? (
          <p className="px-4 text-sm text-muted-foreground">No layers found in this file.</p>
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
                  className="flex h-8 items-center gap-2 px-4 hover:bg-surface"
                >
                  <span
                    className="size-3 shrink-0 rounded-sm border border-border"
                    style={{ backgroundColor: swatchColor }}
                    aria-hidden="true"
                  />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm">
                        {name}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{name}</TooltipContent>
                  </Tooltip>

                  {flags?.frozen && (
                    <Badge variant="outline" className="shrink-0">
                      Frozen
                    </Badge>
                  )}
                  {flags?.locked && (
                    <Badge variant="outline" className="shrink-0">
                      <Lock className="size-3" />
                    </Badge>
                  )}

                  <span className="shrink-0 text-xs text-muted-foreground">{count}</span>

                  <button
                    type="button"
                    onClick={() => toggleLayerVisibility(name)}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    aria-label={visible ? `Hide layer ${name}` : `Show layer ${name}`}
                  >
                    {visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
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
