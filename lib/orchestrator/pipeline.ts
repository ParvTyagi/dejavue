import { computeFirstSeen, deltaTDays, isOlderThan48h } from '@/lib/evidence/dates';
import { haversineKm, isLocationMismatch } from '@/lib/evidence/geo';
import { confirmMatches, type ThumbnailHasher } from '@/lib/evidence/verifyMatch';
import type { LlmPort } from '@/lib/llm/port';
import { narrateSafe, parseClaimSafe, readSceneSafe } from '@/lib/llm/safe';
import { AuditBudget, SerpError, timedOut, type SearchResult, type SerpClient } from '@/lib/serp/client';
import * as engines from '@/lib/serp/engines';
import { toEvidence, toPlace } from '@/lib/serp/normalize';
import type {
  AuditInput,
  Claim,
  Dossier,
  Emit,
  EngineId,
  Evidence,
  GeoPoint,
  LocationCheck,
  SceneReading,
  Signals,
  SkipReason,
} from '@/lib/shared/types';
import { LIMITATIONS } from '@/lib/shared/types';
import { untilAborted } from '@/lib/shared/time';
import { TTL, type Store } from '@/lib/store/types';
import { decide } from '@/lib/verdict/rules';
import { score } from '@/lib/verdict/score';

export interface AuditDeps {
  serp: SerpClient;
  llm: LlmPort;
  hashThumbnail: ThumbnailHasher;
  store: Store;
  /** The audit's notion of "now": evidence dates and claims are judged against it. */
  clock: () => Date;
  /** Real time, for when the dossier was created. Differs from `clock` when replaying a recorded case. */
  wallClock: () => Date;
  newId: () => string;
  trustedDomains: ReadonlySet<string>;
  sign: (unsigned: object) => string;
  /** Golden case to replay fixtures from. */
  caseId?: string;
  /** Reuse evidence for near-identical media seen before. */
  useMediaCache: boolean;
  timeouts?: { tier3Ms?: number; auditMs?: number; llmMs?: number };
}

export type AuditErrorCode = 'UPSTREAM_FAILED' | 'RATE_LIMITED' | 'CREDITS_EXHAUSTED' | 'TIMED_OUT' | 'UNREADABLE';

const AUDIT_ERROR_STATUS: Record<AuditErrorCode, number> = {
  UPSTREAM_FAILED: 502,
  RATE_LIMITED: 429,
  CREDITS_EXHAUSTED: 402,
  TIMED_OUT: 504,
  UNREADABLE: 422,
};

/** An audit that ends with no verdict at all. */
export class AuditError extends Error {
  readonly code: AuditErrorCode;
  readonly status: number;
  constructor(code: AuditErrorCode, message: string) {
    super(message);
    this.code = code;
    this.status = AUDIT_ERROR_STATUS[code];
  }
}

const ID_PREFIX: Record<EngineId, string> = {
  google_lens: 'lens',
  bing_reverse_image: 'bing',
  yandex_images: 'yandex',
  google: 'web',
  google_news: 'news',
  google_maps: 'maps',
  youtube: 'yt',
  google_jobs: 'jobs',
};

const TIER3_RANK = ['google_news', 'maps_claim', 'maps_scene', 'youtube', 'google'] as const;
const LANDMARK_MIN_CONFIDENCE = 0.8;
/**
 * Engines that search by the image itself, so their results hold for any claim
 * about the same media and can be reused from the media cache.
 */
const IMAGE_ENGINES: EngineId[] = ['google_lens', 'bing_reverse_image', 'yandex_images'];
const NEWS_WINDOW_MS = 3 * 86_400_000;

function locationCheck(claim: GeoPoint | undefined, scene: GeoPoint | undefined): LocationCheck {
  if (!claim || !scene) return 'unchecked';
  return isLocationMismatch(claim, scene) ? 'mismatch' : 'agrees';
}

const words = (s: string) => new Set(s.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);

