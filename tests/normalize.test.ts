import { describe, expect, it } from 'vitest';
import { confirmMatches } from '@/lib/evidence/verifyMatch';
import { toEvidence } from '@/lib/serp/normalize';
import type { Evidence } from '@/lib/shared/types';

const ctx = {
  fetchedAt: new Date('2026-03-10T12:00:00.000Z'),
  trustedDomains: new Set(['theatlantic.com']),
  idPrefix: 'bing0',
};

describe('bing_reverse_image normalization', () => {
  // SerpApi puts a bing.com image-viewer redirect in `link` and the page that actually
  // carries the image in `source`. Reading `link` gave every match the same domain, which
  // silently defeated the independent-domain rule in computeFirstSeen() on live responses.
  const live = {
    pages_with_this_image: [
      {
        title: 'Ten years since the 2004 Indian Ocean tsunami',
        link: 'https://www.bing.com/images/search?view=detailv2&FORM=OIIRPO&id=DAEAC469',
        source: 'https://www.theatlantic.com/photo/2014/12/ten-years-since/100878/',
        date: '2014-12-26T14:10:00Z',
        thumbnail: 'https://th.bing.com/th/id/OIP.abc',
      },
      {
        title: 'Catástrofes climáticas',
        link: 'https://www.bing.com/images/search?view=detailv2&FORM=OIIRPO&id=9CBC6988',
        source: 'https://www.ecoavant.com/medio-ambiente/catastrofes/',
        date: '2021-01-27T08:52:00Z',
        thumbnail: 'https://th.bing.com/th/id/OIP.def',
      },
    ],
  };

  it('takes the domain from the source page, not the bing.com redirect', () => {
    const out = toEvidence('bing_reverse_image', live, ctx);
    expect(out.map((e) => e.domain)).toEqual(['theatlantic.com', 'ecoavant.com']);
  });

  it('keeps the domains distinct so independent copies can corroborate each other', () => {
    const domains = new Set(toEvidence('bing_reverse_image', live, ctx).map((e) => e.domain));
    expect(domains.size).toBe(2);
  });

  it('marks a trusted source, which a bing.com domain never could', () => {
    expect(toEvidence('bing_reverse_image', live, ctx)[0].trustedSource).toBe(true);
  });

  it('falls back to link when source is a bare hostname, as the fixtures record it', () => {
    const recorded = {
      pages_with_this_image: [
        {
          title: 'Tsunami 2011 video',
          link: 'https://www.forum-mirror.example/threads/tsunami-2011-video',
          source: 'forum-mirror.example',
          date: '2011-03-11T07:40:00Z',
        },
      ],
    };
    const out = toEvidence('bing_reverse_image', recorded, ctx);
    expect(out).toHaveLength(1);
    expect(out[0].domain).toBe('forum-mirror.example');
  });
});

describe('confirmMatches without an input hash', () => {
  // A frame given as a public URL reaches the pipeline with no pHash, because only the
  // browser uploader computes one. Comparing against it used to throw.
  const match = [
    {
      id: 'b0-0',
      engine: 'bing_reverse_image',
      kind: 'visual_match',
      url: 'https://www.theatlantic.com/photo/2014/12/ten-years-since/100878/',
      domain: 'theatlantic.com',
      title: 'Ten years since',
      thumbnailUrl: 'https://th.bing.com/th/id/OIP.abc',
      publishedAt: '2014-12-26T14:10:00.000Z',
      dateTrust: 'absolute_text',
      trustedSource: true,
    },
  ] as unknown as Evidence[];

  it('reports the match as unconfirmed instead of throwing', async () => {
    const out = await confirmMatches(match, [undefined], async () => 'a4c1e97b2f60d835');
    expect(out[0].match).toEqual({ hamming: 64, confirmed: false });
  });

  it('still confirms against the frames that do have a hash', async () => {
    const hash = 'a4c1e97b2f60d835';
    const out = await confirmMatches(match, [undefined, hash], async () => hash);
    expect(out[0].match).toEqual({ hamming: 0, confirmed: true });
  });
});
