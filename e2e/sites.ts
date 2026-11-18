/**
 * Optional compatibility run against REAL public websites (needs internet; sites change over time,
 * and some block automation). Output: docs/real-sites.json + docs/screenshots/site-*.png.
 *
 * Live sites move on their own (carousels, ads, lazy loading, hydration), so every check is differential:
 *  - layout: metrics measured immediately before vs immediately after toggling the filter;
 *  - JS errors: equal-length windows with correction off vs on (the site's own error rate is the control);
 *  - pixels: only pixels that were stable across consecutive screenshots are compared with the
 *    engine's matrix prediction (screenshot of the unfiltered page -> matrix -> compare to filtered page);
 *  - removal: the filter nodes are gone and layout metrics are unchanged around the toggle.
 */
import { chromium, type Page } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_SETTINGS } from '../src/settings/schema';
import { correctionMatrix, effectiveSeverity } from '../src/engine';

const ROOT = process.cwd();
const DIST = process.env.CV_DIST ?? path.join(ROOT, 'dist');
const SHOTS = path.join(ROOT, 'docs', 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Site { name: string; category: string; url: string; dark?: boolean }
const SITES: Site[] = [
  { name: 'bbc-news', category: 'news', url: 'https://www.bbc.com/news' },
  { name: 'hacker-news', category: 'news', url: 'https://news.ycombinator.com/' },
  { name: 'walmart-home', category: 'shopping', url: 'https://www.walmart.com/' },
  { name: 'ebay-home', category: 'shopping', url: 'https://www.ebay.com/' },
  { name: 'mastodon', category: 'social media', url: 'https://mastodon.social/explore' },
  { name: 'reddit-old', category: 'social media', url: 'https://old.reddit.com/' },
  { name: 'wikipedia-cvd', category: 'educational', url: 'https://en.wikipedia.org/wiki/Color_blindness' },
  { name: 'khan-academy', category: 'educational (SPA)', url: 'https://www.khanacademy.org/' },
  { name: 'chartjs-bar', category: 'charts (canvas)', url: 'https://www.chartjs.org/docs/latest/charts/bar.html' },
  { name: 'd3-gallery', category: 'charts (SVG)', url: 'https://d3-graph-gallery.com/' },
  { name: 'github-dark', category: 'dark interface / complex CSS', url: 'https://github.com/', dark: true },
  { name: 'wikipedia-dark', category: 'dark interface', url: 'https://en.wikipedia.org/wiki/Rainbow', dark: true },
];

function findChrome(): string {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  const dirs = fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse();
  for (const d of dirs) {
    const p = path.join(base, d, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
    if (fs.existsSync(p)) return p;
  }
  throw new Error('No Chromium found; set CHROME_PATH');
}

async function metrics(p: Page) {
  return p.evaluate(() => {
    const own = (e: Element) => e.id === 'colorvision-svg' || e.id === 'colorvision-style' || !!e.closest('#colorvision-svg');
    return {
      scrollHeight: document.documentElement.scrollHeight,
      scrollWidth: document.documentElement.scrollWidth,
      elements: Array.from(document.querySelectorAll('*')).filter((e) => !own(e)).length,
      bodyHeight: Math.round(document.body.getBoundingClientRect().height),
    };
  });
}

async function smooth(p: Page) {
  return p.evaluate(async () => {
    const frames: number[] = [];
    let long = 0;
    try { new PerformanceObserver((l) => { long += l.getEntries().length; }).observe({ entryTypes: ['longtask'] }); } catch { /* ignore */ }
    let last = performance.now();
    const end = last + 2000;
    let y = 0;
    await new Promise<void>((resolve) => {
      const tick = (t: number) => {
        frames.push(t - last);
        last = t;
        y += 30;
        window.scrollTo(0, y);
        if (t < end) requestAnimationFrame(tick); else resolve();
      };
      requestAnimationFrame(tick);
    });
    window.scrollTo(0, 0);
    frames.sort((a, b) => a - b);
    return { median: frames[Math.floor(frames.length / 2)], p95: frames[Math.floor(frames.length * 0.95)], long };
  });
}

async function main() {
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'cv-sites-')), {
    executablePath: findChrome(),
    headless: true,
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    locale: 'en-US',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, '--force-color-profile=srgb'],
  });
  let sw = ctx.serviceWorkers()[0];
  for (let i = 0; i < 60 && !sw; i++) { await sleep(250); sw = ctx.serviceWorkers()[0]; }
  const extId = new URL(sw.url()).host;
  const ctl = await ctx.newPage();
  await ctl.goto(`chrome-extension://${extId}/popup.html`);
  const set = (enabled: boolean) =>
    ctl.evaluate((s) => chrome.storage.local.set({ settings: s }), {
      ...DEFAULT_SETTINGS, enabled, profile: 'deuteranopia', strength: 0.8, mode: 'natural',
    } as unknown as Record<string, unknown>);

  const scratch = await ctx.newPage();
  await scratch.goto('about:blank');
  const M = correctionMatrix({ profile: 'deuteranopia', strength: 0.8, mode: 'natural', severity: effectiveSeverity('deuteranopia') });
  /** Compare filtered screenshots against the engine's prediction, on pixels stable across repeated shots. */
  const stableMatch = (s0a: Buffer, s0b: Buffer, s1a: Buffer, s1b: Buffer) =>
    scratch.evaluate(
      async ({ s0a, s0b, s1a, s1b, M }) => {
        const load = async (s: string) => {
          const bmp = await createImageBitmap(await (await fetch('data:image/png;base64,' + s)).blob());
          const c = new OffscreenCanvas(bmp.width, bmp.height);
          const x = c.getContext('2d', { willReadFrequently: true })!;
          x.drawImage(bmp, 0, 0);
          return x.getImageData(0, 0, bmp.width, bmp.height).data;
        };
        const [a0, b0, a1, b1] = [await load(s0a), await load(s0b), await load(s1a), await load(s1b)];
        const toLin = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
        const toSrgb = (l: number) => { const c = Math.min(1, Math.max(0, l)); return 255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055); };
        let stable = 0, match = 0, changed = 0;
        const n = a0.length / 4;
        for (let i = 0; i < a0.length; i += 4) {
          const st0 = Math.max(Math.abs(a0[i] - b0[i]), Math.abs(a0[i + 1] - b0[i + 1]), Math.abs(a0[i + 2] - b0[i + 2])) <= 2;
          const st1 = Math.max(Math.abs(a1[i] - b1[i]), Math.abs(a1[i + 1] - b1[i + 1]), Math.abs(a1[i + 2] - b1[i + 2])) <= 2;
          if (!st0 || !st1) continue;
          stable++;
          const r = toLin(a0[i]), g = toLin(a0[i + 1]), b = toLin(a0[i + 2]);
          const p = [toSrgb(M[0] * r + M[1] * g + M[2] * b), toSrgb(M[3] * r + M[4] * g + M[5] * b), toSrgb(M[6] * r + M[7] * g + M[8] * b)];
          const d = Math.max(Math.abs(p[0] - a1[i]), Math.abs(p[1] - a1[i + 1]), Math.abs(p[2] - a1[i + 2]));
          if (d <= 6) match++;
          if (Math.max(Math.abs(a0[i] - a1[i]), Math.abs(a0[i + 1] - a1[i + 1]), Math.abs(a0[i + 2] - a1[i + 2])) > 8) changed++;
        }
        return { stableFraction: stable / n, matchOfStable: stable ? match / stable : 0, visiblyChangedOfStable: stable ? changed / stable : 0 };
      },
      { s0a: s0a.toString('base64'), s0b: s0b.toString('base64'), s1a: s1a.toString('base64'), s1b: s1b.toString('base64'), M: Array.from(M) },
    );

  const out: unknown[] = [];
  for (const site of SITES) {
   for (let attempt = 1; attempt <= 2; attempt++) {
    const row: Record<string, unknown> = { name: site.name, category: site.category, url: site.url, attempt };
    try {
      await set(false);
      const page = await ctx.newPage();
      if (site.dark) await page.emulateMedia({ colorScheme: 'dark' });
      const errs: string[] = [];
      page.on('pageerror', (e) => errs.push(e.message));
      const resp = await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch((e) => { row.navError = String(e).slice(0, 120); return null; });
      row.status = resp?.status() ?? null;
      if (!resp || (resp.status() >= 400)) {
        row.result = 'SKIPPED (site unreachable or blocked automation)';
        await page.close();
        console.log(site.name, row.result, row.status, `(attempt ${attempt})`);
        if (attempt < 2) continue;
        out.push(row);
        break;
      }
      await sleep(3500);
      // Window A: correction OFF (the site's own behaviour is the control).
      const errsA0 = errs.length;
      const smooth0 = await smooth(page);
      await sleep(1000);
      const errsOff = errs.length - errsA0;
      const s0a = await page.screenshot();
      await sleep(120);
      const s0b = await page.screenshot();

      // Toggle ON: layout measured immediately before and after.
      const mBefore = await metrics(page);
      await set(true);
      await page.waitForFunction(() => !!document.getElementById('colorvision-svg'), undefined, { timeout: 8000 });
      const mAfter = await metrics(page);
      await sleep(700);
      const filt = await page.evaluate(() => getComputedStyle(document.documentElement).filter);
      const s1a = await page.screenshot();
      await sleep(120);
      const s1b = await page.screenshot();
      const match = await stableMatch(s0a, s0b, s1a, s1b);
      // Window B: correction ON, same length as window A.
      const errsB0 = errs.length;
      const smooth1 = await smooth(page);
      await sleep(1000);
      const errsOn = errs.length - errsB0;

      // Toggle OFF.
      const mBefore2 = await metrics(page);
      await set(false);
      await page.waitForFunction(() => !document.getElementById('colorvision-svg') && !document.getElementById('colorvision-style'), undefined, { timeout: 8000 });
      const mAfter2 = await metrics(page);
      const leftovers = await page.evaluate(() => document.documentElement.outerHTML.includes('colorvision'));

      fs.writeFileSync(path.join(SHOTS, `site-${site.name}-original.png`), s0a);
      fs.writeFileSync(path.join(SHOTS, `site-${site.name}-corrected.png`), s1a);
      const same = (x: object, y: object) => JSON.stringify(x) === JSON.stringify(y);
      const layoutOk = same(mBefore, mAfter) && same(mBefore2, mAfter2);
      const errOk = errsOn <= errsOff * 1.5 + 3;
      Object.assign(row, {
        filterApplied: /url\(/.test(filt),
        layoutUnchangedAroundToggle: layoutOk,
        layout: { onBefore: mBefore, onAfter: mAfter, offBefore: mBefore2, offAfter: mAfter2 },
        jsErrors: { windowCorrectionOff: errsOff, windowCorrectionOn: errsOn },
        pixels: match,
        removedCleanly: !leftovers,
        scroll: { off: smooth0, on: smooth1 },
      });
      row.result = row.filterApplied && layoutOk && errOk && !leftovers && match.matchOfStable > 0.9 ? 'PASS' : 'REVIEW';
      console.log(
        site.name.padEnd(16), row.result,
        `stable px ${(match.stableFraction * 100).toFixed(0)}%, of those match engine ${(match.matchOfStable * 100).toFixed(1)}%, visibly shifted ${(match.visiblyChangedOfStable * 100).toFixed(0)}%, layout ${layoutOk ? 'same' : 'DIFFERENT'}, js errors off/on ${errsOff}/${errsOn}, frame med ${smooth0.median.toFixed(1)}->${smooth1.median.toFixed(1)}ms`,
      );
      await page.close();
    } catch (e) {
      row.result = 'ERROR';
      row.error = String(e).slice(0, 200);
      console.log(site.name, 'ERROR (attempt ' + attempt + ')', row.error.split('\n')[0]);
    }
    if (row.result === 'ERROR' && attempt < 2) { await set(false); continue; }
    out.push(row);
    break;
   }
  }
  fs.writeFileSync(path.join(ROOT, 'docs', 'real-sites.json'), JSON.stringify({ date: new Date().toISOString(), results: out }, null, 2));
  await ctx.close();
}

main().catch((e) => { console.error(e); process.exit(2); });