/**
 * What to ask Google Maps in order to locate the scene.
 *
 * The model's own `confidence` is an uncalibrated number it writes about itself, so
 * it is used only to rank candidates, never as a gate: a named landmark it is unsure
 * about still gets asked about, and text read off a sign is asked about when there is
 * no landmark at all. Maps is the thing that decides, and `mapsAgrees` below throws
 * away an answer that does not actually correspond to what was asked.
 */
export function sceneLocationQuery(scene: SceneReading | undefined): string | undefined {
  const best = [...(scene?.landmarks ?? [])].sort((a, b) => b.confidence - a.confidence)[0];
  if (best && best.confidence >= LANDMARK_MIN_CONFIDENCE) return best.name;
  const sign = (scene?.signText ?? []).filter((t) => words(t).size > 0).slice(0, 2).join(' ');
  return best?.name ?? (sign || undefined);
}

/**
 * Whether a place Maps returned is really the place we asked about: they must share a
 * word. Without this a hallucinated landmark could be "located" by whatever Maps offers
 * instead, and a wrong location is what MISPLACED is built on.
 */
export function mapsAgrees(query: string, place: GeoPoint): boolean {
  const asked = words(query);
  if (asked.size === 0) return false;
  const got = words(`${place.label} ${place.country ?? ''}`);
  return [...asked].some((w) => got.has(w));
}

/**
 * Runs one audit: claim and scene reading, tiered SerpApi escalation that stops
 * as soon as evidence is decisive, then deterministic judging and narration.
 * Whatever has arrived when the audit deadline (25 s) passes is judged as-is.
 */
export async function runAudit(input: AuditInput, emit: Emit, deps: AuditDeps): Promise<Dossier> {
  const auditMs = deps.timeouts?.auditMs ?? 25_000;
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), auditMs);
  try {
    return await auditWithinDeadline(input, emit, deps, deadline.signal, auditMs);
  } finally {
    clearTimeout(timer);
  }
}

