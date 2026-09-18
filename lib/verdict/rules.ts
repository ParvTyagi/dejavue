import { isOlderThan48h } from '@/lib/evidence/dates';
import type { Claim, Signals, Verdict, VerdictFlags } from '@/lib/shared/types';

export interface Decision {
  verdict: Verdict;
  flags: VerdictFlags;
}

/**
 * Words that put a claim in the present, matched against the raw text the user
 * typed. Deterministic on purpose: when no date was given, this — not the
 * language model — is what decides whether the claim asserts recency at all.
 * Hinglish is included because most of the messages DejaVue is aimed at are.
 */
const ASSERTS_RECENCY =
  /\b(today|tonight|now|just\s+(now|in|happened)|breaking|currently|live|this\s+(morning|afternoon|evening|week)|yesterday|latest|moments?\s+ago|happening|aaj|abhi|turant)\b/i;

/**
 * Cues that a claim is openly about an older event. `refersToPast` is the
 * language model's judgement, so it only counts when the text the user actually
 * typed backs it up: a bare hallucinated boolean must not be able to clear a
 * recycled photo.
 */
const REFERS_TO_PAST = /\b(anniversary|remember(ing)?|throwback|flashback|years?\s+ago|back\s+in|archive|memories|on\s+this\s+day|\d{4})\b/i;

/** Whether the claim says anything at all about when the media is from. */
export function claimAssertsDate(claim: Claim): boolean {
  return claim.claimedAtSource !== 'default_now' || ASSERTS_RECENCY.test(claim.rawText);
}

/** The claim openly refers to the earlier event, e.g. "remembering the 2022 fire". */
function claimRefersToOriginal(signals: Signals): boolean {
  const { claim, firstSeen } = signals;
  if (!claim.refersToPast || !firstSeen) return false;
  // The model said so; the text has to show it too.
  if (!REFERS_TO_PAST.test(claim.rawText)) return false;
  if (claim.referencedYear === undefined) return true;
  const originalYear = new Date(Date.parse(firstSeen.at) + 7 * 86_400_000).getUTCFullYear();
  return claim.referencedYear <= originalYear;
}

/** Pure verdict rules over confirmed evidence. The LLM never influences this. */
export function decide(signals: Signals): Decision {
  const misplaced = signals.location === 'mismatch';
  const { firstSeen, claim } = signals;
  // A confirmed copy that predates the claimed date by more than 48 h.
  const predatesClaim =
    signals.confirmedMatches.length > 0 &&
    !!firstSeen &&
    isOlderThan48h(firstSeen.at, claim.claimedAt) &&
    !claimRefersToOriginal(signals);
  // Calling media "recycled" is an accusation, so it needs a claim to contradict.
  // With no date given and nothing in the text asserting recency, the claimed date
  // is only our own "now" default: the earlier copy is reported as a fact instead.
  const recycled = predatesClaim && claimAssertsDate(claim);
  const flags: VerdictFlags = { recycled, misplaced, predatesClaim };

  if (recycled) return { verdict: 'RECYCLED', flags };
  if (misplaced) return { verdict: 'MISPLACED', flags };
  // Recent confirmed copies only confirm the claim when the location was checked and agrees.
  if (!predatesClaim && signals.confirmedMatches.length > 0 && firstSeen && signals.location === 'agrees') {
    return { verdict: 'CONSISTENT', flags };
  }
  // Otherwise absence of evidence is never proof: only news can move the verdict.
  if (!predatesClaim && signals.newsCorroborates) return { verdict: 'CONTEXT_PLAUSIBLE', flags };
  return { verdict: 'UNVERIFIED', flags };
}
