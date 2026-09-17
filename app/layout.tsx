import type { Metadata } from 'next';
import { Geist, Geist_Mono, Instrument_Serif } from 'next/font/google';
import { Providers } from '@/components/site/Providers';
import { SiteFooter } from '@/components/site/SiteFooter';
import { SiteNav } from '@/components/site/SiteNav';
import { fixtureMode } from '@/lib/server/mode';
import './globals.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });
const instrument = Instrument_Serif({ subsets: ['latin'], weight: '400', style: ['normal', 'italic'], variable: '--font-instrument' });

export const metadata: Metadata = {
  title: 'DejaVue — has this been seen before?',
  description:
    'Checks whether a viral image or video is really from where and when it claims, and whether a job offer, scheme message or helpline number shows signs of a scam, using search engines as evidence.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} ${instrument.variable}`}>
      <body className="min-h-screen overflow-x-clip font-sans antialiased">
        <Providers>
          <SiteNav mode={fixtureMode()} />
          <main>{children}</main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
