# Known limitations

Read this before relying on ColorVision or publishing it.

## Science and claims

* **It cannot restore normal color vision.** It re-encodes color differences you may not perceive into differences you can. Some colors will look different from how the author intended. That is the trade-off.
* **No real-user validation yet.** The algorithms are validated against published simulation models and by automated simulated observers. **No testing has been done with people who have diagnosed color vision deficiency.** Until that happens (with informed consent and ethics review where applicable), effectiveness for real people is unproven. See `TESTING.md` for a protocol.
* **The evaluation of the correction method is circular**: the metric and the method share one simulation model (see `ALGORITHMS.md`).
* **Severity is Machado's model parameter** (cone-peak shift, 0 to 1), interpolated between their tabulated steps. It is not a clinical measure and calibration is not a diagnostic test; our calibration estimate is relative to this model.
* **Tritan support is the weakest.** Machado's tritan matrix is not rank-2 and there is little literature on tritan daltonization. Treat the tritan profiles as experimental.
* Individual variation is large (cone peak shifts, lens/macular pigment, screen differences). One matrix per profile will not fit everyone; that is why intensity and calibration exist.
* The model assumes an sRGB display. Wide-gamut or color-managed displays, night-shift/True-Tone and HDR content change what you see.

## Technical

* **Root filter, not per-element recoloring** (deliberate, see `ARCHITECTURE.md`). Consequences:
  * You cannot exclude individual elements. Video exclusion is only a **partial, approximate reversal**: measured on a saturated red test stream, about 78 % of the red's shift remained while the green's was almost fully restored. Treat the toggle as "less shift on video", not "off".
  * Anything with a `filter` on `<html>` of its own is overridden while correction is on.
  * Colors pushed outside the sRGB gamut are clipped by the browser.
* **Performance.** Compositing a full-page filter costs rendering time that grows with viewport size and page complexity. In our uncapped headless benchmark (CPU rasteriser, not a typical GPU) the frame rate with correction on, relative to off, was 1.00x (small static page), 0.98x (Wikipedia article), 0.80x (20,000 px page with 300 DOM inserts/s), 0.72x (GitHub home), and 0.02x on a CSS-heavy page with a constant animation (still about 620 fps there, far above the 60 fps needed). Very large monitors, 4K/retina scaling or low-end GPUs may feel more cost than we measured; the instant off switch is there for that case.
* **A brief flash of uncorrected content** can appear before the content script has read your settings, on slow starts.
* **Pages where it cannot run:** `chrome://`, Chrome Web Store, built-in PDF viewer, `file://`, other extensions' pages, and tabs opened before install until reloaded. Incognito requires enabling the extension there.
* **Hostile pages**: if a page keeps deleting the filter, ColorVision stops retrying after 20 attempts per 10 s and shows a warning in the popup.
* **Canvas/WebGL/video** are corrected as final pixels (tested for 2D canvas, WebGL clear color, images, video). Content that is itself color-managed or uses HDR may differ.
* **The Alt+Shift+C shortcut** is implemented but was not exercised by the automated tests (headless Chrome cannot trigger extension commands). Verify it manually.
* **Not tested**: manual screen-reader use (axe-core passes, which is not the same), Windows/Linux, Chrome stable (tests ran in Chrome for Testing 156 on macOS (Apple silicon)), Edge/Brave, screen readers, high-contrast / forced-colors modes, very old Chrome versions (manifest requires 110+).
* Real-website runs depend on the live sites at the time; sites change and some block automation. Results are in `docs/real-sites.json`.

## Product

* English only. No telemetry means no way for us to learn about problems unless you report them.
* Per-site settings are stored by host name only; no wildcard or path rules.
