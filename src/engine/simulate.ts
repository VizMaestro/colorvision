/**
 * Color vision deficiency SIMULATION in linear-light sRGB.
 *
 * Severity handling follows Machado, Oliveira & Fernandes (2009), "A Physiologically-based Model for
 * Simulation of Color Vision Deficiency", IEEE TVCG 15(6): the authors' pre-computed matrices for
 * severities 0.0 ... 1.0 in steps of 0.1 (machadoTable.ts), linearly interpolated between steps as
 * the authors recommend. Severity 1.0 is dichromacy; lower values are anomalous trichromacy. Their
 * severity scale corresponds to a cone-peak shift of up to 20 nm; it is a model parameter, not a
 * clinical measurement.
 *
 * Viénot, Brettel & Mollon (1999) protan/deutan matrices (checked against libDaltonLens) are included
 * as an independent reference used by the tests as a cross-check.
 *
 * A simulation is a model of what a dichromat/anomalous trichromat may perceive. It is never
 * a restoration or reconstruction of anyone's actual vision.
 */
import { lerp, type Mat3 } from './matrix';
import type { Family } from './profiles';
import { MACHADO_TABLE } from './machadoTable';

export const MACHADO_FULL: Record<Family, Mat3> = {
  protan: MACHADO_TABLE.protan[10],
  deutan: MACHADO_TABLE.deutan[10],
  tritan: MACHADO_TABLE.tritan[10],
};

/** Viénot et al. 1999 dichromat matrices for linear sRGB (reference only). */
export const VIENOT_FULL: Record<'protan' | 'deutan', Mat3> = {
  protan: [0.11238, 0.88762, 0, 0.11238, 0.88762, 0, 0.00401, -0.00401, 1],
  deutan: [0.29275, 0.70725, 0, 0.29275, 0.70725, 0, -0.02234, 0.02234, 1],
};

export function clampSeverity(s: number): number {
  return Number.isFinite(s) ? Math.min(1, Math.max(0, s)) : 0;
}

/** Linear-RGB matrix simulating a deficiency of the given family at severity s (0 = typical, 1 = dichromacy). */
export function simulationMatrix(family: Family, severity: number): Mat3 {
  const x = clampSeverity(severity) * 10;
  const lo = Math.floor(x);
  const hi = Math.min(10, lo + 1);
  const t = x - lo;
  const table = MACHADO_TABLE[family];
  return t === 0 ? table[lo] : lerp(table[lo], table[hi], t);
}
