import type { Dossier, EngineId, Evidence, GeoPoint, SceneReading } from '@/lib/shared/types';

export interface MediaCacheEntry {
  pHash: string;
  evidence: Evidence[];
  scene?: SceneReading;
  sceneGeo?: GeoPoint;
  createdAt: string;
}

/** Persistence for caches, the credit ledger and finished audits. Never holds pixels. */
export interface Store {
  getSerp(key: string): { response: unknown; fetchedAt: string } | undefined;
  putSerp(key: string, response: unknown, fetchedAt: string): void;
  /** Returns cached telemetry for media within Hamming 6 of any given hash. */
  findMedia(pHashes: string[]): MediaCacheEntry | undefined;
  putMedia(entry: MediaCacheEntry): void;
  addLedger(row: { auditId: string; engine: EngineId; cached: boolean; at: string }): void;
  ledgerStats(monthStart: string): { creditsThisMonth: number; cachedThisMonth: number; totalCalls: number };
  putAudit(dossier: Dossier): void;
  getAudit(id: string): Dossier | undefined;
}
