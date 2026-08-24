/**
 * LWPOLYLINE bulge-to-arc conversion (RESEARCH Code Examples / Common Pitfalls #4).
 *
 * A DXF LWPOLYLINE vertex's `bulge` value encodes a curved segment to the *next*
 * vertex: bulge = tan(theta / 4), where theta is the included angle of the arc.
 * A bulge of 0 means a straight segment. Positive bulge = counter-clockwise arc,
 * negative = clockwise (RESEARCH Assumption A5 -- verify against a real fixture).
 */

export interface Point2D {
  x: number;
  y: number;
}

/**
 * Interpolates the curved segment between p1 and p2 described by `bulge`.
 * Returns [p1, p2] unchanged when bulge is 0 (straight segment).
 * Returned array always starts with p1 and ends with p2.
 */
export function bulgeToArcPoints(
  p1: Point2D,
  p2: Point2D,
  bulge: number,
  segments = 16,
): Point2D[] {
  if (bulge === 0) return [p1, p2];

  const chord = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  if (chord === 0) return [p1, p2];

  const theta = 4 * Math.atan(bulge);
  const radius = chord / (2 * Math.sin(theta / 2));
  const midX = (p1.x + p2.x) / 2;
  const midY = (p1.y + p2.y) / 2;
  const sagitta = (bulge * chord) / 2;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const nx = -dy / chord;
  const ny = dx / chord;
  const centerX = midX - nx * (radius - sagitta * Math.sign(bulge));
  const centerY = midY - ny * (radius - sagitta * Math.sign(bulge));
  const startAngle = Math.atan2(p1.y - centerY, p1.x - centerX);

  const points: Point2D[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = startAngle + (theta * i) / segments;
    points.push({ x: centerX + radius * Math.cos(a), y: centerY + radius * Math.sin(a) });
  }
  return points;
}
