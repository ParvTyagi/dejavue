import path from 'node:path';
import { listCases, type GoldenCase } from '@/lib/fixtures/source';
import { runAudit, type AuditDeps } from '@/lib/orchestrator/pipeline';
import { createAuditDeps } from '@/lib/server/deps';
import type { AuditEvent, Dossier } from '@/lib/shared/types';
import { createMemoryStore } from '@/lib/store/memory';

export const FIXTURES = path.join(__dirname, '..', 'fixtures');

export const goldenCases = (): GoldenCase[] => listCases(FIXTURES);

export function getCase(id: string): GoldenCase {
  const c = goldenCases().find((g) => g.id === id);
  if (!c) throw new Error(`Unknown golden case ${id}`);
  return c;
}

export interface AuditRun {
  dossier?: Dossier;
  error?: unknown;
  events: AuditEvent[];
}

/**
 * Runs a golden case through the real pipeline in replay mode with a fixed
 * clock and a fresh in-memory store. `override` swaps collaborators for
 * failure scenarios.
 */
export async function replay(
  c: GoldenCase,
  override: (deps: AuditDeps) => Partial<AuditDeps> = () => ({}),
  input = c.input,
): Promise<AuditRun> {
  const clock = () => new Date(c.submittedAt);
  const base = createAuditDeps({ mode: 'replay', store: createMemoryStore(), fixturesDir: FIXTURES, caseId: c.id, clock });
  let n = 0;
  const deps: AuditDeps = { ...base, newId: () => `dv_test${n++}`, sign: () => 'test-signature', ...override(base) };
  const events: AuditEvent[] = [];
  try {
    const dossier = await runAudit(input, (e) => events.push(e), deps);
    return { dossier, events };
  } catch (error) {
    return { error, events };
  }
}
