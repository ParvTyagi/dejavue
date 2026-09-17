import { computeFirstSeen, deltaTDays, isOlderThan48h } from '@/lib/evidence/dates';
import { haversineKm, isLocationMismatch } from '@/lib/evidence/geo';
import { confirmMatches, type ThumbnailHasher } from '@/lib/evidence/verifyMatch';
import type { LlmPort } from '@/lib/llm/port';
import { narrateSafe, parseClaimSafe, readSceneSafe } from '@/lib/llm/safe';
import { AuditBudget, SerpError, type SearchResult, type SerpClient } from '@/lib/serp/client';
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
  SceneReading,
  Signals,
} from '@/lib/shared/types';
import type { Store } from '@/lib/store/types';
import { decide } from '@/lib/verdict/rules';
import { score } from '@/lib/verdict/score';

export interface AuditDeps {
  serp: SerpClient;
  llm: LlmPort;
  hashThumbnail: ThumbnailHasher;
  store: Store;
  clock: () => Date;
  newId: () => string;
  trustedDomains: ReadonlySet<string>;
  sign: (unsigned: Omit<Dossier, 'signature'>) => string;
  /** Golden case to replay fixtures from. */
  caseId?: string;
  /** Reuse evidence for near-identical media seen before. */
  useMediaCache: boolean;
  timeouts?: { tier3Ms?: number; auditMs?: number };
}

export class AuditError extends Error {
  constructor(
    readonly code: 'UPSTREAM_FAILED',
    readonly status: number,
    message: string,
  ) {
    super(message);
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
  google_trends: 'trends',
};

const TIER3_RANK = ['google_news', 'maps_claim', 'maps_scene', 'youtube', 'google'] as const;
const LANDMARK_MIN_CONFIDENCE = 0.8;
const NEWS_WINDOW_MS = 3 * 86_400_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([p, new Promise<undefined>((r) => setTimeout(() => r(undefined), ms))]);
}

/**
 * Runs one audit: claim and scene reading, tiered SerpApi escalation that stops
 * as soon as evidence is decisive, then deterministic judging and narration.
 */
