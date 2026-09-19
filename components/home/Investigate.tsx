'use client';

import { ArrowUpRight, Film, Image as ImageIcon, Link2, Loader2, Sparkles, Upload } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { MoreDetails } from '@/components/ui/MoreDetails';
import { EASE_OUT, Reveal, ScrambleText, ShimmerButton, SpotlightCard } from '@/components/ui/motion';
import { FIELD_CLASS as field, postJson, uploadImage } from '@/lib/client/api';
import { saveAuditIntro } from '@/lib/client/auditIntro';
import type { PreparedUpload } from '@/lib/client/prepareMedia';
import type { AuditInput, FixtureMode } from '@/lib/shared/types';
import { demoTheme } from './demoThemes';

export interface DemoCase {
  id: string;
  title: string;
  kind: 'image' | 'video';
  input: AuditInput;
}

type Source = 'demo' | 'upload' | 'url';

const REPLAY_FRAME_URL = (i: number) => `https://replay.dejavue.invalid/upload/frame-${i}.jpg`;

/** Uploads the prepared frames in parallel (or, in replay, stands in fixed URLs), keeping their order. */
async function uploadFrames(prepared: PreparedUpload, replay: boolean, onStatus: (s: string) => void) {
  const count = prepared.frames.length;
  if (!replay) onStatus(`Uploading ${count} frame${count === 1 ? '' : 's'}…`);
  return Promise.all(
    prepared.frames.map(async (f, i) => {
      const url = replay ? REPLAY_FRAME_URL(i) : await uploadImage(f.blob, `frame-${i}.jpg`);
      return { url, pHash: f.pHash, sharpness: f.sharpness, tMs: f.tMs };
    }),
  );
}

/** Loaded on first use: most visitors never pick a file. */
const loadMediaPrep = () => import('@/lib/client/prepareMedia');

