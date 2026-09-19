// Domain types shared by the browser, the API routes and the audit pipeline.

import type { LeakDossier, TimelineEntry } from '@/lib/leak/types';
import type { OfferDossier } from '@/lib/offer/types';

export type EngineId =
  | 'google_lens'
  | 'bing_reverse_image'
  | 'yandex_images'
  | 'google'
  | 'google_news'
  | 'google_maps'
  | 'youtube'
  | 'google_jobs';

export type Verdict = 'RECYCLED' | 'MISPLACED' | 'CONSISTENT' | 'CONTEXT_PLAUSIBLE' | 'UNVERIFIED';

export type FixtureMode = 'replay' | 'record' | 'live';

/**
 * Media audits run claim → narrate; offer checks run read → offer, then judge; leak
 * traces run trace → origin, then judge. The three sets of ids are disjoint, which is
 * how a stream tells which kind of check it is following before the result arrives.
 */
export type Stage =
  | 'claim'
  | 'scene'
  | 'tier1'
  | 'tier2'
  | 'tier3'
  | 'judge'
  | 'narrate'
  | 'read'
  | 'identity'
  | 'contacts'
  | 'offer'
  | 'trace'
  | 'copies'
  | 'dates'
  | 'origin';

export type PlaceScale = 'poi' | 'city' | 'region' | 'country';

export interface GeoPoint {
  lat: number;
  lng: number;
  label: string;
  scale: PlaceScale;
  country?: string;
}

export interface Claim {
  rawText: string;
  event?: string;
  place?: string;
  claimedAt: string;
  claimedAtSource: 'user' | 'parsed' | 'default_now';
  refersToPast: boolean;
  referencedYear?: number;
}

export interface Frame {
  url: string;
  /** Optional: the browser uploader computes it, a frame given as a public URL has none
   *  until the pipeline hashes it. The request schema treats it as optional too. */
  pHash?: string;
  sharpness: number;
  tMs?: number;
}

export interface PreparedMedia {
  kind: 'image' | 'video';
  frames: Frame[];
  exif?: { takenAt?: string; gps?: [number, number] } | null;
}

export interface AuditInput {
  media: PreparedMedia;
  claim: { text: string; place?: string; date?: string };
  options: { maxCredits: number; useExifLocation: boolean };
}

export type DateTrust = 'metadata' | 'absolute_text' | 'relative_text' | 'none';

export interface Evidence {
  id: string;
  engine: EngineId;
  kind: 'visual_match' | 'article' | 'video' | 'place' | 'trend' | 'listing';
  url: string;
  domain: string;
  title?: string;
  snippet?: string;
  thumbnailUrl?: string;
  publishedAt?: string;
  dateTrust: DateTrust;
  match?: { hamming: number; confirmed: boolean };
  geo?: GeoPoint;
  trustedSource: boolean;
  /**
   * The full-size image behind a visual match, as the engine reports it. Bing and
   * Yandex give a URL and pixel dimensions; Google Lens documents dimensions only
   * (`actual_image_width` / `actual_image_height`) and no original URL. Leak traces
   * use this to fetch and measure copies; nothing else reads it.
   */
  original?: { url?: string; width?: number; height?: number; bytes?: number };
}

export interface SceneReading {
  signText: string[];
  landmarks: { name: string; confidence: number }[];
  broadcastLogo?: string;
  language?: string;
}

/** Whether the scene was located near the claimed place. 'unchecked' when either place is unknown. */
export type LocationCheck = 'agrees' | 'mismatch' | 'unchecked';

/** Why an engine was not searched. */
export type SkipReason = 'budget' | 'deadline' | 'halted';

export interface VerdictFlags {
  recycled: boolean;
  misplaced: boolean;
  /**
   * A confirmed copy is more than 48 h older than the claimed date. Purely a fact
   * about the evidence: nothing the language model returns can suppress it, so the
   * finding survives even where `recycled` does not. `recycled` is this plus a claim
   * that asserts a date and that the older copy actually contradicts.
   */
  predatesClaim: boolean;
}

export interface Signals {
  claim: Claim;
  confirmedMatches: Evidence[];
  firstSeen?: { at: string; evidenceId: string };
  deltaTDays?: number;
  claimGeo?: GeoPoint;
  sceneGeo?: GeoPoint;
  deltaSKm?: number;
  location: LocationCheck;
  newsCorroborates: boolean;
  /**
   * Where `sceneGeo` came from, or undefined when the scene was never located.
   * EXIF is user-supplied and editable, so it is trusted less than a Maps lookup.
   */
  sceneGeoSource?: 'maps' | 'exif';
  enginesUsed: EngineId[];
  enginesFailed: EngineId[];
  enginesSkipped: { engine: EngineId; reason: SkipReason }[];
  dateSpreadDays?: number;
}

export interface ScoreReason {
  label: string;
  points: number;
}

export interface Dossier {
  /** Absent on media dossiers stored before offer checks existed. */
  kind?: 'media';
  id: string;
  verdict: Verdict;
  flags: VerdictFlags;
  confidence: { value: number; band: 'High' | 'Medium' | 'Low'; reasons: ScoreReason[] };
  signals: Signals;
  evidence: Evidence[];
  scene: { text: string[]; landmarks: string[] };
  narrative: { summary: string; bullets: { text: string; evidenceIds: string[] }[]; source: 'llm' | 'template' };
  metrics: { totalMs: number; credits: number; maxCredits: number; cacheHit: boolean; tiersRun: number[]; partial: boolean };
  /** What DejaVue cannot tell you, carried with every result. */
  limitations: string[];
  signature: string;
  createdAt: string;
}

/** Any stored result: a media audit, an offer check or a leak trace. */
export type AnyDossier = Dossier | OfferDossier | LeakDossier;

export const isOfferDossier = (d: AnyDossier): d is OfferDossier => d.kind === 'offer';

export const isLeakDossier = (d: AnyDossier): d is LeakDossier => d.kind === 'leak';

export const LIMITATIONS = [
  'DejaVue finds earlier appearances of media. It does not detect deepfakes or AI-generated images.',
  'Finding no earlier copy never proves that media is authentic.',
];

export type AuditEvent =
  | { type: 'stage'; data: { stage: Stage } }
  | { type: 'evidence'; data: Evidence }
  | { type: 'signal'; data: { firstSeen?: Signals['firstSeen']; deltaTDays?: number; deltaSKm?: number } }
  | { type: 'credit'; data: { engine: EngineId; cached: boolean; totalCredits: number; maxCredits: number } }
  | { type: 'short_circuit'; data: { afterTier: number; creditsSaved: number } }
  // One confirmed, dated public copy, streamed as soon as it is confirmed. T₀ is only
  // known once every search is in, so `isEarliest` is settled in the finished dossier.
  | { type: 'timeline'; data: TimelineEntry }
  | { type: 'dossier'; data: AnyDossier }
  | { type: 'error'; data: { code: string; message: string; recoverable: boolean } };

export type Emit = (event: AuditEvent) => void;

/** The event that ends an audit stream: the dossier, or an error that stops the audit. */
export const isFinalEvent = (e: AuditEvent) => e.type === 'dossier' || (e.type === 'error' && !e.data.recoverable);
