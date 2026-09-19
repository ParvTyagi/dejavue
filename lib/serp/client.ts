import { createHash } from 'node:crypto';
import type { EngineId, FixtureMode } from '@/lib/shared/types';
import { pause, timeoutSignal } from '@/lib/shared/time';
import { TTL, type Store } from '@/lib/store/types';
import { fixtureName } from './fixtureName';

export { fixtureName };

/** Performs one real SerpApi request. Only used in `record` and `live` modes. */
export type SerpTransport = (engine: EngineId, params: Record<string, string>, signal: AbortSignal) => Promise<unknown>;

/** Recorded responses, grouped by golden case. */
export interface FixtureSource {
  get(caseId: string, name: string): unknown | undefined;
  put(caseId: string, name: string, response: unknown): void;
}

export interface SearchContext {
  auditId: string;
  budget: AuditBudget;
  /** Golden case whose fixtures replay this audit. */
  caseId?: string;
  /** Which keyframe an image search was run on. */
  frameIndex?: number;
  onCredit?: (e: { engine: EngineId; cached: boolean; totalCredits: number; maxCredits: number }) => void;
  /** Aborts the request (audit deadline or tier timeout). An aborted search is never retried. */
  signal?: AbortSignal;
}

export interface SearchResult {
  raw: unknown;
  cached: boolean;
  fetchedAt: Date;
}

export class AuditBudget {
  used = 0;
  readonly max: number;
  constructor(max: number) {
    this.max = max;
  }
  get remaining() {
    return this.max - this.used;
  }
}

export type SerpErrorCode =
  | 'BUDGET_EXCEEDED'
  | 'CREDITS_EXHAUSTED'
  | 'FIXTURE_MISSING'
  | 'RATE_LIMITED'
  | 'TIMED_OUT'
  | 'UPSTREAM_FAILED';

export class SerpError extends Error {
  readonly code: SerpErrorCode;
  readonly engine: EngineId;
  constructor(code: SerpErrorCode, engine: EngineId, message: string) {
    super(message);
    this.code = code;
    this.engine = engine;
  }
}

export interface SerpClientOptions {
  mode: FixtureMode;
  store: Store;
  fixtures: FixtureSource;
  transport?: SerpTransport;
  clock: () => Date;
  timeoutMs?: number;
  retryDelayMs?: number;
  /** Replay only: simulated network time per search, so the live UI can be seen and demoed. */
  replayDelayMs?: number;
}

export type SerpClient = (engine: EngineId, params: Record<string, string>, ctx: SearchContext) => Promise<SearchResult>;


/** How long a query result is reused. Places don't move, so Maps is kept longer. */
export function cacheTtlMs(engine: EngineId): number {
  return engine === 'google_maps' ? TTL.mapsMs : TTL.serpMs;
}

export function cacheKey(engine: EngineId, params: Record<string, string>): string {
  const sorted = Object.keys(params)
    .filter((k) => k !== 'api_key')
    .sort()
    .map((k) => [k, params[k]]);
  return createHash('sha256').update(JSON.stringify([engine, sorted])).digest('hex');
}

/** Removes ids and anything key-bearing so recorded fixtures are safe to commit. */
export function scrubResponse(raw: unknown): unknown {
  return JSON.parse(JSON.stringify(raw), (key, value) => {
    if (['id', 'json_endpoint', 'raw_html_file', 'api_key', 'serpapi_link', 'serpapi_pagination'].includes(key)) {
      return undefined;
    }
    if (typeof value === 'string' && /api_key=/i.test(value)) return undefined;
    return value;
  });
}

/** The error for a search that was cancelled by the audit deadline or a tier timeout. */
export const timedOut = (engine: EngineId) => new SerpError('TIMED_OUT', engine, `${engine} timed out`);

// SerpApi reports an exhausted plan with HTTP 429 as well; only the message tells it apart.
const OUT_OF_SEARCHES = /run out of searches|out of searches|searches? (left|remaining).*0|plan.*(limit|exceeded)/i;

/**
 * The only path to SerpApi. Order: fixtures (replay) → query cache → budget
 * guard → live request with one retry → cache, ledger and (record) fixture.
 */
