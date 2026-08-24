/**
 * confirm_proposal tool handler (MCP-03) -- the key safety mechanism.
 * Re-validates the proposal's snapshot version against the current
 * documentModel.version before applying (RESEARCH Pattern 4): a stale
 * proposal (the document changed since the preview) is rejected, not
 * silently applied. Consumes the proposal either way -- confirmed or
 * rejected, it can never be re-confirmed.
 */
import type { DocumentModel } from '../documentModel';
import { getProposal, consumeProposal } from '../proposals';
import type { ApplyMutationMessage } from '../wsProtocol';

export interface ConfirmProposalResult {
  applied: true;
  action: 'delete' | 'hide';
  affectedCount: number;
}

export interface ConfirmProposalError {
  error: string;
}

export function handleConfirmProposal(
  documentModel: DocumentModel,
  proposalId: string,
  pushToBrowser: (message: ApplyMutationMessage) => void,
): ConfirmProposalResult | ConfirmProposalError {
  const proposal = getProposal(proposalId);
  if (!proposal) {
    return {
      error: `No pending proposal with id "${proposalId}". It may have already been applied, rejected, or expired.`,
    };
  }

  if (proposal.createdAtVersion !== documentModel.version) {
    consumeProposal(proposalId);
    return {
      error:
        'The drawing has changed since this proposal was created (a manual edit or another action occurred). ' +
        'Please request a new preview before confirming.',
    };
  }

  consumeProposal(proposalId);
  documentModel.applyMutation(proposal.action, proposal.indices);
  pushToBrowser({ type: 'apply_mutation', indices: proposal.indices, action: proposal.action });

  return { applied: true, action: proposal.action, affectedCount: proposal.indices.length };
}
