import { hamming, HAMMING } from '@/lib/media/phash';
import type { Dossier } from '@/lib/shared/types';
import { monthKey, type MediaCacheEntry, type Store } from './types';

interface Expiring<T> {
  value: T;
  expiresAt: number;
}

export function createMemoryStore(clock: () => Date = () => new Date()): Store {
  const serp = new Map<string, Expiring<{ response: unknown; fetchedAt: string }>>();
  const media = new Map<string, Expiring<MediaCacheEntry>>();
  const ledger: { cached: boolean; at: string }[] = [];
  const audits = new Map<string, Expiring<Dossier>>();

  const expiring = <T>(value: T, ttlMs: number): Expiring<T> => ({ value, expiresAt: clock().getTime() + ttlMs });
  const live = <T>(item: Expiring<T> | undefined) => (item && item.expiresAt > clock().getTime() ? item.value : undefined);

  return {
    getSerp: async (key) => live(serp.get(key)),
    putSerp: async (key, response, fetchedAt, ttlMs) => void serp.set(key, expiring({ response, fetchedAt }, ttlMs)),
    findMedia: async (hashes) => {
      for (const item of media.values()) {
        const entry = live(item);
        if (entry && hashes.some((h) => hamming(h, entry.pHash) <= HAMMING.sameImage)) return entry;
      }
      return undefined;
    },
    putMedia: async (entry, ttlMs) => void media.set(entry.pHash, expiring(entry, ttlMs)),
    addLedger: async (row) => void ledger.push(row),
    ledgerStats: async (monthStart) => {
      const month = ledger.filter((r) => monthKey(r.at) === monthKey(monthStart));
      return {
        creditsThisMonth: month.filter((r) => !r.cached).length,
        cachedThisMonth: month.filter((r) => r.cached).length,
        totalCalls: ledger.length,
      };
    },
    putAudit: async (d, ttlMs) => void audits.set(d.id, expiring(d, ttlMs)),
    getAudit: async (id) => live(audits.get(id)),
  };
}
