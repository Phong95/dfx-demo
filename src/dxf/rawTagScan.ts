/**
 * Independent raw-tag pre-scan of the DXF text (PARSE-03 / PARSE-04).
 *
 * dxf-parser silently drops entity types it doesn't have a registered handler for --
 * they never appear anywhere in its returned object, and its own console warning is
 * suppressed by default log level. This scanner walks the raw DXF text directly,
 * independent of dxf-parser, counting every group-code-0 entity-type value seen
 * inside ENTITIES and BLOCKS sections, so nothing is ever silently dropped from the
 * report even if dxf-parser drops it from `dxf.entities`.
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

export interface RawTagScanResult {
  typeCounts: Map<string, number>;
  unknown: Array<[string, number]>;
}

export function rawTagScan(dxfText: string): RawTagScanResult {
  const lines = dxfText.split(/\r\n|\r|\n/);
  const typeCounts = new Map<string, number>();

  // A DXF SECTION is entered via the pair (0, "SECTION") immediately followed
  // by (2, "<section name>") -- the section name is carried on group code 2,
  // never on the (0, "SECTION") pair itself. Entities directly under ENTITIES
  // are counted as-is; entities under BLOCKS live nested between a (0, "BLOCK")
  // / (0, "ENDBLK") pair per block definition and those two structural markers
  // are excluded from the type tally.
  let currentSection: string | null = null;
  let inBlockDef = false;

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
      currentSection = null;
      inBlockDef = false;
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
    }
  }

  const unknown: Array<[string, number]> = [...typeCounts.entries()].filter(
    ([type]) => !SUPPORTED_TYPES.has(type),
  );

  return { typeCounts, unknown };
}