async function auditWithinDeadline(
  input: AuditInput,
  emit: Emit,
  deps: AuditDeps,
  auditSignal: AbortSignal,
  auditMs: number,
): Promise<Dossier> {
  const startedMs = performance.now();
  const remainingMs = () => Math.max(0, auditMs - (performance.now() - startedMs));
  const llmMs = () => Math.min(deps.timeouts?.llmMs ?? 8_000, remainingMs());
  const auditId = deps.newId();
  const budget = new AuditBudget(input.options.maxCredits);
  const used = new Set<EngineId>();
  const failed = new Set<EngineId>();
  const skipped = new Map<EngineId, SkipReason>();
  const skip = (engine: EngineId, reason: SkipReason) => {
    if (!skipped.has(engine)) skipped.set(engine, reason);
  };
  const evidence: Evidence[] = [];
  const tiersRun: number[] = [];
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
        auditId,
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

  const collect = async (req: engines.EngineRequest, res: SearchResult) => {
    const prefix = `${ID_PREFIX[req.engine]}${req.frameIndex ?? ''}`;
    const items = toEvidence(req.engine, res.raw, {
      fetchedAt: res.fetchedAt,
      trustedDomains: deps.trustedDomains,
      idPrefix: prefix,
    });
    const checked = await confirmMatches(items, inputHashes, deps.hashThumbnail);
    for (const ev of checked) {
      evidence.push(ev);
      emit({ type: 'evidence', data: ev });
    }
    return checked;
  };

  const confirmed = () => evidence.filter((e) => e.match?.confirmed);

  // Stage 0: claim and scene. They don't depend on each other, so the claim is parsed
  // while the media cache is checked and, on a miss, the scene is read.
  emit({ type: 'stage', data: { stage: 'claim' } });
  const claimParsed: Promise<Claim> = parseClaimSafe(
    deps.llm,
    {
      text: input.claim.text,
      place: input.claim.place,
      date: input.claim.date,
      submittedAt: deps.clock().toISOString(),
    },
    llmMs(),
  );
  const sceneRead = (async () => {
    const hit = deps.useMediaCache ? await deps.store.findMedia(inputHashes) : undefined;
    return { hit, reading: hit ? hit.scene : await readSceneSafe(deps.llm, sharpest.url, llmMs()) };
  })();
  const [claim, { hit: cached, reading }] = await Promise.all([claimParsed, sceneRead]);

  // Decisive uses the same rule as T₀, applied to copies older than 48 h: a
  // trusted archive on its own, or two domains within 30 days of each other.
  const decisive = () => {
    const older = confirmed().filter((e) => e.publishedAt && isOlderThan48h(e.publishedAt, claim.claimedAt));
    return !!computeFirstSeen(older, deps.clock()).firstSeen;
  };

  const scene: SceneReading | undefined = reading;
  let sceneGeo: GeoPoint | undefined = cached?.sceneGeo;

  /** Reverse-image engines answered from the media cache; only the missing ones are searched. */
  const fromCache = new Set(cached?.engines ?? []);

  emit({ type: 'stage', data: { stage: 'scene' } });
  if (cached) {
    for (const ev of structuredClone(cached.evidence)) {
      evidence.push(ev);
      emit({ type: 'evidence', data: ev });
    }
  }

  let shortCircuited = false;
  const shortCircuit = (afterTier: number) => {
    shortCircuited = true;
    emit({ type: 'short_circuit', data: { afterTier, creditsSaved: budget.remaining } });
  };

  // Tier 1: Google Lens on the sharpest frame, falling back to Bing if Lens is down.
  emit({ type: 'stage', data: { stage: 'tier1' } });
  tiersRun.push(1);
  if (!fromCache.has('google_lens')) {
    const lensReq = engines.lensExact(sharpest.url, sharpest.index);
    const lens = await call(lensReq);
    if (lens) {
      await collect(lensReq, lens);
      for (const frame of frames.slice(1)) {
        if (confirmed().length > 0) break;
        const req = engines.lensExact(frame.url, frame.index);
        const res = await call(req);
        if (res) await collect(req, res);
      }
    } else if (failed.has('google_lens') && !fromCache.has('bing_reverse_image')) {
      const bingReq = engines.bingReverse(sharpest.url, sharpest.index);
      const bing = await call(bingReq);
      if (!bing) {
        if (halt) throw new AuditError(halt.code as 'RATE_LIMITED' | 'CREDITS_EXHAUSTED', `SerpApi refused the search: ${halt.message}`);
        if (auditSignal.aborted) throw new AuditError('TIMED_OUT', 'Reverse image search timed out; no verdict is possible.');
        throw new AuditError('UPSTREAM_FAILED', 'Google Lens and Bing both failed; no verdict is possible.');
      }
      await collect(bingReq, bing);
    }
  }
  if (decisive()) shortCircuit(1);

  // Tier 2: independent reverse-image indexes, one at a time.
  if (!shortCircuited) {
    emit({ type: 'stage', data: { stage: 'tier2' } });
    tiersRun.push(2);
    for (const req of [
      engines.bingReverse(sharpest.url, sharpest.index),
      engines.yandexByUrl(sharpest.url, sharpest.index),
    ]) {
      if (fromCache.has(req.engine) || used.has(req.engine) || failed.has(req.engine)) continue;
      const res = await call(req);
      if (res) await collect(req, res);
      if (decisive()) {
        shortCircuit(2);
        break;
      }
    }
  }

  // Tier 3: corroboration in parallel, ranked so the budget drops the least useful first.
  let claimGeo: GeoPoint | undefined;
  let sceneResolvedByMaps = !!sceneGeo;
  if (!shortCircuited) {
    emit({ type: 'stage', data: { stage: 'tier3' } });
    tiersRun.push(3);
    const sceneQuery = sceneLocationQuery(scene);
    const undated = confirmed().find((e) => !e.publishedAt && e.title);
    const plan: { key: (typeof TIER3_RANK)[number]; req: engines.EngineRequest }[] = [];
    const news = engines.newsFor(claim);
    if (news) plan.push({ key: 'google_news', req: news });
    if (claim.place) plan.push({ key: 'maps_claim', req: engines.mapsPlace(claim.place) });
    if (sceneQuery && !sceneGeo) plan.push({ key: 'maps_scene', req: engines.mapsPlace(sceneQuery) });
    if (input.media.kind === 'video' || scene?.broadcastLogo) plan.push({ key: 'youtube', req: engines.youtubeFor(claim) });
    if (undated) plan.push({ key: 'google', req: engines.datedSearch(undated.title!, claim.claimedAt) });
    plan.sort((a, b) => TIER3_RANK.indexOf(a.key) - TIER3_RANK.indexOf(b.key));

    const affordable = plan.slice(0, Math.max(0, budget.remaining));
    for (const p of plan.slice(affordable.length)) {
      skip(p.req.engine, 'budget');
      emit({
        type: 'error',
        data: { code: 'BUDGET_EXCEEDED', message: `Skipped ${p.req.engine}: audit credit cap reached`, recoverable: true },
      });
    }

    // One timeout for the whole tier; it also cancels the searches still running.
    const tier3Signal = AbortSignal.any([auditSignal, AbortSignal.timeout(deps.timeouts?.tier3Ms ?? 10_000)]);
    // Claim-dependent searches always run for this claim, even on a media cache hit.
    const results = await Promise.all(affordable.map((p) => call(p.req, tier3Signal)));

    // Process in rank order so evidence ids and ordering stay deterministic.
    for (let i = 0; i < affordable.length; i++) {
      const { key, req } = affordable[i];
      const res = results[i];
      if (!res) continue;
      if (key === 'maps_claim' || key === 'maps_scene') {
        const place = toPlace(res.raw);
        if (!place) continue;
        // A scene location is only accepted when Maps confirms the name it was asked about;
        // the claimed place came from the user, so it is taken as given.
        if (key === 'maps_scene' && !(sceneQuery && mapsAgrees(sceneQuery, place))) continue;
        if (key === 'maps_claim') claimGeo = place;
        else {
          sceneGeo = place;
          sceneResolvedByMaps = true;
        }
        const ev: Evidence = {
          id: key === 'maps_claim' ? 'maps-claim' : 'maps-scene',
          engine: 'google_maps',
          kind: 'place',
          url: `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`,
          domain: 'google.com',
          title: place.label,
          dateTrust: 'none',
          geo: place,
          trustedSource: false,
        };
        evidence.push(ev);
        emit({ type: 'evidence', data: ev });
      } else if (key === 'google' && undated) {
        const found = await collect(req, res);
        const sameSite = found.find((e) => e.domain === undated.domain && e.publishedAt);
        if (sameSite) {
          undated.publishedAt = sameSite.publishedAt;
          undated.dateTrust = sameSite.dateTrust;
        }
      } else {
        await collect(req, res);
      }
    }
  }

  // EXIF GPS is written by the camera but is trivially editable, so where the scene
  // came from is recorded and scored lower than a location Maps resolved.
  let sceneGeoSource: Signals['sceneGeoSource'] = sceneResolvedByMaps ? 'maps' : undefined;
  if (!sceneGeo && input.options.useExifLocation && input.media.exif?.gps) {
    const [lat, lng] = input.media.exif.gps;
    sceneGeo = { lat, lng, label: 'Photo GPS location', scale: 'poi' };
    sceneGeoSource = 'exif';
  }

  // Cache the reverse-image evidence and record which engines produced it, so a later audit
  // searches only the engines still missing. Nothing is cached from a partial audit or a
  // failed image search, which would hide older copies from later audits of the same media.
  const imageEngines = IMAGE_ENGINES.filter((e) => fromCache.has(e) || used.has(e));
  const searchedNewImageEngine = imageEngines.some((e) => !fromCache.has(e));
  const imageSearchFailed = IMAGE_ENGINES.some((e) => failed.has(e));
  if (deps.useMediaCache && searchedNewImageEngine && !partial && !imageSearchFailed) {
    await deps.store.putMedia(
      {
        pHash: cached?.pHash ?? sharpest.pHash,
        engines: imageEngines,
        evidence: evidence.filter((e) => IMAGE_ENGINES.includes(e.engine)),
        scene,
        sceneGeo: sceneResolvedByMaps ? sceneGeo : undefined,
        createdAt: deps.clock().toISOString(),
      },
      TTL.mediaMs,
    );
  }

  // Judge.
  emit({ type: 'stage', data: { stage: 'judge' } });
  const confirmedMatches = confirmed();
  const { firstSeen, dateSpreadDays } = computeFirstSeen(confirmedMatches, deps.clock());
  const placeToken = claim.place?.split(',')[0].trim();
  // Whole word only, and never a token so short that it matches inside other words:
  // "Goa" must not corroborate an article about "goal", nor "Ladakh" one about "Ladakhi".
  const placeMatch =
    placeToken && placeToken.length >= 3
      ? new RegExp(`\\b${placeToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
      : undefined;
  const claimedMs = Date.parse(claim.claimedAt);
  const newsCorroborates = evidence.some(
    (e) =>
      e.engine === 'google_news' &&
      !!e.publishedAt &&
      Math.abs(Date.parse(e.publishedAt) - claimedMs) <= NEWS_WINDOW_MS &&
      (!placeMatch || placeMatch.test(`${e.title ?? ''} ${e.snippet ?? ''}`)),
  );

  const signals: Signals = {
    claim,
    confirmedMatches,
    firstSeen,
    deltaTDays: firstSeen ? deltaTDays(claim.claimedAt, firstSeen.at) : undefined,
    claimGeo,
    sceneGeo,
    deltaSKm: claimGeo && sceneGeo ? Math.round(haversineKm(claimGeo, sceneGeo)) : undefined,
    location: locationCheck(claimGeo, sceneGeo),
    newsCorroborates,
    sceneResolvedByMaps,
    sceneGeoSource,
    enginesUsed: [...used],
    enginesFailed: [...failed],
    enginesSkipped: [...skipped].filter(([engine]) => !used.has(engine)).map(([engine, reason]) => ({ engine, reason })),
    dateSpreadDays,
  };
  emit({
    type: 'signal',
    data: { firstSeen: signals.firstSeen, deltaTDays: signals.deltaTDays, deltaSKm: signals.deltaSKm },
  });

  const { verdict, flags } = decide(signals);
  const confidence = score(signals, verdict);

  emit({ type: 'stage', data: { stage: 'narrate' } });
  const narrative = await narrateSafe(deps.llm, verdict, flags, signals, evidence, llmMs());

  const unsigned: Omit<Dossier, 'signature'> = {
    kind: 'media',
    id: auditId,
    verdict,
    flags,
    confidence,
    signals,
    evidence,
    scene: { text: scene?.signText ?? [], landmarks: scene?.landmarks.map((l) => l.name) ?? [] },
    narrative,
    metrics: {
      totalMs: Math.round(performance.now() - startedMs),
      credits: budget.used,
      maxCredits: budget.max,
      cacheHit: !!cached,
      tiersRun,
      partial,
    },
    limitations: LIMITATIONS,
    createdAt: deps.wallClock().toISOString(),
  };
  const dossier: Dossier = { ...unsigned, signature: deps.sign(unsigned) };
  await deps.store.putAudit(dossier, TTL.auditMs);
  emit({ type: 'dossier', data: dossier });
  return dossier;
}
