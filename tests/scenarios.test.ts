import { describe, expect, it, vi } from 'vitest';
import type { LlmPort } from '@/lib/llm/port';
import { AuditError, runAudit } from '@/lib/orchestrator/pipeline';
import { createAuditDeps } from '@/lib/server/deps';
import { SerpError, type SerpClient } from '@/lib/serp/client';
import type { EngineId } from '@/lib/shared/types';
import { getCase, NO_RESULTS, replay, withFakeSerpApi } from './harness';
import { makeStore, STORE_KINDS } from './stores';

const failing =
  (serp: SerpClient, engines: EngineId[], code: SerpError['code'] = 'UPSTREAM_FAILED'): SerpClient =>
  (engine, params, ctx) =>
    engines.includes(engine) ? Promise.reject(new SerpError(code, engine, `${engine} down`)) : serp(engine, params, ctx);

const llmWith = (llm: LlmPort, patch: Partial<LlmPort>): LlmPort => ({ ...llm, ...patch });
const down = async () => {
  throw new Error('Gemini unavailable');
};

describe('dossier', () => {
  it('states what DejaVue cannot tell you and when the result was created, even for a replayed case', async () => {
    const c = getCase('c2-uttarakhand-flood');
    const created = new Date('2026-09-17T12:00:00Z');
    const { dossier } = await replay(c, () => ({ wallClock: () => created }));
    expect(dossier!.limitations.join(' ')).toMatch(/does not detect deepfakes/);
    expect(dossier!.createdAt).toBe(created.toISOString());
    // The evidence is still judged at the moment the case was recorded.
    expect(dossier!.signals.claim.claimedAt).toBe(c.submittedAt);
  });
});

describe('audit stream', () => {
  it('streams stages, credits and evidence, then stops early and saves the unused searches', async () => {
    const { events } = await replay(getCase('c2-uttarakhand-flood'));
    const types = events.map((e) => (e.type === 'stage' ? `stage:${e.data.stage}` : e.type));
    expect(types.slice(0, 5)).toEqual(['stage:claim', 'stage:scene', 'stage:tier1', 'credit', 'evidence']);
    expect(types.slice(-5)).toEqual(['short_circuit', 'stage:judge', 'signal', 'stage:narrate', 'dossier']);
    expect(events.find((e) => e.type === 'short_circuit')?.data).toEqual({ afterTier: 1, creditsSaved: 5 });
    expect(events.find((e) => e.type === 'credit')?.data).toEqual({ engine: 'google_lens', cached: false, totalCredits: 1, maxCredits: 6 });
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
    expect(dossier!.signals.enginesSkipped).toEqual(
      expect.arrayContaining([
        { engine: 'yandex_images', reason: 'halted' },
        { engine: 'google_news', reason: 'halted' },
        { engine: 'google_maps', reason: 'halted' },
      ]),
    );
    // Same-day copies were found, but the location was never checked, so the claim is not confirmed.
    expect(dossier!.verdict).toBe('UNVERIFIED');
  });

  it('reports the rate limit, not an upstream failure, when SerpApi refuses the first search', async () => {
    const calls: EngineId[] = [];
    const { dossier, error } = await replay(getCase('c2-uttarakhand-flood'), (d) => ({
      serp: (engine, params, ctx) => {
        calls.push(engine);
        return failing(d.serp, ['google_lens'], 'RATE_LIMITED')(engine, params, ctx);
      },
    }));
    expect(dossier).toBeUndefined();
    expect(error).toMatchObject({ code: 'RATE_LIMITED', status: 429 });
    expect(calls).toEqual(['google_lens']);
  });

  const liveAudit = (c: ReturnType<typeof getCase>) => {
    const deps = createAuditDeps({ mode: 'live', store: makeStore('memory', () => new Date()), clock: () => new Date(c.submittedAt) });
    return runAudit(c.input, () => {}, { ...deps, sign: () => 'test' });
  };

  it('keeps going when a search engine simply has no results', async () => {
    const c = getCase('s11-unverified-nothing');
    await withFakeSerpApi(
      () => NO_RESULTS,
      async (fetched) => {
        const dossier = await liveAudit(c);
        expect(dossier.signals.enginesFailed).toEqual([]);
        expect(dossier.metrics.tiersRun).toEqual([1, 2, 3]);
        // One request per engine: an empty result is not an error, so nothing is retried.
        expect(fetched).toEqual(['google_lens', 'bing_reverse_image', 'yandex_images', 'google_news', 'google_maps']);
        expect(dossier.verdict).toBe('UNVERIFIED');
      },
    );
  });

  it('reports exhausted credits, not a rate limit or an upstream failure, when the SerpApi plan is used up', async () => {
    const c = getCase('s11-unverified-nothing');
    await withFakeSerpApi(
      () => ({ status: 429, body: { error: 'Your account has run out of searches.' } }),
      async (fetched) => {
        await expect(liveAudit(c)).rejects.toMatchObject({ code: 'CREDITS_EXHAUSTED', status: 402 });
        expect(fetched).toEqual(['google_lens']);
      },
    );
  });
});

