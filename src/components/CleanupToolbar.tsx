import { useEffect } from 'react';
import { useStore } from 'zustand';
import { Trash2, EyeOff, Undo2, Redo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDrawingStore } from '@/store/drawingStore';

/**
 * Delete/Hide/Undo/Redo toolbar (CONTEXT.md D-04/D-05/D-06). Renders below
 * the header, spanning the canvas column only (02-UI-SPEC.md layout).
 */
export function CleanupToolbar() {
  const selectedEntityIndices = useDrawingStore((state) => state.selectedEntityIndices);
  const deleteSelected = useDrawingStore((state) => state.deleteSelected);
  const hideSelected = useDrawingStore((state) => state.hideSelected);

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
    // Batch-delete confirmation dialog for 10+ entities (CONTEXT.md D-07)
    // lands in Plan 02-02 -- for now, delete proceeds directly regardless of
    // selection size; undo (Ctrl+Z) remains the safety net either way.
    deleteSelected();
  };

  return (
    <div className="flex h-12 items-center gap-2 bg-surface px-4">
      {hasSelection && (
        <Badge className="bg-accent text-accent-foreground">{selectionCount} selected</Badge>
      )}

      <Button variant="destructive" size="sm" onClick={handleDelete} disabled={!hasSelection}>
        <Trash2 className="size-4" />
        Delete
      </Button>

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
    </div>
  );
}
