import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { Redis } from '@upstash/redis';
import sharp from 'sharp';
import { TRUSTED_DOMAINS } from '@/lib/evidence/trusted';
import type { ThumbnailHasher } from '@/lib/evidence/verifyMatch';
import {
  createFixtureSource,
  createReplayLlm,
  createReplayOriginals,
  createReplayThumbnails,
  loadTrustedDomains,
} from '@/lib/fixtures/source';
import type { FetchedImage, FullImageFetcher } from '@/lib/leak/originals';
import { createGeminiLlm } from '@/lib/llm/gemini';
import type { LlmPort } from '@/lib/llm/port';
import { pHash, toGray } from '@/lib/media/phash';
import type { AuditDeps } from '@/lib/orchestrator/pipeline';
import { createSerpClient, httpTransport } from '@/lib/serp/client';
import type { FixtureMode } from '@/lib/shared/types';
import { createRedisStore } from '@/lib/store/redis';
import { createSqliteStore } from '@/lib/store/sqlite';
import type { Store } from '@/lib/store/types';
import { signDossier } from './sign';
import { assertPublicHttpsUrl } from './ssrf';

import { FIXTURES_DIR } from './mode';

export { FIXTURES_DIR, fixtureMode } from './mode';

const g = globalThis as { __dejavueStore?: Store };

/**
 * Upstash Redis when it is configured (required on serverless hosts such as
 * Vercel, where local files are wiped), otherwise a local SQLite file.
 * Vercel's Upstash integration may name the variables KV_REST_API_*.
 */
export function appStore(): Store {
  if (g.__dejavueStore) return g.__dejavueStore;
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    if (process.env.VERCEL) {
      console.warn('DejaVue: no Upstash Redis configured; using per-instance /tmp storage. Live progress may not reach every instance.');
    }
    // Serverless file systems are read-only except /tmp.
    const dir = process.env.VERCEL ? '/tmp' : path.join(process.cwd(), 'data');
    g.__dejavueStore = createSqliteStore(path.join(dir, 'dejavue.db'));
    return g.__dejavueStore;
  }
  g.__dejavueStore = createRedisStore(new Redis({ url, token, automaticDeserialization: false }));
  return g.__dejavueStore;
}

const MAX_THUMB_BYTES = 2_000_000;

export async function hashImageBuffer(buf: Buffer): Promise<string> {
  const { data, info } = await sharp(buf)
    .rotate()
    .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return pHash(toGray(info.width, info.height, data, 3));
}

/** Downloads an image from a public URL (SSRF-guarded, size-capped) and hashes it. */
export async function fetchAndHash(url: string, timeoutMs: number): Promise<string | undefined> {
  await assertPublicHttpsUrl(url);
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: 'error' });
  if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('image/')) return undefined;
  if (Number(res.headers.get('content-length') ?? 0) > MAX_THUMB_BYTES) return undefined;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_THUMB_BYTES) return undefined;
  return hashImageBuffer(buf);
}

const liveThumbnails: ThumbnailHasher = (url) => fetchAndHash(url, 2_000);

/**
 * Downloads one full-size copy for a leak trace: SSRF-guarded, capped, and read in chunks
 * so a server that declares no length cannot stream past the cap. The bytes are handed
 * straight to the feature measurement and never written anywhere.
 */
export const fetchFullImage: FullImageFetcher = async (url, { timeoutMs, maxBytes }): Promise<FetchedImage> => {
  try {
    await assertPublicHttpsUrl(url);
  } catch {
    return { ok: false, reason: 'blocked' };
  }
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: 'error' });
    if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('image/')) return { ok: false, reason: 'unreadable' };
    if (Number(res.headers.get('content-length') ?? 0) > maxBytes) return { ok: false, reason: 'too_large' };
    if (!res.body) return { ok: false, reason: 'unreadable' };
    const chunks: Uint8Array[] = [];
    let total = 0;
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      total += chunk.byteLength;
      if (total > maxBytes) return { ok: false, reason: 'too_large' };
      chunks.push(chunk);
    }
    return { ok: true, bytes: Buffer.concat(chunks) };
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
};

const unavailableLlm: LlmPort = {
  parseClaim: async () => {
    throw new Error('GEMINI_API_KEY not set');
  },
  readScene: async () => {
    throw new Error('GEMINI_API_KEY not set');
  },
  narrate: async () => {
    throw new Error('GEMINI_API_KEY not set');
  },
  readOffer: async () => {
    throw new Error('GEMINI_API_KEY not set');
  },
};

export interface DepsOptions {
  mode: FixtureMode;
  store: Store;
  fixturesDir?: string;
  caseId?: string;
  clock?: () => Date;
  /** Replay only: simulated latency per search and LLM call. */
  replayDelayMs?: number;
}

/**
 * Wires the audit pipeline for a fixture mode. Tests and API routes share this.
 * `fetchOriginal` is only used by leak traces, which are the only check that downloads
 * full-size images rather than search results.
 */
export function createAuditDeps(opts: DepsOptions): AuditDeps & { fetchOriginal: FullImageFetcher } {
  const fixturesDir = opts.fixturesDir ?? FIXTURES_DIR;
  const clock = opts.clock ?? (() => new Date());
  const replay = opts.mode === 'replay';
  const trusted = new Set(TRUSTED_DOMAINS);
  if (opts.mode !== 'live') {
    for (const d of loadTrustedDomains(path.join(fixturesDir, 'trusted-domains.json'))) trusted.add(d);
  }

  const apiKey = process.env.SERPAPI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  return {
    serp: createSerpClient({
      mode: opts.mode,
      store: opts.store,
      fixtures: createFixtureSource(fixturesDir),
      transport: !replay && apiKey ? httpTransport(apiKey) : undefined,
      clock,
      replayDelayMs: opts.replayDelayMs,
    }),
    llm: replay
      ? createReplayLlm(fixturesDir, opts.caseId, opts.replayDelayMs)
      : geminiKey
        ? createGeminiLlm(geminiKey, process.env.GEMINI_MODEL ?? 'gemini-flash-latest')
        : unavailableLlm,
    hashThumbnail: replay ? createReplayThumbnails(fixturesDir, opts.caseId) : liveThumbnails,
    fetchOriginal: replay ? createReplayOriginals(fixturesDir, opts.caseId) : fetchFullImage,
    store: opts.store,
    clock,
    wallClock: () => new Date(),
    newId: () => `dv_${randomBytes(4).toString('hex')}`,
    trustedDomains: trusted,
    sign: (unsigned) => signDossier(unsigned, process.env.DOSSIER_HMAC_SECRET),
    caseId: opts.caseId,
    useMediaCache: !replay,
  };
}
