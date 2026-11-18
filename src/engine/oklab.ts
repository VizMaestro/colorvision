/**
 * OKLab (Ottosson 2020). Input/output of the *linear* functions is linear-light sRGB.
 * Distances in OKLab are approximately perceptually uniform; ~0.02 is commonly quoted
 * as a just-noticeable difference for a typical observer.
 */
import type { Vec3 } from './matrix';

export type Lab = [number, number, number];

export function linearRgbToOklab([r, g, b]: Vec3): Lab {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklabToLinearRgb([L, a, b]: Vec3): [number, number, number] {
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** Euclidean distance in OKLab (ΔE_OK). */
export function deltaEOK(a: Vec3, b: Vec3): number {
  const x = linearRgbToOklab(a);
  const y = linearRgbToOklab(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

/** Approximate just-noticeable difference in OKLab for side-by-side swatches. */
export const JND_OK = 0.02;
