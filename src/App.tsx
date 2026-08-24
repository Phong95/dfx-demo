import { useRef } from 'react';
import { Maximize } from 'lucide-react';
import { useDrawingStore } from '@/store/drawingStore';
import { DropZone } from '@/components/DropZone';
import { LayerPanel } from '@/components/LayerPanel';
import { StructureBrowser } from '@/components/StructureBrowser';
import { Stage, type StageHandle } from '@/components/CanvasViewer/Stage';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import './App.css';

function App() {
  const dxfData = useDrawingStore((state) => state.dxfData);
  const isLoading = useDrawingStore((state) => state.isLoading);
  const error = useDrawingStore((state) => state.error);
  const fileName = useDrawingStore((state) => state.fileName);
  const stageRef = useRef<StageHandle>(null);

  const handleRetry = () => {
    useDrawingStore.setState({ error: null });
  };

  return (
    <div className="grid h-screen grid-cols-[320px_1fr] grid-rows-[48px_1fr] bg-background text-foreground">
      <header className="col-span-2 flex h-12 items-center justify-between bg-surface px-4">
        <span
          title={fileName ?? undefined}
          className="max-w-md overflow-hidden text-ellipsis whitespace-nowrap text-sm"
        >
          {fileName ?? 'No file loaded'}
        </span>
        <Button
          variant="outline"
          size="icon"
          onClick={() => stageRef.current?.fitToView()}
          disabled={!dxfData}
          aria-label="Fit to view"
        >
          <Maximize className="size-4 text-accent" />
        </Button>
      </header>

      <aside className="flex flex-col overflow-hidden bg-surface">
        <div className="h-[300px] shrink-0 overflow-hidden">
          <LayerPanel />
        </div>
        <Separator />
        <div className="min-h-0 flex-1 overflow-hidden">
          <StructureBrowser />
        </div>
      </aside>

      <main className="overflow-hidden bg-background">
        {!dxfData && !isLoading && !error && <DropZone />}
        {isLoading && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Parsing drawing…
          </div>
        )}
        {error && (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <p className="max-w-sm text-sm text-muted-foreground">{error}</p>
            <Button onClick={handleRetry}>Try again</Button>
          </div>
        )}
        {dxfData && !error && <Stage ref={stageRef} />}
      </main>
    </div>
  );
}

export default App;
