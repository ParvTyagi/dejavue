import { createHmac, timingSafeEqual } from 'node:crypto';

/** JSON with object keys sorted at every level, so equal dossiers sign identically. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, (v as Record<string, unknown>)[k]]))
      : v,
  );
}

export function signDossier(unsigned: object, secret: string | undefined): string {
  if (!secret) return 'unsigned';
  return createHmac('sha256', secret).update(canonicalJson(unsigned)).digest('hex');
}

export function verifyDossier(dossier: { signature?: string } & object, secret: string | undefined): boolean {
  if (!secret || !dossier.signature || dossier.signature === 'unsigned') return false;
  const { signature, ...unsigned } = dossier;
  const expected = Buffer.from(signDossier(unsigned, secret), 'hex');
  const given = Buffer.from(signature, 'hex');
  return expected.length === given.length && timingSafeEqual(expected, given);
}
