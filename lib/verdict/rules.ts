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
    if (misplaced) return { verdict: 'MISPLACED', flags: { recycled: false, misplaced } };
    if (signals.locationAgrees) return { verdict: 'CONSISTENT', flags: { recycled: false, misplaced } };
    // Recent copies exist but the location could not be checked, so the claim
    // is not confirmed: fall through to the news check.
  }

  // No dated confirmed match (or an unchecked location): absence of evidence is
  // never proof, so only location and news evidence can move the verdict.
  if (misplaced) return { verdict: 'MISPLACED', flags: { recycled: false, misplaced } };
  if (signals.newsCorroborates) return { verdict: 'CONTEXT_PLAUSIBLE', flags: { recycled: false, misplaced } };
  return { verdict: 'UNVERIFIED', flags: { recycled: false, misplaced } };
}
