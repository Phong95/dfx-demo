import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { Trash2, EyeOff, Undo2, Redo2, Download } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useDrawingStore } from '@/store/drawingStore';
import { buildEntityTagRanges } from '@/dxf/entityTagRanges';
import { filterDxfText, validateExport } from '@/dxf/exportDxf';
import { saveDxf } from '@/dxf/saveDxf';

const BATCH_DELETE_THRESHOLD = 10;

export function CleanupToolbar() {
  const selectedEntityIndices = useDrawingStore((state) => state.selectedEntityIndices);
  const deletedEntityIndices = useDrawingStore((state) => state.deletedEntityIndices);
  const deleteSelected = useDrawingStore((state) => state.deleteSelected);
  const hideSelected = useDrawingStore((state) => state.hideSelected);
  const dxfData = useDrawingStore((state) => state.dxfData);
  const rawFileText = useDrawingStore((state) => state.rawFileText);
  const fileName = useDrawingStore((state) => state.fileName);

  const [isBatchDeleteOpen, setIsBatchDeleteOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const pastCount = useStore(useDrawingStore.temporal, (state) => state.pastStates.length);
  const futureCount = useStore(useDrawingStore.temporal, (state) => state.futureStates.length);

  const selectionCount = selectedEntityIndices.size;
  const hasSelection = selectionCount > 0;

  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      const isMod = e.ctrlKey || e.metaKey;
      if (!isMod || e.key.toLowerCase() !== 'z') return;
      e.preventDefault();
      const { undo, redo } = useDrawingStore.temporal.getState();
      if (e.shiftKey) {
        redo();
      } else {
        undo();
      }
    }
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, []);

  const handleDelete = () => {
    if (selectionCount >= BATCH_DELETE_THRESHOLD) {
      setIsBatchDeleteOpen(true);
      return;
    }
    deleteSelected();
  };

  const handleConfirmBatchDelete = () => {
    deleteSelected();
    setIsBatchDeleteOpen(false);
  };

  const handleExport = async () => {
    if (!dxfData || rawFileText === null) return;

    setIsExporting(true);
    try {
      const ranges = buildEntityTagRanges(rawFileText);
      const filteredText = filterDxfText(rawFileText, ranges, deletedEntityIndices);
      const expectedEntityCount = dxfData.entities.length - deletedEntityIndices.size;
      const isValid = validateExport(filteredText, expectedEntityCount);

      if (!isValid) {
        toast.error(
          "Couldn't validate the exported file — nothing was saved. Try again, or export a smaller selection.",
        );
        return;
      }

      const baseName = (fileName ?? 'drawing.dxf').replace(/\.dxf$/i, '');
      const suggestedName = `${baseName}_cleaned.dxf`;
      await saveDxf(filteredText, suggestedName);
      toast.success(`Exported ${suggestedName} — ${deletedEntityIndices.size} entities removed.`);
    } catch {
      toast.error(
        "Couldn't validate the exported file — nothing was saved. Try again, or export a smaller selection.",
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex h-10 items-center gap-1.5 border-b border-border bg-surface px-3">
      {hasSelection && (
        <Badge className="bg-accent text-accent-foreground text-[10px]">{selectionCount} selected</Badge>
      )}

      <AlertDialog open={isBatchDeleteOpen} onOpenChange={setIsBatchDeleteOpen}>
        <Button variant="destructive" size="sm" onClick={handleDelete} disabled={!hasSelection} className="h-7 cursor-pointer text-xs">
          <Trash2 className="size-3.5" />
          Delete
        </Button>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectionCount} entities?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes {selectionCount} entities from the drawing. You can undo this with
              Ctrl+Z.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleConfirmBatchDelete}>
              Delete {selectionCount} entities
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Button variant="outline" size="sm" onClick={hideSelected} disabled={!hasSelection} className="h-7 cursor-pointer text-xs">
        <EyeOff className="size-3.5" />
        Hide
      </Button>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 cursor-pointer"
            aria-label="Undo"
            disabled={pastCount === 0}
            onClick={() => useDrawingStore.temporal.getState().undo()}
          >
            <Undo2 className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 cursor-pointer"
            aria-label="Redo"
            disabled={futureCount === 0}
            onClick={() => useDrawingStore.temporal.getState().redo()}
          >
            <Redo2 className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Redo (Ctrl+Shift+Z)</TooltipContent>
      </Tooltip>

      <div className="flex-1" />

      <Button
        variant="default"
        size="sm"
        className="h-7 cursor-pointer text-xs"
        onClick={handleExport}
        disabled={!dxfData || isExporting}
      >
        <Download className="size-3.5" />
        {isExporting ? 'Exporting...' : 'Export DXF'}
      </Button>
    </div>
  );
}
