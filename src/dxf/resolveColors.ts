import type { IBlock, ILayer, IEntity } from 'dxf-parser';

/**
 * BYLAYER/BYBLOCK-safe color resolution (PARSE-02).
 *
 * dxf-parser's own `entity.color` is broken for the BYLAYER (256, or implicit/undefined)
 * and BYBLOCK (0) sentinel colorIndex values — it calls its internal color lookup
 * unconditionally, producing `undefined` or a reserved placeholder rather than the
 * correct inherited color. This resolver never reads `entity.color`; it always routes
 * through the layer's `colorIndex` and the local ACI table for those two sentinels,
 * and through the ACI table directly for explicit 1-255 indices.
 *
 * BYBLOCK (colorIndex === 0) is approximated by falling back to the entity's own layer
 * color — resolving the true "color active when the owning block was inserted" would
 * require walking the INSERT context, which is out of scope for Phase 1 (see RESEARCH
 * Assumption A2 / Open Question 1).
 */
export function resolveEntityColor(
  entity: IEntity,
  layers: Record<string, ILayer>,
  aciColors: string[],
): string {
  const layer = layers[entity.layer];
  const layerColorIndex = layer?.colorIndex;
  const layerColor =
    layerColorIndex !== undefined ? aciColors[layerColorIndex] : undefined;

  if (entity.colorIndex === undefined || entity.colorIndex === 256) {
    // BYLAYER (implicit default, or explicit 256) -- use the entity's layer color.
    return layerColor ?? '#FFFFFF';
  }

  if (entity.colorIndex === 0) {
    // BYBLOCK -- documented approximation: fall back to the layer color.
    return layerColor ?? '#FFFFFF';
  }

  // Explicit non-sentinel colorIndex (1-255).
  return aciColors[entity.colorIndex] ?? '#FFFFFF';
}

/**
 * Batch color resolution: walks an entity array and sets a `resolvedColor` string
 * property on each entity, resolved centrally at parse time (never at render time).
 * Also walks every block definition's entities so INSERT/DIMENSION-referenced
 * geometry carries a resolved color too.
 */
export function resolveAllColors(
  entities: IEntity[],
  layers: Record<string, ILayer>,
  aciColors: string[],
  blocks?: Record<string, IBlock>,
): void {
  for (const entity of entities) {
    (entity as IEntity & { resolvedColor: string }).resolvedColor =
      resolveEntityColor(entity, layers, aciColors);
  }

  if (blocks) {
    for (const blockName of Object.keys(blocks)) {
      const block = blocks[blockName];
      if (!block?.entities) continue;
      for (const entity of block.entities) {
        (entity as IEntity & { resolvedColor: string }).resolvedColor =
          resolveEntityColor(entity, layers, aciColors);
      }
    }
  }
}
