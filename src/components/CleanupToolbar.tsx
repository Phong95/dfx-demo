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
import { filterDxfText, validateExport, saveDxf } from '@/dxf/exportDxf';

// Batch-delete confirmation threshold (CONTEXT.md D-07 / 02-UI-SPEC.md):
// 1-9 entity deletes proceed immediately (undo is the safety net); 10+
// requires an explicit confirmation dialog.
const BATCH_DELETE_THRESHOLD = 10;

/**
 * Delete/Hide/Undo/Redo/Export toolbar (CONTEXT.md D-04/D-05/D-06/D-07/D-09
 * through D-12). Renders below the header, spanning the canvas column only
 * (02-UI-SPEC.md layout).
 */
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

  // zundo's `.temporal` is a separate vanilla store (not a hook) -- subscribe
  // via zustand's `useStore` so Undo/Redo disabled-state reacts to history
  // changes (RESEARCH Pattern 2).
  const pastCount = useStore(useDrawingStore.temporal, (state) => state.pastStates.length);
  const futureCount = useStore(useDrawingStore.temporal, (state) => state.futureStates.length);

  const selectionCount = selectedEntityIndices.size;
  const hasSelection = selectionCount > 0;

  // Ctrl+Z / Ctrl+Shift+Z only -- no Ctrl+Y (CONTEXT.md locked decision,
  // RESEARCH Code Examples).
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
    // Batch-delete confirmation dialog for 10+ entities (CONTEXT.md D-07).
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
    <div className="flex h-12 items-center gap-2 bg-surface px-4">
      {hasSelection && (
        <Badge className="bg-accent text-accent-foreground">{selectionCount} selected</Badge>
      )}

      <AlertDialog open={isBatchDeleteOpen} onOpenChange={setIsBatchDeleteOpen}>
        <Button variant="destructive" size="sm" onClick={handleDelete} disabled={!hasSelection}>
          <Trash2 className="size-4" />
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

      <Button variant="outline" size="sm" onClick={hideSelected} disabled={!hasSelection}>
        <EyeOff className="size-4" />
        Hide
      </Button>

      <Separator orientation="vertical" className="h-6" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Undo"
            disabled={pastCount === 0}
            onClick={() => useDrawingStore.temporal.getState().undo()}
          >
            <Undo2 className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Redo"
            disabled={futureCount === 0}
            onClick={() => useDrawingStore.temporal.getState().redo()}
          >
            <Redo2 className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Redo (Ctrl+Shift+Z)</TooltipContent>
      </Tooltip>

      <div className="flex-1" />

      <Button
        variant="default"
        size="sm"
        onClick={handleExport}
        disabled={!dxfData || isExporting}
      >
        <Download className="size-4" />
        {isExporting ? 'Exporting…' : 'Export DXF'}
      </Button>
    </div>
  );
}
