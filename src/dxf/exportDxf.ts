import DxfParser from 'dxf-parser';
import type { EntityRange } from './entityTagRanges';

/**
 * Surgical DXF export pipeline (EXPORT-01/EXPORT-02, CONTEXT.md D-09/D-10/D-11/D-12).
 *
 * `filterDxfText` never re-serializes or rebuilds DXF content -- it slices the
 * ORIGINAL rawFileText string around deleted entity ranges, so every byte of
 * untouched content (including line endings) is preserved exactly
 * (02-RESEARCH.md Pattern 4/Pitfall 2). Hidden-but-not-deleted entities are
 * NOT filtered -- hiding is view-only state, never a data mutation (D-11).
 */
export function filterDxfText(
  dxfText: string,
  ranges: EntityRange[],
  deletedIndices: Set<number>,
): string {
  let result = '';
  let cursor = 0;
  ranges.forEach((range, index) => {
    if (!deletedIndices.has(index)) return;
    result += dxfText.slice(cursor, range.startOffset); // keep everything before the deleted range
    cursor = range.endOffset; // skip the deleted range itself
  });
  result += dxfText.slice(cursor); // keep the remainder, byte-for-byte
  return result;
}

/**
 * Re-parses the filtered text in-memory and confirms the entity count
 * matches (original count - deleted count) before any save is allowed
 * (EXPORT-02). A boundary-detection bug in `filterDxfText` cannot silently
 * produce corrupted output -- any mismatch or parse failure blocks the save.
 */
export function validateExport(filteredText: string, expectedEntityCount: number): boolean {
  try {
    const parser = new DxfParser();
    const reparsed = parser.parseSync(filteredText);
    return (
      reparsed !== undefined &&
      reparsed !== null &&
      reparsed.entities.length === expectedEntityCount
    );
  } catch {
    return false; // malformed output -- treat as validation failure, never propagate
  }
}

interface SaveFilePickerAcceptOption {
  description: string;
  accept: Record<string, string[]>;
}

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: SaveFilePickerAcceptOption[];
}

interface FileSystemWritableFileStream {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}

interface FileSystemFileHandle {
  createWritable(): Promise<FileSystemWritableFileStream>;
}

declare global {
  interface Window {
    showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
  }
}

/**
 * Saves `text` via the native File System Access API Save-As dialog when
 * available (Chromium), falling back to a Blob + `<a download>` anchor click
 * elsewhere (Firefox/Safari) -- 02-RESEARCH.md Pattern 6.
 *
 * A user-cancelled native picker rejects with `AbortError` -- that is a
 * silent no-op, not an export failure (02-RESEARCH.md Pitfall 6). Any other
 * thrown error is rethrown for the caller to surface as a failure toast.
 */
export async function saveDxf(text: string, suggestedName: string): Promise<void> {
  if (typeof window !== 'undefined' && window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [{ description: 'DXF Drawing', accept: { 'application/dxf': ['.dxf'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return; // user cancelled the save dialog -- silent no-op, not a failure
      }
      throw err;
    }
    return;
  }

  // Fallback: Blob + <a download> anchor click (no native picker UI --
  // browser auto-saves to the default downloads location).
  const blob = new Blob([text], { type: 'application/dxf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = suggestedName;
  anchor.click();
  URL.revokeObjectURL(url);
}
