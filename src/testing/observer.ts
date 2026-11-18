/**
 * Testing utilities: a *simulated* observer used to exercise the calibration logic and the
 * correction engine automatically. This is a model, NOT a substitute for testing with people
 * who have diagnosed colour vision deficiencies.
 */
import type { Mat3, Vec3 } from '../engine/matrix';
import { simulationMatrix } from '../engine/simulate';
import { deltaEOK, JND_OK } from '../engine/oklab';
import { apply } from '../engine/matrix';
import { correctColor } from '../engine/correction';
import type { Family } from '../engine/profiles';

export interface SimulatedObserver {
  family: Family;
  severity: number;
  /** Perceived distance between two colours (after optional on-screen correction). */
  perceivedDistance(a: Vec3, b: Vec3, correction?: Mat3): number;
  /** Can the observer tell the colours apart? */
  canDistinguish(a: Vec3, b: Vec3, correction?: Mat3): boolean;
}

export function makeObserver(family: Family, severity: number, jnd = JND_OK * 1.5): SimulatedObserver {
  const sim = simulationMatrix(family, severity);
  const perceivedDistance = (a: Vec3, b: Vec3, correction?: Mat3) => {
    const ca = correction ? correctColor(correction, a) : a;
    const cb = correction ? correctColor(correction, b) : b;
    return deltaEOK(apply(sim, ca), apply(sim, cb));
  };
  return {
    family,
    severity,
    perceivedDistance,
    canDistinguish: (a, b, c) => perceivedDistance(a, b, c) >= jnd,
  };
}
