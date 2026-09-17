import type { Metadata } from 'next';
import { Investigate, type DemoCase } from '@/components/home/Investigate';
import { listCases } from '@/lib/fixtures/source';
import { FIXTURES_DIR, fixtureMode } from '@/lib/server/mode';

export const metadata: Metadata = {
  title: 'Check media — DejaVue',
};

export default function CheckPage() {
  const mode = fixtureMode();
  const demos: DemoCase[] =
    mode === 'replay'
      ? listCases(FIXTURES_DIR).map((c) => ({ id: c.id, title: c.title, kind: c.input.media.kind, input: c.input }))
      : [];

  return <Investigate mode={mode} demos={demos} />;
}
