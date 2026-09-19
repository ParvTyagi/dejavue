// Captures the README screenshots from a running build, so they can be regenerated
// instead of going stale. Needs a server already listening (see npm run screenshots).
//
//   npm run build && npm run screenshots
//
// Usage: node scripts/screenshot.mjs [baseUrl] [outDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:3123';
const OUT = process.argv[3] ?? path.join('docs', 'images');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
// deviceScaleFactor 2 so the images stay sharp on a high-DPI screen.
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });

await page.goto(`${BASE}/check`, { waitUntil: 'networkidle' });
const cards = page.locator('[role="button"]', { hasText: 'Run this example' });
await cards.first().waitFor({ timeout: 15_000 });
console.log(`demo cases on /check: ${await cards.count()}`);

// The tsunami case is the one the README walks through step by step.
await cards.filter({ hasText: 'tsunami' }).first().click();
await page.waitForURL(/\/audit\/dv_/, { timeout: 15_000 });
await page.getByRole('heading', { name: /Old media, new claim/i }).waitFor({ timeout: 30_000 });
await page.waitForTimeout(2_500); // let the stamp and score-ring animations settle
console.log(`captured ${page.url()}`);

await page.screenshot({ path: path.join(OUT, 'audit.png') });
await page.screenshot({ path: path.join(OUT, 'audit-full.png'), fullPage: true });

await browser.close();
console.log(`wrote audit.png and audit-full.png to ${OUT}`);
