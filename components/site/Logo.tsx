/** Two offset rings: the same image, seen twice. */
export function LogoMark({ className = 'size-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden>
      <circle cx="12.5" cy="16" r="8.5" stroke="currentColor" strokeWidth="2" opacity="0.45" />
      <circle cx="19.5" cy="16" r="8.5" stroke="var(--accent)" strokeWidth="2" />
      <circle cx="19.5" cy="16" r="2.4" fill="var(--accent)" />
    </svg>
  );
}
