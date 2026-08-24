/**
 * apply_cleanup_rule tool handler (MCP-02/MCP-03). Resolves a
 * {layer?, entityType?} filter against the currently loaded document to a
 * set of entity indices, then hands those indices to createProposal
 * (RESEARCH Pattern 3) -- nothing is applied until confirm_proposal.
 */
import type { DocumentModel } from '../documentModel';
import { createProposal } from '../proposals';

export interface CleanupFilter {
  layer?: string;
  entityType?: string;
}

export interface CleanupRulePreview {
  proposalId: string;
  action: 'delete' | 'hide';
  matchCount: number;
  summary: string;
}

export interface CleanupRuleEmptyMatch {
  matchCount: 0;
  summary: string;
}

function resolveFilterIndices(documentModel: DocumentModel, filter: CleanupFilter): number[] {
  const dxfData = documentModel.dxfData;
  if (!dxfData) return [];

  const indices: number[] = [];
  dxfData.entities.forEach((entity, index) => {
    if (documentModel.deletedEntityIndices.has(index)) return; // already gone -- never re-propose
    if (filter.layer && entity.layer !== filter.layer) return;
    if (filter.entityType && entity.type !== filter.entityType) return;
    indices.push(index);
  });
  return indices;
}

export function handleApplyCleanupRule(
  documentModel: DocumentModel,
  action: 'delete' | 'hide',
  filter: CleanupFilter,
): CleanupRulePreview | CleanupRuleEmptyMatch {
  const dxfData = documentModel.dxfData;
  const indices = resolveFilterIndices(documentModel, filter);

  if (indices.length === 0 || !dxfData) {
    return {
      matchCount: 0,
      summary: `0 entities match this filter (layer: ${filter.layer ?? 'any'}, entityType: ${filter.entityType ?? 'any'}).`,
    };
  }

  const proposal = createProposal(action, indices, 'apply_cleanup_rule', documentModel.version);

  const typeCounts = new Map<string, number>();
  const layerCounts = new Map<string, number>();
  for (const index of indices) {
    const entity = dxfData.entities[index];
    typeCounts.set(entity.type, (typeCounts.get(entity.type) ?? 0) + 1);
    layerCounts.set(entity.layer, (layerCounts.get(entity.layer) ?? 0) + 1);
  }
  const typesSummary = [...typeCounts.entries()].map(([type, count]) => `${type}: ${count}`).join(', ');
  const layersSummary = [...layerCounts.entries()].map(([layer, count]) => `${layer}: ${count}`).join(', ');

  const pastTense = action === 'delete' ? 'deleted' : 'hidden';

  return {
    proposalId: proposal.id,
    action,
    matchCount: indices.length,
    summary: `${indices.length} entities would be ${pastTense}. By type: ${typesSummary}. By layer: ${layersSummary}. Call confirm_proposal with proposal_id "${proposal.id}" to apply.`,
  };
}
