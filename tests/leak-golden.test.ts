import { describe, expect, it } from 'vitest';
import { NAMES_A_LEAKER } from '@/lib/llm/safe';
import { LEAK_ADVICE, LEAK_LIMITATIONS } from '@/lib/leak/types';
import { LEAK_SCORE_CAP } from '@/lib/leak/score';
import { redactPersonalData } from '@/lib/shared/redact';
import { AuditError } from '@/lib/orchestrator/pipeline';
import { SerpError, type SerpClient } from '@/lib/serp/client';
import type { EngineId } from '@/lib/shared/types';
import { getLeakCase, leakCases, replayLeak } from './harness';

const cases = leakCases();

const failing =
  (serp: SerpClient, engines: EngineId[], code: SerpError['code'] = 'UPSTREAM_FAILED'): SerpClient =>
  (engine, params, ctx) =>
    engines.includes(engine) ? Promise.reject(new SerpError(code, engine, `${engine} down`)) : serp(engine, params, ctx);

const hang = () => new Promise<never>(() => {});

describe('leak golden cases (replay fixtures)', () => {
  it('covers every verdict path and spends no credits it did not record', () => {
    const counts = cases.reduce<Record<string, number>>((acc, c) => {
      acc[c.expected.verdict] = (acc[c.expected.verdict] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts).toEqual({ LEAK_RECYCLED: 1, LEAK_EARLIEST_FOUND: 3, LEAK_NOT_FOUND: 2 });
    expect(cases.every((c) => c.synthetic)).toBe(true);
    // Every site in every case is a reserved example domain, so no real publisher is named.
    const domains = JSON.stringify(cases).match(/https?:\/\/[^"\s]+/g) ?? [];
    for (const url of domains) expect(new URL(url).hostname).toMatch(/(\.example|\.invalid)$/);
  });

  describe.each(cases.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    it(`returns ${c.expected.verdict} with the expected flags, score, credits and steps`, async () => {
      const { dossier, error } = await replayLeak(c);
      expect(error).toBeUndefined();
      expect({
        verdict: dossier!.verdict,
        flags: dossier!.flags,
        credits: dossier!.metrics.credits,
        stepsRun: dossier!.metrics.stepsRun,
        confidence: dossier!.confidence.value,
      }).toEqual(c.expected);
    });

    it('is byte-identical on a rerun, cites only real evidence and explains every point', async () => {
      const [a, b] = await Promise.all([replayLeak(c), replayLeak(c)]);
      const strip = (d: typeof a.dossier) => JSON.stringify({ ...d!, metrics: { ...d!.metrics, totalMs: 0 } });
      expect(strip(a.dossier)).toBe(strip(b.dossier));
      const ids = new Set(a.dossier!.evidence.map((e) => e.id));
      for (const bullet of a.dossier!.narrative.bullets) for (const id of bullet.evidenceIds) expect(ids).toContain(id);
      for (const entry of a.dossier!.signals.timeline.entries) expect(ids).toContain(entry.evidenceId);
      for (const copy of a.dossier!.origin.ranked) expect(ids).toContain(copy.evidenceId);
      for (const skip of a.dossier!.origin.skipped) expect(ids).toContain(skip.evidenceId);
      expect(a.dossier!.signals.enginesFailed).toEqual([]);
      // Two dating searches run on the same engine, so their ids have to stay apart.
      const allIds = a.dossier!.evidence.map((e) => e.id);
      expect(new Set(allIds).size).toBe(allIds.length);
      const raw = a.dossier!.confidence.reasons.reduce((sum, r) => sum + r.points, 0);
      expect(a.dossier!.confidence.value).toBe(Math.max(0, Math.min(LEAK_SCORE_CAP[a.dossier!.verdict], raw)));
    });

    it('prints both limitation lines, the advice for its verdict, and never names a leaker', async () => {
      const { dossier } = await replayLeak(c);
      expect(dossier!.limitations).toEqual(LEAK_LIMITATIONS);
      expect(dossier!.advice).toBe(LEAK_ADVICE[dossier!.verdict]);
      const words = [dossier!.narrative.summary, ...dossier!.narrative.bullets.map((b) => b.text)].join(' ');
      expect(words).not.toMatch(NAMES_A_LEAKER);
    });

    it('keeps no phone number, email or id read out of the document', async () => {
      const { dossier } = await replayLeak(c);
      // Everything the result shows in words. Numbers the engines reported about a file,
      // such as its pixel size, are not personal data and are left alone.
      const shown = [
        dossier!.narrative.summary,
        ...dossier!.narrative.bullets.map((b) => b.text),
        ...dossier!.scene.redactedSnippets,
        dossier!.advice,
        ...dossier!.evidence.flatMap((e) => [e.title ?? '', e.snippet ?? '']),
      ].join(' ');
      // Redacting it again changes nothing, which is what "already redacted" means.
      expect(redactPersonalData(shown)).toBe(shown);
      expect(shown).not.toMatch(/\b\d{6,}\b/);
      expect(shown).not.toMatch(/[a-z0-9._%+-]+@[a-z0-9-]+\.[a-z]{2,}/i);
    });

    it('places every dated copy on the timeline and every undated one beside it', async () => {
      const { dossier } = await replayLeak(c);
      const { entries, undated } = dossier!.signals.timeline;
      expect(entries.length + undated.length).toBe(dossier!.signals.confirmedMatches.length);
      const firstSeenId = dossier!.signals.firstSeen?.evidenceId;
      expect(entries.filter((e) => e.isEarliest).map((e) => e.evidenceId)).toEqual(firstSeenId ? [firstSeenId] : []);
      for (let i = 1; i < entries.length; i++) expect(Date.parse(entries[i].at)).toBeGreaterThanOrEqual(Date.parse(entries[i - 1].at));
    });
  });
});

describe('what the leak cases prove about the rules', () => {
  it('does not call an old leak recycled when the post claimed no date at all', async () => {
    const { dossier } = await replayLeak(getLeakCase('l04-blank-date-older-copy'));
    expect(dossier!.signals.claim.claimedAtSource).toBe('default_now');
    // The finding survives; only the accusation is dropped.
    expect(dossier!.flags).toMatchObject({ predatesClaim: true, recycled: false });
    expect(dossier!.verdict).toBe('LEAK_EARLIEST_FOUND');
    expect(dossier!.narrative.summary).toMatch(/No date was claimed/);
  });

  it('says plainly that "not found" covers only what search engines index', async () => {
    const { dossier } = await replayLeak(getLeakCase('l03-no-public-copy'));
    expect(dossier!.narrative.summary).toMatch(/do not index private groups, Telegram, paste sites or dark web forums/);
    expect(dossier!.confidence.value).toBeLessThanOrEqual(LEAK_SCORE_CAP.LEAK_NOT_FOUND);
  });

  it('keeps undated copies out of the timeline rather than dating them by guesswork', async () => {
    const { dossier } = await replayLeak(getLeakCase('l05-undated-copies-only'));
    expect(dossier!.signals.timeline.entries).toEqual([]);
    expect(dossier!.signals.timeline.undated).toHaveLength(4);
    expect(dossier!.signals.firstSeen).toBeUndefined();
    expect(dossier!.flags.undatedOnly).toBe(true);
  });
});

describe('the spread timeline as it streams', () => {
  it('streams each dated copy as it is confirmed, and the finished timeline agrees with them', async () => {
    const { dossier, events } = await replayLeak(getLeakCase('l01-recycled-payroll-memo'));
    const streamed = events.filter((e) => e.type === 'timeline').map((e) => e.data.evidenceId);
    // Three copies arrive dated; the fourth is dated later by the dating search and streams then.
    expect(streamed).toEqual(['lens0-0', 'lens0-1', 'bing0-0', 'bing0-1', 'yandex0-0']);
    expect(dossier!.signals.timeline.entries.map((e) => e.evidenceId)).toEqual([
      'lens0-0',
      'lens0-1',
      'bing0-0',
      'yandex0-0',
      'bing0-1',
    ]);
    expect(dossier!.signals.timeline.entries[0].isEarliest).toBe(true);
  });

  it('runs the steps in order and never stops early: the spread is the answer', async () => {
    const { events } = await replayLeak(getLeakCase('l01-recycled-payroll-memo'));
    const stages = events.filter((e) => e.type === 'stage').map((e) => e.data.stage);
    expect(stages).toEqual(['trace', 'copies', 'dates', 'origin', 'judge', 'narrate']);
    expect(events.some((e) => e.type === 'short_circuit')).toBe(false);
  });
});

describe('closest-to-original ranking', () => {
  it('ranks the largest, least compressed, least cropped copy first and labels it a hint only', async () => {
    const { dossier } = await replayLeak(getLeakCase('l01-recycled-payroll-memo'));
    const { ranked, fetched, skipped } = dossier!.origin;
    expect(fetched).toBe(3);
    expect(ranked[0]).toMatchObject({ evidenceId: 'bing0-0', domain: 'newswire.example' });
    expect(ranked[0].reasons).toEqual(['largest resolution', 'least compressed', 'least cropped']);
    expect(ranked.map((r) => r.evidenceId)).toEqual(['bing0-0', 'bing0-1', 'yandex0-0']);
    // Google Lens documents no full-size link for an exact match, so those two are skipped.
    expect(skipped).toEqual([
      { evidenceId: 'lens0-0', reason: 'no_original_url' },
      { evidenceId: 'lens0-1', reason: 'no_original_url' },
    ]);
  });

  it('never lets the ranking move the verdict or the score', async () => {
    const c = getLeakCase('l01-recycled-payroll-memo');
    const full = await replayLeak(c);
    // With every full-size fetch refused, the ranking disappears and nothing else changes.
    const none = await replayLeak(c, () => ({ fetchOriginal: async () => ({ ok: false, reason: 'blocked' }) }));
    expect(none.dossier!.origin).toEqual({
      ranked: [],
      fetched: 0,
      skipped: expect.arrayContaining([{ evidenceId: 'bing0-0', reason: 'blocked' }]),
    });
    expect(none.dossier!.verdict).toBe(full.dossier!.verdict);
    expect(none.dossier!.flags).toEqual(full.dossier!.flags);
    expect(none.dossier!.confidence).toEqual(full.dossier!.confidence);
    expect(none.dossier!.signals.timeline).toEqual(full.dossier!.signals.timeline);
  });

  it('records why a copy could not be measured, the same way a skipped search is recorded', async () => {
    const { dossier } = await replayLeak(getLeakCase('l05-undated-copies-only'));
    expect(dossier!.origin.skipped).toContainEqual({ evidenceId: 'yandex0-0', reason: 'too_large' });
    expect(dossier!.origin.fetched).toBe(1);
  });
});

describe('leak failures', () => {
  it('carries on with the other indexes when one engine is down, and marks the lost confidence', async () => {
    const c = getLeakCase('l01-recycled-payroll-memo');
    const { dossier } = await replayLeak(c, (d) => ({ serp: failing(d.serp, ['google_lens']) }));
    expect(dossier!.signals.enginesFailed).toEqual(['google_lens']);
    expect(dossier!.confidence.reasons).toContainEqual({ label: 'google_lens failed or timed out', points: -10 });
    expect(dossier!.verdict).toBe('LEAK_RECYCLED');
    expect(dossier!.signals.confirmedMatches.map((e) => e.engine)).not.toContain('google_lens');
  });

  it('gives up with no verdict only when every reverse image index fails', async () => {
    const c = getLeakCase('l01-recycled-payroll-memo');
    const { dossier, error } = await replayLeak(c, (d) => ({
      serp: failing(d.serp, ['google_lens', 'bing_reverse_image', 'yandex_images']),
    }));
    expect(dossier).toBeUndefined();
    expect(error).toBeInstanceOf(AuditError);
    expect(error).toMatchObject({ code: 'UPSTREAM_FAILED', status: 502 });
  });

  it('judges whatever arrived when the deadline passes, and records the rest as out of time', async () => {
    const started = performance.now();
    const c = getLeakCase('l01-recycled-payroll-memo');
    const { dossier } = await replayLeak(c, (d) => ({
      serp: (engine, params, ctx) => (engine === 'bing_reverse_image' ? hang() : d.serp(engine, params, ctx)),
      timeouts: { auditMs: 200 },
    }));
    expect(performance.now() - started).toBeLessThan(3_000);
    expect(dossier!.metrics.partial).toBe(true);
    expect(dossier!.signals.enginesFailed).toEqual(['bing_reverse_image']);
    expect(dossier!.signals.enginesSkipped).toContainEqual({ engine: 'yandex_images', reason: 'deadline' });
    // Lens answered before the deadline, so its two copies still carry the verdict.
    expect(dossier!.signals.confirmedMatches).toHaveLength(2);
    expect(dossier!.verdict).toBe('LEAK_RECYCLED');
  });

  it('stops at the credit cap and names the index it never asked', async () => {
    const { dossier } = await replayLeak(getLeakCase('l06-budget-stops-third-index'));
    expect(dossier!.metrics.credits).toBe(2);
    expect(dossier!.signals.enginesSkipped).toEqual([{ engine: 'yandex_images', reason: 'budget' }]);
    expect(dossier!.signals.enginesUsed).toEqual(['google_lens', 'bing_reverse_image']);
  });

  it('still reaches a verdict with a template explanation when Gemini is down', async () => {
    const down = async () => {
      throw new Error('Gemini unavailable');
    };
    const c = getLeakCase('l01-recycled-payroll-memo');
    const { dossier } = await replayLeak(c, (d) => ({
      llm: { ...d.llm, parseClaim: down, readScene: down, narrate: down },
    }));
    expect(dossier!.verdict).toBe('LEAK_RECYCLED');
    expect(dossier!.narrative.source).toBe('template');
    expect(dossier!.scene.redactedSnippets).toEqual([]);
  });
});
