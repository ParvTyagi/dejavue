import { isOlderThan48h } from '@/lib/evidence/dates';
import type { Signals, Verdict } from '@/lib/shared/types';

export interface Decision {
  verdict: Verdict;
  flags: { recycled: boolean; misplaced: boolean };
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
  const misplaced = signals.locationMismatch;
  const { firstSeen, claim } = signals;

  if (signals.confirmedMatches.length > 0 && firstSeen) {
    const recycled = isOlderThan48h(firstSeen.at, claim.claimedAt) && !claimRefersToOriginal(signals);
    if (recycled) return { verdict: 'RECYCLED', flags: { recycled: true, misplaced } };
    return { verdict: misplaced ? 'MISPLACED' : 'CONSISTENT', flags: { recycled: false, misplaced } };
  }

  // No dated confirmed match: absence of a match is never proof, so only
  // location and news evidence can move the verdict.
  if (misplaced) return { verdict: 'MISPLACED', flags: { recycled: false, misplaced } };
  if (signals.newsCorroborates) return { verdict: 'CONTEXT_PLAUSIBLE', flags: { recycled: false, misplaced } };
  return { verdict: 'UNVERIFIED', flags: { recycled: false, misplaced } };
}