describe('audit deadline', () => {
  const hang = () => new Promise<never>(() => {});

  it('judges whatever has arrived when the deadline passes, even if a search never answers', async () => {
    const started = performance.now();
    const { dossier } = await replay(getCase('s06-misplaced-with-match'), (d) => ({
      serp: (engine, params, ctx) => (engine === 'bing_reverse_image' ? hang() : d.serp(engine, params, ctx)),
      timeouts: { auditMs: 150 },
    }));
    expect(performance.now() - started).toBeLessThan(2_000);
    expect(dossier!.metrics.partial).toBe(true);
    expect(dossier!.signals.enginesFailed).toEqual(['bing_reverse_image']);
    expect(dossier!.signals.enginesSkipped).toEqual(
      expect.arrayContaining([
        { engine: 'yandex_images', reason: 'deadline' },
        { engine: 'google_news', reason: 'deadline' },
        { engine: 'google_maps', reason: 'deadline' },
      ]),
    );
    expect(dossier!.evidence.filter((e) => e.engine === 'google_lens')).toHaveLength(2);
  });

  it('cancels tier 3 searches that outlive the tier timeout and lists them only as failed', async () => {
    const { dossier } = await replay(getCase('s06-misplaced-with-match'), (d) => ({
      serp: (engine, params, ctx) => (engine === 'google_news' ? hang() : d.serp(engine, params, ctx)),
      timeouts: { tier3Ms: 100 },
    }));
    expect(dossier!.signals.enginesFailed).toEqual(['google_news']);
    expect(dossier!.signals.enginesUsed).not.toContain('google_news');
    expect(dossier!.verdict).toBe('MISPLACED');
  });

  it('falls back to the template narrative when Gemini does not answer in time', async () => {
    const { dossier } = await replay(getCase('c2-uttarakhand-flood'), (d) => ({
      llm: llmWith(d.llm, { narrate: hang }),
      timeouts: { llmMs: 50 },
    }));
    expect(dossier!.verdict).toBe('RECYCLED');
    expect(dossier!.narrative.source).toBe('template');
  });
});

describe('early stop', () => {
  it('does not stop early on two old copies that are years apart, since they cannot date the media', async () => {
    const c = getCase('s06-misplaced-with-match');
    const frame = c.input.media.frames[0].pHash;
    const lens = {
      search_metadata: { processed_at: c.submittedAt },
      exact_matches: [
        { title: 'Port fire', link: 'https://old-blog.example/2019/fire', thumbnail: 'https://t.example/a.jpg', date: 'May 1, 2019' },
        { title: 'Port fire', link: 'https://mirror.example/2023/fire', thumbnail: 'https://t.example/b.jpg', date: 'Jun 1, 2023' },
      ],
    };
    const { dossier, events } = await replay(c, (d) => ({
      serp: (engine, params, ctx) =>
        engine === 'google_lens'
          ? d.serp(engine, params, ctx).then((res) => ({ ...res, raw: lens }))
          : d.serp(engine, params, ctx),
      hashThumbnail: async (url) => (url.startsWith('https://t.example/') ? frame : d.hashThumbnail(url)),
    }));
    expect(events.some((e) => e.type === 'short_circuit')).toBe(false);
    expect(dossier!.metrics.tiersRun).toEqual([1, 2, 3]);
    expect(dossier!.signals.firstSeen).toBeUndefined();
    expect(dossier!.verdict).toBe('MISPLACED');
  });
});

