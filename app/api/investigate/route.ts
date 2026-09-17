import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { matchCase } from '@/lib/fixtures/source';
import { AuditError, runAudit } from '@/lib/orchestrator/pipeline';
import { appStore, createAuditDeps, fetchAndHash, FIXTURES_DIR, fixtureMode } from '@/lib/server/deps';
import {
  apiError,
  clientIp,
  MONTHLY_CREDIT_FLOOR,
  MONTHLY_CREDIT_LIMIT,
  monthStartIso,
} from '@/lib/server/http';
import { deleteTemporaryFrames, isTemporaryStoreUrl } from '@/lib/server/mediaStore';
import { allowAudit } from '@/lib/server/rateLimit';
import { openAudit } from '@/lib/server/registry';
import { assertPublicHttpsUrl } from '@/lib/server/ssrf';
import { auditInputSchema } from '@/lib/shared/schema';
import type { AuditInput } from '@/lib/shared/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Starts an audit and returns its id; progress is streamed from /api/investigate/:id/stream. */
export async function POST(req: Request) {
  const parsed = auditInputSchema.safeParse(await req.json().catch(() => undefined));
  if (!parsed.success) return apiError(400, 'INVALID_INPUT', 'The request did not match the expected shape.', parsed.error.flatten());
  if (!allowAudit(clientIp(req))) return apiError(429, 'RATE_LIMITED', 'Too many audits from this address. Try again in a few minutes.');

  const mode = fixtureMode();
  const store = appStore();
  const body = parsed.data;
  let caseId: string | undefined;

  if (mode === 'replay') {
    const hashes = body.media.frames.map((f) => f.pHash).filter((h): h is string => !!h);
    const match = hashes.length ? matchCase(FIXTURES_DIR, hashes) : undefined;
    if (!match) {
      return apiError(
        422,
        'NO_FIXTURE',
        'Replay mode only has recorded results for the demo cases. Pick a demo case, or set FIXTURE_MODE=live to search for real.',
      );
    }
    caseId = match.id;
  } else {
    if (!process.env.SERPAPI_API_KEY) return apiError(503, 'NOT_CONFIGURED', 'SERPAPI_API_KEY is not set.');
    const { creditsThisMonth } = await store.ledgerStats(monthStartIso());
    if (MONTHLY_CREDIT_LIMIT - creditsThisMonth < MONTHLY_CREDIT_FLOOR) {
      return apiError(402, 'CREDITS_EXHAUSTED', 'The monthly SerpApi search budget is nearly used up. Switch to FIXTURE_MODE=replay.');
    }
    for (const frame of body.media.frames) {
      try {
        if (!isTemporaryStoreUrl(frame.url)) await assertPublicHttpsUrl(frame.url);
        frame.pHash ??= await fetchAndHash(frame.url, 5_000);
      } catch {
        return apiError(422, 'FRAME_UNREADABLE', `Could not read the image at ${frame.url}.`);
      }
      if (!frame.pHash) return apiError(422, 'FRAME_UNREADABLE', `Could not read the image at ${frame.url}.`);
    }
  }

  const input: AuditInput = {
    media: { ...body.media, frames: body.media.frames.map((f) => ({ ...f, pHash: f.pHash! })) },
    claim: body.claim,
    options: {
      ...body.options,
      maxCredits: Math.min(body.options.maxCredits, Number(process.env.MAX_CREDITS_PER_AUDIT) || 6),
    },
  };
  const auditId = `dv_${randomBytes(4).toString('hex')}`;
  const emit = openAudit(auditId);
  const deps = { ...createAuditDeps({ mode, store, caseId }), newId: () => auditId };

  void runAudit(input, emit, deps)
    .catch((err) => {
      const code = err instanceof AuditError ? err.code : 'UPSTREAM_FAILED';
      const message = err instanceof AuditError ? err.message : 'The audit failed unexpectedly.';
      if (!(err instanceof AuditError)) console.error(err);
      emit({ type: 'error', data: { code, message, recoverable: false } });
    })
    .finally(() => {
      if (mode !== 'replay') {
        deleteTemporaryFrames(input.media.frames.map((f) => f.url)).catch(() => {});
      }
    });

  return NextResponse.json({ auditId, mode, caseId });
}
