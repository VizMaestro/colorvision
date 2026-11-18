# ColorVision

A Chrome extension (Manifest V3, TypeScript, React) that makes colors easier to tell apart for people with color vision deficiency. It does this with a scientifically informed, personalised color transform and not with a stock CSS filter.

> ColorVision improves color **distinguishability**. It does not restore normal color vision, is not a medical device, and cannot diagnose anything. It has **not yet been tested with people who have diagnosed color vision deficiency**; see `docs/TESTING.md`.

## What it does

* Profiles: protanomaly, protanopia, deuteranomaly, deuteranopia, tritanomaly, tritanopia.
* Per-user intensity, Natural/Enhanced modes, and a short **personal calibration** that tunes strength, mode and a relative severity.
* Luminance-preserving correction computed as one 3×3 matrix in linear light, validated against Machado (2009) and Viénot (1999) simulation models, applied to the whole page by the compositor, so it also covers images, charts, canvas, WebGL, video, shadow DOM and iframes, and is exactly reversible.
* Private: no network access, no tracking, no remote code (enforced by tests). Its only API permission is `storage`, but because it must recolor pages it runs as a content script on **all http/https sites**, which Chrome shows as *Site access: On all sites* (restrictable to "On click" / "On specific sites"). The code never reads page content.

## Quick start

```bash
npm install
npm run build
```

Open `chrome://extensions`, enable Developer mode, **Load unpacked**, choose `dist/`. Or unzip `release/colorvision-1.0.0.zip` and load that folder. Details: `docs/INSTALL.md`.

## Documentation

| Doc | Contents |
| --- | --- |
| `docs/INSTALL.md` | Install, use, troubleshoot |
| `docs/ARCHITECTURE.md` | Design decisions, components, data flow, permissions |
| `docs/ALGORITHMS.md` | The mathematics, assumptions and the method evaluation |
| `docs/DEVELOPMENT.md` | Setup, scripts, how to change the math, release |
| `docs/TESTING.md` | What was tested and measured; what was not |
| `docs/KNOWN_LIMITATIONS.md` | Honest limits: science, technical, product |
| `docs/PRIVACY_POLICY.md` | Privacy policy draft |
| `docs/CHROME_WEB_STORE.md` | Step-by-step publishing guide and listing copy |

## Status

| Check | Result |
| --- | --- |
| `npm test` | 56 unit tests pass (incl. all 297 Machado table values vs the authors' published page) |
| `npm run e2e` (real Chromium, built extension, also run on the unzipped release zip) | 50/50 |
| `npm run e2e:a11y` (axe-core, light/dark, keyboard-only calibration, 600 px popup) | 19/19, 0 axe violations |
| `npm run e2e:sites` (12 live websites, differential checks) | 12/12 |
| `npm run package` | Validated 101 KB zip: MV3, `storage` API permission only (plus the all-sites content script), no remote code, no source maps |
| Real-user testing with diagnosed CVD | **Not done** |
| Loaded in a branded Chrome stable | **Not yet**: all tests ran in Chrome for Testing 156 |
| Chrome Web Store submission | **Not done** (needs your account; guide provided) |