export function createSerpClient(opts: SerpClientOptions): SerpClient {
  // Google Jobs regularly takes 5–15 s on a query it has not cached.
  const timeoutFor = (engine: EngineId) => opts.timeoutMs ?? (engine === 'google_jobs' ? 15_000 : 8_000);
  const retryDelayMs = opts.retryDelayMs ?? 1_000;

  const spend = (engine: EngineId, cached: boolean, ctx: SearchContext) => {
    if (!cached) ctx.budget.used++;
    ctx.onCredit?.({ engine, cached, totalCredits: ctx.budget.used, maxCredits: ctx.budget.max });
  };

  const guard = (engine: EngineId, ctx: SearchContext) => {
    if (ctx.budget.remaining <= 0) {
      throw new SerpError('BUDGET_EXCEEDED', engine, `Skipped ${engine}: audit credit cap of ${ctx.budget.max} reached`);
    }
  };

  return async (engine, params, ctx) => {
    if (ctx.signal?.aborted) throw timedOut(engine);
    if (opts.mode === 'replay') {
      // Replay has no query cache, and simulates credit spend so the meter and budget behave as in live mode.
      guard(engine, ctx);
      await pause(opts.replayDelayMs ?? 0, ctx.signal);
      if (ctx.signal?.aborted) throw timedOut(engine);
      const name = fixtureName(engine, params, ctx.frameIndex);
      const raw = ctx.caseId ? opts.fixtures.get(ctx.caseId, name) : undefined;
      if (raw === undefined) throw new SerpError('FIXTURE_MISSING', engine, `No fixture "${name}" for case ${ctx.caseId}`);
      spend(engine, false, ctx);
      const processed = (raw as { search_metadata?: { processed_at?: string } }).search_metadata?.processed_at;
      return { raw, cached: false, fetchedAt: processed ? new Date(processed) : opts.clock() };
    }

    const key = cacheKey(engine, params);
    const hit = await opts.store.getSerp(key);
    if (hit) {
      await opts.store.addLedger({ auditId: ctx.auditId, engine, cached: true, at: opts.clock().toISOString() });
      spend(engine, true, ctx);
      return { raw: hit.response, cached: true, fetchedAt: new Date(hit.fetchedAt) };
    }
    guard(engine, ctx);
    if (!opts.transport) throw new SerpError('UPSTREAM_FAILED', engine, 'No SerpApi transport configured');

    let raw: unknown;
    for (let attempt = 0; ; attempt++) {
      try {
        raw = await opts.transport(engine, { ...params, no_cache: 'false' }, timeoutSignal(timeoutFor(engine), ctx.signal));
        break;
      } catch (err) {
        if (ctx.signal?.aborted) throw timedOut(engine);
        const status = (err as { status?: number }).status;
        if (status === 402 || (status === 429 && OUT_OF_SEARCHES.test((err as Error).message))) {
          throw new SerpError('CREDITS_EXHAUSTED', engine, `SerpApi account has no searches left (${engine})`);
        }
        if (status === 429) throw new SerpError('RATE_LIMITED', engine, `${engine} rate limited by SerpApi`);
        const retryable = status === undefined || status >= 500;
        if (attempt >= 1 || !retryable) {
          throw new SerpError('UPSTREAM_FAILED', engine, `${engine} failed: ${(err as Error).message}`);
        }
        await pause(retryDelayMs, ctx.signal);
        if (ctx.signal?.aborted) throw timedOut(engine);
      }
    }

    const fetchedAt = opts.clock();
    await opts.store.putSerp(key, raw, fetchedAt.toISOString(), cacheTtlMs(engine));
    await opts.store.addLedger({ auditId: ctx.auditId, engine, cached: false, at: fetchedAt.toISOString() });
    spend(engine, false, ctx);
    if (opts.mode === 'record' && ctx.caseId) {
      opts.fixtures.put(ctx.caseId, fixtureName(engine, params, ctx.frameIndex), scrubResponse(raw));
    }
    return { raw, cached: false, fetchedAt };
  };
}

// SerpApi answers an empty search with HTTP 200 and an `error` message such as
// "Google hasn't returned any results for this query." That is a valid, empty result.
const NO_RESULTS = /hasn't returned any results|no results/i;

/** Live transport over SerpApi's JSON endpoint. */
export function httpTransport(apiKey: string): SerpTransport {
  return async (engine, params, signal) => {
    const qs = new URLSearchParams({ ...params, engine, api_key: apiKey, output: 'json' });
    const res = await fetch(`https://serpapi.com/search.json?${qs}`, { signal });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (res.ok && (!body.error || NO_RESULTS.test(body.error))) return body;
    const err = new Error(body.error ?? `HTTP ${res.status}`) as Error & { status: number };
    // Other errors inside a 200 response are request problems, so they are not retried.
    err.status = res.ok ? 422 : res.status;
    throw err;
  };
}
