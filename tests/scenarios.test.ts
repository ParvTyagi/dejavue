import { describe, expect, it } from 'vitest';
import type { LlmPort } from '@/lib/llm/port';
import { AuditError } from '@/lib/orchestrator/pipeline';
import { SerpError, type SerpClient } from '@/lib/serp/client';
import type { EngineId } from '@/lib/shared/types';
import { createMemoryStore } from '@/lib/store/memory';
import { getCase, replay } from './harness';

const failing =
  (serp: SerpClient, engines: EngineId[], code: SerpError['code'] = 'UPSTREAM_FAILED'): SerpClient =>
  (engine, params, ctx) =>
    engines.includes(engine) ? Promise.reject(new SerpError(code, engine, `${engine} down`)) : serp(engine, params, ctx);

const llmWith = (llm: LlmPort, patch: Partial<LlmPort>): LlmPort => ({ ...llm, ...patch });
const down = async () => {
  throw new Error('Gemini unavailable');
};

describe('audit stream', () => {
  it('streams stages, credits and evidence, then stops early and saves the unused searches', async () => {
    const { events } = await replay(getCase('c2-uttarakhand-flood'));
    const types = events.map((e) => (e.type === 'stage' ? `stage:${e.data.stage}` : e.type));
    expect(types.slice(0, 5)).toEqual(['stage:claim', 'stage:scene', 'stage:tier1', 'credit', 'evidence']);
    expect(types.slice(-5)).toEqual(['short_circuit', 'stage:judge', 'signal', 'stage:narrate', 'dossier']);
    expect(events.find((e) => e.type === 'short_circuit')?.data).toEqual({ afterTier: 1, creditsSaved: 5 });
    expect(events.filter((e) => e.type === 'evidence').map((e) => (e.data as { match?: { confirmed: boolean } }).match?.confirmed)).toEqual([
      true,
      true,
      true,
    ]);
  });
});

describe('engine failures', () => {
  it('uses Bing as tier 1 when Google Lens is down, and marks the lost confidence', async () => {
    const { dossier, events } = await replay(getCase('s06-misplaced-with-match'), (d) => ({
      serp: failing(d.serp, ['google_lens']),
    }));
    expect(dossier!.verdict).toBe('MISPLACED');
    expect(dossier!.signals.enginesFailed).toEqual(['google_lens']);
    expect(dossier!.confidence.reasons).toContainEqual({ label: 'google_lens failed or timed out', points: -10 });
    expect(events).toContainEqual({
      type: 'error',
      data: { code: 'UPSTREAM_FAILED', message: 'google_lens down', recoverable: true },
    });
  });

  it('gives up with UPSTREAM_FAILED when Lens and Bing both fail', async () => {
    const { dossier, error } = await replay(getCase('c2-uttarakhand-flood'), (d) => ({
      serp: failing(d.serp, ['google_lens', 'bing_reverse_image']),
    }));
    expect(dossier).toBeUndefined();
    expect(error).toBeInstanceOf(AuditError);
    expect(error).toMatchObject({ code: 'UPSTREAM_FAILED', status: 502 });
  });

  it('finishes a partial audit with the evidence so far when SerpApi rate-limits', async () => {
    const { dossier } = await replay(getCase('c1-kharkiv-prayer'), (d) => ({
      serp: failing(d.serp, ['bing_reverse_image'], 'RATE_LIMITED'),
    }));
    expect(dossier!.metrics.partial).toBe(true);
    expect(dossier!.metrics.credits).toBe(1);
    expect(dossier!.signals.enginesSkipped).toEqual(expect.arrayContaining(['yandex_images', 'google_news', 'google_maps']));
    expect(dossier!.verdict).toBe('CONSISTENT');
  });
});

describe('credit budget', () => {
  it('drops the lowest-ranked tier 3 engines first when the cap is reached', async () => {
    const c = getCase('c1-kharkiv-prayer');
    const { dossier, events } = await replay(c, undefined, { ...c.input, options: { ...c.input.options, maxCredits: 4 } });
    expect(dossier!.metrics.credits).toBe(4);
    expect(dossier!.signals.enginesUsed).toContain('google_news');
    expect(dossier!.signals.enginesSkipped).toEqual(['google_maps']);
    expect(dossier!.signals.sceneGeo).toBeUndefined();
    expect(events.filter((e) => e.type === 'error' && e.data.code === 'BUDGET_EXCEEDED')).toHaveLength(2);
    expect(dossier!.confidence.value).toBe(70);
  });
});

