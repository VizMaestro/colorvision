/**
 * Accessibility checks on the extension's own pages (popup, calibration):
 *  - axe-core (WCAG 2.x A/AA + best-practice rules) in light and dark colour schemes, in every calibration step
 *  - popup at Chrome's 600 px maximum popup height: primary controls reachable (page scrolls), screenshot
 *  - keyboard-only walk through the whole calibration flow (no pointer)
 *  - every tab stop in the popup shows a visible focus indicator
 * Output: docs/a11y-results.json and docs/screenshots/popup-600.png
 */
import { chromium, type Page } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = process.cwd();
const DIST = process.env.CV_DIST ?? path.join(ROOT, 'dist');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const axeSource = fs.readFileSync(createRequire(path.join(ROOT, 'package.json')).resolve('axe-core/axe.min.js'), 'utf8');

function findChrome(): string {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  for (const d of fs.readdirSync(base).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse()) {
    const p = path.join(base, d, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
    if (fs.existsSync(p)) return p;
  }
  throw new Error('No Chromium found');
}

type Row = { name: string; pass: boolean; detail: string };
const rows: Row[] = [];
const rec = (name: string, pass: boolean, detail = '') => {
  rows.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -  ' + detail : ''}`);
};

async function axe(page: Page, label: string) {
  await page.evaluate(axeSource);
  const res = await page.evaluate(async () => {
    // @ts-expect-error axe is injected
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] } });
    return r.violations.map((v: any) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map((n: any) => n.target.join(' ') + ' :: ' + (n.failureSummary || '').split('\n').slice(1, 3).join(' ')) }));
  });
  rec(`axe: ${label}`, res.length === 0, res.length ? JSON.stringify(res) : '0 violations');
}

async function tabTo(page: Page, match: (el: { text: string; label: string; role: string }) => boolean, max = 60): Promise<boolean> {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const e = document.activeElement as HTMLElement | null;
      return { text: (e?.innerText || '').trim(), label: e?.getAttribute('aria-label') || '', role: e?.getAttribute('role') || e?.tagName.toLowerCase() || '' };
    });
    if (match(info)) return true;
  }
  return false;
}

