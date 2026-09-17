import { appStore } from '@/lib/server/deps';
import { apiError } from '@/lib/server/http';
import { pause } from '@/lib/shared/time';
import { isFinalEvent, type AuditEvent } from '@/lib/shared/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const POLL_MS = 350;
/** Close before the platform limit; the browser reconnects and resumes from Last-Event-ID. */
const STREAM_MS = 50_000;
/** How long to wait for a just-started audit to log its first event. */
const START_GRACE_MS = 10_000;

const encoder = new TextEncoder();
const sse = (seq: number, e: AuditEvent) => encoder.encode(`id: ${seq}\nevent: ${e.type}\ndata: ${JSON.stringify(e.data)}\n\n`);
const notFound: AuditEvent = {
  type: 'error',
  data: { code: 'NOT_FOUND', message: 'This audit does not exist or has expired.', recoverable: false },
};

/**
 * Server-Sent Events for one audit. Events are read from the shared store, so this
 * works on any server instance, not only the one running the audit.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^dv_[0-9a-f]{8}$/.test(id)) return apiError(404, 'NOT_FOUND', 'Unknown audit id.');
  const store = appStore();
  const resumeFrom = Number(req.headers.get('last-event-id') ?? -1) + 1;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const started = Date.now();
      let next = Number.isFinite(resumeFrom) && resumeFrom > 0 ? resumeFrom : 0;
      controller.enqueue(encoder.encode('retry: 1000\n\n'));
      try {
        while (!req.signal.aborted && Date.now() - started < STREAM_MS) {
          const events = await store.readEvents(id, next);
          for (const event of events) {
            controller.enqueue(sse(next++, event));
            if (isFinalEvent(event)) return;
          }
          if (next === 0 && events.length === 0) {
            // Nothing logged: either finished long ago (events expired) or not started yet.
            const dossier = await store.getAudit(id);
            if (dossier) {
              controller.enqueue(sse(0, { type: 'dossier', data: dossier }));
              return;
            }
            if (Date.now() - started > START_GRACE_MS) {
              controller.enqueue(sse(0, notFound));
              return;
            }
          }
          await pause(POLL_MS, req.signal);
        }
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed by a disconnecting client.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
