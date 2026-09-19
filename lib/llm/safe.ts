import { z } from 'zod';
import type { LeakFlags, LeakSignals, LeakVerdict } from '@/lib/leak/types';
import { redactPersonalData } from '@/lib/shared/redact';
import type { Claim, Dossier, Evidence, SceneReading, Signals, Verdict, VerdictFlags } from '@/lib/shared/types';
import { withTimeLimit } from '@/lib/shared/time';
import type { LlmPort, ParseClaimRequest } from './port';

const claimOut = z.object({
  event: z.string().max(200).nullish(),
  place: z.string().max(200).nullish(),
  claimedAt: z.string().datetime({ offset: true }).nullish(),
  refersToPast: z.boolean(),
  referencedYear: z.number().int().min(1900).max(2100).nullish(),
});

const sceneOut = z.object({
  signText: z.array(z.string().max(200)).max(20),
  landmarks: z.array(z.object({ name: z.string().max(200), confidence: z.number().min(0).max(1) })).max(10),
  broadcastLogo: z.string().max(100).nullish(),
  language: z.string().max(50).nullish(),
});

const narrativeOut = z.object({
  summary: z.string().min(1).max(600),
  bullets: z.array(z.object({ text: z.string().min(1).max(300), evidenceIds: z.array(z.string()) })).max(8),
});

export async function parseClaimSafe(llm: LlmPort, req: ParseClaimRequest, timeoutMs: number): Promise<Claim> {
  const fallback: Claim = {
    rawText: req.text,
    place: req.place,
    claimedAt: req.date ?? req.submittedAt,
    claimedAtSource: req.date ? 'user' : 'default_now',
    refersToPast: false,
  };
  try {
    const out = claimOut.parse(await withTimeLimit(timeoutMs, (signal) => llm.parseClaim(req, signal)));
    const claimedAt = req.date ?? out.claimedAt ?? req.submittedAt;
    return {
      rawText: req.text,
      event: out.event ?? undefined,
      // Form fields always win over parsed values.
      place: req.place ?? out.place ?? undefined,
      claimedAt: new Date(claimedAt).toISOString(),
      claimedAtSource: req.date ? 'user' : out.claimedAt ? 'parsed' : 'default_now',
      refersToPast: out.refersToPast,
      referencedYear: out.referencedYear ?? undefined,
    };
  } catch {
    return { ...fallback, claimedAt: new Date(fallback.claimedAt).toISOString() };
  }
}

export async function readSceneSafe(llm: LlmPort, frameUrl: string, timeoutMs: number): Promise<SceneReading | undefined> {
  try {
    const out = sceneOut.parse(await withTimeLimit(timeoutMs, (signal) => llm.readScene(frameUrl, signal)));
    return {
      signText: out.signText,
      landmarks: out.landmarks,
      broadcastLogo: out.broadcastLogo ?? undefined,
      language: out.language ?? undefined,
    };
  } catch {
    return undefined;
  }
}

const VERDICT_WORDS: Record<Verdict, RegExp> = {
  RECYCLED: /\b(genuine|authentic|matches (its|the) claim|new footage)\b/i,
  MISPLACED: /\b(correct location|matches (its|the) claim)\b/i,
  CONSISTENT: /\b(recycled|old (photo|image|video)|misplaced|fake)\b/i,
  CONTEXT_PLAUSIBLE: /\b(recycled|confirmed authentic|proven)\b/i,
  UNVERIFIED: /\b(recycled|confirmed|proven|authentic)\b/i,
};

type Narrative = Dossier['narrative'];

export async function narrateSafe(
  llm: LlmPort,
  verdict: Verdict,
  flags: VerdictFlags,
  signals: Signals,
  evidence: Evidence[],
  timeoutMs: number,
): Promise<Narrative> {
  const top = [...signals.confirmedMatches, ...evidence.filter((e) => !e.match?.confirmed)].slice(0, 6);
  const known = new Set(evidence.map((e) => e.id));
  try {
    const { confirmedMatches: _omit, ...rest } = signals;
    const request = {
      verdict,
      flags,
      signals: rest,
      evidence: top.map(({ id, engine, domain, title, publishedAt, url }) => ({ id, engine, domain, title, publishedAt, url })),
    };
    const out = narrativeOut.parse(await withTimeLimit(timeoutMs, (signal) => llm.narrate(request, signal)));
    // Bullets citing unknown evidence are dropped, which blocks invented sources.
    const bullets = out.bullets.filter((b) => b.evidenceIds.length > 0 && b.evidenceIds.every((id) => known.has(id)));
    const text = [out.summary, ...bullets.map((b) => b.text)].join(' ');
    if (VERDICT_WORDS[verdict].test(text)) return templateNarrative(verdict, signals, flags);
    return { summary: out.summary, bullets, source: 'llm' };
  } catch {
    return templateNarrative(verdict, signals, flags);
  }
}

