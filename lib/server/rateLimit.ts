import type { Store } from '@/lib/store/types';

const WINDOW_MS = 10 * 60_000;
const MAX_AUDITS = 10;

/**
 * 10 audits per IP per 10 minutes, to protect credits if the demo is exposed.
 * Counted in the shared store so every server instance enforces the same limit.
 */
export async function allowAudit(store: Store, ip: string): Promise<boolean> {
  return (await store.countHit(`audit:${ip}`, WINDOW_MS)) <= MAX_AUDITS;
}
