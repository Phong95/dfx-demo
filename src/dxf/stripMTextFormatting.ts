/**
 * Strips MTEXT inline formatting codes before display (RESEARCH Code Examples).
 * Pattern corroborated across Autodesk Developer Blog / ezdxf plain_text() approach.
 */
export function stripMTextFormatting(raw: string): string {
  return raw
    .replace(/\\P/g, '\n') // paragraph break
    .replace(/\\p[^;]*;/g, '\n') // paragraph properties
    .replace(/\\[A-Za-z][^;\\]*;/g, '') // \Hheight; \Ccolor; \Ffont; \Wwidth; etc -- strip code + arg
    .replace(/\\[{}]/g, '') // grouping braces
    .replace(/\\~/g, ' '); // non-breaking space code
}
