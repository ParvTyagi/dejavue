// Kept in its own leaf module, with type-only imports, so that scripts run by bare
// `node` (which does not resolve the `@/` alias) can import it without pulling in
// the store and timer helpers that lib/serp/client.ts needs.
import type { EngineId } from '@/lib/shared/types';

const IMAGE_PARAMS = new Set(['url', 'image_url']);

/**
 * Stable, human-readable fixture name. Image URLs change on every upload, so
 * image searches are keyed by keyframe index instead.
 */
export function fixtureName(engine: EngineId, params: Record<string, string>, frameIndex?: number): string {
  const parts = Object.keys(params)
    .filter((k) => k !== 'engine' && k !== 'api_key')
    .sort()
    .map((k) => (IMAGE_PARAMS.has(k) ? `frame=${frameIndex ?? 0}` : `${k}=${params[k]}`));
  return `${engine}?${parts.join('&')}`;
}
