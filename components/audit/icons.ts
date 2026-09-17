import {
  Calendar,
  Eye,
  FileText,
  Globe,
  Image as ImageIcon,
  Layers,
  MapPin,
  Newspaper,
  PenLine,
  Scale,
  ScanSearch,
  Search,
  Youtube,
  type LucideIcon,
} from 'lucide-react';
import type { EngineId, Stage } from '@/lib/shared/types';

export const ENGINE_ICON: Record<EngineId, LucideIcon> = {
  google_lens: ScanSearch,
  bing_reverse_image: ImageIcon,
  yandex_images: Globe,
  google: Search,
  google_news: Newspaper,
  google_maps: MapPin,
  youtube: Youtube,
  google_trends: Calendar,
};

/** A recognisable tint per engine. */
export const ENGINE_COLOR: Record<EngineId, string> = {
  google_lens: '#d4f75c',
  bing_reverse_image: '#5eead4',
  yandex_images: '#fbbf24',
  google: '#a78bfa',
  google_news: '#60a5fa',
  google_maps: '#f472b6',
  youtube: '#ff6b4f',
  google_trends: '#94a3b8',
};

export const STAGE_ICON: Record<Stage, LucideIcon> = {
  claim: FileText,
  scene: Eye,
  tier1: ScanSearch,
  tier2: Layers,
  tier3: Newspaper,
  judge: Scale,
  narrate: PenLine,
};
