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
      className={cn(
        'flex h-full w-full flex-col items-center justify-center gap-4 text-center transition-colors',
        isDragOver && 'bg-surface/40',
      )}
    >
      <Upload className="size-10 text-muted-foreground" />
      <h2 className="text-xl font-semibold">No drawing loaded</h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        Drag and drop a DXF file here, or click Load DXF File to browse your computer.
      </p>
      <Button onClick={() => inputRef.current?.click()}>
        <FileUp className="size-4" />
        Load DXF File
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".dxf"
        className="hidden"
        onChange={handleInputChange}
      />
    </div>
  );
}
