import { describe, expect, it } from 'vitest';
import type { Dossier } from '@/lib/shared/types';
import { TTL } from '@/lib/store/types';
import { makeStore, STORE_KINDS } from './stores';

// Every store must behave the same, so the app works identically on a laptop
// (SQLite) and on a serverless host (Upstash Redis).

const DAY = 86_400_000;
const T0 = new Date('2026-09-17T10:00:00Z');

describe.each(STORE_KINDS)('%s store', (kind) => {
  const setup = () => {
    let now = T0;
    const store = makeStore(kind, () => now);
    return {
      store,
      at: (ms: number) => {
        now = new Date(T0.getTime() + ms);
      },
    };
  };

  it('expires query cache entries after their TTL', async () => {
    const { store, at } = setup();
    await store.putSerp('q', { ok: 1 }, T0.toISOString(), TTL.serpMs);
    at(TTL.serpMs - 1);
    expect(await store.getSerp('q')).toEqual({ response: { ok: 1 }, fetchedAt: T0.toISOString() });
    at(TTL.serpMs + 1);
    expect(await store.getSerp('q')).toBeUndefined();
  });

  it('finds near-identical media and forgets it after the TTL', async () => {
    const { store, at } = setup();
    const entry = { pHash: '0bdd9709e6be8112', evidence: [], createdAt: T0.toISOString() };
    await store.putMedia(entry, TTL.mediaMs);
    at(DAY);
    expect(await store.findMedia(['0bdd9709e6be8113'])).toMatchObject({ pHash: entry.pHash });
    expect(await store.findMedia(['f4226af6194170ed'])).toBeUndefined();
    at(TTL.mediaMs + 1);
    expect(await store.findMedia([entry.pHash])).toBeUndefined();
  });

  it('counts credits and cached calls per calendar month', async () => {
    const { store } = setup();
    const row = (at: string, cached: boolean) => ({ auditId: 'dv_1', engine: 'google_lens' as const, cached, at });
    await store.addLedger(row('2026-08-31T23:59:00Z', false));
    await store.addLedger(row('2026-09-01T00:00:00Z', false));
    await store.addLedger(row('2026-09-17T10:00:00Z', false));
    await store.addLedger(row('2026-09-17T10:05:00Z', true));
    expect(await store.ledgerStats('2026-09-01T00:00:00.000Z')).toEqual({ creditsThisMonth: 2, cachedThisMonth: 1, totalCalls: 4 });
  });

  it('keeps dossiers reloadable for 7 days after saving, whatever time the audit itself used', async () => {
    const { store, at } = setup();
    // A replayed audit carries the time its case was recorded, years earlier.
    const dossier = { id: 'dv_0000abcd', createdAt: '2022-02-21T02:00:00.000Z', verdict: 'RECYCLED' } as Dossier;
    await store.putAudit(dossier, TTL.auditMs);
    at(6 * DAY);
    expect(await store.getAudit('dv_0000abcd')).toMatchObject({ verdict: 'RECYCLED' });
    at(TTL.auditMs + 1);
    expect(await store.getAudit('dv_0000abcd')).toBeUndefined();
  });
});
