'use client';

import { AlertTriangle, ArrowLeft, Zap } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { EASE_OUT } from '@/components/ui/motion';
import { loadAuditIntro, type AuditIntro } from '@/lib/client/auditIntro';
import { humanizeEngines } from '@/lib/client/labels';
import { useAuditStream } from '@/lib/client/useAuditStream';
import { ClaimBanner } from './ClaimBanner';
import { CreditMeter } from './CreditMeter';
import { DossierTools } from './DossierTools';
import { EnginePanel } from './EnginePanel';
import { EvidenceFeed } from './EvidenceFeed';
import { FactTiles } from './FactTiles';
import { Panel } from './Panel';
import { ScorePanel } from './ScorePanel';
import { StageRail } from './StageRail';
import { Toaster } from './Toaster';
import { Timeline } from './Timeline';
import { VerdictHero } from './VerdictHero';

const LocationMap = dynamic(() => import('./LocationMap'), {
  ssr: false,
  loading: () => <div className="h-72 animate-pulse rounded-xl bg-surface-2" />,
});

export function AuditView({ id }: { id: string }) {
  const state = useAuditStream(id);
  const { dossier, fatal } = state;
  const [intro, setIntro] = useState<AuditIntro>();
  useEffect(() => setIntro(loadAuditIntro(id)), [id]);

  const status = fatal ? 'failed' : dossier ? 'complete' : 'live';
  const s = dossier?.signals;

  return (
    <div className="relative isolate">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[560px] overflow-hidden">
        <div className="grid-bg absolute inset-0 opacity-60" />
        <div className="absolute -top-40 left-[10%] h-[420px] w-[620px] animate-drift rounded-full bg-[radial-gradient(closest-side,rgb(94_234_212/0.14),transparent)] blur-3xl" />
        <div className="absolute -top-24 right-[5%] h-[380px] w-[560px] animate-drift rounded-full bg-[radial-gradient(closest-side,rgb(167_139_250/0.16),transparent)] blur-3xl" style={{ animationDelay: '-9s' }} />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-bg" />
      </div>
      <div className="mx-auto max-w-6xl px-4 pt-8 pb-24 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <Link href="/#check" className="group flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink">
            <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
            Check something else
          </Link>
          <div className="flex items-center gap-3">
            <StatusPill status={status} />
            <span className="hidden font-mono text-xs text-faint sm:inline">{id}</span>
          </div>
        </div>

        <ClaimBanner intro={intro} dossier={dossier} />
        <Toaster notices={state.notices} />

        <AnimatePresence>
          {fatal && (
            <motion.div
              role="alert"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 flex items-start gap-3 rounded-2xl border border-bad/40 bg-bad-soft p-5 text-bad"
            >
              <AlertTriangle className="mt-0.5 size-5 shrink-0" />
              <div>
                <p className="font-medium">No verdict could be reached.</p>
                <p className="mt-1 text-sm opacity-90">{fatal.message}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>{dossier && <VerdictHero dossier={dossier} />}</AnimatePresence>

        {/* Phones: progress, then evidence, then details. Desktop: progress and details in a left column. */}
        <div className="mt-6 grid items-start gap-5 lg:grid-cols-[300px_1fr]">
          <aside className="order-1 min-w-0 space-y-5 lg:order-none lg:col-start-1 lg:row-start-1">
            <Panel title="Investigation">
              <StageRail state={state} />
            </Panel>
            <CreditMeter state={state} />
          </aside>

          {dossier && (
            <aside className="order-3 min-w-0 space-y-5 lg:order-none lg:col-start-1 lg:row-start-2">
              <ScorePanel dossier={dossier} />
              <EnginePanel dossier={dossier} />
              <DossierTools dossier={dossier} />
            </aside>
          )}

          <div className="order-2 min-w-0 space-y-5 lg:order-none lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <AnimatePresence>
              {state.shortCircuit && (
                <motion.div
                  initial={{ opacity: 0, height: 0, y: -10 }}
                  animate={{ opacity: 1, height: 'auto', y: 0 }}
                  transition={{ duration: 0.5, ease: EASE_OUT }}
                  className="overflow-hidden"
                >
                  <div className="flex items-center gap-3 rounded-2xl border border-accent/30 bg-accent/[0.07] px-4 py-3 text-sm">
                    <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-ink">
                      <Zap className="size-4" />
                    </span>
                    <p>
                      <span className="font-medium text-ink">Decisive after tier {state.shortCircuit.afterTier}.</span>{' '}
                      <span className="text-muted">
                        Stopped early and saved {state.shortCircuit.creditsSaved} search{state.shortCircuit.creditsSaved === 1 ? '' : 'es'}.
                      </span>
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {dossier && s && (
              <>
                <FactTiles dossier={dossier} />
                <div className={`grid items-start gap-5 ${s.claimGeo || s.sceneGeo ? 'xl:grid-cols-2' : ''}`}>
                  <Panel title="Timeline" subtitle="Dated evidence against the claimed date">
                    <Timeline dossier={dossier} />
                  </Panel>
                  {(s.claimGeo || s.sceneGeo) && (
                    <Panel title="Claimed place vs. scene" subtitle="Resolved with Google Maps">
                      <LocationMap claim={s.claimGeo} scene={s.sceneGeo} distanceKm={s.deltaSKm} />
                    </Panel>
                  )}
                </div>
              </>
            )}

            <Panel
              title="Evidence"
              subtitle={dossier ? `${dossier.evidence.length} results, each linked to its source` : 'Arriving live from each search engine'}
            >
              <EvidenceFeed
                evidence={dossier?.evidence ?? state.evidence}
                firstSeenId={s?.firstSeen?.evidenceId}
                searching={status === 'live'}
                inputPreview={intro?.previews[0]}
              />
            </Panel>

            {state.notices.length > 0 && (
              <Panel title="Notices">
                <ul className="space-y-1.5 text-sm text-warn">
                  {state.notices.map((n, i) => (
                    <motion.li key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="flex gap-2">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                      {humanizeEngines(n.message)}
                    </motion.li>
                  ))}
                </ul>
              </Panel>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: 'live' | 'complete' | 'failed' }) {
  const styles = {
    live: { text: 'Investigating', cls: 'border-accent/40 text-accent', dot: 'bg-accent' },
    complete: { text: 'Complete', cls: 'border-good/40 text-good', dot: 'bg-good' },
    failed: { text: 'Failed', cls: 'border-bad/40 text-bad', dot: 'bg-bad' },
  }[status];
  return (
    <motion.span layout className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${styles.cls}`}>
      <span className="relative flex size-1.5">
        {status === 'live' && <span className={`absolute inset-0 animate-pulse-ring rounded-full ${styles.dot}`} />}
        <span className={`relative size-1.5 rounded-full ${styles.dot}`} />
      </span>
      {styles.text}
    </motion.span>
  );
}