const isoDay = (iso: string) => new Date(iso).toISOString().slice(0, 10);

export function templateNarrative(verdict: Verdict, s: Signals, flags: VerdictFlags): Narrative {
  const bullets: Narrative['bullets'] = [];
  const first = s.firstSeen && s.confirmedMatches.find((e) => e.id === s.firstSeen!.evidenceId);
  // An older copy that the claim said nothing about: a fact to report, not a contradiction.
  // `predatesClaim` alone is not enough, since a claim can openly be about the older event.
  const unclaimedOlderCopy = flags.predatesClaim && !flags.recycled && s.claim.claimedAtSource === 'default_now';
  if (first && s.firstSeen) {
    // With no claimed date there is no gap to report, so the date is stated on its own.
    bullets.push({
      text: unclaimedOlderCopy
        ? `Earliest confirmed copy: ${first.domain} on ${isoDay(s.firstSeen.at)}. No date was claimed for this media, so it is not treated as recycled.`
        : `Earliest confirmed copy: ${first.domain} on ${isoDay(s.firstSeen.at)}, ${s.deltaTDays} days before the claimed date.`,
      evidenceIds: [first.id],
    });
  }
  if (s.confirmedMatches.length) {
    bullets.push({
      text: `${s.confirmedMatches.length} search result(s) were confirmed to show the same image.`,
      evidenceIds: s.confirmedMatches.slice(0, 3).map((e) => e.id),
    });
  }
  const summaries: Record<Verdict, string> = {
    RECYCLED: 'This media was published before the event it is being shared as.',
    MISPLACED: `This media appears to be from ${s.sceneGeo?.label ?? 'a different place'}, not ${s.claimGeo?.label ?? 'the claimed location'}.`,
    CONSISTENT: 'The earliest copies found match the claimed time and place.',
    CONTEXT_PLAUSIBLE: 'The claimed event is covered by news reports, but no earlier copy of this media was found to prove where it came from.',
    UNVERIFIED: 'Not enough evidence was found to confirm or reject this claim. That does not mean it is authentic.',
  };
  if (s.deltaSKm !== undefined && s.claimGeo && s.sceneGeo) {
    bullets.push({
      text: `The scene resolves to ${s.sceneGeo.label}, ${Math.round(s.deltaSKm)} km from ${s.claimGeo.label}.`,
      evidenceIds: [],
    });
  }
  // "Not enough evidence" would be wrong when an older copy was actually found.
  const summary =
    unclaimedOlderCopy && s.firstSeen
      ? `This media was already online on ${isoDay(s.firstSeen.at)}. Nothing was claimed about its date, so that is a fact about the media, not a contradiction of the post.`
      : summaries[verdict];
  return { summary, bullets, source: 'template' };
}

// --- Leak traces -------------------------------------------------------------
//
// A leak trace can say where and when public copies appeared. It can never say who
// leaked anything: the earliest copy found is usually a repost of something first
// shared in a closed channel, and search engines cannot see closed channels at all.

/**
 * Any narrative that points at a person or an account, however it is phrased. The model
 * is told not to, and a snippet full of names can still push it there, so the output is
 * checked rather than trusted: a hit means the deterministic template is used instead.
 */
export const NAMES_A_LEAKER =
  /\b(leaked|shared|posted|uploaded|sent|sold)\s+(?:it\s+)?by\b|\bthe\s+(leaker|whistleblower|culprit|insider|mole)\b|\bwho\s+leaked\b|\bsource\s+(?:of\s+the\s+leak\s+)?(?:is|was)\b|\bresponsible\s+for\s+the\s+leak\b|\bblame[ds]?\b|@[a-z0-9_]{3,}/i;

/** Words that would contradict a leak verdict, the same guard media narration uses. */
const LEAK_VERDICT_WORDS: Record<LeakVerdict, RegExp> = {
  LEAK_RECYCLED: /\b(new leak|first time|never been (public|online)|fresh leak)\b/i,
  LEAK_EARLIEST_FOUND: /\b(original source|the origin of|proves|where it came from|first shared)\b/i,
  LEAK_NOT_FOUND: /\b(never leaked|not leaked|proves|confirmed|was leaked on)\b/i,
};

