import { LogoMark } from './Logo';

/** Grouped so the limits and the data handling can each be read on their own. */
const NOTES = [
  {
    title: 'What it does',
    body: 'Finds earlier appearances of media, and warning signs in messages, through SerpApi search engines.',
  },
  {
    title: 'What it cannot do',
    body: 'It does not detect deepfakes or AI-generated images, and finding nothing never proves media or an offer is genuine.',
  },
  {
    title: 'Your data',
    body: 'What you check is read by Gemini. Uploaded media and screenshots are deleted within 15 minutes; results, including the first 600 characters of a checked message, are kept for 7 days so they can be shared.',
  },
  {
    title: 'What gets searched',
    body: 'Photos and video frames go to reverse image search. From a message, only the organisation, phone numbers, emails and links are searched.',
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex items-center gap-2 text-muted">
          <LogoMark className="size-5" />
          <span className="text-sm font-medium">DejaVue</span>
        </div>
        <dl className="mt-8 grid gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
          {NOTES.map((n) => (
            <div key={n.title}>
              <dt className="text-xs font-medium text-ink">{n.title}</dt>
              <dd className="mt-1.5 text-xs leading-relaxed text-faint">{n.body}</dd>
            </div>
          ))}
        </dl>
      </div>
    </footer>
  );
}
