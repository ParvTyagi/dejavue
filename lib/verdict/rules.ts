import { isOlderThan48h } from '@/lib/evidence/dates';
import type { Signals, Verdict, VerdictFlags } from '@/lib/shared/types';

export interface Decision {
  verdict: Verdict;
  flags: VerdictFlags;
}

/** The claim openly refers to the earlier event, e.g. "remembering the 2022 fire". */
function claimRefersToOriginal(signals: Signals): boolean {
  const { claim, firstSeen } = signals;
  if (!claim.refersToPast || !firstSeen) return false;
  if (claim.referencedYear === undefined) return true;
  const originalYear = new Date(Date.parse(firstSeen.at) + 7 * 86_400_000).getUTCFullYear();
  return claim.referencedYear <= originalYear;
}

/** Pure verdict rules over confirmed evidence. The LLM never influences this. */
export function decide(signals: Signals): Decision {
  const misplaced = signals.location === 'mismatch';
  const { firstSeen, claim } = signals;
  const recycled =
    signals.confirmedMatches.length > 0 &&
    !!firstSeen &&
    isOlderThan48h(firstSeen.at, claim.claimedAt) &&
    !claimRefersToOriginal(signals);
  const flags: VerdictFlags = { recycled, misplaced };

  if (recycled) return { verdict: 'RECYCLED', flags };
  if (misplaced) return { verdict: 'MISPLACED', flags };
  // Recent confirmed copies only confirm the claim when the location was checked and agrees.
  if (signals.confirmedMatches.length > 0 && firstSeen && signals.location === 'agrees') return { verdict: 'CONSISTENT', flags };
  // Otherwise absence of evidence is never proof: only news can move the verdict.
  if (signals.newsCorroborates) return { verdict: 'CONTEXT_PLAUSIBLE', flags };
  return { verdict: 'UNVERIFIED', flags };
}
