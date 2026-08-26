import { useRef, type ChangeEvent } from 'react';
import { Maximize, FileCode2, FolderOpen } from 'lucide-react';
import { useDrawingStore } from '@/store/drawingStore';
import { DropZone } from '@/components/DropZone';
import { LayerPanel } from '@/components/LayerPanel';
import { StructureBrowser } from '@/components/StructureBrowser';
import { PropertiesPanel } from '@/components/PropertiesPanel';
import { CleanupToolbar } from '@/components/CleanupToolbar';
import { ThemeToggle } from '@/components/ThemeToggle';
import { DxfViewerCanvas, type DxfViewerCanvasHandle } from '@/components/CanvasViewer/DxfViewerCanvas';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Toaster } from '@/components/ui/sonner';
import './App.css';

function App() {
  const dxfData = useDrawingStore((state) => state.dxfData);
  const isLoading = useDrawingStore((state) => state.isLoading);
  const error = useDrawingStore((state) => state.error);
  const fileName = useDrawingStore((state) => state.fileName);
  const loadFile = useDrawingStore((state) => state.loadFile);
  const stageRef = useRef<DxfViewerCanvasHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleRetry = () => {
    useDrawingStore.setState({ error: null });
  };

  const handleOpenFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void loadFile(file);
    }
    e.target.value = '';
  };

  return (
    <div className="grid h-screen grid-cols-[300px_1fr] grid-rows-[auto_auto_1fr] bg-background text-foreground">
      <header className="col-span-2 flex h-12 items-center justify-between border-b border-border bg-surface px-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-md bg-accent">
              <FileCode2 className="size-4 text-accent-foreground" />
            </div>
            <span className="text-sm font-semibold tracking-tight">DXF Demo</span>
          </div>

          {fileName && (
            <>
              <Separator orientation="vertical" className="h-5" />
              <span
                title={fileName}
                className="max-w-xs overflow-hidden text-ellipsis whitespace-nowrap text-xs text-muted-foreground"
              >
                {fileName}
              </span>
            </>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => fileInputRef.current?.click()}
          >
            <FolderOpen className="size-3.5" />
            {dxfData ? 'Open' : 'Open File'}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".dxf"
            className="hidden"
            onChange={handleOpenFile}
          />
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => stageRef.current?.fitToView()}
            disabled={!dxfData}
            aria-label="Fit to view"
          >
            <Maximize className="size-4" />
          </Button>
        </div>
      </header>

      <aside className="row-start-2 row-span-2 flex flex-col overflow-hidden border-r border-border bg-surface">
        <div className="h-[240px] shrink-0 overflow-hidden">
          <LayerPanel />
        </div>
        <Separator />
        <div className="min-h-0 flex-1 overflow-hidden">
          <StructureBrowser />
        </div>
        <Separator />
        <div className="h-[220px] shrink-0 overflow-hidden">
          <PropertiesPanel />
        </div>
      </aside>

      <div className="row-start-2 col-start-2">
        <CleanupToolbar />
      </div>

      <main className="row-start-3 col-start-2 overflow-hidden bg-canvas-bg">
        {!dxfData && !isLoading && !error && <DropZone />}
        {isLoading && (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="size-8 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-accent" />
              <p className="text-sm text-muted-foreground">Parsing drawing...</p>
            </div>
          </div>
        )}
        {error && (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <p className="max-w-sm text-sm text-muted-foreground">{error}</p>
            <Button onClick={handleRetry}>Try again</Button>
          </div>
        )}
        {dxfData && !error && <DxfViewerCanvas ref={stageRef} />}
      </main>

      <Toaster />
    </div>
  );
}

export default App;
