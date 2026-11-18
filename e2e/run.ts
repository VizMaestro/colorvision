/**
 * End-to-end tests in a real Chromium with the BUILT extension loaded (dist/).
 * Bundled with esbuild and run with node (see package.json "e2e").
 *
 * What is verified here is exactly what is asserted; see docs/TESTING.md for what is NOT covered
 * (real websites, real users with diagnosed CVD, Chrome Web Store review).
 */
import { chromium, type BrowserContext, type Page } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  PROFILES, apply, correctionMatrix, feColorMatrixValues, getProfile, linearToSrgb, srgbToLinear,
  simulationMatrix, effectiveSeverity, type Mat3, type ProfileId, type CorrectionMode,
} from '../src/engine';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings/schema';

const ROOT = process.cwd();
const DIST = process.env.CV_DIST ?? path.join(ROOT, 'dist');
const FIXTURES = path.join(ROOT, 'e2e', 'fixtures');
const SHOTS = path.join(ROOT, 'docs', 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

type Result = { name: string; pass: boolean; detail: string };
const results: Result[] = [];
function record(name: string, pass: boolean, detail = ''): void {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -  ' + detail : ''}`);
}

function findChrome(): string {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  const dirs = fs.existsSync(base) ? fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort() : [];
  for (const d of dirs.reverse()) {
    const p = path.join(base, d, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
    if (fs.existsSync(p)) return p;
  }
  throw new Error('No Chromium found; set CHROME_PATH');
}

function serve(): Promise<{ url: string; close: () => void; hits: string[] }> {
  const hits: string[] = [];
  const server = http.createServer((req, res) => {
    hits.push(req.url ?? '');
    const file = path.join(FIXTURES, (req.url ?? '/').split('?')[0].replace(/^\//, ''));
    if (file.startsWith(FIXTURES) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(file));
    } else {
      res.writeHead(404);
      res.end('not found');
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port;
      resolve({ url: `http://127.0.0.1:${port}`, close: () => server.close(), hits });
    });
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Rgb = [number, number, number];
const toByte = (v: number) => Math.round(linearToSrgb(v) * 255);
function expectedPixel(c: Rgb, m: Mat3): Rgb {
  const lin = c.map((v) => srgbToLinear(v / 255)) as [number, number, number];
  const o = apply(m, lin).map((v) => toByte(Math.min(1, Math.max(0, v)))) as Rgb;
  return o;
}
const maxDiff = (a: Rgb, b: Rgb) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));

async function main() {
  const srv = await serve();
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-e2e-'));
  const ctx: BrowserContext = await chromium.launchPersistentContext(userDir, {
    executablePath: findChrome(),
    headless: true,
    viewport: { width: 1000, height: 700 },
    deviceScaleFactor: 1,
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, '--force-color-profile=srgb', '--font-render-hinting=none'],
  });
  const extRequests: string[] = [];
  const consoleErrors: string[] = [];
  ctx.on('request', (r) => {
    const u = r.url();
    if (!/^(http:\/\/127\.0\.0\.1|chrome-extension:|data:|blob:|about:)/.test(u)) extRequests.push(u);
  });

  let sw = ctx.serviceWorkers()[0];
  for (let i = 0; i < 60 && !sw; i++) {
    await sleep(250);
    sw = ctx.serviceWorkers()[0];
  }
  if (!sw) throw new Error('extension service worker did not start');
  const extId = new URL(sw.url()).host;
  record('extension loads and service worker starts', !!extId, `id=${extId}`);

  const ctl = await ctx.newPage();
  ctl.on('console', (m) => m.type() === 'error' && consoleErrors.push(`ctl: ${m.text()}`));
  ctl.on('pageerror', (e) => consoleErrors.push(`ctl pageerror: ${e.message}`));
  await ctl.goto(`chrome-extension://${extId}/popup.html`);

  let current: Settings = { ...DEFAULT_SETTINGS, sites: {} };
  const setSettings = async (patch: Partial<Settings>) => {
    current = { ...current, ...patch };
    await ctl.evaluate((s) => chrome.storage.local.set({ settings: s }), current as unknown as Record<string, unknown>);
  };
  const params = (s: Settings) => ({ profile: s.profile, strength: s.strength, mode: s.mode, severity: undefined as number | undefined });

  const scratch = await ctx.newPage();
  await scratch.goto('about:blank');
  const sample = async (shot: Buffer, pts: Array<[number, number]>): Promise<Rgb[]> =>
    scratch.evaluate(
      async ({ b64, pts }) => {
        const blob = await (await fetch('data:image/png;base64,' + b64)).blob();
        const bmp = await createImageBitmap(blob);
        const c = new OffscreenCanvas(bmp.width, bmp.height);
        const x = c.getContext('2d', { willReadFrequently: true })!;
        x.drawImage(bmp, 0, 0);
        return pts.map(([px, py]) => {
          const d = x.getImageData(Math.round(px), Math.round(py), 1, 1).data;
          return [d[0], d[1], d[2]] as [number, number, number];
        });
      },
      { b64: shot.toString('base64'), pts },
    );

  const probePoints = (page: Page) =>
    page.evaluate(() => {
      const out: Array<{ name: string; x: number; y: number }> = [];
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      document.querySelectorAll<HTMLElement>('[data-probe]').forEach((e, i) => {
        const r = e.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) return;
        const x = r.left + Math.min(6, r.width / 2);
        const y = r.top + r.height / 2;
        if (x >= 0 && y >= 0 && x < vw && y < vh) out.push({ name: `${e.tagName.toLowerCase()}#${e.id || i}`, x, y });
      });
      document.querySelectorAll<HTMLElement>('[data-points]').forEach((e, i) => {
        const r = e.getBoundingClientRect();
        for (const p of (e.dataset.points as string).split(',')) {
          const [dx, dy] = p.split(':').map(Number);
          const x = r.left + dx;
          const y = r.top + dy;
          if (x >= 0 && y >= 0 && x < vw && y < vh) out.push({ name: `${e.tagName.toLowerCase()}#${e.id || i}@${p}`, x, y });
        }
      });
      return out;
    });

  const waitApplied = (page: Page, on: boolean) =>
    page.waitForFunction((on) => !!document.getElementById('colorvision-svg') === on && !!document.getElementById('colorvision-style') === on, on, { timeout: 8000 });

  const waitMatrix = async (page: Page) => {
    const want = feColorMatrixValues(correctionMatrix(params(current)));
    await page.waitForFunction((w) => document.querySelector('#colorvision-filter feColorMatrix')?.getAttribute('values') === w, want, { timeout: 8000 });
    await sleep(200);
  };

  const newPage = async (url: string) => {
    const p = await ctx.newPage();
    p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && consoleErrors.push(`${url}: ${m.text()}`));
    p.on('pageerror', (e) => consoleErrors.push(`${url} pageerror: ${e.message}`));
    await p.goto(srv.url + url, { waitUntil: 'load' });
    return p;
  };

  const strong: Partial<Settings> = { enabled: true, profile: 'deuteranopia', strength: 1, mode: 'enhanced', auto: true, sites: {}, processVideo: false };

  // ---------------------------------------------------------------- 1. Pixel conformance on every fixture
  const pages = ['news', 'shop', 'social', 'education', 'charts', 'dark', 'complex'];
  for (const name of pages) {
    await setSettings({ ...strong, enabled: false });
    const page = await newPage(`/${name}.html`);
    await sleep(250);
    const pts = await probePoints(page);
    const xy = pts.map((p) => [p.x, p.y] as [number, number]);
    const base = await page.screenshot();
    const baseRgb = await sample(base, xy);
    await setSettings({ ...strong });
    await waitApplied(page, true);
    await sleep(300);
    const corr = await page.screenshot();
    const corrRgb = await sample(corr, xy);
    const M = correctionMatrix(params(current));
    let worst = 0;
    let changed = 0;
    let worstName = '';
    pts.forEach((p, i) => {
      const d = maxDiff(corrRgb[i], expectedPixel(baseRgb[i], M));
      if (d > worst) { worst = d; worstName = p.name; }
      if (maxDiff(corrRgb[i], baseRgb[i]) > 8) changed++;
    });
    record(`pixels match engine matrix: ${name}`, worst <= 4 && pts.length > 0, `${pts.length} samples, worst diff ${worst} (${worstName}), ${changed} visibly shifted`);
    fs.writeFileSync(path.join(SHOTS, `${name}-original.png`), base);
    fs.writeFileSync(path.join(SHOTS, `${name}-corrected.png`), corr);

    await setSettings({ enabled: false });
    await waitApplied(page, false);
    await sleep(250);
    const off = await sample(await page.screenshot(), xy);
    let restoredWorst = 0;
    off.forEach((c, i) => (restoredWorst = Math.max(restoredWorst, maxDiff(c, baseRgb[i]))));
    record(`disable restores original pixels exactly: ${name}`, restoredWorst <= 1, `worst diff ${restoredWorst}`);
    await page.close();
  }

  // ---------------------------------------------------------------- 2. All six profiles x both modes on the chart page
  {
    const page = await newPage('/charts.html');
    await setSettings({ ...strong, enabled: false });
    await sleep(200);
    const pts = await probePoints(page);
    const xy = pts.map((p) => [p.x, p.y] as [number, number]);
    const baseRgb = await sample(await page.screenshot(), xy);
    let worstAll = 0;
    const detail: string[] = [];
    for (const prof of PROFILES) {
      for (const mode of ['natural', 'enhanced'] as CorrectionMode[]) {
        await setSettings({ ...strong, profile: prof.id as ProfileId, mode, strength: 0.7, enabled: true });
        await waitMatrix(page);
        const rgb = await sample(await page.screenshot(), xy);
        const M = correctionMatrix(params(current));
        let w = 0;
        rgb.forEach((c, i) => (w = Math.max(w, maxDiff(c, expectedPixel(baseRgb[i], M)))));
        if (w > 4) detail.push(`${prof.id}/${mode}:${w}`);
        worstAll = Math.max(worstAll, w);
      }
    }
    record('all 6 profiles x 2 modes: pixels match engine (charts page)', worstAll <= 4, `worst diff ${worstAll} ${detail.join(' ')}`);
    await page.close();
  }

  // ---------------------------------------------------------------- 3. Reversible and idempotent
  {
    await setSettings({ ...strong, enabled: false });
    const page = await newPage('/news.html');
    let ok = true;
    let note = '';
    for (let i = 0; i < 6; i++) {
      await setSettings({ enabled: true, strength: 0.3 + (i % 3) * 0.2 });
      await waitApplied(page, true);
      await sleep(80);
      const counts = await page.evaluate(() => ({
        svg: document.querySelectorAll('#colorvision-svg').length,
        style: document.querySelectorAll('#colorvision-style').length,
        filters: document.querySelectorAll('filter').length,
      }));
      if (counts.svg !== 1 || counts.style !== 1 || counts.filters !== 2) { ok = false; note = JSON.stringify(counts); }
      await setSettings({ enabled: false });
      await waitApplied(page, false);
    }
    record('repeated toggling leaves exactly one filter set (no stacking) and clean removal', ok, note || '6 cycles');
    await setSettings({ ...strong, strength: 0.5 });
    await waitApplied(page, true);
    const vals = await page.evaluate(() => document.querySelector('#colorvision-filter feColorMatrix')!.getAttribute('values'));
    record('filter values equal engine output for current settings', vals === feColorMatrixValues(correctionMatrix(params(current))), vals ?? '');
    const inlineStyle = await page.evaluate(() => document.documentElement.getAttribute('style'));
    record('page <html> inline style is never modified', inlineStyle === null, String(inlineStyle));
    await setSettings({ enabled: false });
    await waitApplied(page, false);
    const leftover = await page.evaluate(() => document.documentElement.outerHTML.includes('colorvision'));
    record('no ColorVision traces remain in DOM after disable', !leftover);
    await page.close();
  }

  // ---------------------------------------------------------------- 4. Layout & behaviour not broken
  {
    await setSettings({ ...strong, enabled: false });
    const page = await newPage('/complex.html');
    await sleep(200);
    const layout = () =>
      page.evaluate(() => {
        const q = (s: string) => document.querySelector(s)!.getBoundingClientRect();
        const f = q('.fixed');
        return {
          fixedBottom: window.innerHeight - f.bottom,
          fixedRight: window.innerWidth - f.right,
          sticky: q('.sticky').top,
          scrollH: document.documentElement.scrollHeight,
          hostW: q('#host').width,
          btn: q('#btn').width,
        };
      });
    const before = await layout();
    await page.evaluate(() => window.scrollTo(0, 600));
    const stickyBefore = (await layout()).sticky;
    await page.evaluate(() => window.scrollTo(0, 0));
    await setSettings({ ...strong });
    await waitApplied(page, true);
    await sleep(250);
    const after = await layout();
    await page.evaluate(() => window.scrollTo(0, 600));
    await sleep(150);
    const afterScrolled = await layout();
    record('layout unchanged (fixed/sticky/scroll height/shadow host/button)', JSON.stringify(before) === JSON.stringify(after), `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
    record('position:fixed and sticky still track the viewport after scrolling', afterScrolled.fixedBottom === before.fixedBottom && afterScrolled.sticky === stickyBefore, `fixedBottom ${afterScrolled.fixedBottom}, sticky ${afterScrolled.sticky}`);
    const fixedPts = await probePoints(page);
    const fixedProbe = fixedPts.find((p) => p.name.startsWith('div#') && p.y > 600);
    if (fixedProbe) {
      const [px] = await sample(await page.screenshot(), [[fixedProbe.x, fixedProbe.y]]);
      const exp = expectedPixel([0xd6, 0x27, 0x28], correctionMatrix(params(current)));
      record('fixed-position element is colour-corrected at its scrolled position', maxDiff(px, exp) <= 4, `got ${px} expected ${exp}`);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(100);
    await page.click('#btn');
    await page.fill('#name', 'Grace Hopper');
    await page.selectOption('#sel', 'Two');
    const state = await page.evaluate(() => ({ title: document.title, name: (document.getElementById('name') as HTMLInputElement).value, sel: (document.getElementById('sel') as HTMLSelectElement).value }));
    record('buttons, text inputs and selects keep working', state.title === 'clicked 1' && state.name === 'Grace Hopper' && state.sel === 'Two', JSON.stringify(state));
    await page.hover('#hov');
    await sleep(500);
    const hoverBg = await page.evaluate(() => getComputedStyle(document.getElementById('hov')!).backgroundColor);
    record('CSS :hover transitions still fire', hoverBg === 'rgb(214, 39, 40)', hoverBg);
    const a1 = await page.evaluate(() => getComputedStyle(document.getElementById('anim')!).backgroundColor);
    await sleep(900);
    const a2 = await page.evaluate(() => getComputedStyle(document.getElementById('anim')!).backgroundColor);
    record('CSS animations still run', a1 !== a2, `${a1} -> ${a2}`);
    await page.close();
  }

  // ---------------------------------------------------------------- 5. Images, canvas, WebGL, video, iframes
  {
    await setSettings({ ...strong, enabled: false });
    const page = await newPage('/media.html');
    await page.waitForFunction(() => { const v = document.getElementById('vid') as HTMLVideoElement; return v.readyState >= 2 && v.currentTime > 0.3; }, undefined, { timeout: 10000 });
    await sleep(300);
    const pts = await probePoints(page);
    const names = pts.map((p) => p.name);
    const xy = pts.map((p) => [p.x, p.y] as [number, number]);
    const baseRgb = await sample(await page.screenshot(), xy);
    for (const processVideo of [false, true]) {
      await setSettings({ ...strong, processVideo });
      await waitApplied(page, true);
      await sleep(600);
      const rgb = await sample(await page.screenshot(), xy);
      const M = correctionMatrix(params(current));
      const groups: Record<string, number> = {};
      const videoRatios: number[] = [];
      rgb.forEach((c, i) => {
        const g = names[i].split('#')[0] + '#' + names[i].split('#')[1].split('@')[0];
        const isVideo = g.startsWith('video');
        if (isVideo && !processVideo) {
          const correctedShift = maxDiff(expectedPixel(baseRgb[i], M), baseRgb[i]);
          const remaining = maxDiff(c, baseRgb[i]);
          videoRatios.push(correctedShift === 0 ? 0 : remaining / correctedShift);
          return;
        }
        groups[g] = Math.max(groups[g] ?? 0, maxDiff(c, expectedPixel(baseRgb[i], M)));
      });
      for (const [g, d] of Object.entries(groups)) {
        const kind = g.startsWith('video') ? 'video (processVideo=true)' : g.replace(/#.*/, '');
        record(`${kind} corrected`, d <= 4, `worst diff ${d} (tolerance 4)`);
      }
      if (!processVideo) {
        const worstRatio = Math.max(...videoRatios);
        record(
          'video (processVideo=false): partial reversal leaves video measurably closer to the original than a corrected image',
          worstRatio < 0.9,
          `remaining shift / full shift per sample: ${videoRatios.map((r) => r.toFixed(2)).join(', ')} (saturated colours cannot be fully restored; documented)`,
        );
      }
    }
    await page.close();
  }

  // ---------------------------------------------------------------- 6. Dynamic content & mutation safety
  {
    await setSettings({ ...strong });
    const page = await newPage('/dynamic.html');
    await waitApplied(page, true);
    await sleep(900);
    const late = await page.evaluate(() => {
      const e = document.querySelector<HTMLElement>('#late .sw')!;
      const r = e.getBoundingClientRect();
      return { x: r.left + 8, y: r.top + r.height / 2 };
    });
    const [px] = await sample(await page.screenshot(), [[late.x, late.y]]);
    const exp = expectedPixel([0xd6, 0x27, 0x28], correctionMatrix(params(current)));
    record('content inserted after load is corrected (no per-node work)', maxDiff(px, exp) <= 4, `got ${px} expected ${exp}`);

    await page.evaluate(() => (window as any).startStress());
    await sleep(2500);
    const live = await page.evaluate(() => ({ svg: document.querySelectorAll('#colorvision-svg').length, rows: document.getElementById('list')!.children.length }));
    record('survives heavy DOM mutation with filter intact', live.svg === 1, `${live.rows} rows`);
    await page.evaluate(() => (window as any).stopStress());
    await page.close();
  }
  {
    // A hostile page that deletes our nodes whenever they appear: we must stop retrying, not loop forever.
    await setSettings({ ...strong });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      (window as any).__inserted = 0;
      const mo = new MutationObserver((muts) => {
        for (const m of muts) m.addedNodes.forEach((n) => {
          const el = n as Element;
          if (el.id === 'colorvision-svg') { (window as any).__inserted++; el.remove(); }
        });
      });
      mo.observe(document, { childList: true, subtree: true });
    });
    await page.goto(srv.url + '/news.html');
    await sleep(4500);
    const c1 = await page.evaluate(() => (window as any).__inserted as number);
    await sleep(2500);
    const c2 = await page.evaluate(() => (window as any).__inserted as number);
    record('hostile page removing the filter: bounded retries, no infinite mutation loop', c1 <= 25 && c2 === c1, `insertions ${c1} then ${c2}`);
    await page.close();
  }

  // ---------------------------------------------------------------- 7. Iframes are corrected exactly once
  {
    await setSettings({ ...strong, enabled: false });
    const page = await newPage('/complex.html');
    await sleep(200);
    const all = await probePoints(page);
    const fr = all.filter((p) => p.name.startsWith('iframe'));
    const xy = fr.map((p) => [p.x, p.y] as [number, number]);
    const baseRgb = await sample(await page.screenshot(), xy);
    await setSettings({ ...strong });
    await waitApplied(page, true);
    await sleep(300);
    const rgb = await sample(await page.screenshot(), xy);
    const M = correctionMatrix(params(current));
    const single = rgb.map((c, i) => maxDiff(c, expectedPixel(baseRgb[i], M)));
    const injected = await page.evaluate(() => { const d = (document.getElementById('fr') as HTMLIFrameElement).contentDocument; return !!d?.getElementById('colorvision-svg'); });
    record('iframe content is corrected exactly once (top frame only)', Math.max(...single) <= 4 && !injected, `diff ${single.join(',')}, injected into frame: ${injected}`);
    await page.close();
  }

  // ---------------------------------------------------------------- 8. Per-site rules / auto-off
  {
    await setSettings({ ...strong, auto: false, sites: {} });
    const page = await newPage('/news.html');
    await sleep(400);
    const idle = await page.evaluate(() => !!document.getElementById('colorvision-svg'));
    await setSettings({ sites: { '127.0.0.1': 'on' } });
    await waitApplied(page, true);
    await setSettings({ auto: true, sites: { '127.0.0.1': 'off' } });
    await waitApplied(page, false);
    record('automatic off / per-site on / per-site off rules', idle === false, 'auto-off idle, site-on applies, site-off removes');
    await page.close();
  }

  // ---------------------------------------------------------------- 9. Popup UI end to end
  {
    await setSettings({ ...DEFAULT_SETTINGS, enabled: true, profile: 'deuteranopia', strength: 0.8, mode: 'natural', sites: {} });
    const page = await newPage('/news.html');
    await waitApplied(page, true);
    const popup = await ctx.newPage();
    popup.on('console', (m) => m.type() === 'error' && consoleErrors.push(`popup: ${m.text()}`));
    popup.on('pageerror', (e) => consoleErrors.push(`popup pageerror: ${e.message}`));
    await popup.setViewportSize({ width: 380, height: 900 });
    await popup.goto(`chrome-extension://${extId}/popup.html`);
    await page.bringToFront();
    await sleep(300);
    await setSettings({ strength: 0.8 });
    await popup.waitForSelector('.status', { timeout: 5000 });
    await popup.waitForFunction(() => /Active on this site/.test(document.querySelector('.status')?.textContent ?? ''), undefined, { timeout: 6000 }).catch(() => undefined);
    const statusText = await popup.locator('.status').innerText();
    record('popup shows active-site status for the focused tab', /Active on this site/.test(statusText), statusText.replace(/\n/g, ' | '));
    await popup.screenshot({ path: path.join(SHOTS, 'popup.png'), fullPage: true });

    await popup.getByRole('radio', { name: /Protanopia/ }).click();
    await sleep(300);
    const prof = await ctl.evaluate(async () => (await chrome.storage.local.get('settings')).settings.profile);
    record('selecting a profile in the popup persists to chrome.storage.local', prof === 'protanopia', String(prof));
    const slider = popup.getByRole('slider', { name: 'Correction intensity' });
    await slider.focus();
    await popup.keyboard.press('End');
    await sleep(300);
    const strength = await ctl.evaluate(async () => (await chrome.storage.local.get('settings')).settings.strength);
    record('intensity slider is keyboard operable and persists', strength === 1, String(strength));
    const valsAfter = await page.evaluate(() => document.querySelector('#colorvision-filter feColorMatrix')!.getAttribute('values'));
    current = { ...current, profile: 'protanopia', strength: 1 };
    record('popup change reaches the open page immediately', valsAfter === feColorMatrixValues(correctionMatrix(params(current))), 'filter updated live');

    await popup.getByRole('switch', { name: 'Enable color correction' }).click();
    await waitApplied(page, false);
    record('popup master switch removes correction from the page immediately', true);
    await popup.getByRole('switch', { name: 'Enable color correction' }).click();
    await waitApplied(page, true);
    await popup.getByRole('button', { name: 'Reset settings' }).click();
    await sleep(300);
    const reset = await ctl.evaluate(async () => (await chrome.storage.local.get('settings')).settings);
    record('reset restores defaults (correction off)', reset.enabled === false && reset.profile === 'deuteranomaly', JSON.stringify({ enabled: reset.enabled, profile: reset.profile }));
    current = { ...DEFAULT_SETTINGS, sites: {} };
    await popup.close();
    await page.close();
  }

  // ---------------------------------------------------------------- 10. Calibration flow end to end
  {
    await setSettings({ ...DEFAULT_SETTINGS, profile: 'deuteranomaly', sites: {} });
    const cal = await ctx.newPage();
    cal.on('console', (m) => m.type() === 'error' && consoleErrors.push(`calibration: ${m.text()}`));
    cal.on('pageerror', (e) => consoleErrors.push(`calibration pageerror: ${e.message}`));
    await cal.setViewportSize({ width: 900, height: 800 });
    await cal.goto(`chrome-extension://${extId}/calibration.html`);
    await cal.getByRole('button', { name: 'Start' }).click();
    await cal.getByRole('radio', { name: 'Box 3' }).click();
    await cal.screenshot({ path: path.join(SHOTS, 'calibration-threshold.png') });
    await cal.getByRole('button', { name: 'Continue' }).click();
    for (let i = 0; i < 6; i++) {
      if (i === 0) await cal.screenshot({ path: path.join(SHOTS, 'calibration-compare.png') });
      await cal.getByRole('button', { name: 'Right is easier' }).click();
    }
    await cal.getByRole('button', { name: 'Left is easier' }).click();
    await cal.screenshot({ path: path.join(SHOTS, 'calibration-result.png') });
    await cal.getByRole('button', { name: 'Save and apply' }).click();
    await sleep(300);
    const saved = await ctl.evaluate(async () => (await chrome.storage.local.get('settings')).settings);
    const cal0 = saved.calibration;
    record(
      'calibration flow saves personalised parameters locally',
      !!cal0 && cal0.family === 'deutan' && cal0.severity > 0 && cal0.severity <= 1 && saved.strength === cal0.strength && saved.enabled === true,
      JSON.stringify(cal0),
    );
    await cal.close();
  }

  // ---------------------------------------------------------------- 11. Performance
  {
    const measure = async (enabled: boolean) => {
      await setSettings({ ...strong, enabled });
      const page = await newPage('/dynamic.html');
      if (enabled) await waitApplied(page, true);
      await sleep(500);
      const r = await page.evaluate(async () => {
        const frames: number[] = [];
        let long = 0;
        const po = new PerformanceObserver((l) => { long += l.getEntries().length; });
        try { po.observe({ entryTypes: ['longtask'] }); } catch { /* ignore */ }
        (window as any).startStress();
        let last = performance.now();
        const end = last + 3000;
        let y = 0;
        await new Promise<void>((resolve) => {
          const tick = (t: number) => {
            frames.push(t - last);
            last = t;
            y += 40;
            window.scrollTo(0, y % 15000);
            if (t < end) requestAnimationFrame(tick); else resolve();
          };
          requestAnimationFrame(tick);
        });
        (window as any).stopStress();
        frames.sort((a, b) => a - b);
        return { median: frames[Math.floor(frames.length / 2)], p95: frames[Math.floor(frames.length * 0.95)], n: frames.length, long };
      });
      await page.close();
      return r;
    };
    const off = await measure(false);
    const on = await measure(true);
    const perf = { off, on };
    fs.writeFileSync(path.join(ROOT, 'docs', 'perf-results.json'), JSON.stringify(perf, null, 2));
    record('performance sample recorded (scroll + 300 DOM inserts/s, headless software rendering)', true, `frame median off ${off.median.toFixed(1)}ms vs on ${on.median.toFixed(1)}ms; p95 off ${off.p95.toFixed(1)} vs on ${on.p95.toFixed(1)}; long tasks off ${off.long} vs on ${on.long}`);
  }

  // ---------------------------------------------------------------- 12. Privacy / network
  record('no network requests leave the machine (only the local fixture server)', extRequests.length === 0, extRequests.slice(0, 5).join(', '));
  const manifest = JSON.parse(fs.readFileSync(path.join(DIST, 'manifest.json'), 'utf8'));
  record('manifest API permissions are only [storage]; no host_permissions, tabs or activeTab (all-sites access comes from the content-script match)', JSON.stringify(manifest.permissions) === '["storage"]' && !manifest.host_permissions, JSON.stringify(manifest.permissions));
  record('no console errors on extension pages or fixtures', consoleErrors.length === 0, consoleErrors.slice(0, 5).join(' || '));

  // ---------------------------------------------------------------- 13. Before/after comparison sheets
  for (const name of ['news', 'shop', 'charts', 'social']) {
    const orig = fs.readFileSync(path.join(SHOTS, `${name}-original.png`)).toString('base64');
    const corr = fs.readFileSync(path.join(SHOTS, `${name}-corrected.png`)).toString('base64');
    const profile = 'deuteranopia' as ProfileId;
    const sim = feColorMatrixValues(simulationMatrix(getProfile(profile).family, effectiveSeverity(profile)));
    const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#111;color:#fff;font:14px system-ui}
      .g{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:10px;width:1400px}
      figure{margin:0}figcaption{padding:4px 0}img{width:100%;display:block}</style>
      <svg width="0" height="0"><filter id="sim" color-interpolation-filters="linearRGB"><feColorMatrix type="matrix" values="${sim}"/></filter></svg>
      <div class="g">
       <figure><figcaption>Original</figcaption><img src="data:image/png;base64,${orig}"></figure>
       <figure><figcaption>Corrected (deuteranopia, enhanced, 100%)</figcaption><img src="data:image/png;base64,${corr}"></figure>
       <figure><figcaption>Original, simulated deuteranopia (model, not real vision)</figcaption><img style="filter:url(#sim)" src="data:image/png;base64,${orig}"></figure>
       <figure><figcaption>Corrected, simulated deuteranopia (model, not real vision)</figcaption><img style="filter:url(#sim)" src="data:image/png;base64,${corr}"></figure>
      </div>`;
    const sheet = await ctx.newPage();
    await sheet.setViewportSize({ width: 1420, height: 900 });
    await sheet.setContent(html);
    await sleep(300);
    await sheet.screenshot({ path: path.join(SHOTS, `compare-${name}.png`), fullPage: true });
    await sheet.close();
  }

  await ctx.close();
  srv.close();
  fs.writeFileSync(path.join(ROOT, 'docs', 'e2e-results.json'), JSON.stringify({ date: new Date().toISOString(), results }, null, 2));
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
