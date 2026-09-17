import { randomBytes } from 'node:crypto';
import { after, NextResponse } from 'next/server';
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
import { assertPublicHttpsUrl } from '@/lib/server/ssrf';
import { auditInputSchema } from '@/lib/shared/schema';
import type { AuditInput, Emit } from '@/lib/shared/types';
import { TTL } from '@/lib/store/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// The audit keeps running after the response (up to its own 25 s deadline plus narration).
export const maxDuration = 60;

/** Starts an audit and returns its id; progress is streamed from /api/investigate/:id/stream. */
export async function POST(req: Request) {
  const parsed = auditInputSchema.safeParse(await req.json().catch(() => undefined));
  if (!parsed.success) return apiError(400, 'INVALID_INPUT', 'The request did not match the expected shape.', parsed.error.flatten());
  const mode = fixtureMode();
  const store = appStore();
  if (!(await allowAudit(store, clientIp(req)))) {
    return apiError(429, 'RATE_LIMITED', 'Too many audits from this address. Try again in a few minutes.');
  }
  const body = parsed.data;
  let caseId: string | undefined;
  // Replay runs at the moment the case was recorded, so dates in its fixtures mean what they meant then.
  let clock: (() => Date) | undefined;

  if (mode === 'replay') {
    const hashes = body.media.frames.map((f) => f.pHash).filter((h): h is string => !!h);
    const match = hashes.length ? matchCase(FIXTURES_DIR, hashes) : undefined;
    if (!match) {
      return apiError(
        422,
        'NO_FIXTURE',
        'This demo site only checks the example cases. Pick one from the Demo cases tab.',
      );
    }
    caseId = match.id;
    const recordedAt = new Date(match.submittedAt);
    clock = () => recordedAt;
  } else {
    if (!process.env.SERPAPI_API_KEY) return apiError(503, 'NOT_CONFIGURED', 'Photo checks are not available right now.');
    const { creditsThisMonth } = await store.ledgerStats(monthStartIso());
    if (MONTHLY_CREDIT_LIMIT - creditsThisMonth < MONTHLY_CREDIT_FLOOR) {
      return apiError(402, 'CREDITS_EXHAUSTED', 'DejaVue has used its searches for this month. Please try again later.');
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
  // Events go to the shared store in order, so a stream served by any instance can follow the audit.
  let logged = Promise.resolve();
  const emit: Emit = (event) => {
    logged = logged.then(() => store.appendEvent(auditId, event, TTL.eventsMs)).catch((err) => console.error(err));
  };
  const replayDelayMs = Number(process.env.REPLAY_PACE_MS ?? 700);
  const deps = { ...createAuditDeps({ mode, store, caseId, clock, replayDelayMs }), newId: () => auditId };

  // after() keeps a serverless function alive until the audit is done.
  after(async () => {
    try {
      await runAudit(input, emit, deps);
    } catch (err) {
      const code = err instanceof AuditError ? err.code : 'UPSTREAM_FAILED';
      const message = err instanceof AuditError ? err.message : 'The audit failed unexpectedly.';
      if (!(err instanceof AuditError)) console.error(err);
      emit({ type: 'error', data: { code, message, recoverable: false } });
    } finally {
      await logged;
      if (mode !== 'replay') await deleteTemporaryFrames(input.media.frames.map((f) => f.url)).catch(() => {});
    }
  });

  return NextResponse.json({ auditId, mode, caseId });
}
