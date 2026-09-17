import { NextResponse } from 'next/server';
import { fixtureMode } from '@/lib/server/deps';
import { apiError } from '@/lib/server/http';
import { putTemporaryFrame } from '@/lib/server/mediaStore';
import { MEDIA_LIMITS } from '@/lib/shared/limits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Stores one prepared frame (≤1024 px, ≤2 MB) in the temporary bucket and
 * returns a 15-minute signed URL that SerpApi can fetch.
 */
export async function POST(req: Request) {
  if (fixtureMode() === 'replay') {
    return apiError(400, 'INVALID_INPUT', 'Uploads are not available on this demo site.');
  }
  const form = await req.formData().catch(() => undefined);
  const file = form?.get('frame');
  if (!(file instanceof File)) return apiError(400, 'INVALID_INPUT', 'Send the frame as multipart field "frame".');
  if (file.size > MEDIA_LIMITS.frameBytes) return apiError(413, 'FRAME_TOO_LARGE', 'Frames must be 2 MB or smaller.');
  if (!TYPES.has(file.type)) return apiError(400, 'INVALID_INPUT', 'Frames must be JPEG, PNG or WebP.');
  try {
    const stored = await putTemporaryFrame(await file.arrayBuffer(), file.type);
    return NextResponse.json({ url: stored.url, expiresInSeconds: stored.expiresInSeconds });
  } catch (err) {
    console.error(err);
    return apiError(502, 'UPSTREAM_FAILED', 'The temporary media store is unavailable. Paste a public image URL instead.');
  }
}
