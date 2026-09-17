import type { Metadata } from 'next';
import Link from 'next/link';
import { fixtureMode } from '@/lib/server/mode';
import './globals.css';

export const metadata: Metadata = {
  title: 'DejaVue — where and when did this really come from?',
  description: 'Checks whether a viral image or video is really from where and when it claims, using search engines as evidence.',
};

export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const mode = fixtureMode();
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
            <Link href="/" className="flex items-baseline gap-2">
              <span className="text-lg font-semibold tracking-tight">DejaVue</span>
              <span className="hidden text-sm text-muted sm:inline">has this been seen before?</span>
            </Link>
            <span
              title={
                mode === 'replay'
                  ? 'Replay mode: results come from recorded demo cases. No search credits are used.'
                  : `${mode} mode: every audit searches SerpApi for real.`
              }
              className={`rounded-full border px-2.5 py-0.5 font-mono text-xs ${
                mode === 'replay' ? 'border-line text-muted' : 'border-warn/40 bg-warn-soft text-warn'
              }`}
            >
              {mode === 'replay' ? 'replay · 0 credits' : `${mode} · uses credits`}
            </span>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
        <footer className="mx-auto max-w-5xl px-4 pb-10 text-xs leading-relaxed text-muted">
          DejaVue finds earlier appearances of media through SerpApi search engines. It does not detect deepfakes or
          AI-generated images, and finding no earlier copy never proves that media is authentic. Media you check is
          sent to search engines through SerpApi and to Gemini for scene reading, stored for at most 15 minutes, and
          never kept on the server.
        </footer>
      </body>
    </html>
  );
}
