/**
 * Geometry of confusion in linear-light sRGB.
 *
 * "Confusion axis" v: a direction along which colours differ but a (full) dichromat of the family
 * cannot tell them apart. "Intact axis" d: a luminance-neutral direction the same observer can
 * still see. The correction encodes the lost coordinate along v into d.
 */
import { apply, cross, inverse, mul, norm, row, type Mat3, type Vec3 } from './matrix';
import { LUMA } from './linear';
import { MACHADO_FULL } from './simulate';
import type { Family } from './profiles';

/** Unit null direction of a rank-2 dichromat matrix: S * v = 0 (Machado protan/deutan hold to within 1e-5). */
export function nullAxis(fullDichromat: Mat3): [number, number, number] {
  const v = cross(row(fullDichromat, 0), row(fullDichromat, 1));
  const n = norm(v) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
}

/** linear sRGB (D65) -> XYZ, then Hunt-Pointer-Estevez XYZ -> LMS (D65-normalised). */
const RGB_TO_XYZ: Mat3 = [0.4124564, 0.3575761, 0.1804375, 0.2126729, 0.7151522, 0.072175, 0.0193339, 0.119192, 0.9503041];
const XYZ_TO_LMS_HPE: Mat3 = [0.4002, 0.7076, -0.0808, -0.2263, 1.1653, 0.0457, 0, 0, 0.9182];
const RGB_TO_LMS = mul(XYZ_TO_LMS_HPE, RGB_TO_XYZ);

/** Direction in linear RGB that changes only one cone class (0 = L, 1 = M, 2 = S), unit length. */
export function coneIsolatingAxis(cone: 0 | 1 | 2): [number, number, number] {
  const inv = inverse(RGB_TO_LMS) as Mat3;
  const e: Vec3 = cone === 0 ? [1, 0, 0] : cone === 1 ? [0, 1, 0] : [0, 0, 1];
  const v = apply(inv, e);
  const n = norm(v) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
}

/**
 * Confusion axis for a family. protan/deutan: null direction of the Machado dichromat matrix.
 * tritan: S-cone isolating direction (Machado's tritan matrix is not rank 2, so it has no exact
 * null direction). Colours differing only along this axis are the hardest to tell apart.
 */
export function confusionAxis(family: Family): [number, number, number] {
  return family === 'tritan' ? coneIsolatingAxis(2) : nullAxis(MACHADO_FULL[family]);
}

function luminance(v: Vec3): number {
  return LUMA[0] * v[0] + LUMA[1] * v[1] + LUMA[2] * v[2];
}

/** Remove the luminance component by subtracting a multiple of white: Y . result = 0 exactly. */
export function toLuminanceNeutral(v: Vec3): [number, number, number] {
  const y = luminance(v);
  return [v[0] - y, v[1] - y, v[2] - y];
}

/**
 * Intact axis d (unit, luminance-neutral) for a family.
 * protan/deutan keep S-cone (blue-yellow) discrimination; tritan keep L-M (red-green) discrimination.
 */
export function intactAxis(family: Family): [number, number, number] {
  let d: Vec3;
  if (family === 'tritan') {
    const eL = coneIsolatingAxis(0);
    const eM = coneIsolatingAxis(1);
    const yL = luminance(eL);
    const yM = luminance(eM);
    d = [yM * eL[0] - yL * eM[0], yM * eL[1] - yL * eM[1], yM * eL[2] - yL * eM[2]];
  } else {
    d = coneIsolatingAxis(2);
  }
  d = toLuminanceNeutral(d);
  const n = norm(d) || 1;
  return [d[0] / n, d[1] / n, d[2] / n];
}

/**
 * Covector w with w.v = 1, w.d = 0, w.white = 0: extracts the confusion-axis coordinate of a colour
 * in the basis {v, d, white}. Neutral greys therefore have coordinate 0.
 */
export function confusionCoordinate(family: Family): [number, number, number] {
  const v = confusionAxis(family);
  const d = intactAxis(family);
  const basis: Mat3 = [v[0], d[0], 1, v[1], d[1], 1, v[2], d[2], 1]; // columns v, d, white
  const inv = inverse(basis);
  if (!inv) throw new Error('degenerate confusion basis');
  return row(inv, 0);
}
