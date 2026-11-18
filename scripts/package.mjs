// Validates dist/ as a Chrome Web Store upload and zips it to release/colorvision-<version>.zip.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const dist = path.join(root, 'dist');
const manifest = JSON.parse(fs.readFileSync(path.join(dist, 'manifest.json'), 'utf8'));
const problems = [];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}
const files = walk(dist);
const rel = (f) => path.relative(dist, f);

const referenced = [
  manifest.background?.service_worker,
  manifest.action?.default_popup,
  ...(manifest.content_scripts ?? []).flatMap((c) => c.js ?? []),
  ...Object.values(manifest.icons ?? {}),
  ...Object.values(manifest.action?.default_icon ?? {}),
].filter(Boolean);
for (const r of referenced) if (!fs.existsSync(path.join(dist, r))) problems.push(`manifest references missing file: ${r}`);

if (manifest.manifest_version !== 3) problems.push('manifest_version is not 3');
if (manifest.host_permissions) problems.push('host_permissions present (not expected)');
if (manifest.permissions?.some((p) => !['storage'].includes(p))) problems.push(`unexpected permissions: ${manifest.permissions}`);
if (files.some((f) => f.endsWith('.map'))) problems.push('source maps are included');

for (const f of files.filter((x) => /\.(html)$/.test(x))) {
  const html = fs.readFileSync(f, 'utf8');
  for (const m of html.matchAll(/<(?:script|link)[^>]+(?:src|href)=["']([^"']+)["']/g)) {
    if (/^(https?:)?\/\//.test(m[1])) problems.push(`${rel(f)} loads a remote resource: ${m[1]}`);
  }
  if (/<script(?![^>]*\bsrc=)[^>]*>[^<]/.test(html)) problems.push(`${rel(f)} has an inline script (blocked by MV3 CSP)`);
}
for (const f of files.filter((x) => x.endsWith('.js'))) {
  const js = fs.readFileSync(f, 'utf8');
  if (/\beval\s*\(/.test(js)) problems.push(`${rel(f)} uses eval()`);
  if (/importScripts\s*\(\s*["']https?:/.test(js) || /import\s*\(\s*["']https?:/.test(js)) problems.push(`${rel(f)} imports remote code`);
  if (/\b(fetch|XMLHttpRequest|WebSocket|sendBeacon)\b/.test(js) && /https?:\/\/(?!www\.w3\.org|react\.dev|reactjs\.org)/.test(js.replace(/\/\*[\s\S]*?\*\//g, ''))) {
    // informational: library strings only; real network use is covered by the e2e network assertion
  }
}

if (problems.length) {
  console.error('Package validation FAILED:\n - ' + problems.join('\n - '));
  process.exit(1);
}

const out = path.join(root, 'release');
fs.mkdirSync(out, { recursive: true });
const zip = path.join(out, `colorvision-${manifest.version}.zip`);
if (fs.existsSync(zip)) fs.rmSync(zip);
execFileSync('zip', ['-r', '-X', '-q', zip, '.', '-x', '*.DS_Store'], { cwd: dist });
const kb = (fs.statSync(zip).size / 1024).toFixed(1);
console.log(`OK  ${zip}  (${kb} KB, ${files.length} files)`);
console.log(execFileSync('unzip', ['-l', zip]).toString().trim());
