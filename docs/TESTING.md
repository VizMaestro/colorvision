# Testing: what was verified, how, and what was not

Run on 2026-11-18, macOS (Apple silicon), Node 22, **Chrome for Testing 156.0.8078.4** (headless, extension loaded with `--load-extension`).

## 1. Unit tests: 56 passing (`npm test`)

| Area | What is asserted |
| --- | --- |
| Color math | sRGB↔linear and linear↔OKLab round-trips; white is L=1, a=b=0. |
| Simulation | **All 297 numbers of the Machado 2009 severity tables re-parsed from a saved copy of the authors' page and compared with the engine's table** (`tests/machado-reference.test.ts`); interpolation hits the table at exact steps; greys fixed; protan/deutan matrices are rank 2 and the tritan matrix is not (documented); severity 0 = identity, 1 = published matrix; agreement with the independent Viénot 1999 model (constants match libDaltonLens; measured mean ΔE_OK 0.034 / 0.027); the confusion axes agree (|cos| > 0.99) with independent Hunt-Pointer-Estevez cone-isolating directions. |
| Correction | Strength 0 is exactly identity; neutral greys unchanged; luminance preserved (every profile, mode, method); colors that differ only along the intact axis untouched; invertible; severity ignored for dichromacy and clamped for anomalies; strength is monotone. **Evaluation:** across 300 seeded random in-gamut confusion pairs per profile, axis projection separates simulated colors by ≥ 1.3× more than the Fidaner-style baseline, and ≥ 1.5× over "no correction" for anomalous profiles (table in `ALGORITHMS.md`). |
| Calibration | Ladder pairs are in gamut and ordered; each level is visible to a typical observer; a simulated observer's severity is recovered within one ladder step and monotonically; a simulated preference observer picks high strength; ties resolve to the weakest strength. |
| Settings | Garbage, out-of-range and mistyped storage values are sanitised; per-site/auto/master-switch decision table; correction is off by default. |
| Image pipeline | Identity preserves 8-bit values and alpha; CPU path equals the engine on test colors; greys fixed; source not mutated. |
| DOM corrector (jsdom) | Exactly one filter set; re-apply replaces rather than stacks; video inverse only when requested; page inline style never touched; re-attach after removal; gives up after repeated hostile removal. |

## 2. End-to-end in real Chromium: 50/50 passing (`npm run e2e`)

Run against `dist/` and again against the **unzipped release artifact** (`CV_DIST`). For each fixture page the screenshot pixel is compared with the engine's prediction `M(baseline pixel)`; tolerance ±4 per channel (measured worst: 3).

* **Fixture sites** (served from localhost; `e2e/fixtures/`): news, shopping, social, education, charts (SVG + canvas), dark UI, complex CSS (gradients, conic gradient, blend modes, backdrop-filter, transforms, sticky/fixed, shadow DOM, iframe, animation, hover, form controls), dynamic content, media (image, 2D canvas, WebGL, video).
* **Pixels match the engine** on every fixture (worst diff 0-3); **disabling restores original pixels exactly** (diff 0).
* All 6 profiles × 2 modes at 70 % on the chart page: worst diff 1.
* **Not broken:** layout metrics identical with/without correction; `position:fixed` and `sticky` still track the viewport and are corrected at their scrolled position; click/typing/select work; `:hover` transitions fire; CSS animations run.
* **Media:** images, 2D canvas and WebGL are corrected exactly; video corrected exactly when "Correct video" is on; with it off, video is measurably closer to the original (remaining shift 78 % for saturated red, 7 % for green at 100 % enhanced: **partial reversal only**).
* **Dynamic content:** late-inserted content is corrected with no per-node work; filter survives 300 DOM inserts/s.
* **Safety:** repeated toggling never stacks filters; filter values equal the engine's output; `<html>` inline style never modified; no traces after disable; a hostile page deleting our nodes causes bounded retries (21 insertions, then none); iframes corrected exactly once.
* **Popup/calibration through real UI interaction:** status shows "Active on this site"; profile persisted; slider keyboard-operable; popup changes reach the open page live; master switch removes correction immediately; reset restores defaults; the full calibration flow saves personalised parameters.
* **Privacy:** zero network requests other than the local fixture server (including from extension pages and the service worker); manifest requests only the `storage` API permission (Chrome still reports all-sites access via the content-script match, see ARCHITECTURE.md); zero console errors on extension pages and fixtures.

## 2b. Accessibility: 19/19 (`npm run e2e:a11y`, `docs/a11y-results.json`)

