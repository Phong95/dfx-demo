/**
 * get_structure tool handler (MCP-01). Pure function: takes the Engine
 * Server's DocumentModel and returns the same layer > entity-type > count
 * tree the Structure Browser renders, plus the unknown-entity report.
 */
import type { DocumentModel, StructureResult } from '../documentModel';

export function handleGetStructure(documentModel: DocumentModel): StructureResult {
  return documentModel.getStructure();
}
