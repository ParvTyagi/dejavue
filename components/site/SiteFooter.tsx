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
          DejaVue finds earlier appearances of media through SerpApi search engines. It does not detect deepfakes or
          AI-generated images, and finding no earlier copy never proves that media is authentic. Media you check is sent
          to search engines through SerpApi and to Gemini for scene reading, stored for at most 15 minutes, and never
          kept on the server.
        </p>
      </div>
    </footer>
  );
}
