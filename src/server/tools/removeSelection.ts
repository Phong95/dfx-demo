/**
 * remove_selection tool handler (MCP-02/MCP-03). Validates a caller-supplied
 * array of entity indices (in bounds, not already deleted), then hands the
 * valid subset to createProposal (RESEARCH Pattern 3) -- mirrors the manual
 * delete/hide flow, just driven by explicit indices instead of a rule.
 */
import type { DocumentModel } from '../documentModel';
import { createProposal } from '../proposals';

export interface RemoveSelectionPreview {
  proposalId: string;
  action: 'delete' | 'hide';
  validCount: number;
  invalidCount: number;
  summary: string;
}

export interface RemoveSelectionError {
  error: string;
}

export function handleRemoveSelection(
  documentModel: DocumentModel,
  indices: number[],
  action: 'delete' | 'hide',
): RemoveSelectionPreview | RemoveSelectionError {
  const dxfData = documentModel.dxfData;
  if (!dxfData) {
    return { error: 'No drawing loaded. Please load a DXF file in the viewer first.' };
  }

  const validIndices: number[] = [];
  let invalidCount = 0;
  for (const index of indices) {
    const isValid =
      Number.isInteger(index) &&
      index >= 0 &&
      index < dxfData.entities.length &&
      !documentModel.deletedEntityIndices.has(index);
    if (isValid) {
      validIndices.push(index);
    } else {
      invalidCount += 1;
    }
  }

  if (validIndices.length === 0) {
    return {
      error: `No valid entity indices to ${action}. ${invalidCount} requested index/indices were out of bounds or already deleted.`,
    };
  }

  const proposal = createProposal(action, validIndices, 'remove_selection', documentModel.version);
  const pastTense = action === 'delete' ? 'deleted' : 'hidden';

  return {
    proposalId: proposal.id,
    action,
    validCount: validIndices.length,
    invalidCount,
    summary:
      `${validIndices.length} entities would be ${pastTense}.` +
      (invalidCount > 0
        ? ` ${invalidCount} requested indices were skipped (out of bounds or already deleted).`
        : '') +
      ` Call confirm_proposal with proposal_id "${proposal.id}" to apply.`,
  };
}
