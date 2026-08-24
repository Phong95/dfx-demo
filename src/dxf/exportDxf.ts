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
