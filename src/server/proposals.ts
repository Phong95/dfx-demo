/**
 * In-memory proposal store (RESEARCH Pattern 3/4). `apply_cleanup_rule` and
 * `remove_selection` both resolve to a `number[]` of matching entity
 * indices and hand it to `createProposal` -- they differ only in *how* the
 * indices are computed, not in what happens after. `confirm_proposal` is the
 * only consumer of `getProposal`/`consumeProposal`.
 *
 * A single-user local demo tracking a handful of pending proposals per
 * session -- a plain module-level `Map` is intentionally not a job queue or
 * a database (RESEARCH "Don't Hand-Roll").
 */
import { randomUUID } from 'node:crypto';

export interface Proposal {
  id: string;
  action: 'delete' | 'hide';
  indices: number[];
  /** Snapshot of documentModel.version at preview time -- confirm_proposal
   * rejects the proposal if this no longer matches (RESEARCH Pattern 4). */
  createdAtVersion: number;
  createdAt: number;
  source: 'apply_cleanup_rule' | 'remove_selection';
}

const proposals = new Map<string, Proposal>();

export function createProposal(
  action: Proposal['action'],
  indices: number[],
  source: Proposal['source'],
  currentVersion: number,
): Proposal {
  const proposal: Proposal = {
    id: randomUUID(),
    action,
    indices,
    createdAtVersion: currentVersion,
    createdAt: Date.now(),
    source,
  };
  proposals.set(proposal.id, proposal);
  return proposal;
}

export function getProposal(id: string): Proposal | undefined {
  return proposals.get(id);
}

/** One-shot: a confirmed or rejected proposal can never be re-confirmed. */
export function consumeProposal(id: string): void {
  proposals.delete(id);
}