* **axe-core** (tags wcag2a, wcag2aa, wcag21a, wcag21aa, best-practice): **0 violations** on the popup (also with the simulation preview on) and on every calibration step (intro, threshold, comparison, natural-vs-enhanced, result), each in **light and dark** schemes.
* Popup at Chrome's **600 px maximum popup height** (`docs/screenshots/popup-600.png`): master switch, status, profile and intensity are in the first screen; the rest scrolls (content is about 1014 px tall).
* **Keyboard only** (Tab, Space, Enter, no pointer): the whole calibration flow completes and saves. All 15 popup tab stops show a focus outline of at least 2 px.
* Closing the popup immediately after a switch change or a slider change does not lose the change (discrete changes write immediately; slider writes are flushed on release/blur/pagehide).
* axe cannot judge everything. **Not done:** manual screen-reader testing (VoiceOver/NVDA/JAWS), forced-colors mode, 200 % zoom/text-size checks. Radio-style groups are individually tabbable buttons (no arrow-key roving).

## 3. Real websites: 12/12 PASS (`npm run e2e:sites`, `docs/real-sites.json`)

Live sites move by themselves, so checks are differential (layout before/after the toggle, JS error rate with correction off vs on, and only pixels that were stable across consecutive screenshots are compared against the engine). Pass = filter applied, layout identical around both toggles, no extra JS errors, nodes removed cleanly, ≥ 90 % of stable pixels match the prediction.

| Category | Site | Stable px that match engine | Visibly shifted | Layout | JS errors off/on |
| --- | --- | --- | --- | --- | --- |
| News | bbc.com/news | 91.5 % | 6 % | same | 0/0 |
| News | news.ycombinator.com | 100 % | 2 % | same | 0/0 |
| Shopping | walmart.com | 100 % | 44 % | same | 0/0 |
| Shopping | ebay.com (first attempt 403, retried) | 97.4 % | 16 % | same | 0/0 |
| Social | mastodon.social | 100 % | 12 % | same | 0/0 |
| Social | old.reddit.com | 100 % | 0 % | same | 0/0 |
| Educational | en.wikipedia.org (Color blindness) | 100 % | 5 % | same | 0/0 |
| Educational SPA | khanacademy.org | 100 % | 4 % | same | 0/0 |
| Charts (canvas) | chartjs.org bar chart | 100 % | 10 % | same | 0/0 |
| Charts (SVG) | d3-graph-gallery.com | 100 % | 4 % | same | 0/0 |
| Dark interface / complex CSS | github.com (dark scheme) | 99.9 % | 2 % | same | 0/0 |
| Dark interface | en.wikipedia.org/wiki/Rainbow (dark scheme) | 100 % | 9 % | same | 0/0 |

The BBC's 91.5 % reflects pixels that changed between our "stable" screenshots (carousel/ads), not a failure of the filter; it is the only site under 97 %.

## 4. Performance (`docs/perf-uncapped.json`, `docs/perf-results.json`)

Headless Chromium on a CPU rasteriser, vsync and frame cap disabled, median of 3. Absolute numbers do not represent a user's GPU; the on/off ratio is the signal.

| Page | fps off | fps on | on/off |
| --- | --- | --- | --- |
| Small static page | 58 | 58 | 1.00 |
| Wikipedia long article | 7541 | 7353 | 0.98 |
| 20,000 px page + 300 DOM inserts/s | 13737 | 10961 | 0.80 |
| GitHub home | 1216 | 876 | 0.72 |
| CSS-heavy page with a constant animation | 25860 | 622 | 0.02 |

The filter is not free: a page that repaints every frame pays the filter every frame (last row), but remains an order of magnitude above 60 fps here. The vsync-capped run (3 s scroll + 300 DOM inserts/s) showed median and p95 frame times of 16.7 ms off and on, with no long tasks. There is no per-node work, no continuous scanning and no processing of unchanged content: the only per-change work is when settings change. Verify on target hardware (4K/retina, integrated GPUs) before relying on this.

## 5. Not done / not claimed

* **No testing with people who have diagnosed color vision deficiency.** This is the most important gap. Suggested protocol (requires informed consent, and ethics/IRB review if run as research): recruit participants with documented CVD (e.g. anomaloscope or clinical Ishihara/HRR/FM100), within-subject comparison of off / natural / enhanced / calibrated on (a) Ishihara-style plates *not* processed by the extension, (b) chart-reading tasks (identify the series named in a legend), (c) UI-state tasks (red/green status), measuring accuracy, time and subjective comfort; record no personal data beyond what the study needs.
* Windows/Linux, Edge/Brave, **Chrome stable channel (everything above ran in Chrome for Testing 156; the extension has not yet been loaded in a branded Chrome)**, screen readers, forced-colors mode, HDR/wide-gamut displays.
* The Alt+Shift+C shortcut (headless Chrome cannot trigger extension commands).
* The Chrome Web Store review itself.
* Visual regression across many versions of live sites (they change; `docs/real-sites.json` is a dated snapshot).

## 6. Before/after visual comparisons

`docs/screenshots/compare-{news,shop,charts,social}.png`: four panels each: original, corrected, original simulated for deuteranopia, corrected simulated for deuteranopia (simulated panels are a *model*, labelled as such). Per-fixture and per-site originals/corrected shots are alongside (`<name>-original.png`, `<name>-corrected.png`, `site-*`), plus `popup.png` and the calibration screens.
