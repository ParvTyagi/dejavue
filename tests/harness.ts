import path from 'node:path';
import { vi } from 'vitest';
import { listCases, listLeakCases, listOfferCases, type GoldenCase, type LeakCase, type OfferCase } from '@/lib/fixtures/source';
import { runLeakTrace, type LeakDeps } from '@/lib/leak/pipeline';
import type { LeakDossier } from '@/lib/leak/types';
import { runOfferCheck, type OfferDeps } from '@/lib/offer/pipeline';
import type { OfferDossier } from '@/lib/offer/types';
import { runAudit, type AuditDeps } from '@/lib/orchestrator/pipeline';
import { createAuditDeps } from '@/lib/server/deps';
import type { AuditEvent, Dossier } from '@/lib/shared/types';
import { createMemoryStore } from '@/lib/store/memory';

export const FIXTURES = path.join(__dirname, '..', 'fixtures');
export const OFFER_FIXTURES = path.join(FIXTURES, 'offers');
export const LEAK_FIXTURES = path.join(FIXTURES, 'leaks');

export const goldenCases = (): GoldenCase[] => listCases(FIXTURES);

export function getCase(id: string): GoldenCase {
  const c = goldenCases().find((g) => g.id === id);
  if (!c) throw new Error(`Unknown golden case ${id}`);
  return c;
}

export const offerCases = (): OfferCase[] => listOfferCases(OFFER_FIXTURES);

export function getOfferCase(id: string): OfferCase {
  const c = offerCases().find((g) => g.id === id);
  if (!c) throw new Error(`Unknown offer case ${id}`);
  return c;
}

export const leakCases = (): LeakCase[] => listLeakCases(LEAK_FIXTURES);

export function getLeakCase(id: string): LeakCase {
  const c = leakCases().find((g) => g.id === id);
  if (!c) throw new Error(`Unknown leak case ${id}`);
  return c;
}

export const NO_RESULTS = { status: 200, body: { search_metadata: { status: 'Success' }, error: "Google hasn't returned any results for this query." } };

/**
 * Runs `test` with live-mode SerpApi requests answered by `respond` instead of the
 * network, and no Gemini key. `fetched` records the engine of every request.
 */
export async function withFakeSerpApi<T>(
  respond: (engine: string) => { status: number; body: unknown },
  test: (fetched: string[]) => Promise<T>,
): Promise<T> {
  const fetched: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL | Request) => {
      const engine = new URL(String(url)).searchParams.get('engine')!;
      fetched.push(engine);
      const { status, body } = respond(engine);
      return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    }),
  );
  vi.stubEnv('SERPAPI_API_KEY', 'test-key');
  vi.stubEnv('GEMINI_API_KEY', '');
  try {
    return await test(fetched);
  } finally {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
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
  const deps: AuditDeps = { ...base, newId: () => `dv_test${n++}`, wallClock: clock, sign: () => 'test-signature', ...override(base) };
  const events: AuditEvent[] = [];
  try {
    const dossier = await runAudit(input, (e) => events.push(e), deps);
    return { dossier, events };
  } catch (error) {
    return { error, events };
  }
}

export interface OfferRun {
  dossier?: OfferDossier;
  error?: unknown;
  events: AuditEvent[];
}

/** Runs an offer case through the real offer pipeline in replay mode, like `replay` does for media. */
export async function replayOffer(
  c: OfferCase,
  override: (deps: OfferDeps) => Partial<OfferDeps> = () => ({}),
  input = c.input,
): Promise<OfferRun> {
  const clock = () => new Date(c.submittedAt);
  const base = createAuditDeps({ mode: 'replay', store: createMemoryStore(), fixturesDir: OFFER_FIXTURES, caseId: c.id, clock });
  let n = 0;
  const deps: OfferDeps = { ...base, newId: () => `dv_test${n++}`, wallClock: clock, sign: () => 'test-signature', ...override(base) };
  const events: AuditEvent[] = [];
  try {
    const dossier = await runOfferCheck(input, (e) => events.push(e), deps);
    return { dossier, events };
  } catch (error) {
    return { error, events };
  }
}

export interface LeakRun {
  dossier?: LeakDossier;
  error?: unknown;
  events: AuditEvent[];
}

/** Runs a leak case through the real leak pipeline in replay mode, like `replay` does for media. */
export async function replayLeak(
  c: LeakCase,
  override: (deps: LeakDeps) => Partial<LeakDeps> = () => ({}),
  input = c.input,
): Promise<LeakRun> {
  const clock = () => new Date(c.submittedAt);
  const base = createAuditDeps({ mode: 'replay', store: createMemoryStore(), fixturesDir: LEAK_FIXTURES, caseId: c.id, clock });
  let n = 0;
  const deps: LeakDeps = { ...base, newId: () => `dv_test${n++}`, wallClock: clock, sign: () => 'test-signature', ...override(base) };
  const events: AuditEvent[] = [];
  try {
    const dossier = await runLeakTrace(input, (e) => events.push(e), deps);
    return { dossier, events };
  } catch (error) {
    return { error, events };
  }
}
