import { Eye, EyeOff } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDrawingStore } from '@/store/drawingStore';

export function LayerPanel() {
  const dxfData = useDrawingStore((state) => state.dxfData);
  const layerVisibility = useDrawingStore((state) => state.layerVisibility);
  const toggleLayerVisibility = useDrawingStore((state) => state.toggleLayerVisibility);

  const layerNames = dxfData
    ? Object.keys(dxfData.tables?.layer?.layers ?? {}).sort((a, b) => a.localeCompare(b))
    : [];

  return (
    <div className="flex h-full flex-col">
      <h2 className="px-4 py-3 text-base font-semibold">Layers</h2>
      <ScrollArea className="flex-1">
        {layerNames.length === 0 ? (
          <p className="px-4 text-sm text-muted-foreground">No layers found in this file.</p>
        ) : (
          <ul>
            {layerNames.map((name) => {
              const visible = layerVisibility[name] ?? true;
              return (
                <li
                  key={name}
                  className="flex h-8 items-center justify-between gap-2 px-4 hover:bg-surface"
                >
                  <span
                    title={name}
                    className="overflow-hidden text-ellipsis whitespace-nowrap text-sm"
                  >
                    {name}
                  </span>
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
