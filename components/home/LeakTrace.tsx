'use client';

import { ArrowUpRight, FileWarning, Loader2, ShieldAlert, Sparkles, Upload, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { MoreDetails } from '@/components/ui/MoreDetails';
import { EASE_OUT, Reveal, ShimmerButton, SpotlightCard } from '@/components/ui/motion';
import { FIELD_CLASS as field, postJson, uploadImage } from '@/lib/client/api';
import { saveAuditIntro } from '@/lib/client/auditIntro';
import type { PreparedScreenshot } from '@/lib/client/prepareMedia';
import type { LeakInput } from '@/lib/leak/types';
import type { FixtureMode } from '@/lib/shared/types';

export interface LeakDemo {
  id: string;
  title: string;
  input: LeakInput;
}

type Source = 'demo' | 'upload';

/**
 * What the form posts. The hash is optional here: the browser computes it from the same
 * pixels it uploads, and the server falls back to hashing the upload itself.
 */
interface LeakRequest {
  media: { kind: 'image' | 'video'; frames: { url: string; pHash?: string; sharpness: number }[] };
  claim: { text: string; source?: string; date?: string };
}

/** Screenshots keep more pixels than a photo frame, so small print in a document stays readable. */
const loadMediaPrep = () => import('@/lib/client/prepareMedia');

export function LeakTrace({ mode, demos }: { mode: FixtureMode; demos: LeakDemo[] }) {
  const router = useRouter();
  const replay = mode === 'replay';
  const [source, setSource] = useState<Source>(replay ? 'demo' : 'upload');
  const [image, setImage] = useState<PreparedScreenshot>();
  const [dragging, setDragging] = useState(false);
  const [claim, setClaim] = useState('');
  const [org, setOrg] = useState('');
  const [date, setDate] = useState('');
  const [status, setStatus] = useState<string>();
  const [error, setError] = useState<string>();
  const busy = !!status;

  async function onFile(file: File | undefined) {
    setError(undefined);
    if (!file) return;
    setStatus('Preparing the image…');
    const { MediaError, prepareScreenshot } = await loadMediaPrep();
    await prepareScreenshot(file, true)
      .then(setImage, (err) => setError(err instanceof MediaError ? err.message : "Couldn't read this file."))
      .finally(() => setStatus(undefined));
  }

  async function start(input: LeakRequest, preview?: string) {
    setStatus('Starting the trace…');
    const { auditId } = await postJson('/api/leak', input);
    saveAuditIntro(auditId, { claim: input.claim.text.slice(0, 200), kind: 'leak', previews: preview ? [preview] : [] });
    router.push(`/audit/${auditId}`);
  }

  function fail(err: unknown) {
    setError((err as Error).message);
    setStatus(undefined);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    if (!image) {
      setError('Add the screenshot or photo of the document first.');
      return;
    }
    if (claim.trim().length < 5) {
      setError('Say what it is being shared as, in a few words.');
      return;
    }
    try {
      setStatus('Uploading…');
      const url = await uploadImage(image.blob, 'document.jpg');
      await start(
        {
          media: { kind: 'image', frames: [{ url, ...(image.pHash ? { pHash: image.pHash } : {}), sharpness: 0 }] },
          claim: {
            text: claim.trim(),
            ...(org.trim() ? { source: org.trim() } : {}),
            ...(date ? { date: new Date(date).toISOString() } : {}),
          },
        },
        image.previewUrl,
      );
    } catch (err) {
      fail(err);
    }
  }

  async function runDemo(demo: LeakDemo) {
    setError(undefined);
    setStatus(`Opening “${demo.title}”…`);
    const { maxCredits: _cap, ...input } = demo.input;
    await start(input).catch(fail);
  }

  const tabs: { id: Source; label: string; icon: typeof Upload; off?: boolean }[] = [
    ...(replay ? [{ id: 'demo' as const, label: 'Demo cases', icon: Sparkles }] : []),
    { id: 'upload', label: 'Your document', icon: Upload, off: replay },
  ];

  return (
    <section>
      <Reveal delay={0.1} className="mt-8">
        <div className="rounded-3xl border border-line bg-surface p-2">
          <div role="tablist" className="flex gap-1 rounded-2xl bg-surface-2 p-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                type="button"
                aria-selected={source === t.id}
                onClick={() => setSource(t.id)}
                className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-[13px] whitespace-nowrap transition-colors sm:flex-none sm:gap-2 sm:px-5 sm:text-sm ${
                  source === t.id ? 'font-medium text-ink' : 'text-muted hover:text-ink'
                }`}
              >
                {source === t.id && (
                  <motion.span
                    layoutId="leak-tab-pill"
                    className="absolute inset-0 rounded-xl bg-bg shadow-sm ring-1 ring-black/5"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  />
                )}
                <t.icon className="relative size-4" />
                <span className="relative">{t.label}</span>
                {t.off && <span className="relative rounded-full border border-line px-1.5 py-0.5 text-[10px] text-faint">off</span>}
              </button>
            ))}
          </div>

          <div className="p-3 sm:p-5">
            {/* Said before anything is uploaded, because it is the whole shape of the answer. */}
            <div className="mb-5 flex items-start gap-2.5 rounded-2xl border border-line bg-surface-2 p-4 text-sm">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warn" />
              <p className="text-muted">
                <span className="font-medium text-ink">DejaVue finds where public copies appeared. It cannot identify who leaked it.</span>{' '}
                Search engines do not cover private groups, Telegram or dark web forums, so the earliest copy found is only the earliest one
                that is public.
              </p>
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={source}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.3, ease: EASE_OUT }}
              >
                {source === 'demo' ? (
                  <div className="space-y-5">
                    <p className="max-w-3xl text-sm text-muted">
                      Each example runs the full trace on saved search results. The documents, companies and dates are made up for
                      demonstration.
                    </p>
                    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {demos.map((d) => (
                        <li key={d.id}>
                          <SpotlightCard
                            role="button"
                            tabIndex={0}
                            aria-disabled={busy}
                            onClick={() => !busy && runDemo(d)}
                            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !busy && runDemo(d)}
                            whileHover={{ y: -4 }}
                            whileTap={{ scale: 0.98 }}
                            className="flex h-full cursor-pointer flex-col gap-3 p-4 outline-none focus-visible:border-accent"
                          >
                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-1 rounded-full border border-line bg-bg/80 px-2 py-0.5 text-[10px] text-ink">
                                <FileWarning className="size-3" />
                                document
                              </span>
                              <ArrowUpRight className="size-4 text-faint transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-ink" />
                            </div>
                            <span className="text-sm leading-snug font-medium text-ink">{d.title}</span>
                            <span className="line-clamp-2 text-xs text-muted">{d.input.claim.text}</span>
                            <span className="mt-auto text-xs text-faint transition-colors group-hover:text-ink">Run this example</span>
                          </SpotlightCard>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
                    {replay && (
                      <div className="rounded-2xl border border-line bg-surface-2 p-4 text-sm lg:col-span-2">
                        <p className="font-medium text-ink">This public demo runs on recorded searches, so it spends no SerpApi credits.</p>
                        <p className="mt-1 text-muted">
                          Tracing your own document needs a live SerpApi key. Run the project locally with{' '}
                          <code className="rounded bg-bg px-1 py-0.5 font-mono text-xs">FIXTURE_MODE=live</code> to do that, or open{' '}
                          <button type="button" onClick={() => setSource('demo')} className="font-medium text-accent underline underline-offset-2">
                            Demo cases
                          </button>
                          .
                        </p>
                      </div>
                    )}

                    <div className="flex flex-col gap-4">
                      <label
                        htmlFor="document"
                        onDragOver={(e) => {
                          e.preventDefault();
                          setDragging(true);
                        }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setDragging(false);
                          onFile(e.dataTransfer.files?.[0]);
                        }}
                        className={`relative flex min-h-56 flex-1 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed p-5 text-center transition-all duration-300 ${
                          dragging ? 'scale-[1.01] border-accent bg-accent/5' : 'border-line-strong bg-bg hover:border-accent/50'
                        }`}
                      >
                        <input
                          id="document"
                          type="file"
                          className="sr-only"
                          accept="image/jpeg,image/png,image/webp"
                          disabled={busy}
                          onChange={(e) => {
                            onFile(e.target.files?.[0]);
                            e.target.value = '';
                          }}
                        />
                        {image ? (
                          <div className="space-y-2">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={image.previewUrl} alt="Document to trace" className="mx-auto max-h-48 w-auto rounded-xl border border-line" />
                            <p className="text-xs text-faint">Click or drop to replace</p>
                          </div>
                        ) : (
                          <>
                            <span className="flex size-11 items-center justify-center rounded-2xl border border-line bg-surface-2 text-accent">
                              {busy ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}
                            </span>
                            <p className="mt-3 text-sm font-medium">Screenshot or photo of the document</p>
                            <p className="mt-1 text-xs text-faint">JPEG, PNG or WebP</p>
                            <p className="mt-3 text-xs text-muted">It is searched by image and then deleted.</p>
                          </>
                        )}
                      </label>
                      {image && (
                        <button
                          type="button"
                          onClick={() => setImage(undefined)}
                          className="flex items-center justify-center gap-1.5 self-start text-xs text-muted hover:text-ink"
                        >
                          <X className="size-3.5" /> Remove image
                        </button>
                      )}
                    </div>

                    <div className="flex flex-col gap-4">
                      <div>
                        <label className="mb-1.5 block text-sm font-medium" htmlFor="leak-claim">
                          What is it being shared as?
                        </label>
                        <textarea
                          id="leak-claim"
                          maxLength={500}
                          rows={4}
                          placeholder="e.g. “Internal payroll memo leaked today from Northwind Logistics”"
                          value={claim}
                          onChange={(e) => setClaim(e.target.value)}
                          className={`${field} resize-y`}
                        />
                      </div>
                      <MoreDetails hint="who it names, and the date it claims">
                        <div>
                          <label className="mb-1.5 block text-xs text-muted" htmlFor="leak-org">
                            Which organisation does the post name?
                          </label>
                          <input
                            id="leak-org"
                            maxLength={200}
                            value={org}
                            onChange={(e) => setOrg(e.target.value)}
                            placeholder="Northwind Logistics"
                            className={field}
                          />
                          <p className="mt-1.5 text-xs text-faint">Shown with the result. It is never sent to a search engine.</p>
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs text-muted" htmlFor="leak-date">
                            Date the post claims
                          </label>
                          <input id="leak-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
                          <p className="mt-1.5 text-xs text-faint">Leave it blank if the post gave no date; nothing is assumed from an empty field.</p>
                        </div>
                      </MoreDetails>
                      <ShimmerButton type="submit" disabled={busy || replay || !image} className="mt-auto flex items-center justify-center gap-2">
                        {busy && <Loader2 className="size-4 animate-spin" />}
                        Trace this document
                      </ShimmerButton>
                    </div>
                  </form>
                )}
              </motion.div>
            </AnimatePresence>

            <AnimatePresence>
              {(status || error) && (
                <motion.p
                  role="status"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className={`mt-4 flex items-center gap-2 text-sm ${error ? 'text-bad' : 'text-muted'}`}
                >
                  {!error && <Loader2 className="size-4 animate-spin text-accent" />}
                  {error ?? status}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
