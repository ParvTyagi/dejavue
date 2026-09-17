import { isFinalEvent, type AuditEvent } from '@/lib/shared/types';

interface LiveAudit {
  events: AuditEvent[];
  listeners: Set<(e: AuditEvent) => void>;
  done: boolean;
}

// Survives Next.js dev hot reloads.
const g = globalThis as { __dejavueAudits?: Map<string, LiveAudit> };
const audits: Map<string, LiveAudit> = (g.__dejavueAudits ??= new Map());

const RETAIN_MS = 10 * 60_000;

export function openAudit(id: string): (e: AuditEvent) => void {
  const audit: LiveAudit = { events: [], listeners: new Set(), done: false };
  audits.set(id, audit);
  return (event) => {
    audit.events.push(event);
    if (isFinalEvent(event)) {
      audit.done = true;
      setTimeout(() => audits.delete(id), RETAIN_MS).unref?.();
    }
    for (const l of audit.listeners) l(event);
  };
}

/** Replays past events, then streams new ones until the audit ends. */
export function subscribe(id: string, listener: (e: AuditEvent) => void): (() => void) | undefined {
  const audit = audits.get(id);
  if (!audit) return undefined;
  for (const e of audit.events) listener(e);
  if (audit.done) return () => {};
  audit.listeners.add(listener);
  return () => audit.listeners.delete(listener);
}
