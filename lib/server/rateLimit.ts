const WINDOW_MS = 10 * 60_000;
const MAX_AUDITS = 10;

const g = globalThis as { __dejavueRate?: Map<string, number[]> };
const hits: Map<string, number[]> = (g.__dejavueRate ??= new Map());

/** 10 audits per IP per 10 minutes, to protect credits if the demo is exposed. */
export function allowAudit(ip: string, now = Date.now()): boolean {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_AUDITS) {
    hits.set(ip, recent);
    return false;
  }
  recent.push(now);
  hits.set(ip, recent);
  return true;
}
