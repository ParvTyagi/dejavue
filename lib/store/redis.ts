import { isSameImage } from '@/lib/media/phash';
import type { AuditEvent, AnyDossier } from '@/lib/shared/types';
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
  rpush(key: string, value: string): Promise<number>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
}

const LEDGER_RETENTION_MS = 40 * 86_400_000;

const KEY_PREFIX = 'dejavue';

/**
 * Shared store for serverless hosting (Upstash Redis). Expiry uses Redis TTLs;
 * the TTL starts at write time, so cache entries always live for their full TTL.
 */
export function createRedisStore(redis: RedisCommands): Store {
  const redisKey = (...parts: string[]) => [KEY_PREFIX, ...parts].join(':');
  const mediaIndex = redisKey('media', 'index');
  const parse = <T>(raw: string | null) => (raw ? (JSON.parse(raw) as T) : undefined);

  return {
    async getSerp(key) {
      return parse(await redis.get(redisKey('serp', key)));
    },
    async putSerp(key, response, fetchedAt, ttlMs) {
      await redis.set(redisKey('serp', key), JSON.stringify({ response, fetchedAt }), { px: ttlMs });
    },
    async findMedia(hashes) {
      // Exact hash first, then a scan of the index for near-identical media.
      for (const h of hashes) {
        const exact = parse<MediaCacheEntry>(await redis.get(redisKey('media', h)));
        if (exact) return exact;
      }
      for (const member of await redis.smembers(mediaIndex)) {
        if (!isSameImage(hashes, member)) continue;
        const entry = parse<MediaCacheEntry>(await redis.get(redisKey('media', member)));
        if (entry) return entry;
        await redis.srem(mediaIndex, member); // expired
      }
      return undefined;
    },
    async putMedia(entry, ttlMs) {
      await redis.set(redisKey('media', entry.pHash), JSON.stringify(entry), { px: ttlMs });
      await redis.sadd(mediaIndex, entry.pHash);
    },
    async addLedger(row) {
      const month = monthKey(row.at);
      const counter = redisKey('ledger', month, row.cached ? 'cached' : 'credits');
      if ((await redis.incr(counter)) === 1) await redis.pexpire(counter, LEDGER_RETENTION_MS);
      await redis.incr(redisKey('ledger', 'total'));
    },
    async ledgerStats(monthStart) {
      const month = monthKey(monthStart);
      const [credits, cached, total] = await Promise.all([
        redis.get(redisKey('ledger', month, 'credits')),
        redis.get(redisKey('ledger', month, 'cached')),
        redis.get(redisKey('ledger', 'total')),
      ]);
      return { creditsThisMonth: Number(credits ?? 0), cachedThisMonth: Number(cached ?? 0), totalCalls: Number(total ?? 0) };
    },
    async putAudit(dossier: AnyDossier, ttlMs) {
      await redis.set(redisKey('audit', dossier.id), JSON.stringify(dossier), { px: ttlMs });
    },
    async getAudit(id) {
      return parse(await redis.get(redisKey('audit', id)));
    },
    async appendEvent(auditId, event, ttlMs) {
      const key = redisKey('events', auditId);
      if ((await redis.rpush(key, JSON.stringify(event))) === 1) await redis.pexpire(key, ttlMs);
    },
    async readEvents(auditId, from) {
      const raw = await redis.lrange(redisKey('events', auditId), from, -1);
      return raw.map((r) => JSON.parse(r) as AuditEvent);
    },
    async countHit(key, windowMs) {
      const counter = redisKey('hits', key);
      const count = await redis.incr(counter);
      if (count === 1) await redis.pexpire(counter, windowMs);
      return count;
    },
  };
}
