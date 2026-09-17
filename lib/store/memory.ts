import { hamming, HAMMING } from '@/lib/media/phash';
import type { Dossier } from '@/lib/shared/types';
import type { MediaCacheEntry, Store } from './types';

export function createMemoryStore(): Store {
  const serp = new Map<string, { response: unknown; fetchedAt: string }>();
  const media: MediaCacheEntry[] = [];
  const ledger: { cached: boolean; at: string }[] = [];
  const audits = new Map<string, Dossier>();

  return {
    getSerp: (key) => serp.get(key),
    putSerp: (key, response, fetchedAt) => void serp.set(key, { response, fetchedAt }),
    findMedia: (hashes) => media.find((m) => hashes.some((h) => hamming(h, m.pHash) <= HAMMING.sameImage)),
    putMedia: (entry) => void media.push(entry),
    addLedger: (row) => void ledger.push(row),
    ledgerStats: (monthStart) => {
      const month = ledger.filter((r) => r.at >= monthStart);
      return {
        creditsThisMonth: month.filter((r) => !r.cached).length,
        cachedThisMonth: month.filter((r) => r.cached).length,
        totalCalls: ledger.length,
      };
    },
    putAudit: (d) => void audits.set(d.id, d),
    getAudit: (id) => audits.get(id),
  };
}
