import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { hamming, HAMMING } from '@/lib/media/phash';
import type { Dossier } from '@/lib/shared/types';
import type { MediaCacheEntry, Store } from './types';

// Node's built-in SQLite, loaded at runtime so bundlers don't try to resolve it.
type DatabaseSync = import('node:sqlite').DatabaseSync;
const { DatabaseSync } = process.getBuiltinModule('node:sqlite') as typeof import('node:sqlite');

const AUDIT_RETENTION_MS = 7 * 86_400_000;

export function createSqliteStore(file: string): Store {
  mkdirSync(path.dirname(file), { recursive: true });
  const db: DatabaseSync = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE IF NOT EXISTS serp_cache (key TEXT PRIMARY KEY, response_json TEXT NOT NULL, fetched_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS media_cache (phash TEXT PRIMARY KEY, payload_json TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS credit_ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, audit_id TEXT NOT NULL,
      engine TEXT NOT NULL, cached INTEGER NOT NULL, at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audits (id TEXT PRIMARY KEY, dossier_json TEXT NOT NULL, created_at TEXT NOT NULL);
  `);

  return {
    getSerp(key) {
      const row = db.prepare('SELECT response_json, fetched_at FROM serp_cache WHERE key = ?').get(key) as
        | { response_json: string; fetched_at: string }
        | undefined;
      return row && { response: JSON.parse(row.response_json), fetchedAt: row.fetched_at };
    },
    putSerp(key, response, fetchedAt) {
      db.prepare('INSERT OR REPLACE INTO serp_cache VALUES (?, ?, ?)').run(key, JSON.stringify(response), fetchedAt);
    },
    findMedia(hashes) {
      const rows = db.prepare('SELECT phash, payload_json FROM media_cache').all() as {
        phash: string;
        payload_json: string;
      }[];
      const row = rows.find((r) => hashes.some((h) => hamming(h, r.phash) <= HAMMING.sameImage));
      return row && (JSON.parse(row.payload_json) as MediaCacheEntry);
    },
    putMedia(entry) {
      db.prepare('INSERT OR REPLACE INTO media_cache VALUES (?, ?, ?)').run(
        entry.pHash,
        JSON.stringify(entry),
        entry.createdAt,
      );
    },
    addLedger(row) {
      db.prepare('INSERT INTO credit_ledger (audit_id, engine, cached, at) VALUES (?, ?, ?, ?)').run(
        row.auditId,
        row.engine,
        row.cached ? 1 : 0,
        row.at,
      );
    },
    ledgerStats(monthStart) {
      const row = db
        .prepare(
          `SELECT
             SUM(CASE WHEN cached = 0 AND at >= ? THEN 1 ELSE 0 END) AS credits,
             SUM(CASE WHEN cached = 1 AND at >= ? THEN 1 ELSE 0 END) AS cachedCalls,
             COUNT(*) AS total
           FROM credit_ledger`,
        )
        .get(monthStart, monthStart) as { credits: number | null; cachedCalls: number | null; total: number };
      return { creditsThisMonth: row.credits ?? 0, cachedThisMonth: row.cachedCalls ?? 0, totalCalls: row.total };
    },
    putAudit(dossier: Dossier) {
      const cutoff = new Date(Date.parse(dossier.createdAt) - AUDIT_RETENTION_MS).toISOString();
      db.prepare('DELETE FROM audits WHERE created_at < ?').run(cutoff);
      db.prepare('INSERT OR REPLACE INTO audits VALUES (?, ?, ?)').run(
        dossier.id,
        JSON.stringify(dossier),
        dossier.createdAt,
      );
    },
    getAudit(id) {
      const row = db.prepare('SELECT dossier_json FROM audits WHERE id = ?').get(id) as
        | { dossier_json: string }
        | undefined;
      return row && (JSON.parse(row.dossier_json) as Dossier);
    },
  };
}