async function main() {
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'cv-a11y-')), {
    executablePath: findChrome(),
    headless: true,
    viewport: { width: 380, height: 600 },
    deviceScaleFactor: 1,
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  let sw = ctx.serviceWorkers()[0];
  for (let i = 0; i < 60 && !sw; i++) { await sleep(250); sw = ctx.serviceWorkers()[0]; }
  const base = `chrome-extension://${new URL(sw.url()).host}`;

  // ---------------- popup: axe light/dark, 600 px height
  for (const scheme of ['light', 'dark'] as const) {
    const p = await ctx.newPage();
    await p.setViewportSize({ width: 380, height: 600 });
    await p.emulateMedia({ colorScheme: scheme });
    await p.goto(`${base}/popup.html`);
    await p.waitForSelector('.status');
    await sleep(900);
    await axe(p, `popup (${scheme}, 600px tall)`);
    await p.getByLabel('Simulate my profile').check();
    await sleep(200);
    await axe(p, `popup with simulation preview (${scheme})`);
    if (scheme === 'light') {
      await p.getByLabel('Simulate my profile').uncheck();
      const m = await p.evaluate(() => ({
        scrollHeight: document.documentElement.scrollHeight,
        profileBottom: document.querySelector('#intensity')!.getBoundingClientRect().bottom,
        switchTop: document.querySelector('[role=switch]')!.getBoundingClientRect().top,
      }));
      rec('popup at 600 px: master switch, status, profile and intensity are in the first screen', m.profileBottom <= 600 && m.switchTop >= 0, JSON.stringify(m) + ' (content scrolls beyond 600 px, as Chrome popups do)');
      await p.screenshot({ path: path.join(ROOT, 'docs/screenshots/popup-600.png') });

      // Focus indicators: every tab stop must show a visible indicator.
      let bad: string[] = [];
      let stops = 0;
      await p.reload();
      await p.waitForSelector('.status');
      for (let i = 0; i < 30; i++) {
        await p.keyboard.press('Tab');
        const r = await p.evaluate(() => {
          const e = document.activeElement as HTMLElement;
          if (!e || e === document.body) return null;
          const cs = getComputedStyle(e);
          return { id: e.getAttribute('aria-label') || e.innerText.slice(0, 24) || e.tagName, outline: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2, tag: e.tagName };
        });
        if (!r) break;
        stops++;
        if (!r.outline) bad.push(r.id);
      }
      rec('popup: every keyboard tab stop has a visible focus outline (≥2px)', bad.length === 0 && stops >= 14, `${stops} tab stops${bad.length ? ', missing: ' + bad.join(', ') : ''}`);
    }
    await p.close();
  }

  // ---------------- calibration: axe in every step, light/dark
  for (const scheme of ['light', 'dark'] as const) {
    const p = await ctx.newPage();
    await p.setViewportSize({ width: 900, height: 800 });
    await p.emulateMedia({ colorScheme: scheme });
    await p.goto(`${base}/calibration.html`);
    await axe(p, `calibration intro (${scheme})`);
    await p.getByRole('button', { name: 'Start' }).click();
    await p.getByRole('radio', { name: 'Box 3' }).click();
    await axe(p, `calibration threshold (${scheme})`);
    await p.getByRole('button', { name: 'Continue' }).click();
    await axe(p, `calibration comparison (${scheme})`);
    for (let i = 0; i < 6; i++) await p.getByRole('button', { name: 'Left is easier' }).click();
    await axe(p, `calibration natural-vs-enhanced (${scheme})`);
    await p.getByRole('button', { name: 'Right is easier' }).click();
    await axe(p, `calibration result (${scheme})`);
    await p.close();
  }

  // ---------------- calibration: keyboard only
  {
    const ctl = await ctx.newPage();
    await ctl.goto(`${base}/popup.html`);
    await ctl.evaluate(() => chrome.storage.local.remove('settings'));
    const p = await ctx.newPage();
    await p.setViewportSize({ width: 900, height: 800 });
    await p.goto(`${base}/calibration.html`);
    let ok = true;
    let where = '';
    const step = async (label: string, match: Parameters<typeof tabTo>[1], key: string) => {
      if (!ok) return;
      if (!(await tabTo(p, match))) { ok = false; where = `could not reach: ${label}`; return; }
      await p.keyboard.press(key);
      await sleep(80);
    };
    await step('Start', (i) => i.text === 'Start', 'Enter');
    await step('Box 3', (i) => i.role === 'radio' && /^3\b/.test(i.text), 'Space');
    await step('Continue', (i) => i.text === 'Continue', 'Enter');
    for (let n = 0; n < 6; n++) await step(`trial ${n + 1}: Right is easier`, (i) => i.text === 'Right is easier', 'Enter');
    await step('mode: Left is easier', (i) => i.text === 'Left is easier', 'Enter');
    await step('Save and apply', (i) => i.text === 'Save and apply', 'Enter');
    await sleep(300);
    const saved = await ctl.evaluate(async () => (await chrome.storage.local.get('settings')).settings?.calibration ?? null);
    rec('calibration: complete flow with keyboard only (Tab, Space, Enter), result saved', ok && !!saved, ok ? JSON.stringify(saved) : where);
    await p.close();
    await ctl.close();
  }

  // ---------------- popup: keyboard-only toggle of master switch persists immediately even if the popup closes at once
  {
    const ctl = await ctx.newPage();
    await ctl.goto(`${base}/popup.html`);
    await ctl.evaluate(() => chrome.storage.local.set({ settings: { version: 1, enabled: false, profile: 'deuteranomaly', strength: 0.6, mode: 'natural', auto: true, sites: {}, processVideo: true, calibration: null } }));
    const p = await ctx.newPage();
    await p.goto(`${base}/popup.html`);
    await p.waitForSelector('.status');
    await p.getByRole('switch', { name: 'Enable color correction' }).click();
    await p.close();
    await sleep(300);
    const enabled = await ctl.evaluate(async () => (await chrome.storage.local.get('settings')).settings.enabled);
    rec('closing the popup immediately after a switch change does not lose the change', enabled === true, `enabled=${enabled}`);
    const q = await ctx.newPage();
    await q.goto(`${base}/popup.html`);
    await q.waitForSelector('.status');
    const slider = q.getByRole('slider', { name: 'Correction intensity' });
    await slider.focus();
    await q.keyboard.press('ArrowRight');
    await q.close();
    await sleep(300);
    const st = await ctl.evaluate(async () => (await chrome.storage.local.get('settings')).settings.strength);
    rec('closing the popup right after a slider change keeps the change (flush on pagehide)', Math.abs(st - 0.61) < 1e-9, `strength=${st}`);
    await ctl.close();
  }

  await ctx.close();
  fs.writeFileSync(path.join(ROOT, 'docs', 'a11y-results.json'), JSON.stringify({ date: new Date().toISOString(), axeVersion: 'axe-core (tags wcag2a, wcag2aa, wcag21a, wcag21aa, best-practice)', rows }, null, 2));
  const failed = rows.filter((r) => !r.pass);
  console.log(`\n${rows.length - failed.length}/${rows.length} passed`);
  process.exit(failed.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
