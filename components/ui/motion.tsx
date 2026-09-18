'use client';

import { animate, motion, useInView, useReducedMotion, type HTMLMotionProps } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** Fades and lifts children into view once, when scrolled to. */
export function Reveal({ delay = 0, y = 16, className, children }: { delay?: number; y?: number; className?: string; children: React.ReactNode }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.7, delay, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}

/** Counts up to a number when it first becomes visible, and animates later changes. */
const formatInteger = (n: number) => Math.round(n).toLocaleString();

export function NumberTicker({ value, className, format = formatInteger }: { value: number; className?: string; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  // Starts at the real number: if the count-up never runs — off screen, no JS — the
  // figure on the page is still the true one rather than a placeholder zero.
  const [shown, setShown] = useState(value);
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

/** Card whose border darkens on hover. Pure CSS, so moving the pointer costs nothing. */
export function SpotlightCard({ className = '', children, ...props }: HTMLMotionProps<'div'> & { children: React.ReactNode }) {
  return (
    <motion.div
      {...props}
      className={`group relative isolate overflow-hidden rounded-2xl border border-line bg-surface transition-colors duration-300 hover:border-line-strong ${className}`}
    >
      {children}
    </motion.div>
  );
}

/**
 * Calls `tick` every `ms` while the element is on screen and the tab is visible,
 * so decorative loops stop re-rendering when nobody can see them.
 */
export function useVisibleInterval(ref: React.RefObject<Element | null>, tick: () => void, ms: number) {
  const inView = useInView(ref);
  const reduce = useReducedMotion();
  const saved = useRef(tick);
  useEffect(() => {
    saved.current = tick;
  });

  useEffect(() => {
    if (!inView || reduce) return;
    const id = setInterval(() => {
      if (!document.hidden) saved.current();
    }, ms);
    return () => clearInterval(id);
  }, [inView, reduce, ms]);
}

/** Primary button with a light sweep and a springy press. */
export function ShimmerButton({ className = '', children, ...props }: HTMLMotionProps<'button'> & { children: React.ReactNode }) {
  return (
    <motion.button
      whileHover={{ scale: 1.015 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 22 }}
      {...props}
      className={`relative isolate overflow-hidden rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-accent-ink hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none ${className}`}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 -z-10 w-1/3 animate-shimmer bg-gradient-to-r from-transparent via-white/15 to-transparent" />
      {children}
    </motion.button>
  );
}
