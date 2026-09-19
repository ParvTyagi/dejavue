'use client';

import { AlertTriangle, ArrowLeft, ChevronRight, Zap } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { EASE_OUT } from '@/components/ui/motion';
import { loadAuditIntro, type AuditIntro } from '@/lib/client/auditIntro';
import { humanizeEngines, LEAK_STAGES, LEAK_STEP_NUMBER, OFFER_STAGES, OFFER_STEP_NUMBER, STAGES } from '@/lib/client/labels';
import { useAuditStream } from '@/lib/client/useAuditStream';
import { LEAK_SCORE_CAP } from '@/lib/leak/score';
import { OFFER_SCORE_CAP } from '@/lib/offer/score';
import { isFinalEvent, type AuditEvent } from '@/lib/shared/types';
import { ClaimBanner } from './ClaimBanner';
import { CreditMeter } from './CreditMeter';
import { DossierTools } from './DossierTools';
import { EnginePanel, leakEngineProps, mediaEngineProps, offerEngineProps } from './EnginePanel';
import { EvidenceFeed } from './EvidenceFeed';
import { FactTiles } from './FactTiles';
import { OriginPanel } from './OriginPanel';
import { ContactList, MessageBanner, OfficialSourceCard, RedFlagList } from './OfferPanels';
import { Panel } from './Panel';
import { MEDIA_SCORE_CAP, ScorePanel } from './ScorePanel';
import { SpreadTimeline } from './SpreadTimeline';
import { StageRail } from './StageRail';
import { Toaster } from './Toaster';
import { Timeline } from './Timeline';
import { leakVerdictView, mediaVerdictView, offerVerdictView, VerdictHero } from './VerdictHero';

const LocationMap = dynamic(() => import('./LocationMap'), {
  ssr: false,
  loading: () => <div className="h-72 animate-pulse rounded-xl bg-surface-2" />,
});