export async function runAudit(input: AuditInput, emit: Emit, deps: AuditDeps): Promise<Dossier> {
  const startedMs = performance.now();
  const auditDeadline = startedMs + (deps.timeouts?.auditMs ?? 25_000);
  const auditId = deps.newId();
  const budget = new AuditBudget(input.options.maxCredits);
  const used = new Set<EngineId>();
  const failed = new Set<EngineId>();
  const skipped = new Set<EngineId>();
  const evidence: Evidence[] = [];
  const tiersRun: number[] = [];
  let partial = false;
  let halted = false;

  const frames = input.media.frames
    .map((frame, index) => ({ ...frame, index }))
    .sort((a, b) => b.sharpness - a.sharpness);
  const inputHashes = frames.map((f) => f.pHash);
  const sharpest = frames[0];

  const call = async (req: engines.EngineRequest): Promise<SearchResult | undefined> => {
    if (halted || performance.now() > auditDeadline) {
      partial = true;
      skipped.add(req.engine);
      return undefined;
    }
    try {
      const res = await deps.serp(req.engine, req.params, {
        auditId,
        budget,
        caseId: deps.caseId,
        frameIndex: req.frameIndex,
        onCredit: (data) => emit({ type: 'credit', data }),
      });
      used.add(req.engine);
      return res;
    } catch (err) {
      const e = err instanceof SerpError ? err : new SerpError('UPSTREAM_FAILED', req.engine, String(err));
      if (e.code === 'BUDGET_EXCEEDED') {
        skipped.add(req.engine);
      } else {
        failed.add(req.engine);
        if (e.code === 'RATE_LIMITED' || e.code === 'CREDITS_EXHAUSTED') {
          halted = true;
          partial = true;
        }
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

  // Stage 0: claim and scene.
  emit({ type: 'stage', data: { stage: 'claim' } });
  const claim: Claim = await parseClaimSafe(deps.llm, {
    text: input.claim.text,
    place: input.claim.place,
    date: input.claim.date,
    submittedAt: deps.clock().toISOString(),
  });

  const decisive = () => {
    const older = confirmed().filter((e) => e.publishedAt && isOlderThan48h(e.publishedAt, claim.claimedAt));
    return older.some((e) => e.trustedSource) || new Set(older.map((e) => e.domain)).size >= 2;
  };

  const cached = deps.useMediaCache ? deps.store.findMedia(inputHashes) : undefined;
  let scene: SceneReading | undefined;
  let sceneGeo: GeoPoint | undefined;

  emit({ type: 'stage', data: { stage: 'scene' } });
  if (cached) {
    scene = cached.scene;
    sceneGeo = cached.sceneGeo;
    for (const ev of cached.evidence) {
      evidence.push(ev);
      emit({ type: 'evidence', data: ev });
    }
  } else {
    scene = await readSceneSafe(deps.llm, sharpest.url);
  }

  let shortCircuited = false;
  const shortCircuit = (afterTier: number) => {
    shortCircuited = true;
    emit({ type: 'short_circuit', data: { afterTier, creditsSaved: budget.remaining } });
  };

  if (!cached) {
    // Tier 1: Google Lens on the sharpest frame, falling back to Bing if Lens is down.
    emit({ type: 'stage', data: { stage: 'tier1' } });
    tiersRun.push(1);
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
    } else if (failed.has('google_lens')) {
      const bingReq = engines.bingReverse(sharpest.url, sharpest.index);
      const bing = await call(bingReq);
      if (!bing) throw new AuditError('UPSTREAM_FAILED', 502, 'Google Lens and Bing both failed; no verdict is possible.');
      await collect(bingReq, bing);
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
        if (used.has(req.engine) || failed.has(req.engine)) continue;
        const res = await call(req);
        if (res) await collect(req, res);
        if (decisive()) {
          shortCircuit(2);
          break;
        }
      }
    }
  }

  // Tier 3: corroboration in parallel, ranked so the budget drops the least useful first.
  let claimGeo: GeoPoint | undefined;
  let sceneResolvedByMaps = !!sceneGeo;
  if (!shortCircuited) {
    emit({ type: 'stage', data: { stage: 'tier3' } });
    tiersRun.push(3);
    const landmark = scene?.landmarks.find((l) => l.confidence >= LANDMARK_MIN_CONFIDENCE);
    const undated = confirmed().find((e) => !e.publishedAt && e.title);
    const plan: { key: (typeof TIER3_RANK)[number]; req: engines.EngineRequest }[] = [];
    const news = engines.newsFor(claim);
    if (news) plan.push({ key: 'google_news', req: news });
    if (claim.place) plan.push({ key: 'maps_claim', req: engines.mapsPlace(claim.place) });
    if (landmark && !cached) plan.push({ key: 'maps_scene', req: engines.mapsPlace(landmark.name) });
    if (!cached && (input.media.kind === 'video' || scene?.broadcastLogo)) {
      plan.push({ key: 'youtube', req: engines.youtubeFor(claim) });
    }
    if (undated && !cached) plan.push({ key: 'google', req: engines.datedSearch(undated.title!, claim.claimedAt) });
    plan.sort((a, b) => TIER3_RANK.indexOf(a.key) - TIER3_RANK.indexOf(b.key));

    const affordable = plan.slice(0, Math.max(0, budget.remaining));
    for (const p of plan.slice(affordable.length)) {
      skipped.add(p.req.engine);
      emit({
        type: 'error',
        data: { code: 'BUDGET_EXCEEDED', message: `Skipped ${p.req.engine}: audit credit cap reached`, recoverable: true },
      });
    }

    const tier3Ms = deps.timeouts?.tier3Ms ?? 10_000;
    const results = await Promise.all(affordable.map((p) => withTimeout(call(p.req), tier3Ms)));

    // Process in rank order so evidence ids and ordering stay deterministic.
    for (let i = 0; i < affordable.length; i++) {
      const { key, req } = affordable[i];
      const res = results[i];
      if (!res) {
        if (!failed.has(req.engine) && !skipped.has(req.engine)) failed.add(req.engine);
        continue;
      }
      if (key === 'maps_claim' || key === 'maps_scene') {
        const place = toPlace(res.raw);
        if (!place) continue;
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

  if (!sceneGeo && input.options.useExifLocation && input.media.exif?.gps) {
    const [lat, lng] = input.media.exif.gps;
    sceneGeo = { lat, lng, label: 'Photo GPS location', scale: 'poi' };
  }

  if (!cached && deps.useMediaCache) {
    deps.store.putMedia({
      pHash: sharpest.pHash,
      evidence: evidence.filter((e) => e.kind === 'visual_match' || e.kind === 'video'),
      scene,
      sceneGeo: sceneResolvedByMaps ? sceneGeo : undefined,
      createdAt: deps.clock().toISOString(),
    });
  }

  // Judge.
  emit({ type: 'stage', data: { stage: 'judge' } });
  const confirmedMatches = confirmed();
  const { firstSeen, dateSpreadDays } = computeFirstSeen(confirmedMatches, deps.clock());
  const placeToken = claim.place?.split(',')[0].trim().toLowerCase();
  const claimedMs = Date.parse(claim.claimedAt);
  const newsCorroborates = evidence.some(
    (e) =>
      e.engine === 'google_news' &&
      !!e.publishedAt &&
      Math.abs(Date.parse(e.publishedAt) - claimedMs) <= NEWS_WINDOW_MS &&
      (!placeToken || `${e.title ?? ''} ${e.snippet ?? ''}`.toLowerCase().includes(placeToken)),
  );

  const signals: Signals = {
    claim,
    confirmedMatches,
    firstSeen,
    deltaTDays: firstSeen ? deltaTDays(claim.claimedAt, firstSeen.at) : undefined,
    claimGeo,
    sceneGeo,
    deltaSKm: claimGeo && sceneGeo ? Math.round(haversineKm(claimGeo, sceneGeo)) : undefined,
    locationMismatch: !!(claimGeo && sceneGeo && isLocationMismatch(claimGeo, sceneGeo)),
    newsCorroborates,
    sceneResolvedByMaps,
    enginesUsed: [...used],
    enginesFailed: [...failed],
    enginesSkipped: [...skipped],
    dateSpreadDays,
  };
  emit({
    type: 'signal',
    data: { firstSeen: signals.firstSeen, deltaTDays: signals.deltaTDays, deltaSKm: signals.deltaSKm },
  });

  const { verdict, flags } = decide(signals);
  const confidence = score(signals, verdict);

  emit({ type: 'stage', data: { stage: 'narrate' } });
  const narrative = await narrateSafe(deps.llm, verdict, flags, signals, evidence);

  const unsigned: Omit<Dossier, 'signature'> = {
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
      cacheHit: !!cached,
      tiersRun,
      partial,
    },
    createdAt: deps.clock().toISOString(),
  };
  const dossier: Dossier = { ...unsigned, signature: deps.sign(unsigned) };
  deps.store.putAudit(dossier);
  emit({ type: 'dossier', data: dossier });
  return dossier;
}
