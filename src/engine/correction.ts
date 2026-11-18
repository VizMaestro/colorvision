/**
 * Luminance-preserving correction as a single 3x3 matrix in linear-light sRGB.
 *
 * Default method, "axis projection" (this project's design, in the spirit of daltonization):
 *   v = confusion axis of the family   (colours differing along v look alike to the user)
 *   d = intact axis (luminance-neutral; blue-yellow for protan/deutan, red-green for tritan)
 *   w = covector extracting the v-coordinate in the basis {v, d, white}     (w.white = 0)
 *   M = I + kappa * d w^T,   kappa = gain(mode) * strength * severityFactor
 * Colours that differ along v therefore also differ along d, which the user can see.
 * It never reduces the signal the user still has (a failure mode of Fidaner-style transfer matrices
 * on anomalous trichromats, see tests/engine.test.ts), and it is luminance-neutral by construction.
 *
 * Reference method, "fidaner" (Fidaner, Lin & Ozguven 2005 style, kept for evaluation):
 *   M = I + g * k * Neutral(E (I - S))   with S the simulation matrix and E a channel-transfer matrix.
 *
 * Properties of both (verified by tests, before gamut clipping):
 *   - strength 0 gives the identity
 *   - neutral greys are untouched   (M * [1,1,1] = [1,1,1])
 *   - luminance is preserved        (Y . M = Y)
 *
 * Because M is linear, one 3x3 can be applied to CSS-rendered content, images, video, canvas and
 * WebGL via a single SVG feColorMatrix filter evaluated in linearRGB, and is trivially reversible.
 * Gains and axes are heuristic design choices, not clinically derived; the tritan path has far
 * less supporting literature than protan/deutan.
 */
import { IDENTITY, add, apply, inverse, mul, scale, sub, type Mat3, type Vec3 } from './matrix';
import { LUMA } from './linear';
import { simulationMatrix } from './simulate';
import { confusionCoordinate, intactAxis } from './axes';
import { getProfile, type CorrectionMode, type Family, type ProfileId } from './profiles';

export type CorrectionMethod = 'axis' | 'fidaner';

export interface CorrectionParams {
  profile: ProfileId;
  /** User-facing intensity, 0..1. */
  strength: number;
  mode: CorrectionMode;
  /** Optional personalised severity (0..1). Only used for anomalous profiles. */
  severity?: number;
  /** Defaults to 'axis'. */
  method?: CorrectionMethod;
}

interface ModeTuning {
  /** Cross-talk coefficient of the Fidaner transfer matrix. */
  a: number;
  /** Overall gain applied to the Fidaner shift. */
  gain: number;
}

export const MODE_TUNING: Record<CorrectionMode, ModeTuning> = {
  natural: { a: 0.5, gain: 0.8 },
  enhanced: { a: 0.7, gain: 1.4 },
};

/** Gain of the axis-projection method per mode. */
export const AXIS_GAIN: Record<CorrectionMode, number> = { natural: 1.0, enhanced: 2.0 };

/** Error-transfer matrix E of the Fidaner reference method. */
export function transferMatrix(family: Family, a: number): Mat3 {
  switch (family) {
    case 'protan':
    case 'deutan':
      // R is left alone; the lost red-green signal is added to G and B.
      return [0, 0, 0, a, 1, 0, a, 0, 1];
    case 'tritan':
      // B is left alone; the lost blue-yellow signal is added to R and G.
      return [1, 0, a, 0, 1, a, 0, 0, 0];
  }
}

export function effectiveSeverity(profile: ProfileId, severity?: number): number {
  const p = getProfile(profile);
  if (!p.anomalous) return 1;
  const s = severity ?? p.defaultSeverity;
  return Math.min(1, Math.max(0.05, Number.isFinite(s) ? s : p.defaultSeverity));
}

export function clampStrength(k: number): number {
  return Number.isFinite(k) ? Math.min(1, Math.max(0, k)) : 0;
}

/** Subtract each column's luminance from all rows so the operator adds zero luminance. */
function removeLuminance(d: Mat3): Mat3 {
  const out = [...d] as number[];
  for (let col = 0; col < 3; col++) {
    const y = LUMA[0] * d[col] + LUMA[1] * d[3 + col] + LUMA[2] * d[6 + col];
    for (let r = 0; r < 3; r++) out[r * 3 + col] -= y;
  }
  return out as unknown as Mat3;
}

function outer(d: Vec3, w: Vec3): Mat3 {
  return [
    d[0] * w[0], d[0] * w[1], d[0] * w[2],
    d[1] * w[0], d[1] * w[1], d[1] * w[2],
    d[2] * w[0], d[2] * w[1], d[2] * w[2],
  ];
}

/** Share of the lost signal that needs re-encoding: all of it for dichromacy, s for anomalies. */
function severityFactor(profile: ProfileId, severity: number): number {
  return getProfile(profile).anomalous ? severity : 1;
}

function fidanerMatrix(params: CorrectionParams, k: number): Mat3 {
  const { family } = getProfile(params.profile);
  const tuning = MODE_TUNING[params.mode];
  const S = simulationMatrix(family, effectiveSeverity(params.profile, params.severity));
  const shift = removeLuminance(mul(transferMatrix(family, tuning.a), sub(IDENTITY, S)));
  return add(IDENTITY, scale(shift, tuning.gain * k));
}

export function correctionMatrix(params: CorrectionParams): Mat3 {
  const k = clampStrength(params.strength);
  if (k === 0) return IDENTITY;
  if (params.method === 'fidaner') return fidanerMatrix(params, k);
  const { family } = getProfile(params.profile);
  const sev = effectiveSeverity(params.profile, params.severity);
  const kappa = AXIS_GAIN[params.mode] * k * severityFactor(params.profile, sev);
  return add(IDENTITY, scale(outer(intactAxis(family), confusionCoordinate(family)), kappa));
}

/** Matrix that (approximately) undoes `correctionMatrix`; null if singular. Out-of-gamut values clip. */
export function inverseCorrectionMatrix(params: CorrectionParams): Mat3 | null {
  return inverse(correctionMatrix(params));
}

/** Full pipeline for one linear-RGB colour: correct, then clip to gamut. */
export function correctColor(m: Mat3, c: Vec3): [number, number, number] {
  const o = apply(m, c);
  return [Math.min(1, Math.max(0, o[0])), Math.min(1, Math.max(0, o[1])), Math.min(1, Math.max(0, o[2]))];
}
