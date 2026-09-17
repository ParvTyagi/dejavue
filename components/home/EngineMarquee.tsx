import { Calendar, Globe, Image as ImageIcon, MapPin, Newspaper, ScanSearch, Search, Youtube } from 'lucide-react';

const ENGINES = [
  { name: 'Google Lens', icon: ScanSearch },
  { name: 'Bing Reverse Image', icon: ImageIcon },
  { name: 'Yandex Images', icon: Globe },
  { name: 'Google News', icon: Newspaper },
  { name: 'Google Maps', icon: MapPin },
  { name: 'YouTube', icon: Youtube },
  { name: 'Google Search', icon: Search },
  { name: 'Date-restricted search', icon: Calendar },
];

/** Endless, edge-faded strip of the engines DejaVue searches. */
export function EngineMarquee() {
  const row = [...ENGINES, ...ENGINES];
  return (
    <div className="relative mx-auto max-w-6xl overflow-hidden py-6 [mask-image:linear-gradient(to_right,transparent,black_15%,black_85%,transparent)]">
      <ul className="flex w-max animate-marquee gap-10 hover:[animation-play-state:paused]">
        {row.map(({ name, icon: Icon }, i) => (
          <li key={i} aria-hidden={i >= ENGINES.length} className="flex items-center gap-2 text-sm whitespace-nowrap text-faint">
            <Icon className="size-4" />
            {name}
          </li>
        ))}
      </ul>
    </div>
  );
}
