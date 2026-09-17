// Domain types shared by the browser, the API routes and the audit pipeline.

export type EngineId =
  | 'google_lens'
  | 'bing_reverse_image'
  | 'yandex_images'
  | 'google'
  | 'google_news'
  | 'google_maps'
  | 'youtube'
  | 'google_trends';

export type Verdict = 'RECYCLED' | 'MISPLACED' | 'CONSISTENT' | 'CONTEXT_PLAUSIBLE' | 'UNVERIFIED';

export type FixtureMode = 'replay' | 'record' | 'live';

export type Stage = 'claim' | 'scene' | 'tier1' | 'tier2' | 'tier3' | 'judge' | 'narrate';

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
  pHash: string;
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
  kind: 'visual_match' | 'article' | 'video' | 'place' | 'trend';
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
  sceneResolvedByMaps: boolean;
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
  | { type: 'dossier'; data: Dossier }
  | { type: 'error'; data: { code: string; message: string; recoverable: boolean } };

export type Emit = (event: AuditEvent) => void;

/** The event that ends an audit stream: the dossier, or an error that stops the audit. */
export const isFinalEvent = (e: AuditEvent) => e.type === 'dossier' || (e.type === 'error' && !e.data.recoverable);
