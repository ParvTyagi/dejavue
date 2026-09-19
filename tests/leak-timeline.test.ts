import { describe, expect, it } from 'vitest';
import { buildSpreadTimeline, toTimelineEntry } from '@/lib/leak/timeline';
import type { DateTrust, EngineId, Evidence } from '@/lib/shared/types';

const NOW = new Date('2026-03-10T12:00:00.000Z');

const copy = (
  id: string,
  domain: string,
  publishedAt?: string,
  over: { dateTrust?: DateTrust; engine?: EngineId } = {},
): Evidence => ({
  id,
  engine: over.engine ?? 'google_lens',
  kind: 'visual_match',
  url: `https://${domain}/p`,
  domain,
  publishedAt,
  dateTrust: over.dateTrust ?? (publishedAt ? 'absolute_text' : 'none'),
  trustedSource: false,
  match: { hamming: 2, confirmed: true },
});

describe('spread timeline', () => {
  it('orders dated copies earliest first and marks T0', () => {
    const confirmed = [
      copy('c', 'mirror.example', '2025-02-01T00:00:00.000Z'),
      copy('a', 'first.example', '2024-06-01T00:00:00.000Z', { engine: 'bing_reverse_image' }),
      copy('b', 'second.example', '2024-06-20T00:00:00.000Z'),
    ];
    const { entries, undated } = buildSpreadTimeline(confirmed, NOW, { evidenceId: 'a' });
    expect(entries.map((e) => e.evidenceId)).toEqual(['a', 'b', 'c']);
    expect(entries.map((e) => e.isEarliest)).toEqual([true, false, false]);
    expect(entries[0]).toEqual({
      evidenceId: 'a',
      at: '2024-06-01T00:00:00.000Z',
      dateTrust: 'absolute_text',
      domain: 'first.example',
      engine: 'bing_reverse_image',
      isEarliest: true,
    });
    expect(undated).toEqual([]);
  });

  it('keeps undated copies in their own group instead of guessing a date', () => {
    const confirmed = [copy('b', 'yandex-hit.example'), copy('a', 'dated.example', '2025-01-05T00:00:00.000Z')];
    const { entries, undated } = buildSpreadTimeline(confirmed, NOW, { evidenceId: 'a' });
    expect(entries.map((e) => e.evidenceId)).toEqual(['a']);
    expect(undated).toEqual([{ evidenceId: 'b', domain: 'yandex-hit.example', engine: 'google_lens' }]);
  });

  it('marks nothing as earliest when there is no corroborated T0', () => {
    const { entries } = buildSpreadTimeline([copy('a', 'one.example', '2025-01-05T00:00:00.000Z')], NOW);
    expect(entries.map((e) => e.isEarliest)).toEqual([false]);
  });

  it('drops dates that cannot be real, so nothing is dated before the web or in the future', () => {
    const confirmed = [
      copy('a', 'old.example', '1971-01-01T00:00:00.000Z'),
      copy('b', 'future.example', '2030-01-01T00:00:00.000Z'),
      copy('c', 'untrusted.example', '2025-01-01T00:00:00.000Z', { dateTrust: 'none' }),
    ];
    const { entries, undated } = buildSpreadTimeline(confirmed, NOW);
    expect(entries).toEqual([]);
    expect(undated.map((u) => u.evidenceId)).toEqual(['a', 'b', 'c']);
  });

  it('is deterministic when two copies share a date', () => {
    const same = '2025-04-04T00:00:00.000Z';
    const built = (order: Evidence[]) => buildSpreadTimeline(order, NOW).entries.map((e) => e.evidenceId);
    const x = copy('x', 'one.example', same);
    const y = copy('y', 'two.example', same);
    expect(built([y, x])).toEqual(['x', 'y']);
    expect(built([x, y])).toEqual(['x', 'y']);
  });

  it('streams the same entry shape it later stores', () => {
    const e = copy('a', 'one.example', '2025-01-05T00:00:00.000Z');
    const streamed = toTimelineEntry(e, NOW);
    expect(streamed).toEqual(buildSpreadTimeline([e], NOW).entries[0]);
    expect(toTimelineEntry(copy('b', 'two.example'), NOW)).toBeUndefined();
  });

  it('carries no text from the leaked document, only where and when a copy appeared', () => {
    const withText = { ...copy('a', 'one.example', '2025-01-05T00:00:00.000Z'), title: 'Payroll of Priya Sharma, 9876543210' };
    const entry = buildSpreadTimeline([withText], NOW).entries[0];
    expect(Object.keys(entry).sort()).toEqual(['at', 'dateTrust', 'domain', 'engine', 'evidenceId', 'isEarliest']);
  });
});
