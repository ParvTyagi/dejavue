import { LogoMark } from './Logo';

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 text-xs leading-relaxed text-faint sm:px-6 md:grid-cols-[auto_1fr]">
        <div className="flex items-center gap-2 text-muted">
          <LogoMark className="size-5" />
          <span className="font-medium">DejaVue</span>
        </div>
        <p className="max-w-3xl md:justify-self-end md:text-right">
          DejaVue finds earlier appearances of media and warning signs in messages through SerpApi search engines. It does
          not detect deepfakes or AI-generated images, and finding nothing never proves that media or an offer is genuine.
          What you check is read by Gemini, and uploaded media and screenshots are deleted within 15 minutes. Photos and
          video frames go to reverse image search through SerpApi; from a message, only the organisation, phone numbers,
          emails and links are searched. Results, including
          the first 600 characters of a checked message, are kept for 7 days so they can be shared.
        </p>
      </div>
    </footer>
  );
}
