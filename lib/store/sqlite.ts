import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { isSameImage } from '@/lib/media/phash';
import type { AuditEvent, AnyDossier } from '@/lib/shared/types';
import { monthKey, type MediaCacheEntry, type Store } from './types';

// Node's built-in SQLite, loaded at runtime so bundlers don't try to resolve it.
type DatabaseSync = import('node:sqlite').DatabaseSync;
const { DatabaseSync } = process.getBuiltinModule('node:sqlite') as typeof import('node:sqlite');

const SCHEMA_VERSION = 3;

/** Local store for running on one machine. Cached data is disposable, so schema changes rebuild it. */
export function createSqliteStore(file: string, clock: () => Date = () => new Date()): Store {
  mkdirSync(path.dirname(file), { recursive: true });
  const db: DatabaseSync = new DatabaseSync(file);
  const { user_version } = db.prepare('PRAGMA user_version').get() as { user_version: number };
  if (user_version !== SCHEMA_VERSION) {
    db.exec(`
      DROP TABLE IF EXISTS serp_cache;
      DROP TABLE IF EXISTS media_cache;
      DROP TABLE IF EXISTS audits;
      DROP TABLE IF EXISTS audit_events;
      DROP TABLE IF EXISTS rate_hits;
      CREATE TABLE serp_cache (key TEXT PRIMARY KEY, response_json TEXT NOT NULL, fetched_at TEXT NOT NULL, expires_at INTEGER NOT NULL);
      CREATE TABLE media_cache (phash TEXT PRIMARY KEY, payload_json TEXT NOT NULL, expires_at INTEGER NOT NULL);
      CREATE TABLE audits (id TEXT PRIMARY KEY, dossier_json TEXT NOT NULL, expires_at INTEGER NOT NULL);
      CREATE TABLE audit_events (audit_id TEXT NOT NULL, seq INTEGER NOT NULL, event_json TEXT NOT NULL, expires_at INTEGER NOT NULL,
        PRIMARY KEY (audit_id, seq));
      CREATE TABLE rate_hits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS credit_ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, audit_id TEXT NOT NULL,
        engine TEXT NOT NULL, cached INTEGER NOT NULL, at TEXT NOT NULL);
      PRAGMA user_version = ${SCHEMA_VERSION};
    `);
  }

  const now = () => clock().getTime();
  const purge = (table: 'serp_cache' | 'media_cache' | 'audits' | 'audit_events' | 'rate_hits') =>
    db.prepare(`DELETE FROM ${table} WHERE expires_at <= ?`).run(now());

  return {
    async getSerp(key) {
      const row = db
        .prepare('SELECT response_json, fetched_at FROM serp_cache WHERE key = ? AND expires_at > ?')
        .get(key, now()) as { response_json: string; fetched_at: string } | undefined;
      return row && { response: JSON.parse(row.response_json), fetchedAt: row.fetched_at };
    },
    async putSerp(key, response, fetchedAt, ttlMs) {
      purge('serp_cache');
      db.prepare('INSERT OR REPLACE INTO serp_cache VALUES (?, ?, ?, ?)').run(key, JSON.stringify(response), fetchedAt, now() + ttlMs);
    },
    async findMedia(hashes) {
      const rows = db
        .prepare('SELECT phash, payload_json FROM media_cache WHERE expires_at > ?')
        .all(now()) as { phash: string; payload_json: string }[];
      const row = rows.find((r) => isSameImage(hashes, r.phash));
      return row && (JSON.parse(row.payload_json) as MediaCacheEntry);
    },
    async putMedia(entry, ttlMs) {
      purge('media_cache');
      db.prepare('INSERT OR REPLACE INTO media_cache VALUES (?, ?, ?)').run(entry.pHash, JSON.stringify(entry), now() + ttlMs);
    },
    async addLedger(row) {
      db.prepare('INSERT INTO credit_ledger (audit_id, engine, cached, at) VALUES (?, ?, ?, ?)').run(
        row.auditId,
        row.engine,
        row.cached ? 1 : 0,
        row.at,
      );
    },
    async ledgerStats(monthStart) {
      const month = monthKey(monthStart);
      const row = db
        .prepare(
          `SELECT
             SUM(CASE WHEN cached = 0 AND substr(at, 1, 7) = ? THEN 1 ELSE 0 END) AS credits,
             SUM(CASE WHEN cached = 1 AND substr(at, 1, 7) = ? THEN 1 ELSE 0 END) AS cachedCalls,
             COUNT(*) AS total
           FROM credit_ledger`,
        )
        .get(month, month) as { credits: number | null; cachedCalls: number | null; total: number };
      return { creditsThisMonth: row.credits ?? 0, cachedThisMonth: row.cachedCalls ?? 0, totalCalls: row.total };
    },
    async putAudit(dossier: AnyDossier, ttlMs) {
      purge('audits');
      db.prepare('INSERT OR REPLACE INTO audits VALUES (?, ?, ?)').run(dossier.id, JSON.stringify(dossier), now() + ttlMs);
    },
    async appendEvent(auditId, event, ttlMs) {
      db.prepare(
        `INSERT INTO audit_events (audit_id, seq, event_json, expires_at)
         VALUES (?, (SELECT COALESCE(MAX(seq) + 1, 0) FROM audit_events WHERE audit_id = ?), ?, ?)`,
      ).run(auditId, auditId, JSON.stringify(event), now() + ttlMs);
    },
    async readEvents(auditId, from) {
      const rows = db
        .prepare('SELECT event_json FROM audit_events WHERE audit_id = ? AND seq >= ? AND expires_at > ? ORDER BY seq')
        .all(auditId, from, now()) as { event_json: string }[];
      return rows.map((r) => JSON.parse(r.event_json) as AuditEvent);
    },
    async countHit(key, windowMs) {
      purge('rate_hits');
      db.prepare(
        `INSERT INTO rate_hits (key, count, expires_at) VALUES (?, 1, ?)
         ON CONFLICT(key) DO UPDATE SET count = count + 1`,
      ).run(key, now() + windowMs);
      return (db.prepare('SELECT count FROM rate_hits WHERE key = ?').get(key) as { count: number }).count;
    },
    async getAudit(id) {
      const row = db
        .prepare('SELECT dossier_json FROM audits WHERE id = ? AND expires_at > ?')
        .get(id, now()) as { dossier_json: string } | undefined;
      return row && (JSON.parse(row.dossier_json) as AnyDossier);
    },
  };
}
