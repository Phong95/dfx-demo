/**
 * list_layers tool handler (MCP-01, tracer slice). Pure function: takes the
 * Engine Server's DocumentModel and returns the layer metadata array. Called
 * by engine.ts when dispatching a `tool_request` with tool === 'list_layers'.
 */
import type { DocumentModel, LayerInfo } from '../documentModel';

export function handleListLayers(documentModel: DocumentModel): LayerInfo[] {
  return documentModel.getLayerInfo();
}
