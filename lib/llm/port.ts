import type { LeakFlags, LeakSignals, LeakVerdict } from '@/lib/leak/types';
import type { Claim, Evidence, SceneReading, Signals, Verdict, VerdictFlags } from '@/lib/shared/types';

export interface ParseClaimRequest {
  text: string;
  place?: string;
  date?: string;
  submittedAt: string;
}

export interface NarrateRequest {
  verdict: Verdict | LeakVerdict;
  flags: VerdictFlags | LeakFlags;
  signals: Omit<Signals, 'confirmedMatches'> | Omit<LeakSignals, 'confirmedMatches'>;
  evidence: Pick<Evidence, 'id' | 'engine' | 'domain' | 'title' | 'publishedAt' | 'url'>[];
  /** Extra rules for this kind of result, such as never naming a person behind a leak. */
  guidance?: string;
}

export interface ReadOfferRequest {
  text?: string;
  /** Screenshot to read; its text is returned as screenshotText. */
  screenshotUrl?: string;
  claimedOrg?: string;
}

/**
 * The LLM calls. Implementations return raw JSON; callers validate it
 * and fall back, so an implementation may throw or return anything. The
 * signal fires when the caller stops waiting, so the request should be cancelled.
 */
export interface LlmPort {
  parseClaim(req: ParseClaimRequest, signal?: AbortSignal): Promise<unknown>;
  readScene(frameUrl: string, signal?: AbortSignal): Promise<unknown>;
  narrate(req: NarrateRequest, signal?: AbortSignal): Promise<unknown>;
  readOffer(req: ReadOfferRequest, signal?: AbortSignal): Promise<unknown>;
}

export type { Claim, SceneReading };
