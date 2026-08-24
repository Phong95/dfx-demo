/**
 * Independent raw-tag pre-scan of the DXF text (PARSE-03 / PARSE-04).
 *
 * dxf-parser silently drops entity types it doesn't have a registered handler for --
 * they never appear anywhere in its returned object, and its own console warning is
 * suppressed by default log level. This scanner walks the raw DXF text directly,
 * independent of dxf-parser, counting every group-code-0 entity-type value seen
 * inside ENTITIES and BLOCKS sections, so nothing is ever silently dropped from the
 * report even if dxf-parser drops it from `dxf.entities`.
 *
 * It also scans the TABLES section's LAYER table for the raw group-70 flag value
 * per layer -- dxf-parser's own `ILayer` has no `locked` field at all (RESEARCH
 * Pitfall #5): only bits 1/2 (frozen) are read by dxf-parser, bit 4 (locked) is
 * never checked. This scan reads group-70 directly and computes both frozen and
 * locked from the same raw value, independent of dxf-parser's partial extraction.
 */

// Exact EntityName union dxf-parser@1.1.2 registers handlers for
// (dist/entities/geomtry.d.ts) -- anything outside this set inside
// ENTITIES/BLOCKS is unsupported and reported as unknown.
const SUPPORTED_TYPES = new Set([
  '3DFACE',
  'ARC',
  'ATTDEF',
  'CIRCLE',
  'DIMENSION',
  'ELLIPSE',
  'INSERT',
  'LINE',
  'LWPOLYLINE',
  'MTEXT',
  'POINT',
  'POLYLINE',
  'SOLID',
  'SPLINE',
  'TEXT',
  'VERTEX',
]);

export interface LayerFlags {
  frozen: boolean;
  locked: boolean;
}

export interface RawTagScanResult {
  typeCounts: Map<string, number>;
  unknown: Array<[string, number]>;
  layerFlags: Record<string, LayerFlags>;
}

function flagsFromGroup70(rawFlags: number): LayerFlags {
  return {
    frozen: (rawFlags & 1) !== 0 || (rawFlags & 2) !== 0,
    locked: (rawFlags & 4) !== 0,
  };
}

export function rawTagScan(dxfText: string): RawTagScanResult {
  const lines = dxfText.split(/\r\n|\r|\n/);
  const typeCounts = new Map<string, number>();
  const layerFlags: Record<string, LayerFlags> = {};

  // A DXF SECTION is entered via the pair (0, "SECTION") immediately followed
  // by (2, "<section name>") -- the section name is carried on group code 2,
  // never on the (0, "SECTION") pair itself. Entities directly under ENTITIES
  // are counted as-is; entities under BLOCKS live nested between a (0, "BLOCK")
  // / (0, "ENDBLK") pair per block definition and those two structural markers
  // are excluded from the type tally.
  let currentSection: string | null = null;
  let inBlockDef = false;

  // TABLES/LAYER tracking. A TABLE is entered via (0, "TABLE") + (2, "<table name>"),
  // same two-pair pattern as SECTION. Each layer record starts at (0, "LAYER") and
  // runs until the next (0, ...) pair; its name is on group 2, its flags on group 70.
  let currentTable: string | null = null;
  let pendingLayerName: string | null = null;
  let pendingLayerRawFlags = 0;
  let inLayerRecord = false;

  const commitPendingLayer = () => {
    if (pendingLayerName !== null) {
      layerFlags[pendingLayerName] = flagsFromGroup70(pendingLayerRawFlags);
    }
    pendingLayerName = null;
    pendingLayerRawFlags = 0;
  };

  for (let i = 0; i < lines.length - 1; i += 2) {
    const code = Number(lines[i]);
    const value = lines[i + 1]?.trim();
    if (Number.isNaN(code) || !value) continue;

    if (code === 0 && value === 'SECTION') {
      const nextCode = Number(lines[i + 2]);
      const nextValue = lines[i + 3]?.trim();
      currentSection = nextCode === 2 ? (nextValue ?? null) : null;
      continue;
    }

    if (code === 0 && value === 'ENDSEC') {
      if (inLayerRecord) commitPendingLayer();
      currentSection = null;
      inBlockDef = false;
      currentTable = null;
      inLayerRecord = false;
      continue;
    }

    if (currentSection === 'ENTITIES' && code === 0) {
      typeCounts.set(value, (typeCounts.get(value) ?? 0) + 1);
      continue;
    }

    if (currentSection === 'BLOCKS' && code === 0) {
      if (value === 'BLOCK') {
        inBlockDef = true;
        continue;
      }
      if (value === 'ENDBLK') {
        inBlockDef = false;
        continue;
      }
      if (inBlockDef) {
        typeCounts.set(value, (typeCounts.get(value) ?? 0) + 1);
      }
      continue;
    }

    if (currentSection === 'TABLES') {
      if (code === 0 && value === 'TABLE') {
        const nextCode = Number(lines[i + 2]);
        const nextValue = lines[i + 3]?.trim();
        currentTable = nextCode === 2 ? (nextValue ?? null) : null;
        continue;
      }

      if (code === 0 && value === 'ENDTAB') {
        if (inLayerRecord) commitPendingLayer();
        currentTable = null;
        inLayerRecord = false;
        continue;
      }

      if (currentTable === 'LAYER') {
        if (code === 0 && value === 'LAYER') {
          if (inLayerRecord) commitPendingLayer();
          inLayerRecord = true;
          continue;
        }
        if (inLayerRecord && code === 2) {
          pendingLayerName = value;
          continue;
        }
        if (inLayerRecord && code === 70) {
          pendingLayerRawFlags = Number(value) || 0;
          continue;
        }
      }
    }
  }

  const unknown: Array<[string, number]> = [...typeCounts.entries()].filter(
    ([type]) => !SUPPORTED_TYPES.has(type),
  );

  return { typeCounts, unknown, layerFlags };
}
