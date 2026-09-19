import { randomBytes } from 'node:crypto';
import { after, NextResponse } from 'next/server';
import { matchOfferCase } from '@/lib/fixtures/source';
import { offerInputSchema } from '@/lib/offer/schema';
import { runOfferCheck } from '@/lib/offer/pipeline';
import type { OfferInput } from '@/lib/offer/types';
import { AuditError } from '@/lib/orchestrator/pipeline';
import { appStore, createAuditDeps, fixtureMode } from '@/lib/server/deps';
import { apiError, clientIp, MONTHLY_CREDIT_FLOOR, MONTHLY_CREDIT_LIMIT, monthStartIso } from '@/lib/server/http';
import { deleteTemporaryFrames, isTemporaryStoreUrl } from '@/lib/server/mediaStore';
import { OFFER_FIXTURES_DIR, replayPaceMs } from '@/lib/server/mode';
import { allowAudit } from '@/lib/server/rateLimit';
import { assertPublicHttpsUrl } from '@/lib/server/ssrf';
import type { Emit } from '@/lib/shared/types';
import { TTL } from '@/lib/store/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// The check keeps running after the response, up to its own 25 s deadline.
export const maxDuration = 60;

/** Starts an offer check and returns its id; progress is streamed from /api/investigate/:id/stream like a media audit. */
export async function POST(req: Request) {
  const parsed = offerInputSchema.safeParse(await req.json().catch(() => undefined));
  if (!parsed.success) return apiError(400, 'INVALID_INPUT', 'Paste the message or upload a screenshot.', parsed.error.flatten());
  const mode = fixtureMode();
  const store = appStore();
  if (!(await allowAudit(store, clientIp(req)))) {
    return apiError(429, 'RATE_LIMITED', 'Too many checks from this address. Try again in a few minutes.');
  }
  const body = parsed.data;
  let caseId: string | undefined;
  let clock: (() => Date) | undefined;

  if (mode === 'replay') {
    const match = matchOfferCase(OFFER_FIXTURES_DIR, body);
    if (!match) {
      return apiError(422, 'NO_FIXTURE', 'This demo site only checks the example messages. Pick one from the Demo messages tab.');
    }
    caseId = match.id;
    const recordedAt = new Date(match.submittedAt);
    clock = () => recordedAt;
  } else {
    if (!process.env.SERPAPI_API_KEY) return apiError(503, 'NOT_CONFIGURED', 'Message checks are not available right now.');
    const { creditsThisMonth } = await store.ledgerStats(monthStartIso());
    if (MONTHLY_CREDIT_LIMIT - creditsThisMonth < MONTHLY_CREDIT_FLOOR) {
      return apiError(402, 'CREDITS_EXHAUSTED', 'DejaVue has used its searches for this month. Please try again later.');
    }
    // Gemini fetches the screenshot from the server, so it must be our own upload or a public address.
    if (body.screenshotUrl && !isTemporaryStoreUrl(body.screenshotUrl)) {
      try {
        await assertPublicHttpsUrl(body.screenshotUrl);
      } catch {
        return apiError(422, 'FRAME_UNREADABLE', 'Could not read the screenshot. Try uploading it again.');
      }
    }
  }

  const input: OfferInput = {
    text: body.text,
    screenshotUrl: body.screenshotUrl,
    claimedOrg: body.claimedOrg,
    maxCredits: Math.min(body.maxCredits, Number(process.env.MAX_CREDITS_PER_AUDIT) || 6),
  };
  const auditId = `dv_${randomBytes(4).toString('hex')}`;
  let logged = Promise.resolve();
  const emit: Emit = (event) => {
    logged = logged.then(() => store.appendEvent(auditId, event, TTL.eventsMs)).catch((err) => console.error(err));
  };
  const deps = {
    ...createAuditDeps({ mode, store, caseId, clock, replayDelayMs: replayPaceMs(), fixturesDir: mode === 'replay' ? OFFER_FIXTURES_DIR : undefined }),
    newId: () => auditId,
  };

  after(async () => {
    try {
      await runOfferCheck(input, emit, deps);
    } catch (err) {
      const code = err instanceof AuditError ? err.code : 'UPSTREAM_FAILED';
      const message = err instanceof AuditError ? err.message : 'The check failed unexpectedly.';
      if (!(err instanceof AuditError)) console.error(err);
      emit({ type: 'error', data: { code, message, recoverable: false } });
    } finally {
      await logged;
      // The screenshot is read once; only the extracted text is kept with the result.
      if (mode !== 'replay' && input.screenshotUrl) await deleteTemporaryFrames([input.screenshotUrl]).catch(() => {});
    }
  });

  return NextResponse.json({ auditId, mode, caseId });
}