export function AuditView({ id, initialEvents }: { id: string; initialEvents: AuditEvent[] }) {
  const state = useAuditStream(id, initialEvents);
  // A finished audit arrives complete in the server HTML; skipping entrance animations
  // keeps it visible from the first paint instead of hidden until hydration.
  const [finishedOnLoad] = useState(() => initialEvents.some(isFinalEvent));
  const { dossier, offerDossier, leakDossier, fatal } = state;
  const [intro, setIntro] = useState<AuditIntro>();
  useEffect(() => setIntro(loadAuditIntro(id)), [id]);

  // Which kind of check this is, known from its first stage, its result, or the form that
  // started it in this tab.
  const kind = state.kind ?? (intro?.kind === 'offer' || intro?.kind === 'leak' ? intro.kind : undefined);
  const offer = kind === 'offer';
  const leak = kind === 'leak';
  const finished = offer ? offerDossier : leak ? leakDossier : dossier;
  const status = fatal ? 'failed' : finished ? 'complete' : 'live';
  const s = dossier?.signals;

  return (
    <AnimatePresence initial={!finishedOnLoad}>
      <div key="audit" className="relative isolate">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[560px] overflow-hidden">
          <div className="grid-bg absolute inset-0 opacity-60" />
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-bg" />
        </div>
        <div className="mx-auto max-w-6xl px-4 pt-8 pb-24 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <Link href="/check" className="group flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink">
              <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
              Check something else
            </Link>
            <div className="flex items-center gap-3">
              <StatusPill status={status} />
              <span className="hidden font-mono text-xs text-faint sm:inline">{id}</span>
            </div>
          </div>

          {offer ? (
            <MessageBanner intro={intro} dossier={offerDossier} />
          ) : leak ? (
            <ClaimBanner intro={intro} claim={leakDossier?.signals.claim} source={leakDossier?.signals.claimedSource} scanning={!leakDossier} />
          ) : (
            <ClaimBanner intro={intro} claim={dossier?.signals.claim} scanning={!dossier} />
          )}
          <Toaster notices={state.notices} />

          <AnimatePresence initial={!finishedOnLoad}>
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

          <AnimatePresence initial={!finishedOnLoad}>
            {offer
              ? offerDossier && <VerdictHero view={offerVerdictView(offerDossier)} />
              : leak
                ? leakDossier && <VerdictHero view={leakVerdictView(leakDossier)} />
                : dossier && <VerdictHero view={mediaVerdictView(dossier)} />}
          </AnimatePresence>

          {/* Phones: progress, then evidence, then details. Desktop: progress and details in a left column. */}
          <div className={finished ? 'mt-6 space-y-5' : 'mt-6 grid items-start gap-5 lg:grid-cols-[300px_1fr]'}>
            <aside className={finished ? 'hidden' : 'order-1 min-w-0 space-y-5 lg:order-none lg:col-start-1 lg:row-start-1'}>
              <Panel title="Investigation">
                {leak ? (
                  <StageRail
                    stages={LEAK_STAGES}
                    stage={state.stage}
                    finished={!!leakDossier}
                    fatal={fatal}
                    skipped={(stage) => LEAK_STEP_NUMBER[stage] !== undefined && !leakDossier?.metrics.stepsRun.includes(LEAK_STEP_NUMBER[stage]!)}
                  />
                ) : offer ? (
                  <StageRail
                    stages={OFFER_STAGES}
                    stage={state.stage}
                    finished={!!offerDossier}
                    fatal={fatal}
                    skipped={(stage) => OFFER_STEP_NUMBER[stage] !== undefined && !offerDossier?.metrics.stepsRun.includes(OFFER_STEP_NUMBER[stage]!)}
                  />
                ) : (
                  <StageRail
                    stages={STAGES}
                    stage={state.stage}
                    finished={!!dossier}
                    fatal={fatal}
                    skipped={(stage) => stage.startsWith('tier') && !dossier?.metrics.tiersRun.includes(Number(stage.slice(4)))}
                  />
                )}
              </Panel>
              <CreditMeter credits={state.credits} maxCredits={state.maxCredits} shortCircuit={state.shortCircuit} creditLog={state.creditLog} />
            </aside>

            <div className={finished ? 'min-w-0 space-y-5' : 'order-2 min-w-0 space-y-5 lg:order-none lg:col-start-2 lg:row-span-2 lg:row-start-1'}>
              <AnimatePresence initial={!finishedOnLoad}>
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
                        <span className="font-medium text-ink">
                          {offer ? 'Clear scam signs' : 'Decisive'} after {offer ? 'step' : 'tier'} {state.shortCircuit.afterTier}.
                        </span>{' '}
                        <span className="text-muted">
                          Stopped early and saved {state.shortCircuit.creditsSaved} search{state.shortCircuit.creditsSaved === 1 ? '' : 'es'}.
                        </span>
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {leak && (
                <>
                  <Panel
                    title="Where public copies appeared"
                    subtitle="Confirmed copies only, earliest first"
                  >
                    <SpreadTimeline
                      timeline={leakDossier?.signals.timeline ?? { entries: state.timeline, undated: [] }}
                      live={!leakDossier}
                    />
                  </Panel>
                  {leakDossier && <OriginPanel origin={leakDossier.origin} />}
                </>
              )}

              {offerDossier && (
                <>
                  <OfficialSourceCard dossier={offerDossier} />
                  <RedFlagList dossier={offerDossier} />
                  <ContactList dossier={offerDossier} />
                </>
              )}

              {!offer && !leak && dossier && s && (
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
                subtitle={finished ? `${finished.evidence.length} results, each linked to its source` : 'Arriving live from each search engine'}
              >
                <EvidenceFeed
                  evidence={finished?.evidence ?? state.evidence}
                  firstSeenId={s?.firstSeen?.evidenceId}
                  searching={status === 'live'}
                  inputPreview={offer ? undefined : intro?.previews[0]}
                  firstSeenLabel={leak ? 'earliest public copy' : undefined}
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
              {finished && (
                <ShowTheWorking>
                  <div className="grid gap-5 lg:grid-cols-3">
                    {leakDossier ? (
                      <>
                        <ScorePanel reasons={leakDossier.confidence.reasons} cap={LEAK_SCORE_CAP[leakDossier.verdict]} />
                        <EnginePanel {...leakEngineProps(leakDossier)} />
                      </>
                    ) : offerDossier ? (
                      <>
                        <ScorePanel reasons={offerDossier.confidence.reasons} cap={OFFER_SCORE_CAP[offerDossier.verdict]} />
                        <EnginePanel {...offerEngineProps(offerDossier)} />
                      </>
                    ) : (
                      dossier && (
                        <>
                          <ScorePanel reasons={dossier.confidence.reasons} cap={MEDIA_SCORE_CAP[dossier.verdict]} />
                          <EnginePanel {...mediaEngineProps(dossier)} />
                        </>
                      )
                    )}
                    <div className="space-y-5">
                      <CreditMeter
                        credits={state.credits}
                        maxCredits={state.maxCredits}
                        shortCircuit={state.shortCircuit}
                        creditLog={state.creditLog}
                      />
                      <DossierTools dossier={finished} />
                    </div>
                  </div>
                </ShowTheWorking>
              )}

            </div>
          </div>
        </div>
      </div>
    </AnimatePresence>
  );
}

/**
 * The audit's working, folded away once there is a verdict to read.
 *
 * None of it is hidden or dropped: the score breakdown, the searches spent, the engines
 * and the signed dossier are what make a verdict checkable rather than asserted. But a
 * reader who has just been told a photo is recycled wants the verdict and the evidence
 * first, and everything at once was the complaint.
 */
function ShowTheWorking({ children }: { children: React.ReactNode }) {
  return (
    <details className="group rounded-2xl border border-line bg-surface/60 open:bg-transparent">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm transition-colors hover:text-ink [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 text-faint transition-transform group-open:rotate-90" />
        <span className="font-medium text-ink">Show the working</span>
        <span className="hidden text-xs text-faint sm:inline">score · searches spent · engines · signed dossier</span>
      </summary>
      <div className="border-t border-line p-4">{children}</div>
    </details>
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
