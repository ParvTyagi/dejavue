import type { Claim, Evidence, SceneReading, Signals, Verdict } from '@/lib/shared/types';

export interface ParseClaimRequest {
  text: string;
  place?: string;
  date?: string;
  submittedAt: string;
}

export interface NarrateRequest {
  verdict: Verdict;
  flags: { recycled: boolean; misplaced: boolean };
  signals: Omit<Signals, 'confirmedMatches'>;
  evidence: Pick<Evidence, 'id' | 'engine' | 'domain' | 'title' | 'publishedAt' | 'url'>[];
}

/**
 * The three LLM calls. Implementations return raw JSON; callers validate it
 * and fall back, so an implementation may throw or return anything. The
 * signal fires when the caller stops waiting, so the request should be cancelled.
 */
export interface LlmPort {
  parseClaim(req: ParseClaimRequest, signal?: AbortSignal): Promise<unknown>;
  readScene(frameUrl: string, signal?: AbortSignal): Promise<unknown>;
  narrate(req: NarrateRequest, signal?: AbortSignal): Promise<unknown>;
}

export type { Claim, SceneReading };
