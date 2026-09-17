import { hamming, HAMMING } from '@/lib/media/phash';
import type { Dossier } from '@/lib/shared/types';
import { monthKey, type MediaCacheEntry, type Store } from './types';

interface Expiring<T> {
  value: T;
  expiresAt: number;
}

export function createMemoryStore(): Store {
  const serp = new Map<string, Expiring<{ response: unknown; fetchedAt: string }>>();
  const media = new Map<string, Expiring<MediaCacheEntry>>();
  const ledger: { cached: boolean; at: string }[] = [];
  const audits = new Map<string, Expiring<Dossier>>();

  const live = <T>(item: Expiring<T> | undefined, now: Date) => (item && item.expiresAt > now.getTime() ? item.value : undefined);

  return {
    getSerp: async (key, now) => live(serp.get(key), now),
    putSerp: async (key, response, fetchedAt, ttlMs) =>
      void serp.set(key, { value: { response, fetchedAt }, expiresAt: Date.parse(fetchedAt) + ttlMs }),
    findMedia: async (hashes, now) => {
      for (const item of media.values()) {
        const entry = live(item, now);
        if (entry && hashes.some((h) => hamming(h, entry.pHash) <= HAMMING.sameImage)) return entry;
      }
      return undefined;
    },
    putMedia: async (entry, ttlMs) =>
      void media.set(entry.pHash, { value: entry, expiresAt: Date.parse(entry.createdAt) + ttlMs }),
    addLedger: async (row) => void ledger.push(row),
    ledgerStats: async (monthStart) => {
      const month = ledger.filter((r) => monthKey(r.at) === monthKey(monthStart));
      return {
        creditsThisMonth: month.filter((r) => !r.cached).length,
        cachedThisMonth: month.filter((r) => r.cached).length,
        totalCalls: ledger.length,
      };
    },
    putAudit: async (d, ttlMs) => void audits.set(d.id, { value: d, expiresAt: Date.parse(d.createdAt) + ttlMs }),
    getAudit: async (id, now) => live(audits.get(id), now),
  };
}
