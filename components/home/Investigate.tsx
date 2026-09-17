'use client';

import { ArrowUpRight, Film, Image as ImageIcon, Link2, Loader2, Sparkles, Upload } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { EASE_OUT, Reveal, ScrambleText, ShimmerButton, SpotlightCard } from '@/components/ui/motion';
import { saveAuditIntro } from '@/lib/client/auditIntro';
import { MediaError, prepareImage, prepareVideo, type PreparedUpload } from '@/lib/client/prepareMedia';
import type { AuditInput, FixtureMode } from '@/lib/shared/types';

export interface DemoCase {
  id: string;
  title: string;
  kind: 'image' | 'video';
  input: AuditInput;
}

type Source = 'demo' | 'upload' | 'url';

const REPLAY_FRAME_URL = (i: number) => `https://replay.dejavue.invalid/upload/frame-${i}.jpg`;

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message ?? `Request failed (${res.status})`);
  return data;
}

const field =
  'w-full rounded-xl border border-line bg-black/30 px-3.5 py-2.5 text-sm text-ink placeholder:text-faint transition-colors outline-none focus:border-accent/60 focus:ring-4 focus:ring-accent/10';

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
    try {
      if (file.type.startsWith('video/')) {
        setStatus('Picking keyframes…');
        setPrepared(await prepareVideo(file, (f) => setStatus(`Picking keyframes… ${Math.round(f * 100)}%`)));
      } else {
        setStatus('Fingerprinting image…');
        setPrepared(await prepareImage(file));
      }
    } catch (err) {
      setError(err instanceof MediaError ? err.message : "Couldn't read this file.");
    } finally {
      setStatus(undefined);
    }
  }

  async function start(input: AuditInput | Record<string, unknown>, previews: string[] = []) {
    const { auditId } = await postJson('/api/investigate', input);
    const body = input as AuditInput;
    saveAuditIntro(auditId, { claim: body.claim.text, place: body.claim.place, kind: body.media?.kind ?? 'image', previews });
    router.push(`/audit/${auditId}`);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    const claimBody = {
      text: claim.trim(),
      ...(place.trim() ? { place: place.trim() } : {}),
      ...(date ? { date: new Date(date).toISOString() } : {}),
    };
    try {
      if (source === 'upload') {
        if (!prepared) throw new Error('Choose an image or video first.');
        const frames = [];
        for (const [i, f] of prepared.frames.entries()) {
          let url = REPLAY_FRAME_URL(i);
          if (!replay) {
            setStatus(`Uploading frame ${i + 1} of ${prepared.frames.length}…`);
            const form = new FormData();
            form.append('frame', f.blob, `frame-${i}.jpg`);
            const res = await fetch('/api/upload', { method: 'POST', body: form });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.error?.message ?? 'Upload failed.');
            url = data.url;
          }
          frames.push({ url, pHash: f.pHash, sharpness: f.sharpness, tMs: f.tMs });
        }
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
    } catch (err) {
      setError((err as Error).message);
      setStatus(undefined);
    }
  }

  async function runDemo(demo: DemoCase) {
    setError(undefined);
    setStatus(`Opening “${demo.title}”…`);
    try {
      await start(demo.input);
    } catch (err) {
      setError((err as Error).message);
      setStatus(undefined);
    }
  }

  const tabs: { id: Source; label: string; icon: typeof Upload }[] = [
    ...(replay ? [{ id: 'demo' as const, label: 'Demo cases', icon: Sparkles }] : []),
    { id: 'upload', label: 'Upload', icon: Upload },
    { id: 'url', label: 'Image URL', icon: Link2 },
  ];

  return (
    <section id="check" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-24 sm:px-6">
      <Reveal>
        <p className="font-mono text-xs tracking-[0.2em] text-accent uppercase">Check media</p>
        <h2 className="mt-3 font-serif text-4xl leading-tight sm:text-5xl">Where did it come from?</h2>
      </Reveal>

      <Reveal delay={0.1} className="mt-10">
        <div className="rounded-3xl border border-line bg-surface p-2 backdrop-blur">
          <div role="tablist" className="flex gap-1 rounded-2xl bg-black/30 p-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                type="button"
                aria-selected={source === t.id}
                onClick={() => setSource(t.id)}
                className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-[13px] whitespace-nowrap transition-colors sm:flex-none sm:gap-2 sm:px-5 sm:text-sm ${
                  source === t.id ? 'text-ink' : 'text-muted hover:text-ink'
                }`}
              >
                {source === t.id && (
                  <motion.span
                    layoutId="tab-pill"
                    className="absolute inset-0 rounded-xl border border-line-strong bg-surface-2"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  />
                )}
                <t.icon className="relative size-4" />
                <span className="relative">{t.label}</span>
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
                      Replay mode runs the full pipeline on recorded search results, so it costs no credits. These cases
                      are synthetic: invented scenarios in SerpApi&apos;s response format, not real publication histories.
                    </p>
                    <motion.ul
                      initial="hidden"
                      animate="show"
                      variants={{ show: { transition: { staggerChildren: 0.04 } } }}
                      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
                    >
                      {demos.map((d) => (
                        <motion.li key={d.id} variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }}>
                          <SpotlightCard
                            role="button"
                            tabIndex={0}
                            aria-disabled={busy}
                            onClick={() => !busy && runDemo(d)}
                            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !busy && runDemo(d)}
                            whileHover={{ y: -3 }}
                            whileTap={{ scale: 0.98 }}
                            className="flex h-full cursor-pointer flex-col gap-4 p-4 outline-none focus-visible:border-accent"
                          >
                            <div className="flex items-center justify-between">
                              <span className="flex size-8 items-center justify-center rounded-lg border border-line bg-black/30 text-muted group-hover:text-accent">
                                {d.kind === 'video' ? <Film className="size-4" /> : <ImageIcon className="size-4" />}
                              </span>
                              <ArrowUpRight className="size-4 text-faint transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-accent" />
                            </div>
                            <span className="text-sm leading-snug font-medium text-ink">{d.title}</span>
                            <span className="mt-auto font-mono text-[11px] text-faint">{d.id}</span>
                          </SpotlightCard>
                        </motion.li>
                      ))}
                    </motion.ul>
                  </div>
                ) : (
                  <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
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
                              dragging ? 'scale-[1.01] border-accent bg-accent/5' : 'border-line-strong bg-black/20 hover:border-accent/50'
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
                                      <div className="absolute inset-x-0 h-8 animate-scan bg-gradient-to-b from-transparent via-accent/30 to-transparent" />
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
                            <label className="flex items-start gap-3 rounded-xl border border-line bg-black/20 p-3 text-xs text-muted">
                              <input type="checkbox" checked={useExif} onChange={(e) => setUseExif(e.target.checked)} className="mt-0.5 accent-[var(--accent)]" />
                              <span>
                                This photo contains
                                {prepared.exif.gps ? ` GPS ${prepared.exif.gps.map((n) => n.toFixed(4)).join(', ')}` : ''}
                                {prepared.exif.takenAt ? ` a capture date of ${prepared.exif.takenAt.slice(0, 10)}` : ''}. Use
                                the photo location as evidence? It is only sent if you tick this.
                              </span>
                            </label>
                          )}
                          {replay && (
                            <p className="text-xs text-warn">Replay mode only recognises the demo case images. Set FIXTURE_MODE=live to search any image.</p>
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
                          {replay && <p className="text-xs text-warn">Image URLs need FIXTURE_MODE=live.</p>}
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
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="mb-1.5 block text-xs text-muted" htmlFor="place">
                            Claimed place <span className="text-faint">(optional)</span>
                          </label>
                          <input id="place" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Dubai, UAE" className={field} />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs text-muted" htmlFor="date">
                            Claimed date <span className="text-faint">(defaults to now)</span>
                          </label>
                          <input id="date" type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} className={`${field} [color-scheme:dark]`} />
                        </div>
                      </div>
                      <ShimmerButton type="submit" disabled={busy || (source === 'upload' && !prepared)} className="mt-auto flex items-center justify-center gap-2">
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
