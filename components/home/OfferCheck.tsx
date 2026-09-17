'use client';

import { ArrowUpRight, Image as ImageIcon, Loader2, MessageSquareText, Sparkles, Upload, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { EASE_OUT, Reveal, ShimmerButton, SpotlightCard } from '@/components/ui/motion';
import { FIELD_CLASS as field, postJson, uploadImage } from '@/lib/client/api';
import { saveAuditIntro } from '@/lib/client/auditIntro';
import type { PreparedScreenshot } from '@/lib/client/prepareMedia';
import type { OfferInput } from '@/lib/offer/types';
import { OFFER_LIMITS } from '@/lib/shared/limits';
import type { FixtureMode } from '@/lib/shared/types';

export interface OfferDemo {
  id: string;
  title: string;
  input: OfferInput;
}

type Source = 'demo' | 'message';

/** Loaded on first use: most visitors paste text. */
const loadMediaPrep = () => import('@/lib/client/prepareMedia');

const MIN_TEXT = 10;

export function OfferCheck({ mode, demos }: { mode: FixtureMode; demos: OfferDemo[] }) {
  const router = useRouter();
  const replay = mode === 'replay';
  const [source, setSource] = useState<Source>(replay ? 'demo' : 'message');
  const [text, setText] = useState('');
  const [org, setOrg] = useState('');
  const [screenshot, setScreenshot] = useState<PreparedScreenshot>();
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<string>();
  const [error, setError] = useState<string>();
  const busy = !!status;
  const hasText = text.trim().length >= MIN_TEXT;

  async function onFile(file: File | undefined) {
    setError(undefined);
    if (!file) return;
    setStatus('Preparing screenshot…');
    const { MediaError, prepareScreenshot } = await loadMediaPrep();
    await prepareScreenshot(file)
      .then(setScreenshot, (err) => setError(err instanceof MediaError ? err.message : "Couldn't read this file."))
      .finally(() => setStatus(undefined));
  }

  async function start(input: Omit<OfferInput, 'maxCredits'>, preview?: string) {
    setStatus('Starting check…');
    const { auditId } = await postJson('/api/offer', input);
    const claim = input.text?.trim() || 'Screenshot of a message';
    saveAuditIntro(auditId, { claim: claim.slice(0, 200), kind: 'offer', previews: preview ? [preview] : [] });
    router.push(`/audit/${auditId}`);
  }

  function fail(err: unknown) {
    setError((err as Error).message);
    setStatus(undefined);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    if (!hasText && !screenshot) {
      setError('Paste the message or add a screenshot.');
      return;
    }
    try {
      let screenshotUrl: string | undefined;
      if (screenshot) {
        setStatus('Uploading screenshot…');
        screenshotUrl = await uploadImage(screenshot.blob, 'screenshot.jpg');
      }
      await start(
        {
          ...(hasText ? { text: text.trim() } : {}),
          ...(screenshotUrl ? { screenshotUrl } : {}),
          ...(org.trim() ? { claimedOrg: org.trim() } : {}),
        },
        screenshot?.previewUrl,
      );
    } catch (err) {
      fail(err);
    }
  }

  async function runDemo(demo: OfferDemo) {
    setError(undefined);
    const { maxCredits: _cap, ...input } = demo.input;
    await start(input).catch(fail);
  }

  const tabs: { id: Source; label: string; icon: typeof Upload }[] = [
    ...(replay ? [{ id: 'demo' as const, label: 'Demo messages', icon: Sparkles }] : []),
    { id: 'message', label: 'Your message', icon: MessageSquareText },
  ];

  return (
    <section className="mx-auto max-w-6xl px-4 pt-8 pb-24 sm:px-6">
      <Reveal>
        <p className="font-mono text-xs tracking-[0.2em] text-accent uppercase">Check a message</p>
        <h1 className="mt-3 font-serif text-4xl leading-tight sm:text-5xl">
          Is this offer <span className="text-shine italic">for real?</span>
        </h1>
        <p className="mt-4 max-w-2xl text-sm text-muted sm:text-base">
          Job offers, government scheme messages and customer-care numbers. DejaVue finds the official website, looks
          for scam reports and checks for warning signs like asking you to pay.
        </p>
      </Reveal>

      <Reveal delay={0.1} className="mt-10">
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
                  source === t.id ? 'text-ink' : 'text-muted hover:text-ink'
                }`}
              >
                {source === t.id && (
                  <motion.span
                    layoutId="offer-tab-pill"
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
                      Each example runs the full check on saved search results. The messages, numbers and websites are
                      made up for demonstration.
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
                                {d.input.screenshotUrl ? <ImageIcon className="size-3" /> : <MessageSquareText className="size-3" />}
                                {d.input.screenshotUrl ? 'screenshot' : 'message'}
                              </span>
                              <ArrowUpRight className="size-4 text-faint transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-ink" />
                            </div>
                            <span className="text-sm leading-snug font-medium text-ink">{d.title}</span>
                            {d.input.text && <span className="line-clamp-2 text-xs text-muted">{d.input.text}</span>}
                            <span className="mt-auto font-mono text-[11px] text-faint">{d.id}</span>
                          </SpotlightCard>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
                    <div className="flex flex-col gap-4">
                      <div>
                        <div className="mb-1.5 flex items-baseline justify-between">
                          <label className="block text-sm font-medium" htmlFor="message">
                            The message
                          </label>
                          <span className="font-mono text-[11px] text-faint">
                            {text.length}/{OFFER_LIMITS.textChars}
                          </span>
                        </div>
                        <textarea
                          id="message"
                          maxLength={OFFER_LIMITS.textChars}
                          rows={8}
                          placeholder="Paste it here, e.g. “Amazon is hiring for work from home. Pay ₹999 registration fee to confirm your seat…”"
                          value={text}
                          onChange={(e) => setText(e.target.value)}
                          className={`${field} resize-y`}
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs text-muted" htmlFor="org">
                          Who does it claim to be from? <span className="text-faint">(optional)</span>
                        </label>
                        <input
                          id="org"
                          maxLength={OFFER_LIMITS.orgChars}
                          value={org}
                          onChange={(e) => setOrg(e.target.value)}
                          placeholder="Amazon, SBI, PM-Kisan…"
                          className={field}
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-4">
                      <label
                        htmlFor="screenshot"
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
                          id="screenshot"
                          type="file"
                          className="sr-only"
                          accept="image/jpeg,image/png,image/webp"
                          disabled={busy}
                          onChange={(e) => {
                            onFile(e.target.files?.[0]);
                            e.target.value = '';
                          }}
                        />
                        {screenshot ? (
                          <div className="space-y-2">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={screenshot.previewUrl} alt="Screenshot to check" className="mx-auto max-h-48 w-auto rounded-xl border border-line" />
                            <p className="text-xs text-faint">Click or drop to replace</p>
                          </div>
                        ) : (
                          <>
                            <span className="flex size-11 items-center justify-center rounded-2xl border border-line bg-surface-2 text-accent">
                              {busy ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}
                            </span>
                            <p className="mt-3 text-sm font-medium">Or drop a screenshot</p>
                            <p className="mt-1 text-xs text-faint">WhatsApp, SMS, Telegram or email · JPEG, PNG, WebP</p>
                            <p className="mt-3 text-xs text-muted">It is read once and deleted.</p>
                          </>
                        )}
                      </label>
                      {screenshot && (
                        <button
                          type="button"
                          onClick={() => setScreenshot(undefined)}
                          className="flex items-center justify-center gap-1.5 self-start text-xs text-muted hover:text-ink"
                        >
                          <X className="size-3.5" />
                          Remove screenshot
                        </button>
                      )}
                      {replay && (
                        <p className="text-xs text-warn">This demo site only checks the example messages. Checking your own isn&apos;t switched on here.</p>
                      )}
                      <ShimmerButton
                        type="submit"
                        disabled={busy || replay || (!hasText && !screenshot)}
                        className="mt-auto flex items-center justify-center gap-2"
                      >
                        {busy && <Loader2 className="size-4 animate-spin" />}
                        Check this message
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
