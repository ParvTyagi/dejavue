import { z } from 'zod';
import type { Claim, Dossier, Evidence, SceneReading, Signals, Verdict } from '@/lib/shared/types';
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

/** Runs an LLM call with a time limit, cancelling it when the limit passes. */
function withinTime<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  if (ms <= 0) return Promise.reject(new Error('No time left for the LLM call'));
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`LLM call timed out after ${ms} ms`));
    }, ms);
  });
  return Promise.race([run(controller.signal), timeout]).finally(() => clearTimeout(timer));
}

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
    const out = claimOut.parse(await withinTime(timeoutMs, (signal) => llm.parseClaim(req, signal)));
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
    const out = sceneOut.parse(await withinTime(timeoutMs, (signal) => llm.readScene(frameUrl, signal)));
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
  flags: Dossier['flags'],
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
    const out = narrativeOut.parse(await withinTime(timeoutMs, (signal) => llm.narrate(request, signal)));
    // Bullets citing unknown evidence are dropped, which blocks invented sources.
    const bullets = out.bullets.filter((b) => b.evidenceIds.length > 0 && b.evidenceIds.every((id) => known.has(id)));
    const text = [out.summary, ...bullets.map((b) => b.text)].join(' ');
    if (VERDICT_WORDS[verdict].test(text)) return templateNarrative(verdict, signals);
    return { summary: out.summary, bullets, source: 'llm' };
  } catch {
    return templateNarrative(verdict, signals);
  }
}

const fmtDate = (iso: string) => new Date(iso).toISOString().slice(0, 10);

export function templateNarrative(verdict: Verdict, s: Signals): Narrative {
  const bullets: Narrative['bullets'] = [];
  const first = s.firstSeen && s.confirmedMatches.find((e) => e.id === s.firstSeen!.evidenceId);
  if (first && s.firstSeen) {
    bullets.push({
      text: `Earliest confirmed copy: ${first.domain} on ${fmtDate(s.firstSeen.at)}, ${s.deltaTDays} days before the claimed date.`,
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
  return { summary: summaries[verdict], bullets, source: 'template' };
}
