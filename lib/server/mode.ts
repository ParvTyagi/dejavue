import type { FixtureMode } from '@/lib/shared/types';

export function fixtureMode(): FixtureMode {
  const m = process.env.FIXTURE_MODE?.trim();
  return m === 'live' || m === 'record' ? m : 'replay';
}

export const FIXTURES_DIR = `${process.cwd()}/fixtures`;

export const OFFER_FIXTURES_DIR = `${FIXTURES_DIR}/offers`;

export const LEAK_FIXTURES_DIR = `${FIXTURES_DIR}/leaks`;

/**
 * Simulated network time per replayed search and per replayed model call, so the staged
 * progress on the result page is visible rather than flashing past.
 *
 * It is the whole reason a demo check takes seconds: the pipeline itself does a media
 * audit in single-digit milliseconds. Kept small enough that a check feels immediate, and
 * `REPLAY_PACE_MS=0` removes it entirely.
 */
export const replayPaceMs = () => Number(process.env.REPLAY_PACE_MS ?? 180);
