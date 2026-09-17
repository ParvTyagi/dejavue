'use client';

import { animate, motion, useInView, useMotionTemplate, useMotionValue, useReducedMotion, type HTMLMotionProps } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** Fades and lifts children into view once, when scrolled to. */
export function Reveal({ delay = 0, y = 16, className, children }: { delay?: number; y?: number; className?: string; children: React.ReactNode }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y, filter: 'blur(6px)' }}
      whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.7, delay, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}

/** Headline that blurs in word by word. */
export function WordReveal({ text, className, delay = 0 }: { text: string; className?: string; delay?: number }) {
  return (
    <span className={className}>
      {text.split(' ').map((word, i) => (
        <motion.span
          key={i}
          className="inline-block whitespace-pre"
          initial={{ opacity: 0, y: '0.35em', filter: 'blur(10px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.8, delay: delay + i * 0.07, ease: EASE_OUT }}
        >
          {word + ' '}
        </motion.span>
      ))}
    </span>
  );
}

/** Counts up to a number when it first becomes visible, and animates later changes. */
export function NumberTicker({ value, className, format = (n) => Math.round(n).toLocaleString() }: { value: number; className?: string; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  const from = useRef(0);

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      setShown(value);
      return;
    }
    const controls = animate(from.current, value, {
      duration: 1.1,
      ease: EASE_OUT,
      onUpdate: (v) => setShown(v),
    });
    from.current = value;
    return () => controls.stop();
  }, [value, inView, reduce]);

  return (
    <span ref={ref} className={`tabular-nums ${className ?? ''}`}>
      {format(shown)}
    </span>
  );
}

const GLYPHS = '0123456789abcdef';

/** Text that resolves from random hex glyphs, like a hash being computed. */
export function ScrambleText({ text, className, duration = 900 }: { text: string; className?: string; duration?: number }) {
  const reduce = useReducedMotion();
  const [out, setOut] = useState(text);

  useEffect(() => {
    if (reduce) {
      setOut(text);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const progress = Math.min(1, (t - start) / duration);
      const settled = Math.floor(progress * text.length);
      setOut(
        text
          .split('')
          .map((ch, i) => (i < settled || ch === ' ' ? ch : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]))
          .join(''),
      );
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, duration, reduce]);

  return <span className={className}>{out}</span>;
}

/** Card whose border and surface light up under the cursor. */
export function SpotlightCard({ className = '', children, ...props }: HTMLMotionProps<'div'> & { children: React.ReactNode }) {
  const x = useMotionValue(-400);
  const y = useMotionValue(-400);
  const glow = useMotionTemplate`radial-gradient(320px circle at ${x}px ${y}px, rgb(212 247 92 / 0.10), transparent 70%)`;
  const ring = useMotionTemplate`radial-gradient(220px circle at ${x}px ${y}px, rgb(212 247 92 / 0.55), transparent 70%)`;

  return (
    <motion.div
      {...props}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        x.set(e.clientX - r.left);
        y.set(e.clientY - r.top);
      }}
      onPointerLeave={() => {
        x.set(-400);
        y.set(-400);
      }}
      className={`group relative isolate overflow-hidden rounded-2xl border border-line bg-surface ${className}`}
    >
      <motion.div aria-hidden className="pointer-events-none absolute inset-0 -z-10" style={{ background: glow }} />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 rounded-[inherit] p-px opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: ring,
          WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
          WebkitMaskComposite: 'xor',
          maskComposite: 'exclude',
        }}
      />
      {children}
    </motion.div>
  );
}

/** Primary button with a light sweep and a springy press. */
export function ShimmerButton({ className = '', children, ...props }: HTMLMotionProps<'button'> & { children: React.ReactNode }) {
  return (
    <motion.button
      whileHover={{ scale: 1.015 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 22 }}
      {...props}
      className={`relative isolate overflow-hidden rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-accent-ink shadow-[0_0_0_1px_rgb(212_247_92/0.4),0_10px_40px_-10px_rgb(212_247_92/0.55)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none ${className}`}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 -z-10 w-1/3 animate-shimmer bg-gradient-to-r from-transparent via-white/60 to-transparent" />
      {children}
    </motion.button>
  );
}
