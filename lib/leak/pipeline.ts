import { computeFirstSeen, deltaTDays } from '@/lib/evidence/dates';
import { confirmMatches } from '@/lib/evidence/verifyMatch';
import { narrateLeakSafe, parseClaimSafe, readSceneSafe } from '@/lib/llm/safe';
import { AuditError, type AuditDeps } from '@/lib/orchestrator/pipeline';
import { AuditBudget, SerpError, timedOut, type SearchResult } from '@/lib/serp/client';
import * as engines from '@/lib/serp/engines';
import { toEvidence } from '@/lib/serp/normalize';
import { redactPersonalData } from '@/lib/shared/redact';
import type { Claim, Emit, EngineId, Evidence, SceneReading, SkipReason } from '@/lib/shared/types';
import { untilAborted } from '@/lib/shared/time';
import { TTL } from '@/lib/store/types';
import { compareCopies, type FullImageFetcher } from './originals';
import { scrubQuery } from './query';
import { decideLeak } from './rules';
import { scoreLeak } from './score';
import { buildSpreadTimeline, toTimelineEntry } from './timeline';
import { LEAK_ADVICE, LEAK_LIMITATIONS, type LeakDossier, type LeakInput, type LeakSignals, type OriginHint } from './types';

export interface LeakDeps
  extends Pick<
    AuditDeps,
    | 'serp'
    | 'llm'
    | 'hashThumbnail'
    | 'store'
    | 'clock'
    | 'wallClock'
    | 'newId'
    | 'sign'
    | 'trustedDomains'
    | 'caseId'
    | 'useMediaCache'
    | 'timeouts'
  > {
  fetchOriginal: FullImageFetcher;
}

const ID_PREFIX: Partial<Record<EngineId, string>> = {
  google_lens: 'lens',
  bing_reverse_image: 'bing',
  yandex_images: 'yandex',
  google: 'web',
};

/** Engines that search by the image itself, so their results can be reused from the media cache. */
const IMAGE_ENGINES: EngineId[] = ['google_lens', 'bing_reverse_image', 'yandex_images'];
/** At most this many searches spent putting a date on copies that arrived without one. */
const MAX_DATING_SEARCHES = 2;
/** Snippets of text read from the document, kept only as a record of what was worked from. */
const MAX_SNIPPETS = 3;
const SNIPPET_CHARS = 80;

/**
 * Traces where and when public copies of a leaked document appeared.
 *
 * Unlike a media audit, this one never stops early once the evidence is decisive: the
 * spread of copies *is* the answer here, so every reverse-image index the budget allows
 * is searched. Nothing derived from the document's own text is ever sent to a search
 * engine, and no branch of this pipeline can produce a statement about a person.
 */
export async function runLeakTrace(input: LeakInput, emit: Emit, deps: LeakDeps): Promise<LeakDossier> {
  const auditMs = deps.timeouts?.auditMs ?? 25_000;
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), auditMs);
  try {
    return await traceWithinDeadline(input, emit, deps, deadline.signal, auditMs);
  } finally {
    clearTimeout(timer);
  }
}

