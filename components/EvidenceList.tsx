import { DATE_TRUST_LABEL, ENGINE_LABEL, fmtDate } from '@/lib/client/labels';
import type { Evidence } from '@/lib/shared/types';

function MatchBadge({ ev }: { ev: Evidence }) {
  if (!ev.match) return null;
  return ev.match.confirmed ? (
    <span className="rounded-full bg-good-soft px-2 py-0.5 text-xs text-good" title={`Hamming distance ${ev.match.hamming} of 64`}>
      ✓ same image · {ev.match.hamming}
    </span>
  ) : (
    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted" title="Not confirmed; never used for dating">
      similar only
    </span>
  );
}

export function EvidenceList({ evidence, firstSeenId }: { evidence: Evidence[]; firstSeenId?: string }) {
  const sorted = [...evidence].sort((a, b) => Number(!!b.match?.confirmed) - Number(!!a.match?.confirmed));
  return (
    <ul className="divide-y divide-line">
      {sorted.map((ev) => (
        <li key={ev.id} id={`ev-${ev.id}`} className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono">{ev.id}</span>
            <span className="text-muted">{ENGINE_LABEL[ev.engine]}</span>
            <MatchBadge ev={ev} />
            {ev.trustedSource && <span className="rounded-full bg-info-soft px-2 py-0.5 text-info">trusted archive</span>}
            {ev.id === firstSeenId && <span className="rounded-full bg-warn-soft px-2 py-0.5 text-warn">first seen</span>}
          </div>
          <a href={ev.url} target="_blank" rel="noopener noreferrer nofollow" className="text-sm font-medium break-words hover:underline">
            {ev.title ?? ev.url}
          </a>
          <p className="text-xs text-muted">
            {ev.domain} · {ev.publishedAt ? `${fmtDate(ev.publishedAt)} (${DATE_TRUST_LABEL[ev.dateTrust]})` : 'undated'}
          </p>
        </li>
      ))}
    </ul>
  );
}
