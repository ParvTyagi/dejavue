import type { Dossier, EngineId, Evidence, GeoPoint, SceneReading } from '@/lib/shared/types';

export interface MediaCacheEntry {
  pHash: string;
  evidence: Evidence[];
  scene?: SceneReading;
  sceneGeo?: GeoPoint;
  createdAt: string;
}

export interface LedgerStats {
  creditsThisMonth: number;
  cachedThisMonth: number;
  totalCalls: number;
}

/**
 * Persistence for caches, the credit ledger and finished audits. Never holds
 * pixels. Every write takes a time-to-live; reads take the current time so
 * expiry is decided by the audit clock, not the machine clock.
 */
export interface Store {
  getSerp(key: string, now: Date): Promise<{ response: unknown; fetchedAt: string } | undefined>;
  putSerp(key: string, response: unknown, fetchedAt: string, ttlMs: number): Promise<void>;
  /** Cached telemetry for media within Hamming 6 of any given hash. */
  findMedia(pHashes: string[], now: Date): Promise<MediaCacheEntry | undefined>;
  putMedia(entry: MediaCacheEntry, ttlMs: number): Promise<void>;
  addLedger(row: { auditId: string; engine: EngineId; cached: boolean; at: string }): Promise<void>;
  /** Totals for the calendar month (UTC) that starts at `monthStart`. */
  ledgerStats(monthStart: string): Promise<LedgerStats>;
  putAudit(dossier: Dossier, ttlMs: number): Promise<void>;
  getAudit(id: string, now: Date): Promise<Dossier | undefined>;
}

export const TTL = {
  /** Default SerpApi query cache. */
  serpMs: 24 * 3_600_000,
  /** Places don't move, so Maps lookups are kept much longer. */
  mapsMs: 30 * 86_400_000,
  /** Evidence reused for near-identical media. */
  mediaMs: 7 * 86_400_000,
  /** Finished dossiers stay reloadable for 7 days. */
  auditMs: 7 * 86_400_000,
} as const;

export const monthKey = (iso: string) => iso.slice(0, 7);
