import { fmtDate } from '@/lib/client/labels';
import type { Dossier } from '@/lib/shared/types';

const W = 560;
const H = 120;
const PAD = 24;

/** Dated evidence on a time axis, with the claimed date and first-seen date marked. */
export function Timeline({ dossier }: { dossier: Dossier }) {
  const claimed = Date.parse(dossier.signals.claim.claimedAt);
  const points = dossier.evidence
    .filter((e) => e.publishedAt)
    .map((e) => ({ e, t: Date.parse(e.publishedAt!) }));

  if (points.length === 0) {
    return <p className="text-sm text-muted">No dated evidence was found, so there is no timeline to show.</p>;
  }

  const times = [...points.map((p) => p.t), claimed];
  const min = Math.min(...times);
  const max = Math.max(...times);
  const span = Math.max(max - min, 86_400_000);
  const x = (t: number) => PAD + ((t - min) / span) * (W - 2 * PAD);
  const firstSeenId = dossier.signals.firstSeen?.evidenceId;

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Timeline of dated evidence and the claimed date">
        <line x1={PAD} x2={W - PAD} y1={70} y2={70} stroke="var(--line)" strokeWidth={2} />
        {points.map(({ e, t }, i) => {
          const confirmed = !!e.match?.confirmed;
          const first = e.id === firstSeenId;
          return (
            <g key={e.id}>
              <title>{`${e.id} · ${e.domain} · ${fmtDate(e.publishedAt)}${confirmed ? ' · confirmed' : ''}`}</title>
              <circle
                cx={x(t)}
                cy={70 - (i % 3) * 12}
                r={first ? 7 : 5}
                fill={confirmed ? (first ? 'var(--warn)' : 'var(--good)') : 'var(--surface)'}
                stroke={confirmed ? 'none' : 'var(--muted)'}
                strokeWidth={1.5}
              />
            </g>
          );
        })}
        <line x1={x(claimed)} x2={x(claimed)} y1={30} y2={90} stroke="var(--bad)" strokeWidth={2} strokeDasharray="4 3" />
        <text x={x(claimed)} y={22} textAnchor="middle" fontSize={11} fill="var(--bad)">
          claimed
        </text>
        <text x={PAD} y={H - 6} fontSize={11} fill="var(--muted)">
          {fmtDate(new Date(min).toISOString())}
        </text>
        <text x={W - PAD} y={H - 6} textAnchor="end" fontSize={11} fill="var(--muted)">
          {fmtDate(new Date(max).toISOString())}
        </text>
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-3 text-xs text-muted">
        <span>
          <span className="mr-1 inline-block size-2 rounded-full bg-warn" />
          first seen
        </span>
        <span>
          <span className="mr-1 inline-block size-2 rounded-full bg-good" />
          confirmed copy
        </span>
        <span>
          <span className="mr-1 inline-block size-2 rounded-full border border-muted" />
          similar or article
        </span>
      </figcaption>
    </figure>
  );
}
