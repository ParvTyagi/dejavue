import { isOlderThan48h } from '@/lib/evidence/dates';
import { claimAssertsDate, claimRefersToOriginal } from '@/lib/verdict/rules';
import type { LeakFlags, LeakSignals, LeakVerdict } from './types';

export interface LeakDecision {
  verdict: LeakVerdict;
  flags: LeakFlags;
}

/**
 * Pure verdict rules over confirmed evidence, next to decide() for media audits. The
 * language model never influences this, and neither does the closest-to-original
 * ranking: how large or how compressed a copy is says nothing about when it appeared.
 *
 * No branch here can conclude anything about a person. The strongest thing it says is
 * that a public copy existed before the claimed date.
 */
export function decideLeak(s: LeakSignals): LeakDecision {
  const { claim, firstSeen } = s;
  const copiesFound = s.confirmedMatches.length > 0;
  // Purely a fact about the evidence: the corroborated earliest public copy is more
  // than 48 h older than the claimed date.
  const predatesClaim = copiesFound && !!firstSeen && isOlderThan48h(firstSeen.at, claim.claimedAt);
  // Whether that fact actually contradicts the post. A post that openly refers to the
  // earlier leak ("the 2023 payroll dump doing the rounds again") is not contradicted by it.
  const contradicts = predatesClaim && !claimRefersToOriginal(s);
  // "Old leak, shared as new" is an accusation about the post, so it needs a claim to
  // contradict. With no date given and nothing in the text asserting recency, the
  // claimed date is only our own "now" default, and the older copy is reported as a fact.
  const recycled = contradicts && claimAssertsDate(claim);
  // Copies that exist but cannot be dated: there is no T₀, so there is no timeline either.
  const undatedOnly = copiesFound && !firstSeen;
  const flags: LeakFlags = { predatesClaim, recycled, copiesFound, undatedOnly };

  if (recycled) return { verdict: 'LEAK_RECYCLED', flags };
  // Any other corroborated T₀ is reported as what it is: the earliest copy we could
  // find in public, which is not a claim about where the document came from.
  if (firstSeen) return { verdict: 'LEAK_EARLIEST_FOUND', flags };
  return { verdict: 'LEAK_NOT_FOUND', flags };
}
