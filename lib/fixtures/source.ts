import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { hamming, HAMMING } from '@/lib/media/phash';
import type { FixtureSource } from '@/lib/serp/client';
import type { ThumbnailHasher } from '@/lib/evidence/verifyMatch';
import type { LlmPort } from '@/lib/llm/port';
import type { AuditInput, Verdict } from '@/lib/shared/types';

// A golden case lives in fixtures/<caseId>/:
//   case.json    input, expectations and the fixed submission time
//   serp.json    SerpApi responses keyed by fixtureName()
//   llm.json     parseClaim / readScene / narrate outputs
//   thumbs.json  thumbnail URL → pHash (hashes only, never pixels)

export interface GoldenCase {
  id: string;
  title: string;
  synthetic: boolean;
  notes?: string;
  submittedAt: string;
  input: AuditInput;
  expected: {
    verdict: Verdict;
    flags: { recycled: boolean; misplaced: boolean };
    credits: number;
    tiersRun: number[];
    confidence: number;
  };
}

const readJson = (file: string): Record<string, unknown> =>
  existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>) : {};

export function listCases(dir: string): GoldenCase[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(path.join(dir, d.name, 'case.json')))
    .map((d) => ({ id: d.name, ...(readJson(path.join(dir, d.name, 'case.json')) as Omit<GoldenCase, 'id'>) }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Finds the recorded case whose frames look like the given media. */
export function matchCase(dir: string, pHashes: string[]): GoldenCase | undefined {
  return listCases(dir).find((c) =>
    c.input.media.frames.some((f) => pHashes.some((h) => hamming(h, f.pHash) <= HAMMING.confirmedMatch)),
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

export function createReplayLlm(dir: string, caseId: string | undefined): LlmPort {
  const data = caseId ? readJson(path.join(dir, caseId, 'llm.json')) : {};
  const get = async (key: string) => {
    if (!(key in data)) throw new Error(`No recorded LLM output "${key}"`);
    return data[key];
  };
  return {
    parseClaim: () => get('parseClaim'),
    readScene: () => get('readScene'),
    narrate: () => get('narrate'),
  };
}

export function createReplayThumbnails(dir: string, caseId: string | undefined): ThumbnailHasher {
  const data = caseId ? (readJson(path.join(dir, caseId, 'thumbs.json')) as Record<string, string>) : {};
  return async (url) => data[url];
}

export function loadTrustedDomains(file: string): string[] {
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as string[]) : [];
}
