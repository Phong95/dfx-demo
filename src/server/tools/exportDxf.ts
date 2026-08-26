/**
 * export_dxf tool handler. Reuses the Phase 2 surgical export pipeline
 * (filterDxfText/validateExport) verbatim, server-side -- NOT saveDxf, which
 * calls window.showSaveFilePicker and does not exist under Node. Writes via
 * node:fs/promises to a Claude-supplied path (RESEARCH Code Examples,
 * Security Domain: filePath is LLM-controlled and must be validated before
 * any write).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildEntityTagRanges } from '@/dxf/entityTagRanges';
import { filterDxfText, validateExport } from '@/dxf/exportDxf';
import type { DocumentModel } from '../documentModel';

export interface ExportDxfResult {
  exported: true;
  outputPath: string;
  entityCount: number;
}

export interface ExportDxfError {
  error: string;
}

export async function handleExportDxf(
  documentModel: DocumentModel,
  filePath: string,
): Promise<ExportDxfResult | ExportDxfError> {
  if (!documentModel.rawFileText || !documentModel.dxfData) {
    return { error: 'No drawing loaded. Please load a DXF file in the viewer first.' };
  }

  if (!/\.dxf$/i.test(filePath)) {
    return { error: 'The export file path must end in .dxf.' };
  }

  const resolvedPath = path.resolve(filePath);
  const normalized = path.normalize(resolvedPath);
  if (normalized.split(path.sep).includes('..')) {
    return { error: 'The export file path must not contain ".." segments.' };
  }

  const ranges = buildEntityTagRanges(documentModel.rawFileText);
  const filtered = filterDxfText(documentModel.rawFileText, ranges, documentModel.deletedEntityIndices);
  const expectedCount = documentModel.dxfData.entities.length - documentModel.deletedEntityIndices.size;

  if (!validateExport(filtered, expectedCount)) {
    return {
      error: 'Export validation failed: the filtered DXF did not re-parse to the expected entity count. No file was written.',
    };
  }

  await mkdir(path.dirname(normalized), { recursive: true });
  await writeFile(normalized, filtered, 'utf-8');

  return { exported: true, outputPath: normalized, entityCount: expectedCount };
}