export function Investigate({ mode, demos }: { mode: FixtureMode; demos: DemoCase[] }) {
  const router = useRouter();
  const replay = mode === 'replay';
  const [source, setSource] = useState<Source>(replay ? 'demo' : 'upload');
  const [prepared, setPrepared] = useState<PreparedUpload>();
  const [dragging, setDragging] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [claim, setClaim] = useState('');
  const [place, setPlace] = useState('');
  const [date, setDate] = useState('');
  const [useExif, setUseExif] = useState(false);
  const [status, setStatus] = useState<string>();
  const [error, setError] = useState<string>();
  const busy = !!status;

  async function onFile(file: File | undefined) {
    setError(undefined);
    setPrepared(undefined);
    if (!file) return;
    const video = file.type.startsWith('video/');
    setStatus(video ? 'Picking keyframes…' : 'Fingerprinting image…');
    const { MediaError, prepareImage, prepareVideo } = await loadMediaPrep();
    await (video ? prepareVideo(file, (f) => setStatus(`Picking keyframes… ${Math.round(f * 100)}%`)) : prepareImage(file))
      .then(setPrepared, (err) => setError(err instanceof MediaError ? err.message : "Couldn't read this file."))
      .finally(() => setStatus(undefined));
  }

  async function start(input: AuditInput | Record<string, unknown>, previews: string[] = []) {
    const { auditId } = await postJson('/api/investigate', input);
    const body = input as AuditInput;
    saveAuditIntro(auditId, { claim: body.claim.text, place: body.claim.place, kind: body.media?.kind ?? 'image', previews });
    router.push(`/audit/${auditId}`);
  }

  function fail(err: unknown) {
    setError((err as Error).message);
    setStatus(undefined);
  }

  async function submit() {
    const claimBody = {
      text: claim.trim(),
      ...(place.trim() ? { place: place.trim() } : {}),
      ...(date ? { date: new Date(date).toISOString() } : {}),
    };
    if (source === 'upload') {
      if (!prepared) {
        setError('Choose an image or video first.');
        return;
      }
      const frames = await uploadFrames(prepared, replay, setStatus);
      setStatus('Starting audit…');
      await start(
        {
          media: { kind: prepared.kind, frames, exif: useExif ? (prepared.exif ?? null) : null },
          claim: claimBody,
          options: { maxCredits: 6, useExifLocation: useExif && !!prepared.exif?.gps },
        },
        prepared.frames.map((f) => f.previewUrl),
      );
    } else if (source === 'url') {
      setStatus('Starting audit…');
      await start({ media: { kind: 'image', frames: [{ url: imageUrl.trim(), sharpness: 0 }] }, claim: claimBody }, [imageUrl.trim()]);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    await submit().catch(fail);
  }

  async function runDemo(demo: DemoCase) {
    setError(undefined);
    setStatus(`Opening “${demo.title}”…`);
    await start(demo.input).catch(fail);
  }

  const tabs: { id: Source; label: string; icon: typeof Upload; off?: boolean }[] = [
    ...(replay ? [{ id: 'demo' as const, label: 'Demo cases', icon: Sparkles }] : []),
    { id: 'upload', label: 'Upload', icon: Upload, off: replay },
    { id: 'url', label: 'Image URL', icon: Link2, off: replay },
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
                    layoutId="tab-pill"
                    className="absolute inset-0 rounded-xl bg-bg shadow-sm ring-1 ring-black/5"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  />
                )}
                <t.icon className="relative size-4" />
                <span className="relative">{t.label}</span>
                {t.off && (
                  <span className="relative rounded-full border border-line px-1.5 py-0.5 text-[10px] text-faint">off</span>
                )}
              </button>
            ))}
          </div>

          <div className="p-3 sm:p-5">
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
                      Each example runs the full check on saved search results, so you can watch how a verdict is reached.
                      The cases are made up for demonstration and are not real news events.
                    </p>
                    <motion.ul
                      initial="hidden"
                      animate="show"
                      variants={{ show: { transition: { staggerChildren: 0.04 } } }}
                      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
                    >
                      {demos.map((d) => {
                        const theme = demoTheme(d.title);
                        return (
                          <motion.li key={d.id} variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }}>
                            <SpotlightCard
                              role="button"
                              tabIndex={0}
                              aria-disabled={busy}
                              onClick={() => !busy && runDemo(d)}
                              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !busy && runDemo(d)}
                              whileHover={{ y: -4 }}
                              whileTap={{ scale: 0.98 }}
                              className="flex h-full cursor-pointer flex-col outline-none focus-visible:border-accent"
                            >
                              <div
                                className="relative flex h-16 items-center justify-center overflow-hidden border-b border-line"
                                style={{ background: 'var(--surface-2)' }}
                              >
                                <div className="grid-bg absolute inset-0 opacity-30" />
                                <theme.icon
                                  className="relative size-7 transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-6"
                                  style={{ color: 'var(--ink)' }}
                                  strokeWidth={1.5}
                                />
                                <span className="absolute top-2.5 left-2.5 flex items-center gap-1 rounded-full border border-line bg-bg/80 px-2 py-0.5 text-[10px] text-ink">
                                  {d.kind === 'video' ? <Film className="size-3" /> : <ImageIcon className="size-3" />}
                                  {d.kind}
                                </span>
                                <ArrowUpRight className="absolute top-2.5 right-2.5 size-4 text-faint transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-ink" />
                              </div>
                              <div className="flex flex-1 flex-col gap-3 p-4">
                                <span className="text-sm leading-snug font-medium text-ink">{d.title}</span>
                                <span className="mt-auto text-xs text-faint transition-colors group-hover:text-ink">Run this example</span>
                              </div>
                            </SpotlightCard>
                          </motion.li>
                        );
                      })}
                    </motion.ul>
                  </div>
                ) : (
                  <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
                    {/* Said once, up front, before anything is filled in. */}
                    {replay && (
                      <div className="rounded-2xl border border-line bg-surface-2 p-4 text-sm lg:col-span-2">
                        <p className="font-medium text-ink">This public demo runs on recorded searches, so it spends no SerpApi credits.</p>
                        <p className="mt-1 text-muted">
                          Checking your own photo needs a live SerpApi key. Run the project locally with{' '}
                          <code className="rounded bg-bg px-1 py-0.5 font-mono text-xs">FIXTURE_MODE=live</code> to do that. To see
                          the full pipeline right now, open{' '}
                          <button type="button" onClick={() => setSource('demo')} className="font-medium text-accent underline underline-offset-2">
                            Demo cases
                          </button>
                          .
                        </p>
                      </div>
                    )}
                    <div className="space-y-3">
                      {source === 'upload' ? (
                        <>
                          <label
                            htmlFor="media"
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
                            className={`relative flex min-h-64 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed p-6 text-center transition-all duration-300 ${
                              dragging ? 'scale-[1.01] border-accent bg-accent/5' : 'border-line-strong bg-bg hover:border-accent/50'
                            }`}
                          >
                            <input
                              id="media"
                              type="file"
                              className="sr-only"
                              accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
                              disabled={busy}
                              onChange={(e) => onFile(e.target.files?.[0])}
                            />
                            {prepared ? (
                              <div className="w-full space-y-3">
                                <div className="flex justify-center gap-2">
                                  {prepared.frames.map((f, i) => (
                                    <motion.div
                                      key={f.previewUrl}
                                      initial={{ opacity: 0, scale: 0.9 }}
                                      animate={{ opacity: 1, scale: 1 }}
                                      transition={{ delay: i * 0.08 }}
                                      className="relative overflow-hidden rounded-xl border border-line"
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={f.previewUrl} alt={`Prepared frame ${i + 1}`} className="h-36 w-auto max-w-44 object-cover" />
                                      <div className="scan-band animate-scan" />
                                    </motion.div>
                                  ))}
                                </div>
                                <div className="space-y-1 font-mono text-[11px] text-muted">
                                  {prepared.frames.map((f, i) => (
                                    <p key={i}>
                                      pHash <ScrambleText text={f.pHash} className="text-accent" />
                                    </p>
                                  ))}
                                </div>
                                <p className="text-xs text-faint">Click or drop to replace</p>
                              </div>
                            ) : (
                              <>
                                <motion.span
                                  animate={dragging ? { y: -4, scale: 1.08 } : { y: 0, scale: 1 }}
                                  className="flex size-12 items-center justify-center rounded-2xl border border-line bg-surface-2 text-accent"
                                >
                                  {busy ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}
                                </motion.span>
                                <p className="mt-4 text-sm font-medium">Drop an image or short video</p>
                                <p className="mt-1 text-xs text-faint">JPEG, PNG, WebP up to 10 MB · MP4 up to 50 MB</p>
                                <p className="mt-3 text-xs text-muted">Only resized frames leave your browser.</p>
                              </>
                            )}
                          </label>
                          {prepared?.exif && (
                            <label className="flex items-start gap-3 rounded-xl border border-line bg-surface p-3 text-xs text-muted">
                              <input type="checkbox" checked={useExif} onChange={(e) => setUseExif(e.target.checked)} className="mt-0.5 accent-[var(--accent)]" />
                              <span>
                                This photo contains
                                {prepared.exif.gps ? ` GPS ${prepared.exif.gps.map((n) => n.toFixed(4)).join(', ')}` : ''}
                                {prepared.exif.takenAt ? ` a capture date of ${prepared.exif.takenAt.slice(0, 10)}` : ''}. Use
                                the photo location as evidence? It is only sent if you tick this.
                              </span>
                            </label>
                          )}
                        </>
                      ) : (
                        <>
                          <label className="block text-sm font-medium" htmlFor="imageUrl">
                            Public image URL
                          </label>
                          <input
                            id="imageUrl"
                            type="url"
                            required
                            placeholder="https://…/photo.jpg"
                            value={imageUrl}
                            onChange={(e) => setImageUrl(e.target.value)}
                            className={field}
                          />
                        </>
                      )}
                    </div>

                    <div className="flex flex-col gap-4">
                      <div>
                        <label className="mb-1.5 block text-sm font-medium" htmlFor="claim">
                          What does the post claim?
                        </label>
                        <textarea
                          id="claim"
                          required
                          minLength={5}
                          maxLength={500}
                          rows={4}
                          placeholder="Drone strike on port facilities in Dubai tonight"
                          value={claim}
                          onChange={(e) => setClaim(e.target.value)}
                          className={`${field} resize-none font-serif text-lg`}
                        />
                      </div>
                      <MoreDetails hint="place and date, if the post gives them">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="mb-1.5 block text-xs text-muted" htmlFor="place">
                              Claimed place
                            </label>
                            <input id="place" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Dubai, UAE" className={field} />
                            <p className="mt-1.5 text-xs text-faint">Lets the check compare the scene with the place claimed.</p>
                          </div>
                          <div>
                            <label className="mb-1.5 block text-xs text-muted" htmlFor="date">
                              Claimed date
                            </label>
                            <input id="date" type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
                            <p className="mt-1.5 text-xs text-faint">Left blank, nothing is assumed about when it is from.</p>
                          </div>
                        </div>
                      </MoreDetails>
                      <ShimmerButton type="submit" disabled={busy || replay || (source === 'upload' && !prepared)} className="mt-auto flex items-center justify-center gap-2">
                        {busy && <Loader2 className="size-4 animate-spin" />}
                        Check where it came from
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