describe('LLM layer', () => {
  it('still reaches a verdict with template narration when Gemini is down', async () => {
    const c = getCase('c2-uttarakhand-flood');
    const { dossier } = await replay(c, (d) => ({
      llm: { parseClaim: down, readScene: down, narrate: down },
    }));
    expect(dossier!.verdict).toBe('RECYCLED');
    expect(dossier!.signals.claim).toMatchObject({ claimedAtSource: 'default_now', claimedAt: c.submittedAt, place: 'Uttarakhand, India' });
    expect(dossier!.narrative.source).toBe('template');
    expect(dossier!.narrative.bullets.length).toBeGreaterThan(0);
  });

  it('drops narrative bullets that cite evidence which does not exist', async () => {
    const { dossier } = await replay(getCase('c2-uttarakhand-flood'), (d) => ({
      llm: llmWith(d.llm, {
        narrate: async () => ({
          summary: 'This photo was online years before the claimed flood.',
          bullets: [
            { text: 'Reuters confirmed this in a report.', evidenceIds: ['lens0-99'] },
            { text: 'An archive copy is dated June 2013.', evidenceIds: ['lens0-0'] },
          ],
        }),
      }),
    }));
    expect(dossier!.narrative.source).toBe('llm');
    expect(dossier!.narrative.bullets).toEqual([{ text: 'An archive copy is dated June 2013.', evidenceIds: ['lens0-0'] }]);
  });

  it('replaces a narrative that contradicts the verdict, e.g. after prompt injection in a snippet', async () => {
    const { dossier } = await replay(getCase('c2-uttarakhand-flood'), (d) => ({
      llm: llmWith(d.llm, {
        narrate: async () => ({ summary: 'This image is genuine and matches its claim.', bullets: [] }),
      }),
    }));
    expect(dossier!.verdict).toBe('RECYCLED');
    expect(dossier!.narrative.source).toBe('template');
  });

  it('discards off-schema LLM output', async () => {
    const { dossier } = await replay(getCase('c2-uttarakhand-flood'), (d) => ({
      llm: llmWith(d.llm, { narrate: async () => ({ summary: 42, bullets: 'none' }) }),
    }));
    expect(dossier!.narrative.source).toBe('template');
  });
});

describe('verdict rules through the pipeline', () => {
  it('does not flag an honest post that openly refers to the earlier event', async () => {
    const c = getCase('c2-uttarakhand-flood');
    const { dossier } = await replay(
      c,
      (d) => ({
        llm: llmWith(d.llm, {
          parseClaim: async () => ({ event: 'remembering the 2013 floods', place: 'Uttarakhand, India', refersToPast: true, referencedYear: 2013 }),
        }),
      }),
      { ...c.input, claim: { ...c.input.claim, text: 'Remembering the 2013 Uttarakhand floods' } },
    );
    expect(dossier!.flags.recycled).toBe(false);
    expect(dossier!.verdict).toBe('CONSISTENT');
  });

  it('uses EXIF GPS as the scene location only when the user opts in', async () => {
    const c = getCase('s11-unverified-nothing');
    const media = { ...c.input.media, exif: { gps: [28.6139, 77.209] as [number, number] } };
    const optedOut = await replay(c, undefined, { ...c.input, media });
    const optedIn = await replay(c, undefined, { ...c.input, media, options: { ...c.input.options, useExifLocation: true } });
    expect(optedOut.dossier!.verdict).toBe('UNVERIFIED');
    expect(optedIn.dossier!.verdict).toBe('MISPLACED');
    expect(optedIn.dossier!.signals.deltaSKm).toBeGreaterThan(1500);
  });
});

describe('media cache', () => {
  it('reuses evidence for the same photo but re-judges it against the new claim', async () => {
    const c = getCase('c1-kharkiv-prayer');
    const store = createMemoryStore();
    const cached = (d: Parameters<NonNullable<Parameters<typeof replay>[1]>>[0]) => ({ store, useMediaCache: true });

    const first = await replay(c, cached);
    expect(first.dossier!.metrics.cacheHit).toBe(false);
    expect(first.dossier!.verdict).toBe('CONSISTENT');

    const laterPost = { ...c.input, claim: { ...c.input.claim, date: '2024-02-24T09:00:00+02:00' } };
    const second = await replay(c, cached, laterPost);
    expect(second.dossier!.metrics.cacheHit).toBe(true);
    expect(second.dossier!.signals.enginesUsed).not.toContain('google_lens');
    expect(second.dossier!.metrics.credits).toBe(2);
    expect(second.dossier!.signals.sceneGeo?.label).toBe('Derzhprom');
    expect(second.dossier!.verdict).toBe('RECYCLED');
  });
});
