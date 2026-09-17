import {
  CloudHail,
  Flame,
  Landmark,
  Mountain,
  PawPrint,
  Siren,
  Users,
  Waves,
  Wind,
  type LucideIcon,
} from 'lucide-react';

export interface DemoTheme {
  name: string;
  icon: LucideIcon;
  /** Two colours for the card's header gradient. */
  from: string;
  to: string;
}

// Matched in order against the case title (whole words), so new cases pick up a sensible look.
const THEMES: [RegExp, DemoTheme][] = [
  [/\b(tsunami|waves?)\b/i, { name: 'waves', icon: Waves, from: '#0ea5e9', to: '#5eead4' }],
  [/\b(floods?|rain)\b/i, { name: 'flood', icon: Waves, from: '#3b82f6', to: '#22d3ee' }],
  [/\b(fire|blaze)\b/i, { name: 'fire', icon: Flame, from: '#f97316', to: '#facc15' }],
  [/\b(police|lathi-charge)\b/i, { name: 'police', icon: Siren, from: '#ef4444', to: '#a78bfa' }],
  [/\bhailstorm\b/i, { name: 'hail', icon: CloudHail, from: '#a5b4fc', to: '#e0f2fe' }],
  [/\b(cyclone|storm|winds?)\b/i, { name: 'wind', icon: Wind, from: '#6366f1', to: '#5eead4' }],
  [/\b(landslide|mountain)\b/i, { name: 'landslide', icon: Mountain, from: '#a16207', to: '#d4f75c' }],
  [/\b(leopard|animal)\b/i, { name: 'animal', icon: PawPrint, from: '#f59e0b', to: '#84cc16' }],
  [/\b(bridge|port|station)\b/i, { name: 'landmark', icon: Landmark, from: '#14b8a6', to: '#a78bfa' }],
  [/\b(crowd|praying|people)\b/i, { name: 'people', icon: Users, from: '#d4f75c', to: '#5eead4' }],
];

const FALLBACK: DemoTheme = { name: 'default', icon: Users, from: '#a78bfa', to: '#5eead4' };

export function demoTheme(title: string): DemoTheme {
  return THEMES.find(([re]) => re.test(title))?.[1] ?? FALLBACK;
}