async function traceWithinDeadline(
  input: LeakInput,
  emit: Emit,
  deps: LeakDeps,
  auditSignal: AbortSignal,
  auditMs: number,
): Promise<LeakDossier> {
  const startedMs = performance.now();
  const remainingMs = () => Math.max(0, auditMs - (performance.now() - startedMs));
  const llmMs = () => Math.min(deps.timeouts?.llmMs ?? 8_000, remainingMs());
  const id = deps.newId();
  const budget = new AuditBudget(input.maxCredits);
  const used = new Set<EngineId>();
  const failed = new Set<EngineId>();
  const skipped = new Map<EngineId, SkipReason>();
  const skip = (engine: EngineId, reason: SkipReason) => {
    if (!skipped.has(engine)) skipped.set(engine, reason);
  };
  const evidence: Evidence[] = [];
  const stepsRun: number[] = [];
  let partial = false;
  /** Set when SerpApi refuses further searches (rate limit or credits exhausted). */
  let halt: SerpError | undefined;

  const frames = input.media.frames
    .map((frame, index) => ({ ...frame, index }))
    .sort((a, b) => b.sharpness - a.sharpness);
  const inputHashes = frames.map((f) => f.pHash);
  const sharpest = frames[0];

  const call = async (req: engines.EngineRequest, signal = auditSignal): Promise<SearchResult | undefined> => {
    if (halt || auditSignal.aborted) {
      partial = true;
      skip(req.engine, halt ? 'halted' : 'deadline');
      return undefined;
    }
    try {
      const search = deps.serp(req.engine, req.params, {
        auditId: id,
        budget,
        caseId: deps.caseId,
        frameIndex: req.frameIndex,
        onCredit: (data) => emit({ type: 'credit', data }),
        signal,
      });
      const res = await untilAborted(search, signal, () => timedOut(req.engine));
      used.add(req.engine);
      return res;
    } catch (err) {
      const e = err instanceof SerpError ? err : new SerpError('UPSTREAM_FAILED', req.engine, String(err));
      if (e.code === 'BUDGET_EXCEEDED') {
        skip(req.engine, 'budget');
      } else {
        failed.add(req.engine);
        if (e.code === 'RATE_LIMITED' || e.code === 'CREDITS_EXHAUSTED') {
          halt = e;
          partial = true;
        }
        if (auditSignal.aborted) partial = true;
      }
      emit({ type: 'error', data: { code: e.code, message: e.message, recoverable: true } });
      return undefined;
    }
  };

  /** Streams a copy onto the timeline the moment it is confirmed and carries a date. */
  const streamTimeline = (ev: Evidence) => {
    const entry = toTimelineEntry(ev, deps.clock());
    if (ev.match?.confirmed && entry) emit({ type: 'timeline', data: entry });
  };

  const collect = async (req: engines.EngineRequest, res: SearchResult, idPrefix?: string) => {
    // Two dating searches both run on `google`, so each is given its own prefix; without
    // one they would both number their results from web-0 and collide.
    const prefix = idPrefix ?? `${ID_PREFIX[req.engine] ?? req.engine}${req.frameIndex ?? ''}`;
    const items = toEvidence(req.engine, res.raw, {
      fetchedAt: res.fetchedAt,
      trustedDomains: deps.trustedDomains,
      idPrefix: prefix,
    });
    const checked = await confirmMatches(items, inputHashes, deps.hashThumbnail);
    for (const ev of checked) {
      evidence.push(ev);
      emit({ type: 'evidence', data: ev });
      streamTimeline(ev);
    }
    return checked;
  };

  const confirmed = () => evidence.filter((e) => e.match?.confirmed);

  // Step 0: the claim and what the document says. No searches, and nothing read from the
  // document is searched either — see lib/leak/query.ts for why.
  emit({ type: 'stage', data: { stage: 'trace' } });
  const claimParsed: Promise<Claim> = parseClaimSafe(
    deps.llm,
    { text: input.claim.text, date: input.claim.date, submittedAt: deps.clock().toISOString() },
    llmMs(),
  );
  const sceneRead = (async () => {
    const hit = deps.useMediaCache ? await deps.store.findMedia(inputHashes) : undefined;
    return { hit, reading: hit?.scene ?? (await readSceneSafe(deps.llm, sharpest.url, llmMs())) };
  })();
  const [claim, { hit: cached, reading }] = await Promise.all([claimParsed, sceneRead]);
  const scene: SceneReading | undefined = reading;
  // Short and redacted: enough to show what the audit worked from, never a copy of the leak.
  const redactedSnippets = (scene?.signText ?? [])
    .map((text) => redactPersonalData(text).trim().slice(0, SNIPPET_CHARS))
    .filter(Boolean)
    .slice(0, MAX_SNIPPETS);

  const fromCache = new Set(cached?.engines ?? []);
  if (cached) {
    for (const ev of structuredClone(cached.evidence)) {
      evidence.push(ev);
      emit({ type: 'evidence', data: ev });
      streamTimeline(ev);
    }
  }

  // Step 1: public copies, from every reverse-image index the budget allows.
  emit({ type: 'stage', data: { stage: 'copies' } });
  stepsRun.push(1);
  if (!fromCache.has('google_lens')) {
    const lensReq = engines.lensExact(sharpest.url, sharpest.index);
    const lens = await call(lensReq);
    if (lens) {
      await collect(lensReq, lens);
      // Other keyframes are only worth a search while nothing has matched at all.
      for (const frame of frames.slice(1)) {
        if (confirmed().length > 0) break;
        const req = engines.lensExact(frame.url, frame.index);
        const res = await call(req);
        if (res) await collect(req, res);
      }
    }
  }
  for (const req of [engines.bingReverse(sharpest.url, sharpest.index), engines.yandexByUrl(sharpest.url, sharpest.index)]) {
    if (fromCache.has(req.engine) || used.has(req.engine) || failed.has(req.engine)) continue;
    const res = await call(req);
    if (res) await collect(req, res);
  }
  if (!IMAGE_ENGINES.some((e) => used.has(e) || fromCache.has(e))) {
    if (halt) {
      throw new AuditError(halt.code as 'RATE_LIMITED' | 'CREDITS_EXHAUSTED', `SerpApi refused the search: ${halt.message}`);
    }
    if (auditSignal.aborted) throw new AuditError('TIMED_OUT', 'The reverse image searches timed out; no trace is possible.');
    throw new AuditError('UPSTREAM_FAILED', 'Every reverse image search failed; no trace is possible.');
  }

  // Step 2: put a date on copies that arrived without one. The query is the search
  // result's own page title, which is already public, and it is scrubbed even so.
  const undated = confirmed().filter((e) => !e.publishedAt && e.title);
  if (undated.length > 0) {
    emit({ type: 'stage', data: { stage: 'dates' } });
    stepsRun.push(2);
    const wanted = undated.slice(0, MAX_DATING_SEARCHES);
    const affordable = wanted.slice(0, Math.max(0, budget.remaining));
    for (const _ of wanted.slice(affordable.length)) {
      skip('google', 'budget');
      emit({
        type: 'error',
        data: { code: 'BUDGET_EXCEEDED', message: 'Skipped google: audit credit cap reached', recoverable: true },
      });
    }
    for (const [i, copy] of affordable.entries()) {
      // A title that is nothing but personal data leaves no query worth sending, and the
      // copy simply stays undated rather than being searched for as it was written.
      const query = scrubQuery(copy.title!);
      if (!query) continue;
      const req = engines.datedSearch(query, claim.claimedAt);
      const res = await call(req);
      if (!res) continue;
      const found = await collect(req, res, `date${i}`);
      const sameSite = found.find((e) => e.domain === copy.domain && e.publishedAt);
      if (sameSite) {
        copy.publishedAt = sameSite.publishedAt;
        copy.dateTrust = sameSite.dateTrust;
        streamTimeline(copy);
      }
    }
  }

  // Step 3: compare the full-size copies. These are image downloads, not searches, so
  // they spend no credits — but they are counted, and every skip is recorded.
  let origin: OriginHint = { ranked: [], fetched: 0, skipped: [] };
  const confirmedMatches = confirmed();
  if (confirmedMatches.length > 0) {
    emit({ type: 'stage', data: { stage: 'origin' } });
    stepsRun.push(3);
    origin = await compareCopies(confirmedMatches, {
      fetchOriginal: deps.fetchOriginal,
      timeoutMs: Math.min(deps.timeouts?.originalMs ?? 5_000, remainingMs()),
      signal: auditSignal,
    });
  }

  // Reverse-image evidence is cached for later checks of the same image, exactly as media
  // audits do. The scene reading is deliberately not: it is the text of somebody's leaked
  // document, and it has no business outliving this audit.
  const imageEngines = IMAGE_ENGINES.filter((e) => fromCache.has(e) || used.has(e));
  const searchedNewImageEngine = imageEngines.some((e) => !fromCache.has(e));
  const imageSearchFailed = IMAGE_ENGINES.some((e) => failed.has(e));
  if (deps.useMediaCache && searchedNewImageEngine && !partial && !imageSearchFailed) {
    await deps.store.putMedia(
      {
        pHash: cached?.pHash ?? sharpest.pHash,
        engines: imageEngines,
        evidence: evidence.filter((e) => IMAGE_ENGINES.includes(e.engine)),
        createdAt: deps.clock().toISOString(),
      },
      TTL.mediaMs,
    );
  }

  // Judge.
  emit({ type: 'stage', data: { stage: 'judge' } });
  const { firstSeen, dateSpreadDays } = computeFirstSeen(confirmedMatches, deps.clock());
  const signals: LeakSignals = {
    claim,
    claimedSource: input.claim.source,
    confirmedMatches,
    firstSeen,
    deltaTDays: firstSeen ? deltaTDays(claim.claimedAt, firstSeen.at) : undefined,
    timeline: buildSpreadTimeline(confirmedMatches, deps.clock(), firstSeen),
    dateSpreadDays,
    enginesUsed: [...used],
    enginesFailed: [...failed],
    enginesSkipped: [...skipped].filter(([engine]) => !used.has(engine)).map(([engine, reason]) => ({ engine, reason })),
  };
  emit({ type: 'signal', data: { firstSeen: signals.firstSeen, deltaTDays: signals.deltaTDays } });

  const { verdict, flags } = decideLeak(signals);
  const confidence = scoreLeak(signals, verdict);

  emit({ type: 'stage', data: { stage: 'narrate' } });
  const narrative = await narrateLeakSafe(deps.llm, verdict, flags, signals, evidence, llmMs());

  const unsigned: Omit<LeakDossier, 'signature'> = {
    kind: 'leak',
    id,
    verdict,
    flags,
    confidence,
    signals,
    evidence,
    scene: { redactedSnippets },
    origin,
    narrative,
    advice: LEAK_ADVICE[verdict],
    metrics: {
      totalMs: Math.round(performance.now() - startedMs),
      credits: budget.used,
      maxCredits: budget.max,
      cacheHit: !!cached,
      stepsRun,
      partial,
    },
    limitations: LEAK_LIMITATIONS,
    createdAt: deps.wallClock().toISOString(),
  };
  const dossier: LeakDossier = { ...unsigned, signature: deps.sign(unsigned) };
  await deps.store.putAudit(dossier, TTL.auditMs);
  emit({ type: 'dossier', data: dossier });
  return dossier;
}
