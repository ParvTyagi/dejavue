import { Hero } from '@/components/home/Hero';
import { HowItWorks } from '@/components/home/HowItWorks';
import { Investigate, type DemoCase } from '@/components/home/Investigate';
import { listCases } from '@/lib/fixtures/source';
import { FIXTURES_DIR, fixtureMode } from '@/lib/server/mode';

export default function Home() {
  const mode = fixtureMode();
  const demos: DemoCase[] =
    mode === 'replay'
      ? listCases(FIXTURES_DIR).map((c) => ({ id: c.id, title: c.title, kind: c.input.media.kind, input: c.input }))
      : [];

  return (
    <>
      <Hero />
      <HowItWorks />
      <Investigate mode={mode} demos={demos} />
    </>
  );
}
