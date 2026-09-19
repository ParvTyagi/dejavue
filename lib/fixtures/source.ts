import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { hamming, HAMMING } from '@/lib/media/phash';
import type { FixtureSource } from '@/lib/serp/client';
import type { ThumbnailHasher } from '@/lib/evidence/verifyMatch';
import type { LlmPort } from '@/lib/llm/port';
import { pause } from '@/lib/shared/time';
import type { FullImageFetcher } from '@/lib/leak/originals';
import type { LeakInput, LeakVerdict, OriginSkipReason } from '@/lib/leak/types';
import type { OfferInput, OfferVerdict, RedFlagId } from '@/lib/offer/types';
import type { AuditInput, Verdict } from '@/lib/shared/types';

// A golden case lives in fixtures/<caseId>/:
//   case.json    input, expectations and the fixed submission time
//   serp.json    SerpApi responses keyed by fixtureName()
//   llm.json     parseClaim / readScene / narrate / readOffer outputs
//   thumbs.json  thumbnail URL → pHash (hashes only, never pixels)
// Offer cases live the same way in fixtures/offers/<caseId>/, without thumbs.json.
// Leak cases live in fixtures/leaks/<caseId>/, with the same four files plus
//   originals.json       full-size image URL → a file in originals/, or a skip reason
//   originals/*.jpg      small stand-in images, so ranking runs without the network

export interface GoldenCase {
  id: string;
  title: string;
  synthetic: boolean;
  notes?: string;
  submittedAt: string;
  input: AuditInput;
  expected: {
    verdict: Verdict;
    flags: { recycled: boolean; misplaced: boolean; predatesClaim: boolean };
    credits: number;
    tiersRun: number[];
    confidence: number;
  };
}

export interface OfferCase {
  id: string;
  title: string;
  synthetic: boolean;
  notes?: string;
  submittedAt: string;
  input: OfferInput;
  expected: {
    verdict: OfferVerdict;
    flags: RedFlagId[];
    credits: number;
    stepsRun: number[];
    confidence: number;
  };
}

export interface LeakCase {
  id: string;
  title: string;
  synthetic: boolean;
  notes?: string;
  submittedAt: string;
  input: LeakInput;
  expected: {
    verdict: LeakVerdict;
    flags: { predatesClaim: boolean; recycled: boolean; copiesFound: boolean; undatedOnly: boolean };
    credits: number;
    stepsRun: number[];
    confidence: number;
  };
}

const readJson = (file: string): Record<string, unknown> =>
  existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>) : {};

function listCaseFiles<T extends { id: string }>(dir: string): T[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(path.join(dir, d.name, 'case.json')))
    .map((d) => ({ id: d.name, ...readJson(path.join(dir, d.name, 'case.json')) }) as T)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export const listCases = (dir: string): GoldenCase[] => listCaseFiles<GoldenCase>(dir);

export const listOfferCases = (dir: string): OfferCase[] => listCaseFiles<OfferCase>(dir);

export const listLeakCases = (dir: string): LeakCase[] => listCaseFiles<LeakCase>(dir);

/** Finds the recorded leak case whose frames look like the given image. */
export function matchLeakCase(dir: string, pHashes: string[]): LeakCase | undefined {
  return listLeakCases(dir).find((c) =>
    c.input.media.frames.some((f) => pHashes.some((h) => hamming(h, f.pHash) <= HAMMING.confirmedMatch)),
  );
}

/** Finds the recorded case whose frames look like the given media. */
export function matchCase(dir: string, pHashes: string[]): GoldenCase | undefined {
  return listCases(dir).find((c) =>
    c.input.media.frames.some((f) => pHashes.some((h) => hamming(h, f.pHash) <= HAMMING.confirmedMatch)),
  );
}

const sameText = (a: string | undefined, b: string | undefined) =>
  a !== undefined && b !== undefined && a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim();

/** Finds the recorded offer case for a demo message: the same text, or the same screenshot URL. */
export function matchOfferCase(dir: string, input: Pick<OfferInput, 'text' | 'screenshotUrl'>): OfferCase | undefined {
  return listOfferCases(dir).find(
    (c) =>
      sameText(c.input.text, input.text) ||
      (input.screenshotUrl !== undefined && c.input.screenshotUrl === input.screenshotUrl),
  );
}

export function createFixtureSource(dir: string): FixtureSource {
  const cache = new Map<string, Record<string, unknown>>();
  const load = (caseId: string) => {
    if (!cache.has(caseId)) cache.set(caseId, readJson(path.join(dir, caseId, 'serp.json')));
    return cache.get(caseId)!;
  };
  return {
    get: (caseId, name) => load(caseId)[name],
    put: (caseId, name, response) => {
      const data = load(caseId);
      data[name] = response;
      writeFileSync(path.join(dir, caseId, 'serp.json'), JSON.stringify(data, null, 2) + '\n');
    },
  };
}

export function createReplayLlm(dir: string, caseId: string | undefined, delayMs = 0): LlmPort {
  const data = caseId ? readJson(path.join(dir, caseId, 'llm.json')) : {};
  const get = async (key: string, signal?: AbortSignal) => {
    await pause(delayMs, signal);
    if (!(key in data)) throw new Error(`No recorded LLM output "${key}"`);
    return data[key];
  };
  return {
    parseClaim: (_req, signal) => get('parseClaim', signal),
    readScene: (_url, signal) => get('readScene', signal),
    narrate: (_req, signal) => get('narrate', signal),
    readOffer: (_req, signal) => get('readOffer', signal),
  };
}

export function createReplayThumbnails(dir: string, caseId: string | undefined): ThumbnailHasher {
  const data = caseId ? (readJson(path.join(dir, caseId, 'thumbs.json')) as Record<string, string>) : {};
  return async (url) => data[url];
}

/**
 * Replays the full-size image fetches a leak trace makes. Each entry in originals.json is
 * either a file in the case's originals/ folder or `{ "skip": "<reason>" }`, so the skip
 * paths are exercised without the network. A URL that is not listed at all reads as
 * unreadable, which is what a dead link does in live mode.
 */
export function createReplayOriginals(dir: string, caseId: string | undefined): FullImageFetcher {
  const map = caseId ? (readJson(path.join(dir, caseId, 'originals.json')) as Record<string, unknown>) : {};
  return async (url) => {
    const entry = map[url];
    if (typeof entry === 'object' && entry !== null && 'skip' in entry) {
      return { ok: false, reason: (entry as { skip: OriginSkipReason }).skip };
    }
    if (typeof entry !== 'string') return { ok: false, reason: 'unreadable' };
    const file = path.join(dir, caseId!, 'originals', entry);
    if (!existsSync(file)) return { ok: false, reason: 'unreadable' };
    return { ok: true, bytes: readFileSync(file) };
  };
}

export function loadTrustedDomains(file: string): string[] {
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as string[]) : [];
}
