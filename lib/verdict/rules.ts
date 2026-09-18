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
 * The same words in the scripts they are actually forwarded in. `\b` is defined on
 * [A-Za-z0-9_], so it never matches beside a Devanagari or Bengali letter and these
 * cannot share the regex above.
 */
const ASSERTS_RECENCY_INDIC = /(आज|अभी|तुरंत|ताज़ा|ताजा|इस\s*समय|এখন|আজ|এইমাত্র)/;

/**
 * Cues that a claim is openly about an older event. `refersToPast` is the
 * language model's judgement, so it only counts when the text the user actually
 * typed backs it up: a bare hallucinated boolean must not be able to clear a
 * recycled photo.
 *
 * A bare four-digit number is deliberately NOT a cue. "2000 houses washed away"
 * and "Rs 2500 relief" are not references to an older event, and treating them as
 * one handed the model back the veto this check exists to take away. A year only
 * counts through `referencedYear`, and only when it is written in the text.
 */
const REFERS_TO_PAST = /\b(anniversary|remember(ing)?|throwback|flashback|years?\s+ago|back\s+in|archive|memories|on\s+this\s+day)\b/i;

/** Whether the claim says anything at all about when the media is from. */
export function claimAssertsDate(claim: Claim): boolean {
  if (claim.claimedAtSource !== 'default_now') return true;
  return ASSERTS_RECENCY.test(claim.rawText) || ASSERTS_RECENCY_INDIC.test(claim.rawText);
}

/** The claim openly refers to the earlier event, e.g. "remembering the 2022 fire". */
export function claimRefersToOriginal(signals: Signals): boolean {
  const { claim, firstSeen } = signals;
  if (!claim.refersToPast || !firstSeen) return false;
  // A claim that puts the media in the present is not also a claim about an older
  // event, whatever the model says about it.
  if (ASSERTS_RECENCY.test(claim.rawText) || ASSERTS_RECENCY_INDIC.test(claim.rawText)) return false;
  const year = claim.referencedYear;
  // The model said so; the text has to show it too, as a past-reference word or as
  // the very year the model says is referenced.
  const yearInText = year !== undefined && new RegExp(`\\b${year}\\b`).test(claim.rawText);
  if (!REFERS_TO_PAST.test(claim.rawText) && !yearInText) return false;
  if (year === undefined) return true;
  const originalYear = new Date(Date.parse(firstSeen.at) + 7 * 86_400_000).getUTCFullYear();
  return year <= originalYear;
}

/** Pure verdict rules over confirmed evidence. The LLM never influences this. */
export function decide(signals: Signals): Decision {
  const misplaced = signals.location === 'mismatch';
  const { firstSeen, claim } = signals;
  // Purely a fact about the evidence: a confirmed copy is more than 48 h older than
  // the claimed date. Nothing the model returns can suppress it, so the finding
  // survives even when the claim turns out to account for it.
  const predatesClaim =
    signals.confirmedMatches.length > 0 && !!firstSeen && isOlderThan48h(firstSeen.at, claim.claimedAt);
  // Whether that fact actually contradicts the post. A claim that openly refers to
  // the older event ("remembering the 2019 floods") is not contradicted by it.
  const contradicts = predatesClaim && !claimRefersToOriginal(signals);
  // Calling media "recycled" is an accusation, so it needs a claim to contradict.
  // With no date given and nothing in the text asserting recency, the claimed date
  // is only our own "now" default: the earlier copy is reported as a fact instead.
  const recycled = contradicts && claimAssertsDate(claim);
  const flags: VerdictFlags = { recycled, misplaced, predatesClaim };

  if (recycled) return { verdict: 'RECYCLED', flags };
  if (misplaced) return { verdict: 'MISPLACED', flags };
  // Recent confirmed copies only confirm the claim when the location was checked and agrees.
  if (!contradicts && signals.confirmedMatches.length > 0 && firstSeen && signals.location === 'agrees') {
    return { verdict: 'CONSISTENT', flags };
  }
  // Otherwise absence of evidence is never proof: only news can move the verdict.
  if (!contradicts && signals.newsCorroborates) return { verdict: 'CONTEXT_PLAUSIBLE', flags };
  return { verdict: 'UNVERIFIED', flags };
}
