/**
 * Raw rendering-cost benchmark: frame-rate cap and vsync disabled, so frames/second reflects how
 * expensive each frame is with the colour filter off vs on. Headless Chromium on this machine's CPU
 * rasteriser: absolute numbers are NOT representative of a user's GPU; the on/off ratio is the signal.
 */
import { chromium, type Page } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_SETTINGS } from '../src/settings/schema';

const ROOT = process.cwd();
const DIST = process.env.CV_DIST ?? path.join(ROOT, 'dist');
const FIXTURES = path.join(ROOT, 'e2e', 'fixtures');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function findChrome(): string {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  for (const d of fs.readdirSync(base).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse()) {
    const p = path.join(base, d, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
    if (fs.existsSync(p)) return p;
  }
  throw new Error('No Chromium found');
}

const TARGETS = [
  { name: 'fixture: news (small static page)', url: '/news.html', local: true },
  { name: 'fixture: complex CSS (gradients, blend, backdrop-filter)', url: '/complex.html', local: true },
  { name: 'fixture: 20,000px page + 300 DOM inserts/s', url: '/dynamic.html', local: true, stress: true },
  { name: 'real: Wikipedia long article', url: 'https://en.wikipedia.org/wiki/Rainbow', local: false },
  { name: 'real: GitHub home', url: 'https://github.com/', local: false },
];

async function fps(page: Page, stress: boolean) {
  return page.evaluate(async (stress) => {
    if (stress) (window as unknown as { startStress: () => void }).startStress();
    let frames = 0;
    let y = 0;
    const t0 = performance.now();
    await new Promise<void>((resolve) => {
      const tick = (t: number) => {
        frames++;
        y += 25;
        window.scrollTo(0, y % 8000);
        if (t - t0 < 3000) requestAnimationFrame(tick); else resolve();
      };
      requestAnimationFrame(tick);
    });
    if (stress) (window as unknown as { stopStress: () => void }).stopStress();
    window.scrollTo(0, 0);
    return frames / ((performance.now() - t0) / 1000);
  }, stress);
}

async function main() {
  const srv = http.createServer((req, res) => {
    const file = path.join(FIXTURES, (req.url ?? '/').split('?')[0]);
    if (file.startsWith(FIXTURES) && fs.existsSync(file) && fs.statSync(file).isFile()) { res.writeHead(200, { 'content-type': 'text/html' }); res.end(fs.readFileSync(file)); } else { res.writeHead(404); res.end(); }
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(srv.address() as { port: number }).port}`;
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'cv-perf-')), {
    executablePath: findChrome(), headless: true, viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1,
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, '--disable-frame-rate-limit', '--disable-gpu-vsync'],
  });
  let sw = ctx.serviceWorkers()[0];
  for (let i = 0; i < 60 && !sw; i++) { await sleep(250); sw = ctx.serviceWorkers()[0]; }
  const ctl = await ctx.newPage();
  await ctl.goto(`chrome-extension://${new URL(sw.url()).host}/popup.html`);
  const set = (enabled: boolean) => ctl.evaluate((s) => chrome.storage.local.set({ settings: s }), { ...DEFAULT_SETTINGS, enabled, profile: 'deuteranopia', strength: 0.8 } as unknown as Record<string, unknown>);

  const rows: Array<{ name: string; fpsOff: number; fpsOn: number; ratio: number }> = [];
  for (const t of TARGETS) {
    const runs = { off: [] as number[], on: [] as number[] };
    for (let rep = 0; rep < 3; rep++) {
      for (const enabled of [false, true]) {
        await set(enabled);
        const page = await ctx.newPage();
        try {
          await page.goto(t.local ? base + t.url : t.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          if (enabled) await page.waitForFunction(() => !!document.getElementById('colorvision-svg'), undefined, { timeout: 8000 });
          await sleep(2500);
          runs[enabled ? 'on' : 'off'].push(await fps(page, !!t.stress));
        } catch (e) { console.log(t.name, 'skipped:', String(e).split('\n')[0]); }
        await page.close();
      }
    }
    if (!runs.off.length || !runs.on.length) continue;
    const med = (a: number[]) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
    const row = { name: t.name, fpsOff: med(runs.off), fpsOn: med(runs.on), ratio: med(runs.on) / med(runs.off) };
    rows.push(row);
    console.log(`${t.name.padEnd(62)} off ${row.fpsOff.toFixed(0).padStart(4)} fps | on ${row.fpsOn.toFixed(0).padStart(4)} fps | on/off ${row.ratio.toFixed(2)}`);
  }
  fs.writeFileSync(path.join(ROOT, 'docs', 'perf-uncapped.json'), JSON.stringify({ date: new Date().toISOString(), note: 'headless, CPU raster, vsync + frame cap disabled; median of 3', rows }, null, 2));
  await ctx.close();
  srv.close();
}
main().catch((e) => { console.error(e); process.exit(2); });
