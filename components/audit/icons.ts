import {
  Briefcase,
  Calendar,
  Crosshair,
  Eye,
  FileText,
  Globe,
  IdCard,
  Image as ImageIcon,
  Layers,
  MapPin,
  Newspaper,
  PenLine,
  Phone,
  Scale,
  ScanSearch,
  Search,
  Share2,
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
  google_jobs: Briefcase,
};

/** A recognisable tint per engine. */
export const ENGINE_COLOR: Record<EngineId, string> = {
  google_lens: '#171717',
  bing_reverse_image: '#404040',
  yandex_images: '#525252',
  google: '#262626',
  google_news: '#404040',
  google_maps: '#525252',
  youtube: '#262626',
  google_jobs: '#404040',
};

export const STAGE_ICON: Record<Stage, LucideIcon> = {
  claim: FileText,
  scene: Eye,
  tier1: ScanSearch,
  tier2: Layers,
  tier3: Newspaper,
  judge: Scale,
  narrate: PenLine,
  read: FileText,
  identity: IdCard,
  contacts: Phone,
  offer: Briefcase,
  trace: FileText,
  copies: Share2,
  dates: Calendar,
  origin: Crosshair,
};
