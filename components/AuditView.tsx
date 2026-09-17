'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useState } from 'react';
import { ENGINE_LABEL, fmtDate, STAGES, TONE_CLASS, VERDICT_LABEL } from '@/lib/client/labels';
import { useAuditStream, type AuditState } from '@/lib/client/useAuditStream';
import type { Dossier } from '@/lib/shared/types';
import { EvidenceList } from './EvidenceList';
import { Timeline } from './Timeline';

const LocationMap = dynamic(() => import('./LocationMap'), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse rounded-xl bg-surface-2" />,
});

export function AuditView({ id }: { id: string }) {
  const state = useAuditStream(id);
  const { dossier, fatal } = state;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/" className="text-sm text-muted hover:text-ink">
          ← Check something else
        </Link>
        <span className="font-mono text-xs text-muted">{id}</span>
      </div>

      <ProgressRail state={state} />

      {fatal && (
        <div role="alert" className="rounded-xl border border-bad/30 bg-bad-soft p-4 text-sm text-bad">
          <p className="font-medium">No verdict could be reached.</p>
          <p>{fatal.message}</p>
        </div>
      )}

      {dossier ? <DossierView dossier={dossier} state={state} /> : !fatal && <LiveEvidence state={state} />}
    </div>
  );
}

function ProgressRail({ state }: { state: AuditState }) {
  const current = state.dossier ? STAGES.length : STAGES.findIndex((s) => s.id === state.stage);
  const skippedTiers = state.dossier
    ? new Set(STAGES.filter((s) => s.id.startsWith('tier') && !state.dossier!.metrics.tiersRun.includes(Number(s.id.slice(4)))).map((s) => s.id))
    : new Set<string>();

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {STAGES.map((s, i) => {
          const skipped = skippedTiers.has(s.id);
          const done = i < current;
          const active = i === current && !state.fatal;
          return (
            <li
              key={s.id}
              className={`rounded-lg border px-2 py-1.5 text-xs ${
                skipped
                  ? 'border-dashed border-line text-muted line-through'
                  : done
                    ? 'border-good/30 bg-good-soft text-good'
                    : active
                      ? 'animate-pulse border-accent text-ink'
                      : 'border-line text-muted'
              }`}
            >
              {s.label}
            </li>
          );
        })}
      </ol>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span>
          SerpApi searches: <strong className="font-mono">{state.credits}</strong>
        </span>
        {state.creditLog.length > 0 && (
          <span className="text-xs text-muted">
            {state.creditLog.map((c) => `${ENGINE_LABEL[c.engine]}${c.cached ? ' (cached)' : ''}`).join(' → ')}
          </span>
        )}
      </div>
      {state.shortCircuit && (
        <p className="mt-2 rounded-lg bg-good-soft px-3 py-1.5 text-sm text-good">
          Evidence was decisive after tier {state.shortCircuit.afterTier}: stopped early and saved {state.shortCircuit.creditsSaved}{' '}
          search{state.shortCircuit.creditsSaved === 1 ? '' : 'es'}.
        </p>
      )}
      {state.notices.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-warn">
          {state.notices.map((n, i) => (
            <li key={i}>⚠ {n.message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LiveEvidence({ state }: { state: AuditState }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-muted">Evidence so far</h2>
      {state.evidence.length ? <EvidenceList evidence={state.evidence} /> : <p className="text-sm text-muted">Searching…</p>}
    </section>
  );
}

function DossierView({ dossier, state }: { dossier: Dossier; state: AuditState }) {
  const label = VERDICT_LABEL[dossier.verdict];
  const s = dossier.signals;
  const hasMap = !!(s.claimGeo || s.sceneGeo);

  return (
    <div className="space-y-6">
      <section className={`rounded-2xl border p-5 sm:p-6 ${TONE_CLASS[label.tone]}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="font-mono text-xs tracking-wide uppercase">{dossier.verdict.replace('_', ' ')}</p>
            <h1 className="text-2xl font-semibold text-ink sm:text-3xl">{label.title}</h1>
            {dossier.flags.recycled && dossier.flags.misplaced && <p className="text-sm">Also shown in the wrong location.</p>}
          </div>
          <div className="text-right">
            <p className="font-mono text-3xl font-semibold text-ink">{dossier.confidence.value}</p>
            <p className="text-xs">{dossier.confidence.band} confidence</p>
          </div>
        </div>
        <p className="mt-4 max-w-3xl text-ink">{dossier.narrative.summary}</p>
        {dossier.narrative.bullets.length > 0 && (
          <ul className="mt-2 max-w-3xl list-disc space-y-1 pl-5 text-sm text-ink">
            {dossier.narrative.bullets.map((b, i) => (
              <li key={i}>
                {b.text}{' '}
                {b.evidenceIds.map((eid) => (
                  <a key={eid} href={`#ev-${eid}`} className="font-mono text-xs text-muted underline">
                    [{eid}]
                  </a>
                ))}
              </li>
            ))}
          </ul>
        )}
        {dossier.metrics.partial && (
          <p className="mt-3 text-sm font-medium text-warn">Partial audit: searches ran out or were rate-limited before all engines ran.</p>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Fact label="First seen" value={fmtDate(s.firstSeen?.at)} hint={s.firstSeen ? `ΔT ${s.deltaTDays} days before the claim` : 'No dated, confirmed copy'} />
        <Fact label="Claimed" value={fmtDate(s.claim.claimedAt)} hint={s.claim.place ?? 'No place given'} />
        <Fact
          label="Location"
          value={s.deltaSKm !== undefined ? `${s.deltaSKm.toLocaleString()} km` : '—'}
          hint={s.sceneGeo ? `Scene: ${s.sceneGeo.label}` : 'Scene not located'}
        />
      </div>

      <div className={`grid gap-4 ${hasMap ? 'lg:grid-cols-2' : ''}`}>
        <Card title="Timeline">
          <Timeline dossier={dossier} />
        </Card>
        {hasMap && (
          <Card title="Claimed place vs. scene">
            <LocationMap claim={s.claimGeo} scene={s.sceneGeo} />
          </Card>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card title={`Evidence (${dossier.evidence.length})`}>
          <EvidenceList evidence={dossier.evidence} firstSeenId={s.firstSeen?.evidenceId} />
        </Card>
        <div className="space-y-4">
          <Card title="Why this confidence">
            <ul className="space-y-1.5 text-sm">
              {dossier.confidence.reasons.length === 0 && <li className="text-muted">No evidence earned points.</li>}
              {dossier.confidence.reasons.map((r, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span>{r.label}</span>
                  <span className={`font-mono ${r.points < 0 ? 'text-bad' : 'text-good'}`}>
                    {r.points > 0 ? '+' : ''}
                    {r.points}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">Capped at {CAP_NOTE[dossier.verdict]} for this verdict.</p>
          </Card>
          <Card title="Search engines">
            <EngineSummary dossier={dossier} />
          </Card>
          {(dossier.scene.text.length > 0 || dossier.scene.landmarks.length > 0) && (
            <Card title="Read from the scene">
              <p className="text-sm">{[...dossier.scene.landmarks, ...dossier.scene.text].join(' · ')}</p>
            </Card>
          )}
          <Card title="Dossier">
            <DossierTools dossier={dossier} />
          </Card>
        </div>
      </div>
      {state.notices.length > 0 && <p className="text-xs text-muted">{state.notices.length} notice(s) during the audit, listed above.</p>}
    </div>
  );
}

const CAP_NOTE: Record<Dossier['verdict'], number> = { RECYCLED: 99, MISPLACED: 99, CONSISTENT: 85, CONTEXT_PLAUSIBLE: 60, UNVERIFIED: 40 };

function Fact({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="font-mono text-xl">{value}</p>
      <p className="text-xs text-muted">{hint}</p>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <h2 className="mb-3 text-sm font-medium text-muted">{title}</h2>
      {children}
    </section>
  );
}

function EngineSummary({ dossier }: { dossier: Dossier }) {
  const { enginesUsed, enginesFailed, enginesSkipped } = dossier.signals;
  const rows = [
    ...enginesUsed.map((e) => [e, 'used', 'text-good'] as const),
    ...enginesFailed.map((e) => [e, 'failed', 'text-bad'] as const),
    ...enginesSkipped.filter((e) => !enginesUsed.includes(e)).map((e) => [e, 'skipped (budget)', 'text-warn'] as const),
  ];
  return (
    <div className="space-y-2 text-sm">
      <ul className="space-y-1">
        {rows.map(([engine, status, cls], i) => (
          <li key={i} className="flex justify-between gap-3">
            <span>{ENGINE_LABEL[engine]}</span>
            <span className={`text-xs ${cls}`}>{status}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">
        {dossier.metrics.credits} search credit(s) · {dossier.metrics.cacheHit ? 'reused cached evidence · ' : ''}
        tiers {dossier.metrics.tiersRun.join(', ') || 'none'} · {(dossier.metrics.totalMs / 1000).toFixed(1)} s
      </p>
    </div>
  );
}

function DossierTools({ dossier }: { dossier: Dossier }) {
  const [verified, setVerified] = useState<string>();
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(dossier, null, 2)], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `${dossier.id}.json` });
    a.click();
    URL.revokeObjectURL(url);
  };
  const verify = async () => {
    const res = await fetch('/api/dossier/verify', { method: 'POST', body: JSON.stringify(dossier) });
    const data = await res.json().catch(() => ({}));
    setVerified(res.ok ? (data.valid ? 'Signature valid' : 'Signature does not match') : data?.error?.message ?? 'Could not verify');
  };
  return (
    <div className="space-y-2 text-sm">
      <p className="break-all font-mono text-xs text-muted">HMAC {dossier.signature.slice(0, 24)}…</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={download} className="rounded-lg border border-line px-3 py-1.5 hover:border-accent">
          Download JSON
        </button>
        <button type="button" onClick={verify} className="rounded-lg border border-line px-3 py-1.5 hover:border-accent">
          Verify signature
        </button>
      </div>
      {verified && <p className="text-xs">{verified}</p>}
    </div>
  );
}
