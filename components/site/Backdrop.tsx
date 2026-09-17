'use client';

import { motion, useMotionTemplate, useMotionValue, useSpring } from 'motion/react';
import { useEffect } from 'react';

/** Hero background: masked grid, slowly drifting colour fields and a soft cursor spotlight. */
export function Backdrop() {
  const x = useSpring(useMotionValue(50), { stiffness: 60, damping: 20 });
  const y = useSpring(useMotionValue(30), { stiffness: 60, damping: 20 });
  const spotlight = useMotionTemplate`radial-gradient(600px circle at ${x}% ${y}%, rgb(212 247 92 / 0.07), transparent 60%)`;

  useEffect(() => {
    const move = (e: PointerEvent) => {
      x.set((e.clientX / window.innerWidth) * 100);
      y.set((e.clientY / window.innerHeight) * 100);
    };
    window.addEventListener('pointermove', move);
    return () => window.removeEventListener('pointermove', move);
  }, [x, y]);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="grid-bg absolute inset-0" />
      <div className="absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 animate-drift rounded-full bg-[radial-gradient(closest-side,rgb(212_247_92/0.16),transparent)] blur-3xl" />
      <div
        className="absolute top-20 -left-40 h-[420px] w-[520px] animate-drift rounded-full bg-[radial-gradient(closest-side,rgb(108_180_255/0.12),transparent)] blur-3xl"
        style={{ animationDelay: '-8s' }}
      />
      <div
        className="absolute top-40 -right-40 h-[380px] w-[520px] animate-drift rounded-full bg-[radial-gradient(closest-side,rgb(255_107_79/0.10),transparent)] blur-3xl"
        style={{ animationDelay: '-14s' }}
      />
      <motion.div className="absolute inset-0" style={{ background: spotlight }} />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-bg" />
    </div>
  );
}
