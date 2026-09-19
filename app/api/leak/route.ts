import { randomBytes } from 'node:crypto';
import { after, NextResponse } from 'next/server';
import { matchLeakCase } from '@/lib/fixtures/source';
import { runLeakTrace } from '@/lib/leak/pipeline';
import { leakInputSchema } from '@/lib/leak/schema';
import type { LeakInput } from '@/lib/leak/types';
import { AuditError } from '@/lib/orchestrator/pipeline';
import { appStore, createAuditDeps, fetchAndHash, fixtureMode } from '@/lib/server/deps';
import { apiError, clientIp, MONTHLY_CREDIT_FLOOR, MONTHLY_CREDIT_LIMIT, monthStartIso } from '@/lib/server/http';
import { deleteTemporaryFrames, isTemporaryStoreUrl } from '@/lib/server/mediaStore';
import { LEAK_FIXTURES_DIR, replayPaceMs } from '@/lib/server/mode';
import { allowAudit } from '@/lib/server/rateLimit';
import { assertPublicHttpsUrl } from '@/lib/server/ssrf';
import type { Emit } from '@/lib/shared/types';
import { TTL } from '@/lib/store/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// The trace keeps running after the response, up to its own 25 s deadline plus narration.
export const maxDuration = 60;

/** Starts a leak trace and returns its id; progress streams from /api/investigate/:id/stream like a media audit. */
export async function POST(req: Request) {
  const parsed = leakInputSchema.safeParse(await req.json().catch(() => undefined));
  if (!parsed.success) return apiError(400, 'INVALID_INPUT', 'The request did not match the expected shape.', parsed.error.flatten());
  const mode = fixtureMode();
  const store = appStore();
  if (!(await allowAudit(store, clientIp(req)))) {
    return apiError(429, 'RATE_LIMITED', 'Too many checks from this address. Try again in a few minutes.');
  }
  const body = parsed.data;
  let caseId: string | undefined;
  // Replay runs at the moment the case was recorded, so dates in its fixtures mean what they meant then.
  let clock: (() => Date) | undefined;

  if (mode === 'replay') {
    const hashes = body.media.frames.map((f) => f.pHash).filter((h): h is string => !!h);
    const match = hashes.length ? matchLeakCase(LEAK_FIXTURES_DIR, hashes) : undefined;
    if (!match) {
      return apiError(422, 'NO_FIXTURE', 'This demo site only traces the example documents. Pick one from the Demo cases tab.');
    }
    caseId = match.id;
    const recordedAt = new Date(match.submittedAt);
    clock = () => recordedAt;
  } else {
    if (!process.env.SERPAPI_API_KEY) return apiError(503, 'NOT_CONFIGURED', 'Leak traces are not available right now.');
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

  const input: LeakInput = {
    media: { ...body.media, frames: body.media.frames.map((f) => ({ ...f, pHash: f.pHash! })) },
    claim: body.claim,
    maxCredits: Math.min(body.maxCredits, Number(process.env.MAX_CREDITS_PER_AUDIT) || 6),
  };
  const auditId = `dv_${randomBytes(4).toString('hex')}`;
  // Events go to the shared store in order, so a stream served by any instance can follow the trace.
  let logged = Promise.resolve();
  const emit: Emit = (event) => {
    logged = logged.then(() => store.appendEvent(auditId, event, TTL.eventsMs)).catch((err) => console.error(err));
  };
  const deps = {
    ...createAuditDeps({
      mode,
      store,
      caseId,
      clock,
      replayDelayMs: replayPaceMs(),
      fixturesDir: mode === 'replay' ? LEAK_FIXTURES_DIR : undefined,
    }),
    newId: () => auditId,
  };

  after(async () => {
    try {
      await runLeakTrace(input, emit, deps);
    } catch (err) {
      const code = err instanceof AuditError ? err.code : 'UPSTREAM_FAILED';
      const message = err instanceof AuditError ? err.message : 'The trace failed unexpectedly.';
      if (!(err instanceof AuditError)) console.error(err);
      emit({ type: 'error', data: { code, message, recoverable: false } });
    } finally {
      await logged;
      // The uploaded document is searched by URL and then deleted; only the evidence is kept.
      if (mode !== 'replay') await deleteTemporaryFrames(input.media.frames.map((f) => f.url)).catch(() => {});
    }
  });

  return NextResponse.json({ auditId, mode, caseId });
}
