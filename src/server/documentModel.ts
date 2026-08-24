/**
 * Server-side Document Model mirror (Engine Server, RESEARCH Pattern 2).
 *
 * Never receives a serialized `IDxf` from the browser -- it independently
 * re-parses the exact `rawFileText` bytes the browser last synced, using the
 * same pipeline `src/dxf/dxf.worker.ts` runs client-side: `DxfParser.parseSync`
 * -> `rawTagScan` -> `resolveAllColors`. Because the input bytes are
 * identical, the resulting `dxfData.entities` array is index-aligned with the
 * browser's own array with no custom wire format to design or version.
 *
 * `deletedEntityIndices`/`hiddenEntityIndices`/`version` mirror the browser's
 * own mutation state (also synced on every commit, not just on load) so tool
 * handlers answer accurately even for manual (non-AI) edits.
 */
import DxfParser from 'dxf-parser';
import type { IDxf } from 'dxf-parser';
import { rawTagScan, type RawTagScanResult } from '@/dxf/rawTagScan';
import { resolveAllColors } from '@/dxf/resolveColors';
import { ACI_COLORS } from '@/dxf/aciColorIndex';

export interface LayerInfo {
  name: string;
  color: string;
  entityCount: number;
  frozen: boolean;
  locked: boolean;
}

export interface StructureEntityTypeCount {
  type: string;
  count: number;
}

export interface StructureLayer {
  name: string;
  entityTypes: StructureEntityTypeCount[];
}

export interface StructureResult {
  layers: StructureLayer[];
  unknownEntities: StructureEntityTypeCount[];
}

export class DocumentModel {
  rawFileText: string | null = null;
  fileName: string | null = null;
  dxfData: IDxf | null = null;
  unknownEntityReport: RawTagScanResult | null = null;
  deletedEntityIndices: Set<number> = new Set();
  hiddenEntityIndices: Set<number> = new Set();
  version = 0;
  /** Set when the last load()/re-parse attempt failed -- never thrown, never
   * crashes the Engine Server (RESEARCH Security Domain, Pitfall 5). */
  loadError: string | null = null;

  /** Re-parses `text` server-side and replaces the current document mirror.
   * Wrapped defensively: a malformed/adversarial DXF text sets `loadError`
   * and clears the stale document rather than throwing out of this call. */
  load(text: string, fileName: string): void {
    this.rawFileText = text;
    this.fileName = fileName;
    this.loadError = null;

    try {
      const parser = new DxfParser();
      const dxfData = parser.parseSync(text);
      if (!dxfData) {
        this.dxfData = null;
        this.unknownEntityReport = null;
        this.loadError = 'DXF parser returned no data. The file may be empty or malformed.';
        return;
      }

      const unknownEntityReport = rawTagScan(text);
      const layers = dxfData.tables?.layer?.layers ?? {};
      resolveAllColors(dxfData.entities, layers, ACI_COLORS, dxfData.blocks);

      this.dxfData = dxfData;
      this.unknownEntityReport = unknownEntityReport;
    } catch (error) {
      this.dxfData = null;
      this.unknownEntityReport = null;
      this.loadError = error instanceof Error ? error.message : 'Unknown parsing error.';
    }
  }

  /** Mirrors the browser's removal/hide state and monotonic version counter
   * (RESEARCH Pattern 2 / Pattern 4 staleness check). */
  updateState(deletedEntityIndices: number[], hiddenEntityIndices: number[], version: number): void {
    this.deletedEntityIndices = new Set(deletedEntityIndices);
    this.hiddenEntityIndices = new Set(hiddenEntityIndices);
    this.version = version;
  }

  /** Applies an AI-confirmed proposal's indices to the mirror and bumps the
   * version counter immediately (RESEARCH Pattern 4). The browser's own
   * subsequent `sync_state` (triggered by its `applyIndices` store action)
   * will overwrite `version` again with its own counter -- bumping here first
   * only protects against a second `confirm_proposal` racing ahead of that
   * round trip and missing this mutation in its staleness check. */
  applyMutation(action: 'delete' | 'hide', indices: number[]): void {
    const targetSet = action === 'delete' ? this.deletedEntityIndices : this.hiddenEntityIndices;
    for (const index of indices) targetSet.add(index);
    this.version += 1;
  }

  get isLoaded(): boolean {
    return this.dxfData !== null;
  }

  /** list_layers (RESEARCH Code Examples): name, resolved color, live entity
   * count (excluding deleted), frozen/locked flags from the raw group-70 scan. */
  getLayerInfo(): LayerInfo[] {
    if (!this.dxfData) return [];

    const layers = this.dxfData.tables?.layer?.layers ?? {};
    const layerFlags = this.unknownEntityReport?.layerFlags ?? {};

    const entityCounts = new Map<string, number>();
    this.dxfData.entities.forEach((entity, index) => {
      if (this.deletedEntityIndices.has(index)) return;
      entityCounts.set(entity.layer, (entityCounts.get(entity.layer) ?? 0) + 1);
    });

    return Object.values(layers).map((layer) => {
      const color = ACI_COLORS[layer.colorIndex] ?? '#FFFFFF';
      const flags = layerFlags[layer.name];
      return {
        name: layer.name,
        color,
        entityCount: entityCounts.get(layer.name) ?? 0,
        frozen: flags?.frozen ?? layer.frozen ?? false,
        locked: flags?.locked ?? false,
      };
    });
  }

  /** get_structure: the same layer > entity-type > count tree the Structure
   * Browser renders, plus the unknown-entity report from the raw tag scan.
   * Deleted entities are excluded (mirrors getLayerInfo's convention);
   * hidden-but-not-deleted entities are still counted -- hiding is view-only
   * state, never a data mutation (02-RESEARCH.md D-11). */
  getStructure(): StructureResult {
    if (!this.dxfData) return { layers: [], unknownEntities: [] };

    const layerTypeCounts = new Map<string, Map<string, number>>();
    this.dxfData.entities.forEach((entity, index) => {
      if (this.deletedEntityIndices.has(index)) return;
      if (!layerTypeCounts.has(entity.layer)) layerTypeCounts.set(entity.layer, new Map());
      const typeCounts = layerTypeCounts.get(entity.layer);
      if (!typeCounts) return;
      typeCounts.set(entity.type, (typeCounts.get(entity.type) ?? 0) + 1);
    });

    const layerTableNames = Object.keys(this.dxfData.tables?.layer?.layers ?? {});
    // Union of the LAYER table (may include layers with zero visible
    // entities) and any layer name actually referenced by an entity (a DXF
    // file can reference a layer not declared in the LAYER table).
    const allLayerNames = new Set([...layerTableNames, ...layerTypeCounts.keys()]);

    const layers: StructureLayer[] = [...allLayerNames].map((name) => {
      const typeCounts = layerTypeCounts.get(name) ?? new Map<string, number>();
      return {
        name,
        entityTypes: [...typeCounts.entries()].map(([type, count]) => ({ type, count })),
      };
    });

    const unknownEntities: StructureEntityTypeCount[] = (this.unknownEntityReport?.unknown ?? []).map(
      ([type, count]) => ({ type, count }),
    );

    return { layers, unknownEntities };
  }
}
