/**
 * Polyline-aware entity boundary scanner for the surgical DXF export filter
 * (EXPORT-01/EXPORT-02, CONTEXT.md D-09/D-10).
 *
 * Walks the raw DXF text tracking character offsets -- it never splits the
 * text into a line array and rejoins it, which would discard the original
 * CRLF/LF terminator bytes and break the byte-for-byte fidelity guarantee
 * for untouched content (02-RESEARCH.md Pitfall 2).
 *
 * Produces one EntityRange per top-level entity marker inside the ENTITIES
 * section, in the exact order dxf-parser@1.1.2 pushes entities into
 * `dxfData.entities`. POLYLINE is a compound entity: dxf-parser's polyline
 * handler internally consumes all following VERTEX groups plus the
 * terminating SEQEND before returning control to the outer parse loop
 * (verified against node_modules/dxf-parser/dist/entities/polyline.js and
 * DxfParser.js this session -- see 02-RESEARCH.md Pattern 4) -- so VERTEX
 * and SEQEND markers are folded into the *preceding* POLYLINE's range here,
 * never starting a new range of their own. Filtering the result to
 * SUPPORTED_TYPES keeps it index-aligned 1:1 with `dxfData.entities`.
 */

// Matches dxf-parser@1.1.2's registered top-level entity handlers exactly.
// VERTEX is deliberately excluded -- it has no registered top-level handler,
// it is only consumed inside POLYLINE's internal vertex-parsing loop.
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
]);

export interface EntityRange {
  startOffset: number;
  endOffset: number;
  type: string;
}

interface Token {
  text: string;
  offset: number;
}

/**
 * Tokenizes the raw text into line-by-line tokens, each tagged with its
 * character offset in the ORIGINAL string. Group codes and values sit on
 * alternating lines in a DXF file; pairing consecutive tokens (code, value)
 * reproduces dxf-parser's own group-code reading without ever mutating or
 * rejoining the source text.
 */
function tokenize(dxfText: string): Token[] {
  const tokens: Token[] = [];
  const lineRe = /([^\r\n]*)(\r\n|\r|\n|$)/g;
  let match: RegExpExecArray | null;
  while ((match = lineRe.exec(dxfText)) !== null) {
    if (match[0].length === 0) break; // guard against a zero-width match looping forever at EOF
    tokens.push({ text: match[1], offset: match.index });
    if (match[2] === '') break; // reached end of string without a trailing terminator
  }
  return tokens;
}

export function buildEntityTagRanges(dxfText: string): EntityRange[] {
  const tokens = tokenize(dxfText);
  const ranges: EntityRange[] = [];

  let inEntities = false;
  let current: EntityRange | null = null;

  const closeCurrent = (endOffset: number) => {
    if (current) {
      current.endOffset = endOffset;
      ranges.push(current);
      current = null;
    }
  };

  for (let i = 0; i + 1 < tokens.length; i += 2) {
    const code = Number(tokens[i].text);
    const value = tokens[i + 1]?.text.trim();
    if (Number.isNaN(code) || value === undefined) continue;

    if (code === 0 && value === 'SECTION') {
      const nameCode = Number(tokens[i + 2]?.text);
      const nameValue = tokens[i + 3]?.text.trim();
      inEntities = nameCode === 2 && nameValue === 'ENTITIES';
      continue;
    }

    if (code === 0 && value === 'ENDSEC') {
      closeCurrent(tokens[i].offset);
      inEntities = false;
      continue;
    }

    if (!inEntities || code !== 0) continue;

    if (value === 'VERTEX' || value === 'SEQEND') {
      // Continuation of the preceding POLYLINE's range -- never a new boundary.
      continue;
    }

    // New top-level entity marker: close the previous range, open a new one.
    closeCurrent(tokens[i].offset);
    current = { startOffset: tokens[i].offset, endOffset: -1, type: value };
  }

  // Close a range left open at EOF (a malformed file with no trailing
  // ENDSEC) rather than dropping or crashing on it -- fail-safe scanning per
  // 02-RESEARCH.md Security Domain (V5 Input Validation).
  if (current) {
    closeCurrent(dxfText.length);
  }

  return ranges.filter((range) => SUPPORTED_TYPES.has(range.type));
}
