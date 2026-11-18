# Development guide

## Requirements

Node 20+ (developed on 22), npm, Chrome/Chromium. The e2e suites use Playwright with a Chromium that supports `--load-extension` (Chrome for Testing). **Branded Chrome 137+ ignores `--load-extension`**, so e2e looks for a Chrome for Testing build in `~/Library/Caches/ms-playwright/chromium-*` (macOS) or uses `CHROME_PATH`.

```bash
npm install
npm run icons          # regenerate public/icons (pure Node, no deps)
npm run typecheck
npm test               # unit tests (Vitest): engine, calibration, settings, image, corrector (jsdom)
npm run build          # typecheck + vite build (popup/calibration/background) + vite build (content IIFE)
npm run e2e            # 50 checks in real Chromium with dist/ loaded
npm run e2e:a11y       # axe-core + keyboard-only + 600 px popup checks
npm run e2e:sites      # optional: real public websites (needs internet)
npm run e2e:perf       # optional: uncapped frame-rate benchmark, filter off vs on
npm run package        # build + validate + release/colorvision-<version>.zip
```

`CV_DIST=/path/to/unzipped npm run e2e` runs the e2e suite against any unpacked build, e.g. the unzipped release artifact.

During development: `npm run dev` rebuilds the popup/calibration/background on change. The content script has its own config, so after changing `src/content/**` run `npx vite build -c vite.content.config.ts`. Then press reload on the extension card in `chrome://extensions`.

## Layout

See `docs/ARCHITECTURE.md`. Rules of thumb:

* `src/engine/**` and `src/analysis/**` must stay free of DOM and `chrome.*` so they run in Node, tests, workers and the page.
* The **same engine** produces the page filter, the popup preview, the calibration swatches and the test expectations. Never re-implement the math elsewhere.
* Storage is untrusted input: always go through `sanitizeSettings`.
* The content script is built as a self-contained IIFE (content scripts cannot be ES modules); popup, calibration and the service worker are ES modules.

## Adding a profile or changing the math

1. Update `profiles.ts` / `simulate.ts` / `axes.ts` / `correction.ts`.
2. `npm test`: the property tests (identity at strength 0, grey and luminance preservation, increased simulated separation, comparison with the Fidaner reference) must stay green.
3. `npm run build && npm run e2e`: checks the browser filter still equals the engine matrix pixel for pixel on all profiles.
4. Update `docs/ALGORITHMS.md` (including the evaluation table).

## Releasing

1. Bump `version` in `public/manifest.json` and `package.json`.
2. `npm run package`: validates the manifest, rejects remote code/inline scripts/source maps/extra permissions, writes the zip.
3. `CV_DIST=<unzipped> npm run e2e` on the artifact you will upload.
4. Follow `docs/CHROME_WEB_STORE.md`.
