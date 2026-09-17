import { NextResponse } from 'next/server';
import { apiError } from '@/lib/server/http';
import { verifyDossier } from '@/lib/server/sign';

export const runtime = 'nodejs';

/** Checks that a dossier's HMAC signature matches its contents. */
export async function POST(req: Request) {
  const dossier = await req.json().catch(() => undefined);
  if (!dossier || typeof dossier !== 'object') return apiError(400, 'INVALID_INPUT', 'Send the dossier JSON as the body.');
  if (!process.env.DOSSIER_HMAC_SECRET) {
    return apiError(503, 'NOT_CONFIGURED', 'DOSSIER_HMAC_SECRET is not set, so dossiers are unsigned.');
  }
  return NextResponse.json({ valid: verifyDossier(dossier, process.env.DOSSIER_HMAC_SECRET) });
}
