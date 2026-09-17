import { randomBytes } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import { TRUSTED_DOMAINS } from '@/lib/evidence/trusted';
import type { ThumbnailHasher } from '@/lib/evidence/verifyMatch';
import {
  createFixtureSource,
  createReplayLlm,
  createReplayThumbnails,
  loadTrustedDomains,
} from '@/lib/fixtures/source';
import { createGeminiLlm } from '@/lib/llm/gemini';
import type { LlmPort } from '@/lib/llm/port';
import { pHash, toGray } from '@/lib/media/phash';
import type { AuditDeps } from '@/lib/orchestrator/pipeline';
import { createSerpClient, httpTransport } from '@/lib/serp/client';
import type { FixtureMode } from '@/lib/shared/types';
import { createSqliteStore } from '@/lib/store/sqlite';
import type { Store } from '@/lib/store/types';
import { signDossier } from './sign';
import { assertPublicHttpsUrl } from './ssrf';

import { FIXTURES_DIR } from './mode';

export { FIXTURES_DIR, fixtureMode } from './mode';

const g = globalThis as { __dejavueStore?: Store };
export function appStore(): Store {
  return (g.__dejavueStore ??= createSqliteStore(path.join(process.cwd(), 'data', 'dejavue.db')));
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
};

export interface DepsOptions {
  mode: FixtureMode;
  store: Store;
  fixturesDir?: string;
  caseId?: string;
  clock?: () => Date;
}

/** Wires the audit pipeline for a fixture mode. Tests and API routes share this. */
export function createAuditDeps(opts: DepsOptions): AuditDeps {
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
    }),
    llm: replay
      ? createReplayLlm(fixturesDir, opts.caseId)
      : geminiKey
        ? createGeminiLlm(geminiKey, process.env.GEMINI_MODEL ?? 'gemini-flash-latest')
        : unavailableLlm,
    hashThumbnail: replay ? createReplayThumbnails(fixturesDir, opts.caseId) : liveThumbnails,
    store: opts.store,
    clock,
    newId: () => `dv_${randomBytes(4).toString('hex')}`,
    trustedDomains: trusted,
    sign: (unsigned) => signDossier(unsigned, process.env.DOSSIER_HMAC_SECRET),
    caseId: opts.caseId,
    useMediaCache: !replay,
  };
}
