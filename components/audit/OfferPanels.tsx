'use client';

import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  Globe,
  Image as ImageIcon,
  Mail,
  MessageCircle,
  MessageSquareText,
  Phone,
  SearchX,
  ShieldAlert,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { motion } from 'motion/react';
import { EASE_OUT } from '@/components/ui/motion';
import type { AuditIntro } from '@/lib/client/auditIntro';
import { FLAG_STRENGTH_LABEL, OFFER_TYPE_LABEL, TONE_VAR } from '@/lib/client/labels';
import { FLAG_LABEL } from '@/lib/offer/score';
import type { Contact, ContactType, OfferDossier } from '@/lib/offer/types';
import { Panel } from './Panel';

const EvidenceChips = ({ ids }: { ids: string[] }) =>
  ids.map((id) => (
    <a
      key={id}
      href={`#ev-${id}`}
      className="ml-1 rounded-md border border-line px-1.5 py-0.5 font-mono text-[10px] text-muted transition-colors hover:border-accent hover:text-accent"
    >
      {id}
    </a>
  ));

/** The message under investigation, with the screenshot preview when it was uploaded from this tab. */
export function MessageBanner({ intro, dossier }: { intro?: AuditIntro; dossier?: OfferDossier }) {
  const text = dossier?.reading.excerpt ?? intro?.claim;
  const preview = intro?.previews[0];
  const s = dossier?.signals;
  const who = s?.org ?? s?.schemeName;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: EASE_OUT }}
      className="mt-8 flex flex-col gap-5 sm:flex-row sm:items-start"
    >
      {preview && (
        <div className="relative w-28 shrink-0 overflow-hidden rounded-xl border border-line-strong shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="" className="max-h-40 w-full object-cover object-top" />
          {!dossier && <div className="scan-band animate-scan" />}
        </div>
      )}
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-xs tracking-wide text-faint uppercase">
          {preview ? <ImageIcon className="size-3.5" /> : <MessageSquareText className="size-3.5" />} Message under investigation
        </p>
        {text ? (
          <blockquote className="mt-2 line-clamp-6 max-w-3xl border-l-2 border-line-strong pl-4 text-base leading-relaxed whitespace-pre-line text-ink sm:text-lg">
            {text}
          </blockquote>
        ) : (
          <div className="mt-3 h-20 w-3/4 animate-pulse rounded-lg bg-surface-2" />
        )}
        {s && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
            <span className="rounded-full border border-line px-2.5 py-1">{OFFER_TYPE_LABEL[s.type]}</span>
            {who && (
              <span className="flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1">
                <Building2 className="size-3" /> Claims to be {who}
              </span>
            )}
            {s.role && <span className="rounded-full border border-line px-2.5 py-1">{s.role}</span>}
          </div>
        )}
      </div>
    </motion.div>
  );
}

/** Where to go instead of the message's links. */
export function OfficialSourceCard({ dossier }: { dossier: OfferDossier }) {
  const { officialDomain, officialDomains = [], org, schemeName } = dossier.signals;
  const who = org ?? schemeName;
  const alsoOfficial = officialDomains.filter((d) => d !== officialDomain);

  if (!officialDomain) {
    return (
      <Panel title="Official website" subtitle="Where to check this yourself">
        <div className="flex gap-3 text-sm">
          <SearchX className="mt-0.5 size-5 shrink-0 text-faint" />
          <p className="text-muted">
            {who ? `No official website for ${who} could be confirmed.` : 'The message does not say clearly who it is from.'} Look the
            organisation up yourself in a search engine, and never use a link or number from the message to check it.
          </p>
        </div>
      </Panel>
    );
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: EASE_OUT }}
      className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4 sm:flex-row sm:items-center sm:p-5"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-2 text-ink">
        <Globe className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-faint">Official website{who ? ` of ${who}` : ''}</p>
        <p className="mt-0.5 truncate font-mono text-lg text-ink">{officialDomain}</p>
        {alsoOfficial.length > 0 && <p className="mt-0.5 truncate text-xs text-faint">Also theirs: {alsoOfficial.join(', ')}</p>}
        <p className="mt-1 text-xs text-muted">Go there directly, not through any link in the message.</p>
      </div>
      <a
        href={`https://${officialDomain}`}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="flex items-center justify-center gap-1.5 rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-bg transition-opacity hover:opacity-90"
      >
        Go here instead <ArrowUpRight className="size-4" />
      </a>
    </motion.section>
  );
}

/** Every warning sign, strongest first, with the quote or search result behind it. */
export function RedFlagList({ dossier }: { dossier: OfferDossier }) {
  const order = { strong: 0, medium: 1, weak: 2 };
  const flags = [...dossier.flags].sort((a, b) => order[a.strength] - order[b.strength]);

  return (
    <Panel title="Warning signs" subtitle="Checked by fixed rules, not by AI">
      {flags.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <ShieldCheck className="size-4 text-faint" /> None found in the message or the search results.
        </p>
      ) : (
        <ul className="space-y-3">
          {flags.map((f, i) => {
            const strength = FLAG_STRENGTH_LABEL[f.strength];
            const color = TONE_VAR[strength.tone];
            return (
              <motion.li
                key={`${f.id}-${i}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + i * 0.06 }}
                className="flex gap-3 rounded-xl border bg-bg p-3"
                style={{ borderColor: `color-mix(in oklab, ${color} 30%, var(--line))` }}
              >
                {f.strength === 'weak' ? (
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" style={{ color }} />
                ) : (
                  <ShieldAlert className="mt-0.5 size-4 shrink-0" style={{ color }} />
                )}
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                    {FLAG_LABEL[f.id]}
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-normal"
                      style={{ color, background: `color-mix(in oklab, ${color} 10%, transparent)` }}
                    >
                      {strength.text}
                    </span>
                  </p>
                  <p className="mt-1 text-sm break-words text-muted">
                    {f.detail}
                    <EvidenceChips ids={f.evidenceIds} />
                  </p>
                </div>
              </motion.li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

const CONTACT_ICON: Record<ContactType, LucideIcon> = { phone: Phone, email: Mail, url: Globe, chat: MessageCircle };

function contactStatus(c: Contact): { text: string; cls: string } {
  if (c.scamReports >= 2) return { text: `Reported on ${c.scamReports} sites`, cls: 'bg-bad-soft text-bad' };
  if (c.onOfficialSite) return { text: 'Official', cls: 'bg-good-soft text-good' };
  if (c.scamReports === 1) return { text: 'Reported on 1 site', cls: 'bg-warn-soft text-warn' };
  return { text: 'Not confirmed', cls: 'bg-surface-2 text-faint' };
}

/** The phone numbers, emails, links and chat handles found in the message. */
export function ContactList({ dossier }: { dossier: OfferDossier }) {
  const contacts = dossier.signals.contacts;
  return (
    <Panel title="Contacts in the message" subtitle="Official means it appears on one of the organisation's own websites">
      {contacts.length === 0 ? (
        <p className="text-sm text-muted">No phone numbers, emails or links were found.</p>
      ) : (
        <ul className="divide-y divide-line">
          {contacts.map((c) => {
            const Icon = CONTACT_ICON[c.type];
            const status = contactStatus(c);
            return (
              <li key={`${c.type}:${c.value}`} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <Icon className="size-4 shrink-0 text-muted" />
                <span className="min-w-0 flex-1 truncate font-mono text-sm text-ink" title={c.value}>
                  {c.value}
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${status.cls}`}>{status.text}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
