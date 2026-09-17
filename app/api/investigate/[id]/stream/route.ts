import { appStore } from '@/lib/server/deps';
import { apiError } from '@/lib/server/http';
import { subscribe } from '@/lib/server/registry';
import type { AuditEvent } from '@/lib/shared/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const encoder = new TextEncoder();
const frame = (e: AuditEvent) => encoder.encode(`event: ${e.type}\ndata: ${JSON.stringify(e.data)}\n\n`);
const isFinal = (e: AuditEvent) => e.type === 'dossier' || (e.type === 'error' && !e.data.recoverable);

/** Server-Sent Events: replays everything so far, then streams until the dossier arrives. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^dv_[0-9a-f]{8}$/.test(id)) return apiError(404, 'NOT_FOUND', 'Unknown audit id.');

  let unsubscribe: (() => void) | undefined;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        unsubscribe?.();
        controller.close();
      };
      const send = (e: AuditEvent) => {
        if (closed) return;
        controller.enqueue(frame(e));
        if (isFinal(e)) queueMicrotask(close);
      };

      unsubscribe = subscribe(id, send);
      if (!unsubscribe) {
        const dossier = await appStore().getAudit(id, new Date());
        if (dossier) send({ type: 'dossier', data: dossier });
        else send({ type: 'error', data: { code: 'NOT_FOUND', message: 'This audit does not exist or has expired.', recoverable: false } });
      }
      req.signal.addEventListener('abort', close);
    },
    cancel() {
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
