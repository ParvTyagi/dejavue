import { Investigate, type DemoCase } from '@/components/Investigate';
import { listCases } from '@/lib/fixtures/source';
import { FIXTURES_DIR, fixtureMode } from '@/lib/server/mode';

export default function Home() {
  const mode = fixtureMode();
  const demos: DemoCase[] =
    mode === 'replay'
      ? listCases(FIXTURES_DIR).map((c) => ({ id: c.id, title: c.title, kind: c.input.media.kind, input: c.input }))
      : [];

  return (
    <div className="space-y-8">
      <section className="max-w-2xl space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Is this really from where and when it says?</h1>
        <p className="text-muted">
          Most viral misinformation is a real photo with a false caption. DejaVue searches Google Lens, Bing, Yandex, News,
          Maps and YouTube through SerpApi to find where the media appeared first, then shows you the evidence.
        </p>
      </section>
      <Investigate mode={mode} demos={demos} />
    </div>
  );
}
