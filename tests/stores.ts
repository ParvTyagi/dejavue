import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createMemoryStore } from '@/lib/store/memory';
import { createRedisStore, type RedisCommands } from '@/lib/store/redis';
import { createSqliteStore } from '@/lib/store/sqlite';
import type { Store } from '@/lib/store/types';

/**
 * In-memory stand-in for Upstash Redis, implementing only the commands the
 * store uses. Expiry follows `clock`, like Redis TTLs follow wall time.
 */
export function fakeRedis(clock: () => Date): RedisCommands {
  const values = new Map<string, { value: string; expiresAt: number }>();
  const sets = new Map<string, Set<string>>();
  const alive = (key: string) => {
    const item = values.get(key);
    if (item && item.expiresAt <= clock().getTime()) values.delete(key);
    return values.get(key);
  };
  return {
    get: async (key) => alive(key)?.value ?? null,
    set: async (key, value, { px }) => void values.set(key, { value, expiresAt: clock().getTime() + px }),
    incr: async (key) => {
      const next = Number(alive(key)?.value ?? 0) + 1;
      values.set(key, { value: String(next), expiresAt: alive(key)?.expiresAt ?? Infinity });
      return next;
    },
    pexpire: async (key, ms) => {
      const item = alive(key);
      if (item) item.expiresAt = clock().getTime() + ms;
    },
    sadd: async (key, member) => void (sets.get(key) ?? sets.set(key, new Set()).get(key)!).add(member),
    smembers: async (key) => [...(sets.get(key) ?? [])],
    srem: async (key, member) => void sets.get(key)?.delete(member),
  };
}

export type StoreKind = 'memory' | 'sqlite' | 'redis';
export const STORE_KINDS: StoreKind[] = ['memory', 'sqlite', 'redis'];

/** A fresh store of each kind. `clock` drives Redis expiry; the others use the `now` passed to reads. */
export function makeStore(kind: StoreKind, clock: () => Date): Store {
  switch (kind) {
    case 'memory':
      return createMemoryStore();
    case 'sqlite':
      return createSqliteStore(path.join(mkdtempSync(path.join(tmpdir(), 'dejavue-')), 'test.db'));
    case 'redis':
      return createRedisStore(fakeRedis(clock));
  }
}
