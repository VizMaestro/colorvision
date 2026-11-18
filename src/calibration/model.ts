/**
 * Personal calibration (pure logic, no DOM).
 *
 * Stage 1 - discrimination threshold (estimates a *relative severity*):
 *   Colour pairs are built to differ only along the confusion axis of the chosen family
 *   (S * v = 0 for the full-dichromat matrix), at increasing ΔE_OK. The user picks the first pair
 *   in which two different colours are clearly visible. We then find the severity s at which the
 *   simulated observer's distance for that pair crosses a just-noticeable difference, and take the
 *   midpoint of the interval implied by the last "no" and the first "yes".
 *
 * Stage 2 - preference (estimates correction strength and mode):
 *   Two-alternative comparisons between candidate corrections; the user says which makes the
 *   colours easier to tell apart ("same" scores nothing). Ties resolve to the weaker setting.
 *
 * Nothing here is a diagnosis. The result is a set of display parameters that appeared to work
 * best for the user in this session, and it is stored locally only.
 */
import type { Mat3, Vec3 } from '../engine/matrix';
import { apply } from '../engine/matrix';
import { confusionAxis } from '../engine/axes';
import { simulationMatrix } from '../engine/simulate';
import { deltaEOK, JND_OK } from '../engine/oklab';
import { correctionMatrix } from '../engine/correction';
import { getProfile, PROFILES, type CorrectionMode, type Family, type ProfileId } from '../engine/profiles';

/** Distance at which the (modelled) user can just tell two adjacent swatches apart. */
export const CALIBRATION_JND = JND_OK * 1.5;

/** Target ΔE_OK of the Stage-1 pairs, from hardest to easiest. */
export const LEVEL_TARGETS = [0.03, 0.045, 0.065, 0.09, 0.13, 0.18, 0.25] as const;

export interface ThresholdLevel {
  index: number;
  a: Vec3;
  b: Vec3;
  /** ΔE_OK between a and b for a typical observer. */
  typicalDistance: number;
}

/**
 * Base colours (linear RGB) chosen so that the whole ladder, up to ΔE_OK 0.25, stays inside the sRGB
 * gamut when displaced along each family's confusion axis (headroom is checked by tests).
 */
const BASE: Record<Family, Vec3> = {
  protan: [0.5, 0.1, 0.05],
  deutan: [0.5, 0.2, 0.05],
  tritan: [0.1, 0.1, 0.5],
};

function pairAt(family: Family, t: number): [Vec3, Vec3] {
  const v = confusionAxis(family);
  // Orient the axis so the first component is positive; keeps results deterministic.
  const sign = v[0] + v[1] >= 0 ? 1 : -1;
  const base = BASE[family];
  const a: Vec3 = [base[0] - (sign * v[0] * t) / 2, base[1] - (sign * v[1] * t) / 2, base[2] - (sign * v[2] * t) / 2];
  const b: Vec3 = [base[0] + (sign * v[0] * t) / 2, base[1] + (sign * v[1] * t) / 2, base[2] + (sign * v[2] * t) / 2];
  return [a, b];
}

/** Stage-1 ladder for a family. All colours are inside the sRGB gamut. */
export function thresholdLevels(family: Family): ThresholdLevel[] {
  return LEVEL_TARGETS.map((target, index) => {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      const [a, b] = pairAt(family, mid);
      if (deltaEOK(a, b) < target) lo = mid;
      else hi = mid;
    }
    const [a, b] = pairAt(family, (lo + hi) / 2);
    return { index, a, b, typicalDistance: deltaEOK(a, b) };
  });
}

/** Largest severity at which a simulated observer can still distinguish the pair (grid search). */
function maxSeverityDistinguishing(family: Family, level: ThresholdLevel): number {
  let best = 0;
  for (let i = 0; i <= 100; i++) {
    const s = i / 100;
    const S = simulationMatrix(family, s);
    if (deltaEOK(apply(S, level.a), apply(S, level.b)) >= CALIBRATION_JND) best = s;
  }
  return best;
}

