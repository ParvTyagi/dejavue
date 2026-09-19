// Types for Leak trace: leaked documents shared as images or screenshots.
//
// DejaVue never names a leaker. The earliest public copy it finds is very often a
// repost of something first shared in a closed channel, so everything here is
// worded as "earliest public appearance found", never "leaked by".

import type { Claim, DateTrust, EngineId, Evidence, ScoreReason, SkipReason } from '@/lib/shared/types';

/** There is deliberately no "confirmed leak" verdict: DejaVue only sees public copies. */
export type LeakVerdict = 'LEAK_RECYCLED' | 'LEAK_EARLIEST_FOUND' | 'LEAK_NOT_FOUND';

export interface LeakFlags {
  /**
   * A corroborated public copy is more than 48 h older than the claimed date. Purely a
   * fact about the evidence: nothing the language model returns can suppress it, so the
   * finding survives even where `recycled` does not.
   */
  predatesClaim: boolean;
  /** `predatesClaim` plus a claim that asserts a date and does not acknowledge the older leak. */
  recycled: boolean;
  /** At least one public copy was confirmed to be the same image. */
  copiesFound: boolean;
  /** Copies were confirmed but none of them could be dated, so there is no T₀. */
  undatedOnly: boolean;
}

/** One confirmed public copy on the spread timeline. */
export interface TimelineEntry {
  evidenceId: string;
  at: string;
  dateTrust: DateTrust;
  domain: string;
  engine: EngineId;
  /** The corroborated earliest public appearance (T₀). */
  isEarliest: boolean;
}

/** A confirmed copy that carries no usable date. Never given a guessed one. */
export interface UndatedCopy {
  evidenceId: string;
  domain: string;
  engine: EngineId;
}

export interface SpreadTimeline {
  /** Dated copies, earliest first. */
  entries: TimelineEntry[];
  /** Copies with no usable date, kept apart instead of being placed on the axis. */
  undated: UndatedCopy[];
}

/** Why the full-size image behind a copy was not measured. */
export type OriginSkipReason =
  | 'no_original_url'
  | 'budget'
  | 'deadline'
  | 'too_large'
  | 'unreadable'
  | 'blocked';

/** What was measured from one full-size copy. The pixels themselves are never kept. */
export interface CopyFeatures {
  evidenceId: string;
  domain: string;
  width: number;
  height: number;
  /** Estimated JPEG quality (1–100) from the quantisation tables; undefined for other formats. */
  jpegQuality?: number;
  /**
   * How much of the scene this copy shows, against the copy that shows the most:
   * 1 means the whole scene, 0.6 means roughly 60 % of it.
   */
  coverage: number;
}

export interface RankedCopy extends CopyFeatures {
  /** Why this copy ranks where it does, e.g. "largest resolution". */
  reasons: string[];
}

/**
 * A display hint only. It never reaches decideLeak() or scoreLeak(): resolution,
 * compression and cropping say which copy is least degraded, not which came first.
 */
export interface OriginHint {
  ranked: RankedCopy[];
  /** Full-size images actually fetched. These are not SerpApi searches and cost no credits. */
  fetched: number;
  skipped: { evidenceId: string; reason: OriginSkipReason }[];
}

export interface LeakSignals {
  claim: Claim;
  /** Who the post says it leaked from, as typed. Shown with the result, never sent to a search engine. */
  claimedSource?: string;
  confirmedMatches: Evidence[];
  /** The corroborated earliest public appearance, using the same T₀ rule as media audits. */
  firstSeen?: { at: string; evidenceId: string };
  deltaTDays?: number;
  timeline: SpreadTimeline;
  dateSpreadDays?: number;
  enginesUsed: EngineId[];
  enginesFailed: EngineId[];
  enginesSkipped: { engine: EngineId; reason: SkipReason }[];
}

export interface LeakInput {
  media: { kind: 'image' | 'video'; frames: { url: string; pHash: string; sharpness: number; tMs?: number }[] };
  claim: { text: string; source?: string; date?: string };
  maxCredits: number;
}

export interface LeakConfidence {
  value: number;
  band: 'High' | 'Medium' | 'Low';
  reasons: ScoreReason[];
}

/** The result of a leak trace, stored and streamed like a media dossier. */
export interface LeakDossier {
  kind: 'leak';
  id: string;
  verdict: LeakVerdict;
  flags: LeakFlags;
  confidence: LeakConfidence;
  signals: LeakSignals;
  evidence: Evidence[];
  /**
   * Short, redacted snippets of text read from the leaked image, kept only because the
   * audit has to show what it worked from. The full reading is never stored.
   */
  scene: { redactedSnippets: string[] };
  origin: OriginHint;
  narrative: { summary: string; bullets: { text: string; evidenceIds: string[] }[]; source: 'llm' | 'template' };
  advice: string;
  metrics: {
    totalMs: number;
    credits: number;
    maxCredits: number;
    cacheHit: boolean;
    stepsRun: number[];
    partial: boolean;
  };
  limitations: string[];
  signature: string;
  createdAt: string;
}

/** Printed with every leak result, whatever the verdict. */
export const LEAK_LIMITATIONS = [
  'DejaVue finds where public copies appeared. It cannot identify who leaked it.',
  'Search engines do not cover private groups, Telegram or dark web forums.',
];

/** Short, fixed advice per verdict. Never an instruction to find or name a person. */
export const LEAK_ADVICE: Record<LeakVerdict, string> = {
  LEAK_RECYCLED:
    'This document was already public before the date being claimed. Do not reshare personal data from it. Anyone harmed can report it at cybercrime.gov.in or call 1930.',
  LEAK_EARLIEST_FOUND:
    'This is the earliest public copy found, not the source of the leak. Do not reshare personal data from it. Anyone harmed can report it at cybercrime.gov.in or call 1930.',
  LEAK_NOT_FOUND:
    'No public copy was found, which says nothing about whether it leaked. Do not reshare personal data from it. Anyone harmed can report it at cybercrime.gov.in or call 1930.',
};