describe('credit budget', () => {
  it('drops the lowest-ranked tier 3 engines first when the cap is reached', async () => {
    const c = getCase('c1-kharkiv-prayer');
    const { dossier, events } = await replay(c, undefined, { ...c.input, options: { ...c.input.options, maxCredits: 4 } });
    expect(dossier!.metrics.credits).toBe(4);
    expect(dossier!.signals.enginesUsed).toContain('google_news');
    expect(dossier!.signals.enginesSkipped).toEqual([{ engine: 'google_maps', reason: 'budget' }]);
    expect(dossier!.signals.sceneGeo).toBeUndefined();
    expect(events.filter((e) => e.type === 'error' && e.data.code === 'BUDGET_EXCEEDED')).toHaveLength(2);
    // Without Maps the location is unchecked, so news corroboration is the strongest verdict (capped at 60).
    expect(dossier!.verdict).toBe('CONTEXT_PLAUSIBLE');
    expect(dossier!.confidence.value).toBe(60);
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
    expect(dossier!.verdict).not.toBe('RECYCLED');
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

describe.each(STORE_KINDS)('media cache (%s store)', (kind) => {
  const DAY = 86_400_000;

  /** Runs audits of one case against a shared store, with a clock that can move forward. */
  const session = (caseId: string) => {
    const c = getCase(caseId);
    let now = new Date(c.submittedAt);
    const store = makeStore(kind, () => now);
    const run = (patch: Parameters<typeof replay>[1] = () => ({}), input = c.input) =>
      replay(c, (d) => ({ store, useMediaCache: true, clock: () => now, ...patch!(d) }), input);
    return { c, run, later: (ms: number) => (now = new Date(Date.parse(c.submittedAt) + ms)) };
  };

  it('reuses evidence for the same photo at no credit cost, but re-judges it against the new claim', async () => {
    const { c, run } = session('c1-kharkiv-prayer');
    const first = await run();
    expect(first.dossier!.metrics.cacheHit).toBe(false);
    expect(first.dossier!.verdict).toBe('CONSISTENT');

    const laterPost = { ...c.input, claim: { ...c.input.claim, date: '2024-02-24T09:00:00+02:00' } };
    const second = await run(undefined, laterPost);
    expect(second.dossier!.metrics.cacheHit).toBe(true);
    expect(second.dossier!.metrics.credits).toBe(0);
    expect(second.dossier!.signals.enginesUsed).toEqual([]);
    expect(second.dossier!.signals.sceneGeo?.label).toBe('Derzhprom');
    expect(second.dossier!.verdict).toBe('RECYCLED');
  });

  it('does not cache evidence from a partial audit', async () => {
    const { run } = session('c1-kharkiv-prayer');
    const partial = await run((d) => ({
      serp: (engine, params, ctx) =>
        engine === 'bing_reverse_image'
          ? Promise.reject(new SerpError('RATE_LIMITED', engine, 'slow down'))
          : d.serp(engine, params, ctx),
    }));
    expect(partial.dossier!.metrics.partial).toBe(true);
    const next = await run();
    expect(next.dossier!.metrics.cacheHit).toBe(false);
    expect(next.dossier!.verdict).toBe('CONSISTENT');
  });

  it('still checks a new caption fairly: reverse-image searches are free, claim searches run again', async () => {
    const { run } = session('c1-kharkiv-prayer');
    await run();
    const again = await run();
    expect(again.dossier!.metrics.cacheHit).toBe(true);
    expect(again.dossier!.signals.enginesUsed).not.toEqual(expect.arrayContaining(['google_lens']));
    expect(again.dossier!.signals.enginesUsed).toEqual(expect.arrayContaining(['google_news', 'google_maps']));
    // News and Maps for the claimed place: 2 credits, while Lens, Bing, Yandex and the scene landmark come from the cache.
    expect(again.dossier!.metrics.credits).toBe(2);
    expect(again.dossier!.signals.location).toBe('agrees');
    expect(again.dossier!.verdict).toBe('CONSISTENT');
  });

  it('completes the missing reverse-image searches when an early-stopped audit is reused for a harder claim', async () => {
    const { c, run } = session('c2-uttarakhand-flood');
    const first = await run();
    expect(first.dossier!.metrics.tiersRun).toEqual([1]);

    // Claimed before the known copies, so the cached Lens evidence is no longer decisive.
    const calls: EngineId[] = [];
    const earlier = { ...c.input, claim: { ...c.input.claim, date: '2013-06-01T00:00:00Z' } };
    await run(
      (d) => ({
        serp: (engine, params, ctx) => {
          calls.push(engine);
          return d.serp(engine, params, ctx);
        },
      }),
      earlier,
    );
    expect(calls).not.toContain('google_lens');
    expect(calls).toEqual(expect.arrayContaining(['bing_reverse_image', 'yandex_images']));
  });

  it('caches only reverse-image evidence, never searches built from the claim', async () => {
    const c = getCase('c1-kharkiv-prayer');
    const frame = c.input.media.frames[0].pHash;
    const store = makeStore(kind, () => new Date(c.submittedAt));
    const video = { ...c.input, media: { ...c.input.media, kind: 'video' as const } };
    const results: Partial<Record<EngineId, unknown>> = {
      google_lens: { exact_matches: [{ title: 'Copy', link: 'https://a.example/p', thumbnail: 'https://t.example/a.jpg', date: 'Feb 19, 2022' }] },
      youtube: { video_results: [{ title: 'Clip', link: 'https://www.youtube.com/watch?v=x', thumbnail: { static: 'https://t.example/y.jpg' }, published_date: '3 years ago' }] },
    };
    const { dossier } = await replay(
      c,
      (d) => ({
        store,
        useMediaCache: true,
        serp: async (engine, _params, ctx) => {
          ctx.budget.used++;
          return { raw: results[engine] ?? {}, cached: false, fetchedAt: new Date(c.submittedAt) };
        },
        hashThumbnail: async () => frame,
        llm: llmWith(d.llm, {
          parseClaim: async () => ({ event: 'people pray in the snow', refersToPast: false }),
          readScene: async () => ({ signText: [], landmarks: [] }),
        }),
      }),
      video,
    );
    expect(dossier!.evidence.map((e) => e.engine)).toContain('youtube');

    const entry = await store.findMedia([frame]);
    expect(entry!.engines).toEqual(['google_lens', 'bing_reverse_image', 'yandex_images']);
    expect(entry!.evidence.map((e) => e.engine)).toEqual(['google_lens']);
  });

  it('searches again once cached evidence is older than 7 days', async () => {
    const { run, later } = session('c2-uttarakhand-flood');
    expect((await run()).dossier!.metrics.cacheHit).toBe(false);
    later(6 * DAY);
    expect((await run()).dossier!.metrics.cacheHit).toBe(true);
    later(8 * DAY);
    const stale = await run();
    expect(stale.dossier!.metrics.cacheHit).toBe(false);
    expect(stale.dossier!.metrics.credits).toBe(1);
  });
});

describe('query cache in live mode', () => {
  it('keeps Maps lookups for 30 days but other searches for 24 hours', async () => {
    const c = getCase('s11-unverified-nothing');
    let now = new Date(c.submittedAt);
    await withFakeSerpApi(() => NO_RESULTS, async (fetched) => {
      const store = makeStore('memory', () => now);
      // The image cache is off so the second audit searches again and only the query cache is exercised.
      const audit = () =>
        runAudit(c.input, () => {}, { ...createAuditDeps({ mode: 'live', store, clock: () => now }), useMediaCache: false, sign: () => 'test' });

      await audit();
      fetched.length = 0;
      now = new Date(Date.parse(c.submittedAt) + 2 * 86_400_000);
      const second = await audit();

      expect(fetched).toEqual(['google_lens', 'bing_reverse_image', 'yandex_images', 'google_news']);
      expect(second.metrics.credits).toBe(4);
      expect(second.signals.enginesUsed).toContain('google_maps');
    });
  });
});
