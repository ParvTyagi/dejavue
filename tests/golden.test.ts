import { describe, expect, it } from 'vitest';
import { goldenCases, replay } from './harness';

const cases = goldenCases();

const SCORE_CAP = { RECYCLED: 99, MISPLACED: 99, CONSISTENT: 85, CONTEXT_PLAUSIBLE: 60, UNVERIFIED: 40 };

describe('golden cases (replay fixtures)', () => {
  it('covers every verdict in the planned mix', () => {
    const counts = cases.reduce<Record<string, number>>((acc, c) => {
      acc[c.expected.verdict] = (acc[c.expected.verdict] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts).toEqual({ RECYCLED: 4, MISPLACED: 2, CONSISTENT: 2, CONTEXT_PLAUSIBLE: 2, UNVERIFIED: 2 });
  });

  describe.each(cases.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    it(`returns ${c.expected.verdict} with the expected score, credits and tiers`, async () => {
      const { dossier, error } = await replay(c);
      expect(error).toBeUndefined();
      expect({
        verdict: dossier!.verdict,
        flags: dossier!.flags,
        credits: dossier!.metrics.credits,
        tiersRun: dossier!.metrics.tiersRun,
        confidence: dossier!.confidence.value,
      }).toEqual(c.expected);
    });

    it('is deterministic and never fails an engine', async () => {
      const [a, b] = await Promise.all([replay(c), replay(c)]);
      const { totalMs: _a, ...metricsA } = a.dossier!.metrics;
      expect(a.dossier!.metrics.maxCredits).toBe(c.input.options.maxCredits);
      const { totalMs: _b, ...metricsB } = b.dossier!.metrics;
      expect({ ...a.dossier!, metrics: metricsA }).toEqual({ ...b.dossier!, metrics: metricsB });
      expect(a.dossier!.signals.enginesFailed).toEqual([]);
    });

    it('cites only evidence that exists and explains every point of the score', async () => {
      const { dossier } = await replay(c);
      const ids = new Set(dossier!.evidence.map((e) => e.id));
      for (const bullet of dossier!.narrative.bullets) {
        for (const id of bullet.evidenceIds) expect(ids).toContain(id);
      }
      const sum = dossier!.confidence.reasons.reduce((s, r) => s + r.points, 0);
      expect(dossier!.confidence.value).toBe(Math.max(0, Math.min(sum, SCORE_CAP[dossier!.verdict])));
    });
  });
});
