import { ENGINE_ICON } from '@/components/audit/icons';
import { ENGINE_LABEL } from '@/lib/client/labels';
import type { EngineId } from '@/lib/shared/types';

const SEARCHED: EngineId[] = ['google_lens', 'bing_reverse_image', 'yandex_images', 'google_news', 'google_maps', 'youtube', 'google'];
const ENGINES = SEARCHED.map((id) => ({ name: ENGINE_LABEL[id], icon: ENGINE_ICON[id] }));

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
