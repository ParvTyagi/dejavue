'use client';

import { MotionConfig } from 'motion/react';

/** Honours the visitor's reduced-motion setting for every animation. */
export function Providers({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
