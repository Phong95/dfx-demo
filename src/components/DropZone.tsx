import { useRef, useState, type DragEvent, type ChangeEvent } from 'react';
import { Upload, FileUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDrawingStore } from '@/store/drawingStore';
import { cn } from '@/lib/utils';

export function DropZone() {
  const loadFile = useDrawingStore((state) => state.loadFile);
  const [isDragOver, setIsDragOver] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      void loadFile(file);
    }
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void loadFile(file);
    }
    e.target.value = '';
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="flex h-full w-full items-center justify-center p-8"
    >
      <div
        className={cn(
          'flex max-w-md flex-col items-center gap-5 rounded-xl border-2 border-dashed px-10 py-14 text-center transition-all',
          isDragOver
            ? 'border-accent bg-accent-muted'
            : 'border-border bg-surface',
        )}
      >
        <div className={cn(
          'flex size-14 items-center justify-center rounded-xl transition-colors',
          isDragOver ? 'bg-accent/10 text-accent' : 'bg-muted text-muted-foreground',
        )}>
          <Upload className="size-6" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Load a DXF drawing</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            Drag and drop a .dxf file here, or click the button below to browse.
          </p>
        </div>
        <Button onClick={() => inputRef.current?.click()} className="cursor-pointer">
          <FileUp className="size-4" />
          Choose File
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".dxf"
          className="hidden"
          onChange={handleInputChange}
        />
      </div>
    </div>
  );
}
