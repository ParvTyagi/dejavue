import type { FixtureMode } from '@/lib/shared/types';

export function fixtureMode(): FixtureMode {
  const m = process.env.FIXTURE_MODE?.trim();
  return m === 'live' || m === 'record' ? m : 'replay';
}

export const FIXTURES_DIR = `${process.cwd()}/fixtures`;

export const OFFER_FIXTURES_DIR = `${FIXTURES_DIR}/offers`;