export async function narrateLeakSafe(
  llm: LlmPort,
  verdict: LeakVerdict,
  flags: LeakFlags,
  signals: LeakSignals,
  evidence: Evidence[],
  timeoutMs: number,
): Promise<Narrative> {
  const top = [...signals.confirmedMatches, ...evidence.filter((e) => !e.match?.confirmed)].slice(0, 6);
  const known = new Set(evidence.map((e) => e.id));
  try {
    const { confirmedMatches: _omit, ...rest } = signals;
    const request = {
      verdict,
      flags,
      signals: rest,
      evidence: top.map(({ id, engine, domain, title, publishedAt, url }) => ({ id, engine, domain, title, publishedAt, url })),
      guidance:
        'Never name, quote or hint at any person or account as the source of the leak, and never call anything "the original". ' +
        'Say only where and when public copies appeared, and that earlier copies may exist where search engines cannot look.',
    };
    const out = narrativeOut.parse(await withTimeLimit(timeoutMs, (signal) => llm.narrate(request, signal)));
    // Bullets citing unknown evidence are dropped, which blocks invented sources.
    const kept = out.bullets.filter((b) => b.evidenceIds.length > 0 && b.evidenceIds.every((id) => known.has(id)));
    // Personal data goes first: an email address in the text reads as an account handle to
    // the guard below, and a leak narrative should not be carrying one either way.
    const summary = redactPersonalData(out.summary);
    const bullets = kept.map((b) => ({ ...b, text: redactPersonalData(b.text) }));
    const text = [summary, ...bullets.map((b) => b.text)].join(' ');
    if (NAMES_A_LEAKER.test(text) || LEAK_VERDICT_WORDS[verdict].test(text)) return templateLeakNarrative(verdict, signals, flags);
    return { summary, bullets, source: 'llm' };
  } catch {
    return templateLeakNarrative(verdict, signals, flags);
  }
}

/** The deterministic explanation, used whenever the model's is missing or discarded. */
export function templateLeakNarrative(verdict: LeakVerdict, s: LeakSignals, flags: LeakFlags): Narrative {
  const bullets: Narrative['bullets'] = [];
  const earliest = s.firstSeen && s.confirmedMatches.find((e) => e.id === s.firstSeen!.evidenceId);
  const copies = s.confirmedMatches.length;
  const { entries, undated } = s.timeline;

  if (earliest && s.firstSeen) {
    bullets.push({
      text: `Earliest public copy found: ${earliest.domain} on ${isoDay(s.firstSeen.at)}. That is where a copy was found, not where it came from.`,
      evidenceIds: [earliest.id],
    });
  }
  if (copies > 0) {
    bullets.push({
      text: `${copies} public ${copies === 1 ? 'copy was' : 'copies were'} confirmed to be the same image.`,
      evidenceIds: s.confirmedMatches.slice(0, 3).map((e) => e.id),
    });
  }
  if (entries.length >= 2) {
    bullets.push({
      text: `Dated copies run from ${isoDay(entries[0].at)} to ${isoDay(entries[entries.length - 1].at)}, across ${new Set(entries.map((e) => e.domain)).size} sites.`,
      evidenceIds: entries.slice(0, 3).map((e) => e.evidenceId),
    });
  }
  if (undated.length > 0) {
    bullets.push({
      text: `${undated.length} copy or copies carry no usable date, so they are listed apart from the timeline rather than placed on it.`,
      evidenceIds: undated.slice(0, 3).map((u) => u.evidenceId),
    });
  }

  const summaries: Record<LeakVerdict, string> = {
    LEAK_RECYCLED: s.firstSeen
      ? `This document was already public on ${isoDay(s.firstSeen.at)}, ${s.deltaTDays} days before the date this post claims. It is an old leak being shared as new.`
      : 'This document was already public before the date this post claims.',
    LEAK_EARLIEST_FOUND: s.firstSeen
      ? `The earliest public copy found appeared on ${isoDay(s.firstSeen.at)}. Earlier copies may exist in places search engines cannot see.`
      : 'Public copies were found, but none of them could be dated.',
    LEAK_NOT_FOUND: flags.undatedOnly
      ? `${copies} public copy or copies were found, but none carried a date, so there is no timeline to show. That is not evidence about when or whether this leaked.`
      : 'No public copy of this image was found. Search engines do not index private groups, Telegram, paste sites or dark web forums, so this says nothing about whether or how widely it leaked.',
  };
  // An unclaimed date means the older copy contradicts nothing, so it is stated as a fact.
  const summary =
    verdict === 'LEAK_EARLIEST_FOUND' && flags.predatesClaim && s.claim.claimedAtSource === 'default_now' && s.firstSeen
      ? `A public copy of this document was already online on ${isoDay(s.firstSeen.at)}. No date was claimed for it, so that is a fact about the document, not a contradiction of the post.`
      : summaries[verdict];
  return { summary, bullets, source: 'template' };
}
