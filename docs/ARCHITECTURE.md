# Architecture (Phase 1 design, as built)

## Goal and the decision that shapes everything

Correct colors on arbitrary websites in real time, reversibly, without breaking the page, with no network, minimal permissions, and acceptable performance.

**Decision: one compositor-level color matrix on `<html>`, not per-element recoloring.**

| Option | Verdict |
| --- | --- |
| Walk the DOM and rewrite every `color`, `background`, gradient, SVG fill, border... | Cannot reach images, canvas, WebGL, video, CSS variables resolved late, shadow DOM or cross-origin iframes. Needs a MutationObserver over the whole subtree (loop and performance risk), must remember originals to undo, and double-transforms are easy to cause. |
| Per-image/canvas pixel processing | Cross-origin images taint canvas; CPU cost; still misses CSS colors. |
| **Single SVG `feColorMatrix` (linearRGB) referenced by `html{filter:url(#…)}`** | One 3×3 linear transform (our correction is linear) applied by the compositor to everything painted: CSS, gradients, SVG, images, canvas, WebGL, video, shadow DOM, iframes. Removal = delete two nodes. Cannot double-transform. No per-node work, so dynamic content needs no handling. |

Trade-offs of the chosen design are listed in `KNOWN_LIMITATIONS.md` (cannot exclude individual elements; a root filter has a rendering cost; the page's own `filter` on `<html>` is overridden).

## Components

```
src/
  engine/        pure math, no DOM, no chrome.*  (unit-tested)
    matrix.ts      3x3 helpers, inverse
    linear.ts      sRGB <-> linear, LUTs
    oklab.ts       OKLab + ΔE_OK
    profiles.ts    six profiles, families, defaults
    simulate.ts    Machado severity tables (interpolated), Viénot reference
    axes.ts        confusion axis, intact axis, confusion coordinate
    correction.ts  correction matrix (axis projection + Fidaner reference)
    svgFilter.ts   matrix -> feColorMatrix values
  analysis/      color analysis: simulated distance, confusable-pair analysis
  image/         CPU pixel pipeline (popup preview, tests), procedural preview scene
  settings/      schema + sanitiser (storage is untrusted), chrome.storage.local wrapper
  content/       corrector.ts (DOM side), index.ts (entry, top frame only)
  background/    service worker: keyboard shortcut only
  popup/         React popup (status, profile, intensity, mode, preview, toggles)
  calibration/   model.ts (pure), React page (threshold ladder + preference trials)
  testing/       simulated observer used by tests
e2e/             Playwright suites against the built extension in real Chromium
```

## Data flow

1. The popup/calibration page/shortcut writes `settings` to `chrome.storage.local` (the only persistence).
2. Every top-level http(s) page runs `content.js` at `document_start`. It loads settings, decides per host (`decideForHost`), builds the matrix with the same engine used everywhere else, and applies/removes the filter.
3. `chrome.storage.onChanged` updates every open page live, so the popup toggle is an immediate off switch.
4. The popup asks the content script for its *actual* state (`colorvision:status`) rather than guessing, so status is truthful and needs no `tabs` permission.

## Safe, reversible application

* Two nodes are added to `<html>`: a hidden `<svg>` (filters) and a `<style>` (one rule). Nothing else in the page is touched; `<html>`'s inline style is never modified (tested).
* Re-applying replaces, never stacks, those nodes (a bug caught by the e2e suite, covered by a unit test).
* A `MutationObserver` watches `document` and `<html>` for **child-list changes only (no subtree)**, debounced 60 ms, to re-attach the two nodes if a page removes them or replaces `<html>`. It is rate-limited (20 re-attaches / 10 s) and then **stops** and reports `blocked`, so a hostile or buggy page cannot create an infinite loop (tested).
* Top frame only: iframes are painted under the top document's filter; injecting into them too would correct their colors twice (tested).

## Video

Video is corrected by default. When "Correct video" is off, a best-effort *inverse* matrix filter is applied to `video` (low specificity, so a page's own video filter still wins). Because the inverse is clipped between filter stages, saturated colors cannot be fully restored: measured on a red/green test stream, the unsaturated channels are restored almost exactly but a saturated red keeps most of its blue shift (see `TESTING.md`). Exact exclusion of an element is not possible with a root-level filter.

## Permissions (all justified)

| Permission | Why |
| --- | --- |
| `storage` | Save your settings and calibration result locally. |
| content script on `http://*/*`, `https://*/*` | The correction has to run on the pages you browse. **This is all-sites access**: Chrome lists it under *Site access: On all sites* (verified in `chrome://extensions` details) and the Web Store install prompt will warn that the extension can "read and change all your data on all websites". The manifest has no `host_permissions` entry and no `tabs`, `activeTab`, `scripting` or `webRequest` permission, and the code never reads page content or makes network requests, but Chrome cannot distinguish that from the match pattern alone. Users can narrow it in the extension's details (*On click* or *On specific sites*); the popup then reports "not active" on pages where Chrome withholds access. |

`commands` (keyboard shortcut Alt+Shift+C) needs a service worker but no permission.

## Why not Web Workers / WebGL?

The heavy lifting is done by the browser's compositor (GPU where available) through the SVG filter, so there is no pixel loop to move to a worker. The only CPU pixel path is the 168×104 popup preview. The engine and `applyMatrixToPixels` are DOM-free, so a worker is a drop-in if a future feature (e.g. user-supplied image analysis) needs one. Adding one now would be unused code.
