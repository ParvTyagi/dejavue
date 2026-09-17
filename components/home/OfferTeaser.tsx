import { ArrowRight, Briefcase, Landmark, PhoneCall } from 'lucide-react';
import Link from 'next/link';

const KINDS = [
  {
    icon: Briefcase,
    title: 'Job offers',
    body: 'Work-from-home jobs that ask for a registration fee, recruiters on Gmail, interviews only on WhatsApp.',
  },
  {
    icon: Landmark,
    title: 'Government schemes',
    body: '"Claim ₹6,000 today" messages that link to a look-alike of the real government website.',
  },
  {
    icon: PhoneCall,
    title: 'Customer-care numbers',
    body: '"Your KYC is pending" texts with a helpline number that people online have already reported.',
  },
];

/** Points visitors with a suspicious message, not a photo, to the offer check. */
export function OfferTeaser() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6 sm:pb-28">
      <div className="rounded-3xl border border-line bg-surface p-6 sm:p-10">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-xs tracking-[0.2em] text-accent uppercase">Not a photo?</p>
            <h2 className="mt-3 max-w-xl font-serif text-4xl leading-tight sm:text-5xl">
              Check the message <span className="text-muted italic">before you pay.</span>
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted sm:text-base">
              Paste a message or drop a screenshot. DejaVue finds the official website, searches the phone numbers and
              links for scam reports, and flags requests for money. Fixed rules decide, not AI.
            </p>
          </div>
          <Link
            href="/check?type=offer"
            className="flex shrink-0 items-center justify-center gap-2 self-start rounded-xl bg-ink px-5 py-3 text-sm font-medium text-bg transition-opacity hover:opacity-90 md:self-auto"
          >
            Check a message <ArrowRight className="size-4" />
          </Link>
        </div>
        <ul className="mt-8 grid gap-3 md:grid-cols-3">
          {KINDS.map((k) => (
            <li key={k.title} className="rounded-2xl border border-line bg-bg p-4">
              <k.icon className="size-5 text-ink" strokeWidth={1.75} />
              <p className="mt-3 text-sm font-medium text-ink">{k.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">{k.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
