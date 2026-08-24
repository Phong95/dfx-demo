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
 * Browser-only (uses `window`/`document`) -- kept in its own module,
 * separate from `exportDxf.ts`'s pure `filterDxfText`/`validateExport`, so
 * server-side code (Phase 3's `export_dxf` MCP tool) can import the pure
 * functions without pulling DOM-only globals into the Node-only
 * `tsconfig.server.json` type-check scope (RESEARCH: "export_dxf... does
 * NOT reuse saveDxf, which calls window.showSaveFilePicker").
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
