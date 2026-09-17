import { hamming, HAMMING } from '@/lib/media/phash';
import type { Dossier } from '@/lib/shared/types';
import { monthKey, type MediaCacheEntry, type Store } from './types';

/**
 * The Redis commands this store uses, matching @upstash/redis created with
 * `automaticDeserialization: false` (values come back as strings).
 */
export interface RedisCommands {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, opts: { px: number }): Promise<unknown>;
  incr(key: string): Promise<number>;
  pexpire(key: string, ms: number): Promise<unknown>;
  sadd(key: string, member: string): Promise<unknown>;
  smembers(key: string): Promise<string[]>;
  srem(key: string, member: string): Promise<unknown>;
}

const LEDGER_RETENTION_MS = 40 * 86_400_000;

/**
 * Shared store for serverless hosting (Upstash Redis). Expiry uses Redis TTLs;
 * the TTL starts at write time, so cache entries always live for their full TTL.
 */
export function createRedisStore(redis: RedisCommands, prefix = 'dejavue'): Store {
  const k = (...parts: string[]) => [prefix, ...parts].join(':');
  const mediaIndex = k('media', 'index');
  const parse = <T>(raw: string | null) => (raw ? (JSON.parse(raw) as T) : undefined);

  return {
    async getSerp(key) {
      return parse(await redis.get(k('serp', key)));
    },
    async putSerp(key, response, fetchedAt, ttlMs) {
      await redis.set(k('serp', key), JSON.stringify({ response, fetchedAt }), { px: ttlMs });
    },
    async findMedia(hashes) {
      // Exact hash first, then a scan of the index for near-identical media.
      for (const h of hashes) {
        const exact = parse<MediaCacheEntry>(await redis.get(k('media', h)));
        if (exact) return exact;
      }
      for (const member of await redis.smembers(mediaIndex)) {
        if (!hashes.some((h) => hamming(h, member) <= HAMMING.sameImage)) continue;
        const entry = parse<MediaCacheEntry>(await redis.get(k('media', member)));
        if (entry) return entry;
        await redis.srem(mediaIndex, member); // expired
      }
      return undefined;
    },
    async putMedia(entry, ttlMs) {
      await redis.set(k('media', entry.pHash), JSON.stringify(entry), { px: ttlMs });
      await redis.sadd(mediaIndex, entry.pHash);
    },
    async addLedger(row) {
      const month = monthKey(row.at);
      const counter = k('ledger', month, row.cached ? 'cached' : 'credits');
      if ((await redis.incr(counter)) === 1) await redis.pexpire(counter, LEDGER_RETENTION_MS);
      await redis.incr(k('ledger', 'total'));
    },
    async ledgerStats(monthStart) {
      const month = monthKey(monthStart);
      const [credits, cached, total] = await Promise.all([
        redis.get(k('ledger', month, 'credits')),
        redis.get(k('ledger', month, 'cached')),
        redis.get(k('ledger', 'total')),
      ]);
      return { creditsThisMonth: Number(credits ?? 0), cachedThisMonth: Number(cached ?? 0), totalCalls: Number(total ?? 0) };
    },
    async putAudit(dossier: Dossier, ttlMs) {
      await redis.set(k('audit', dossier.id), JSON.stringify(dossier), { px: ttlMs });
    },
    async getAudit(id) {
      return parse(await redis.get(k('audit', id)));
    },
  };
}