/**
 * firstSeen: index of the first level where the user clearly saw two colours,
 * 'all' if they saw every level, 'none' if they saw none.
 */
export type ThresholdAnswer = number | 'all' | 'none';

export function estimateSeverity(family: Family, answer: ThresholdAnswer): number {
  const levels = thresholdLevels(family);
  const cap = levels.map((l) => maxSeverityDistinguishing(family, l));
  const clamp = (v: number) => Math.min(1, Math.max(0.05, v));
  if (answer === 'all') return clamp(cap[0] / 2);
  if (answer === 'none') return clamp((cap[cap.length - 1] + 1) / 2);
  if (answer <= 0) return clamp(cap[0] / 2);
  return clamp((cap[answer - 1] + cap[answer]) / 2);
}

export interface Candidate {
  strength: number;
  mode: CorrectionMode;
}

export const STRENGTH_CANDIDATES = [0.25, 0.5, 0.75, 1] as const;

export interface ComparisonTrial {
  left: Candidate;
  right: Candidate;
}

export type Preference = 'left' | 'right' | 'same';

/** Round-robin between strength candidates in natural mode (6 trials). */
export function strengthTrials(): ComparisonTrial[] {
  const out: ComparisonTrial[] = [];
  for (let i = 0; i < STRENGTH_CANDIDATES.length; i++) {
    for (let j = i + 1; j < STRENGTH_CANDIDATES.length; j++) {
      // alternate sides to avoid a position bias
      const lo: Candidate = { strength: STRENGTH_CANDIDATES[i], mode: 'natural' };
      const hi: Candidate = { strength: STRENGTH_CANDIDATES[j], mode: 'natural' };
      out.push((i + j) % 2 === 0 ? { left: lo, right: hi } : { left: hi, right: lo });
    }
  }
  return out;
}

export function pickStrength(trials: readonly ComparisonTrial[], answers: readonly Preference[]): number {
  const wins = new Map<number, number>(STRENGTH_CANDIDATES.map((s) => [s, 0]));
  trials.forEach((t, i) => {
    const a = answers[i];
    if (a === 'left') wins.set(t.left.strength, (wins.get(t.left.strength) ?? 0) + 1);
    if (a === 'right') wins.set(t.right.strength, (wins.get(t.right.strength) ?? 0) + 1);
  });
  let best: number = STRENGTH_CANDIDATES[0];
  let bestWins = -1;
  for (const s of STRENGTH_CANDIDATES) {
    const w = wins.get(s) ?? 0;
    if (w > bestWins) {
      best = s;
      bestWins = w;
    }
  }
  return best;
}

/** Natural (left) vs enhanced (right) at the chosen strength. */
export function modeTrial(strength: number): ComparisonTrial {
  return { left: { strength, mode: 'natural' }, right: { strength, mode: 'enhanced' } };
}

export function pickMode(answer: Preference): CorrectionMode {
  return answer === 'right' ? 'enhanced' : 'natural';
}

/** Colour pairs (from the mid levels) displayed in Stage 2. */
export function comparisonPairs(family: Family): Array<[Vec3, Vec3]> {
  const levels = thresholdLevels(family);
  return [levels[1], levels[2], levels[3]].map((l) => [l.a, l.b] as [Vec3, Vec3]);
}

export interface CalibrationResult {
  family: Family;
  /** Relative severity estimate 0..1 (internal scale; not a clinical measure). */
  severity: number;
  strength: number;
  mode: CorrectionMode;
  completedAt: number;
}

export function matrixFor(profile: ProfileId, severity: number, c: Candidate): Mat3 {
  return correctionMatrix({ profile, strength: c.strength, mode: c.mode, severity });
}

/** Profile whose severity category best matches the estimate (a display suggestion, not a diagnosis). */
export function suggestProfile(family: Family, severity: number): ProfileId {
  const wantAnomalous = severity < 0.85;
  const p = PROFILES.find((x) => x.family === family && x.anomalous === wantAnomalous);
  return (p ?? getProfile('deuteranomaly')).id;
}
