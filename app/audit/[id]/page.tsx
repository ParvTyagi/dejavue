import { AuditView } from '@/components/audit/AuditView';
import { appStore } from '@/lib/server/deps';
import type { AuditEvent } from '@/lib/shared/types';

export const dynamic = 'force-dynamic';

export default async function AuditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AuditView id={id} initialEvents={await eventsSoFar(id)} />;
}

/**
 * Everything the audit has logged by now, so a finished audit (or a shared link) paints its
 * verdict from the server HTML and the browser only streams what comes after.
 */
async function eventsSoFar(id: string): Promise<AuditEvent[]> {
  if (!/^dv_[0-9a-f]{8}$/.test(id)) return [];
  const store = appStore();
  const events = await store.readEvents(id, 0);
  if (events.length > 0) return events;
  // The event log expires before the dossier does.
  const dossier = await store.getAudit(id);
  return dossier ? [{ type: 'dossier', data: dossier }] : [];
}
