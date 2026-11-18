/**
 * Color analysis: how distinguishable are colours for a given (simulated) profile?
 * All inputs/outputs of colour values are linear-light sRGB triples.
 */
import { apply, type Mat3, type Vec3 } from '../engine/matrix';
import { deltaEOK, JND_OK } from '../engine/oklab';
import { correctColor } from '../engine/correction';

/** Perceived (simulated) distance between two colours after an optional correction matrix. */
export function simulatedDistance(sim: Mat3, a: Vec3, b: Vec3, correction?: Mat3): number {
  const ca = correction ? correctColor(correction, a) : a;
  const cb = correction ? correctColor(correction, b) : b;
  return deltaEOK(apply(sim, ca), apply(sim, cb));
}

export interface PairAnalysis {
  i: number;
  j: number;
  typical: number;
  before: number;
  after: number;
}

/**
 * For every pair that a typical observer can tell apart but the simulated observer cannot
 * (distance < threshold), report the distance before and after correction.
 */
export function analyzeConfusablePairs(
  palette: readonly Vec3[],
  sim: Mat3,
  correction: Mat3,
  threshold = JND_OK * 1.5,
): PairAnalysis[] {
  const out: PairAnalysis[] = [];
  for (let i = 0; i < palette.length; i++) {
    for (let j = i + 1; j < palette.length; j++) {
      const typical = deltaEOK(palette[i], palette[j]);
      if (typical < threshold * 2) continue;
      const before = simulatedDistance(sim, palette[i], palette[j]);
      if (before >= threshold) continue;
      out.push({ i, j, typical, before, after: simulatedDistance(sim, palette[i], palette[j], correction) });
    }
  }
  return out;
}

/** Fraction of confusable pairs that become distinguishable (>= threshold) after correction. */
export function resolvedFraction(pairs: readonly PairAnalysis[], threshold = JND_OK * 1.5): number {
  if (pairs.length === 0) return 1;
  return pairs.filter((p) => p.after >= threshold).length / pairs.length;
}
