# Algorithms, mathematics and assumptions

ColorVision changes how colors are *displayed* so that colors a person with a color vision deficiency (CVD) is likely to confuse end up further apart along an axis they can still see. **It does not restore normal color vision**, and a *simulation* below is only an approximate model of how colors may appear to someone with a given profile. Simulations are never used or described as a reconstruction of anyone's actual perception.

All color math runs in **linear-light sRGB** (the sRGB transfer function is removed first). Perceptual distances use **OKLab** (Ottosson 2020), where ΔE_OK ≈ 0.02 is commonly quoted as a just-noticeable difference.

## 1. Simulation (`src/engine/simulate.ts`)

| Item | Source | Notes |
| --- | --- | --- |
| Dichromacy and all severities (protan, deutan, tritan) | Machado, Oliveira & Fernandes (2009), Table 1: pre-computed matrices for severities 0.0 to 1.0 in steps of 0.1, sRGB | Linearly interpolated between steps, as the authors recommend. `src/engine/machadoTable.ts` was generated programmatically from the authors' page; `tests/machado-reference.test.ts` re-parses a saved copy of that page and checks all 297 numbers. Severity 1.0 = dichromacy; lower = anomalous trichromacy (their scale models a cone-peak shift of up to 20 nm). |
| Independent reference (protan, deutan) | Viénot, Brettel & Mollon (1999), values as published in libDaltonLens | Used only as a cross-check in tests. Measured ΔE_OK difference from Machado on a 12-color palette: mean 0.034 (protan) / 0.027 (deutan), max 0.105. The test bound is deliberately loose (< 0.08 mean) because the cone models differ. |

Severity is a model parameter. It is not a clinical measurement and not comparable to an anomaloscope result.

Known weak point: **Machado's tritan matrix is not rank-2** (det ≈ 0.24), so unlike protan/deutan it has no exact null direction. Tritan support is therefore the least well-founded part of the engine.

## 2. Confusion and intact axes (`src/engine/axes.ts`)

* **Confusion axis `v`**: a direction in linear RGB along which colors differ but a full dichromat of the family cannot tell them apart.
  * protan / deutan: the null vector of the Machado dichromat matrix (`S·v = 0`, cross product of two rows).
  * tritan: the S-cone isolating direction from Hunt-Pointer-Estevez LMS.
  * Cross-check (tested): the protan/deutan null axes agree (|cos| > 0.99) with the HPE L-cone / M-cone isolating directions.
* **Intact axis `d`**: a luminance-neutral direction the observer can still see: pure S-cone (blue-yellow) modulation for protan/deutan; L-M (red-green) modulation at constant luminance for tritan.
* **Confusion coordinate `w`**: covector with `w·v = 1`, `w·d = 0`, `w·white = 0`. It extracts how much of a color lies along `v`; neutral greys have coordinate 0.

## 3. Correction (`src/engine/correction.ts`)

Default method, **axis projection**:

```
M = I + κ · d wᵀ        κ = gain(mode) · strength · severityFactor
gain: natural 1.0, enhanced 2.0       severityFactor: 1 for dichromacy, s for anomalous
```

Colors that differ along `v` now also differ along `d`. Because `Y·d = 0` and `w·white = 0`, **brightness is preserved and greys are untouched** (verified by tests, before gamut clipping). Colors with zero confusion coordinate are unchanged. `M` is a single 3×3 matrix, invertible, and strength 0 gives the identity exactly.

Reference method, **"fidaner"** (kept for evaluation, not used by default): `M = I + g·k·Neutral(E·(I − S))`, a channel-transfer daltonization in the style of Fidaner, Lin & Ozguven (2005).

### Evaluation (reproducible: `tests/engine.test.ts`)

300 seeded random in-gamut color pairs per profile that differ only along the confusion axis (typical ΔE_OK = 0.06); mean simulated separation after correction at strength 100%, relative to before:

| Profile | natural / Fidaner | natural / axis | enhanced / Fidaner | enhanced / axis |
| --- | --- | --- | --- | --- |
| Protanomaly | 1.02× | 2.44× | 1.23× | 4.15× |
| Deuteranomaly | 1.56× | 2.80× | 2.26× | 4.68× |
| Tritanomaly | 0.95× | 1.59× | 0.86× | 2.20× |
| Tritanopia | 1.72× | 5.67× | 2.83× | 8.58× |

(Dichromat "before" distances are ≈ 0, so ratios are meaningless; the tests compare absolute distances instead.) The Fidaner-style transfer barely helps protanomaly and can reduce separation for tritanomaly: it removes signal the observer still has. Axis projection never removes that signal, which is why it is the default.

**Caveat on this evaluation:** it is circular in one respect, since both the metric and the method use the same simulation model. It shows the method does what it is designed to do under the model. It is not evidence about real perception. Only testing with people who have diagnosed CVD can show that (see `docs/TESTING.md`).

### Gamut clipping

`M` can map saturated colors outside the sRGB gamut. The browser clips each channel to [0,1], so extremely saturated colors lose a little of the intended shift. This is inherent to a display-side correction.

## 4. Applying the matrix (`src/content/corrector.ts`)

The 3×3 matrix is serialised into one SVG `feColorMatrix` (`color-interpolation-filters="linearRGB"`, alpha untouched) and applied to `<html>` with one stylesheet rule. See `docs/ARCHITECTURE.md` for why this is a root filter rather than per-element recoloring.

## 5. Calibration (`src/calibration/model.ts`)

*Stage 1, threshold (estimates a relative severity).* Seven color pairs per family, displaced along that family's confusion axis, ΔE_OK from 0.03 to 0.25. The user picks the first pair where two different colors are clearly visible. For each ladder level we find the largest severity at which the simulated observer can still distinguish the pair (threshold 0.03), and use the midpoint of the interval implied by the last "no" and the first "yes".

*Stage 2, preference (estimates strength and mode).* Six round-robin two-alternative comparisons between strengths 25/50/75/100% in natural mode; then natural vs enhanced at the winner. "No difference" scores nothing; ties go to the weaker setting.

Validation by simulation (tests): a simulated observer with known severity is recovered within one ladder step (and within 0.25 for protan/deutan at moderate-to-strong severity); a simulated observer who prefers larger perceived separation selects a high strength. These tests check the logic, **not** the clinical validity of the estimate. The severity value is not a clinical measurement and the calibration is not a diagnosis.

## 6. Contrast preservation

Luminance is preserved by construction (`Y·M = Y` for the Rec. 709 weights), so luminance contrast between text and background is unchanged apart from gamut clipping. WCAG contrast ratios use relative luminance, so they are likewise unaffected to first order.
