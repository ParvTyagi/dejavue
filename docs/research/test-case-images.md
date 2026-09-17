# Test-case images: fact-checked recycled media

Research for issue #4. Candidates for the `RECYCLED` (and `MISPLACED`) golden cases in `docs/DESIGN.md` §15.1. The final pick of 4 is made in #9.

Researched 2026-09-17. Every row comes from the fact-checker's own article. AFP Fact Check blocks automated fetching, so the one AFP row (C8) was checked through Gulf News, which quotes AFP and links to the AFP article.

## Summary

| # | Fact-checker | Type | Claimed (place, date) | Actually (place, date) | Expected verdict |
| --- | --- | --- | --- | --- | --- |
| C1 | BOOM | Photo | Ukraine, Feb 2022 (just before the invasion) | Freedom Square, Kharkiv, Ukraine, 2019 | `RECYCLED` |
| C2 | BOOM | Photo, location swap | Bengaluru, May 2022 | Uttarakhand (Kosi river flood near Jim Corbett), Oct 2021, AP | `RECYCLED` + `MISPLACED` |
| C3 | BOOM | Video, location swap | Karachi, Pakistan, Aug/Sep 2022 | Ishinomaki, Miyagi, Japan, Mar 2011 | `RECYCLED` + `MISPLACED` |
| C4 | BOOM | Video frame | Pahalgam, J&K, 22 Apr 2025 | Facebook video, Oct 2021 (rifle drill, Pakistani account) | `RECYCLED` |
| C5 | Alt News | Video, location swap | Assam, May 2025 | Gopalpur, Nadia, West Bengal, Sep 2020 or earlier | `RECYCLED` + `MISPLACED` |
| C6 | Alt News | Video | Kolkata, Jul 2022 (police beating Kanwar pilgrims) | Ahiritola Ghat, Kolkata, Aug 2021 (COVID-rule lathi-charge) | `RECYCLED` (same city) |
| C7 | Alt News | Photo | Ganga, Bihar/UP, May 2021 (COVID dead) | Ganga near Pariyar, Unnao, UP, Jan 2015, Getty/Hindustan Times | `RECYCLED` |
| C8 | AFP | Photo | Pakistan after IAF strikes, 27 Feb 2019 | Balakot, Pakistan, 10 Oct 2005 (earthquake), AFP photo | `RECYCLED` |

The ticket asked for at least 2 video cases (C3, C4, C5, C6) and at least 1 location swap (C2, C3, C5).

## Details

### C1: Ukrainians praying in the snow
- Fact-check: https://www.boomlive.in/world/fake-news-ukraine-russia-praying-in-snow-16952 (28 Feb 2022)
- False claim: "Ukrainian Christians pray outdoors, in the snow, for their country in this phase of war danger" (Facebook, 20 Feb 2022)
- Original: a 2019 photo from the International Mission Board of Kharkiv residents who had held daily prayers in Freedom Square since March 2014. BOOM matched the location with Google Maps.
- Image URLs:
  - https://www.boomlive.in/h-upload/2022/02/28/971145-ukrainians-praying-in-snow.jpg (screenshot of the Facebook post; crop the photo out of it)
  - https://www.boomlive.in/h-upload/2022/02/25/970995-2022022521-044d0d634c2d4037410a2ca8ad82e952.webp (from the article body)

### C2: Flooded cars in "Bengaluru"
- Fact-check: https://www.boomlive.in/fact-check/politics/fake-news-viral-photo-flooded-road-bengaluru-rains-uttarakhand-photo-factcheck-17985 (24 May 2022)
- False claim: a Telugu tweet by @RahulRaoTRS on 18 May 2022 mocking a "double engine government" for a car-swimming contest in Bengaluru (#bengalorerains)
- Original: AP photo by Mustafa Quraishi of the Kosi river overflowing near Jim Corbett National Park, Uttarakhand, October 2021. Al Jazeera ran it on 20 Oct 2021, and the photographer confirmed it on Twitter.
- Image URLs:
  - https://www.boomlive.in/h-upload/2022/05/24/977840-flood-023.jpg (side-by-side image with a "FAKE" stamp; the clean photo is the right half)
  - https://www.boomlive.in/h-upload/2022/05/24/977842-viral-on-fb-not-bengaluru-floods.webp
- Note: the image comes from a wire agency and is widely indexed, so Lens is likely to find it. The two places are about 2,000 km apart, well past the 50 km rule. This is the strongest candidate.

### C3: 2011 Japan tsunami shown as "Karachi today"
- Fact-check: https://www.boomlive.in/fast-check/viral-video-pakistan-karachi-flood-old-video-japan-tsunami-social-media-platforms-19105 (2 Sep 2022)
- False claim: "Karachi Pakistan Today"
- Original: 2011 Japan tsunami footage from Ishinomaki City, uploaded to the YouTube channel "Takuro Suzuki" in December 2011 and re-uploaded on 30 Apr 2012. BOOM had already debunked the same clip in 2020, when it went viral as floods in China.
- Image URLs (key frames):
  - https://www.boomlive.in/h-upload/2022/09/02/984691-claim-pakistan-flood.webp
  - https://www.boomlive.in/h-upload/2022/09/02/984692-pakistan-flood-01.jpg
- Note: the same clip was used for more than one false claim, which makes it a good multi-claim demo.

### C4: "First image of the Pahalgam attacker"
- Fact-check: https://www.boomlive.in/fact-check/pahalgam-terrorist-attack-kashmir-indian-army-viral-photo-fact-check-28355 (24 Apr 2025)
- False claim: "First image of terrorist who attacked tourists" in Pahalgam. Many national outlets ran it, including India Today, Aaj Tak, Times Now, News18 and Republic.
- Original: a screengrab from a Facebook video posted by a Pakistani account in October 2021, showing a man in a purple kurta doing rifle drills.
- Image URLs:
  - https://www.boomlive.in/h-upload/2025/04/24/1042742-pahalgam-0001.jpg
  - https://www.boomlive.in/h-upload/2025/04/24/1042686-2021-post.webp (the 2021 post)
- Note: the original was a Facebook video, so Lens may not index it well. This is a useful test of the `UNVERIFIED` fallback if Lens misses.

### C5: West Bengal video shown as "Assam Police"
- Fact-check: https://www.altnews.in/old-unrelated-video-from-west-bengal-shared-as-assam-police-lathicharged-on-pakistani-supporters/ (2 Jun 2025)
- False claim: "The Assam Police is serving Bangladeshis who support Pakistan." (shared 17 May 2025)
- Original: Gopalpur, Nadia district, West Bengal. It was posted on the "Kokborok Memes" Facebook page on 7 Sep 2020, and a 2021 YouTube upload describes it as a lockdown police chase.
- Scene evidence: "WB" number plates and a Bengali "Gopalpur Satsang Club" sign. This case can exercise the scene-text path in §6.
- Image URLs:
  - https://www.altnews.in/wp-content/uploads/2025/05/assam.jpg
  - https://www.altnews.in/hindi/wp-content/uploads/sites/2/2025/05/VIDEO-SCREENGRAB-2000-x-622-px-1-1024x318.jpg

### C6: Kolkata lathi-charge shown as police beating Kanwariyas
- Fact-check: https://www.altnews.in/old-unrelated-video-from-wb-viral-as-kolkata-police-thrashing-kanwaris/ (27 Jul 2022)
- False claim: "बंगाल में ममता सरकार के आदेशानुसार कांवड़ियों पर प्रेम बरसाती पुलिस" ("in Bengal, police showering 'love' on Kanwariyas on the Mamata government's orders")
- Original: police lathi-charged a crowd at Ahiritola Ghat, Kolkata, for breaking COVID rules in August 2021. Dainik Jagran (16 Aug 2021), TV9 and Sanmarg reported it. Alt News geolocated it through the "Ahiritola Ghat Bachao Committee" sign and Street View.
- Image URL: https://www.altnews.in/wp-content/uploads/2022/07/Copy-of-FI-Template-211.jpg
- Note: the place in the claim is correct and only the date is wrong. This checks that `RECYCLED` fires without `MISPLACED`.

### C7: 2015 Unnao photo shown as COVID victims in the Ganga
- Fact-check: https://www.altnews.in/old-photo-shared-amid-reports-of-dead-bodies-of-suspected-covid-victims-found-in-ganga/ (14 May 2021)
- False claim: presented as a recent photo of COVID victims' bodies in the Ganga. Daman & Diu Congress Seva Dal shared it on 12 May 2021, and so did an AAP leader, who later deleted it.
- Original: photo by Amit Yadav for Hindustan Times, distributed by Getty (editorial #461525246). Getty lists the creation date as 14 Jan 2015, but its caption says "January 13, 2014". The fixture should record this conflict.
- Image URL: https://www.altnews.in/wp-content/uploads/2021/05/dead-bodies.jpg (Getty page screenshot with a watermark)
- Caution: the image is graphic (dead bodies). Use it for tests only, not the live demo.

### C8: 2005 earthquake photo shown as damage from the Balakot strike
- Fact-check: https://factcheck.afp.com/no-these-are-not-photos-pakistan-february-27-2019-after-indian-airstrikes (5 Mar 2019). Checked through https://gulfnews.com/world/asia/india/fake-news-no-this-is-not-balakot-in-2019-afp-exposes-indian-social-media-post-on-bomb-hit-pakistan-1.1551804524060, because AFP returns 403 to automated fetches.
- False claim (Hindi, translated): "You have seen many pictures of Pulwama; now look at state of Pakistan today." (27 Feb 2019)
- Original: AFP's own photo taken in Balakot on 10 Oct 2005, two days after the Muzaffarabad earthquake.
- Image URL: not captured, because the AFP page could not be fetched. Take it from the AFP article by hand.
- Note: the claimed and true places are both Balakot, so this is a pure `RECYCLED` case. The 14-year gap makes the timeline very clear.

## Caveats for fixture recording (#9)
- **The image URLs point to fact-checker graphics, not clean originals.** They are screenshots, side-by-side comparisons or images with a "FAKE" stamp. If one of these is uploaded as-is, Lens will probably match the fact-check article itself, which tells us nothing useful. Crop out the viral media, or better, save the frame from the original viral post. Keep the cropped files out of git, as decided for this ticket.
- If a matched page is a fact-check about this image, it should not count as the "first seen" evidence. Consider excluding boomlive.in, altnews.in and factcheck.afp.com from the matches used for dating, or handling them specially.
- For the video cases (C3, C4, C5, C6), DejaVue only sees one key frame. C3 comes from widely re-uploaded tsunami footage and has the best chance of a Lens hit. C4 and C5 come from Facebook-only originals and may end up `UNVERIFIED`.
- Suggested shortlist for #9: C2 (photo, location swap), C1 (photo), C3 (video, location swap) and C6 (video, same city). This mix covers photo and video, and `RECYCLED` with and without `MISPLACED`.
