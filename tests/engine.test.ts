import { describe, expect, it } from 'vitest';
import {
  IDENTITY, LUMA, MACHADO_FULL, VIENOT_FULL, apply, correctionMatrix, deltaEOK, det, effectiveSeverity,
  feColorMatrixValues, inverse, linearRgbToOklab, linearToSrgb, mul, oklabToLinearRgb, PROFILES,
  simulationMatrix, srgbToLinear, getProfile, confusionAxis, coneIsolatingAxis, intactAxis, type Mat3, type Vec3,
} from '../src/engine';
import { simulatedDistance } from '../src/analysis/confusion';
import { thresholdLevels } from '../src/calibration/model';

const close = (a: readonly number[], b: readonly number[], eps = 1e-6) =>
  a.forEach((v, i) => expect(Math.abs(v - b[i])).toBeLessThan(eps));

const PALETTE: Vec3[] = [
  [1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 0], [1, 0, 1], [0, 1, 1],
  [0.8, 0.2, 0.2], [0.2, 0.7, 0.2], [0.6, 0.3, 0.5], [0.4, 0.5, 0.2], [0.9, 0.5, 0.1], [0.5, 0.5, 0.1],
].map((c) => c.map((v) => srgbToLinear(v)) as unknown as Vec3);

describe('transfer functions & OKLab', () => {
  it('round-trips sRGB <-> linear', () => {
    for (let i = 0; i <= 20; i++) expect(linearToSrgb(srgbToLinear(i / 20))).toBeCloseTo(i / 20, 6);
  });
  it('round-trips linear RGB <-> OKLab', () => {
    for (const c of PALETTE) close(oklabToLinearRgb(linearRgbToOklab(c)), c, 1e-6);
  });
  it('white is L=1, a=b=0 in OKLab', () => {
    const [L, a, b] = linearRgbToOklab([1, 1, 1]);
    expect(L).toBeCloseTo(1, 3);
    expect(Math.abs(a)).toBeLessThan(1e-3);
    expect(Math.abs(b)).toBeLessThan(1e-3);
  });
});

describe('simulation matrices (Machado 2009 / Viénot 1999)', () => {
  it('published dichromat matrices keep greys unchanged (rows sum to 1)', () => {
    for (const m of [...Object.values(MACHADO_FULL), ...Object.values(VIENOT_FULL)]) {
      close(apply(m, [1, 1, 1]), [1, 1, 1], 1e-4);
      close(apply(m, [0.3, 0.3, 0.3]), [0.3, 0.3, 0.3], 1e-4);
    }
  });
  it('protan/deutan dichromat matrices are rank 2; Machado tritan is documented NOT to be', () => {
    expect(Math.abs(det(MACHADO_FULL.protan))).toBeLessThan(1e-5);
    expect(Math.abs(det(MACHADO_FULL.deutan))).toBeLessThan(1e-5);
    expect(Math.abs(det(MACHADO_FULL.tritan))).toBeGreaterThan(0.1);
  });
  it('severity 0 is identity and severity 1 is the published matrix', () => {
    for (const f of ['protan', 'deutan', 'tritan'] as const) {
      close(simulationMatrix(f, 0), IDENTITY);
      close(simulationMatrix(f, 1), MACHADO_FULL[f]);
    }
  });
  it('matches the published Machado protanopia/deuteranopia values for pure red', () => {
    close(apply(MACHADO_FULL.protan, [1, 0, 0]), [0.152286, 0.114503, -0.003882]);
    close(apply(MACHADO_FULL.deutan, [1, 0, 0]), [0.367322, 0.280085, -0.01182]);
  });
  it('agrees with the independent Viénot 1999 model within a loose perceptual tolerance', () => {
    const diffs: number[] = [];
    for (const fam of ['protan', 'deutan'] as const) {
      for (const c of PALETTE) {
        const a = apply(MACHADO_FULL[fam], c).map((v) => Math.min(1, Math.max(0, v))) as unknown as Vec3;
        const b = apply(VIENOT_FULL[fam], c).map((v) => Math.min(1, Math.max(0, v))) as unknown as Vec3;
        diffs.push(deltaEOK(a, b));
      }
    }
    const mean = diffs.reduce((x, y) => x + y, 0) / diffs.length;
    // Two different cone models: we only require the same ballpark (see docs/TESTING.md).
    expect(mean).toBeLessThan(0.08);
  });
  it('protan/deutan simulation collapses the red-green axis', () => {
    const red: Vec3 = [srgbToLinear(0.8), srgbToLinear(0.2), srgbToLinear(0.2)];
    const green: Vec3 = [srgbToLinear(0.2), srgbToLinear(0.6), srgbToLinear(0.2)];
    for (const fam of ['protan', 'deutan'] as const) {
      const S = simulationMatrix(fam, 1);
      expect(simulatedDistance(S, red, green)).toBeLessThan(deltaEOK(red, green) * 0.6);
    }
  });
  it('protan/deutan confusion axis is annihilated by the dichromat matrix', () => {
    for (const f of ['protan', 'deutan'] as const) close(apply(MACHADO_FULL[f], confusionAxis(f)), [0, 0, 0], 1e-5);
  });
  it('confusion axes agree with independent Hunt-Pointer-Estevez cone-isolating directions', () => {
    const cos = (a: readonly number[], b: readonly number[]) => Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]);
    expect(cos(confusionAxis('protan'), coneIsolatingAxis(0))).toBeGreaterThan(0.99);
    expect(cos(confusionAxis('deutan'), coneIsolatingAxis(1))).toBeGreaterThan(0.99);
    expect(cos(confusionAxis('tritan'), coneIsolatingAxis(2))).toBeGreaterThan(0.99);
  });
  it('tritan axis changes the simulated colour far less than an orthogonal chroma direction', () => {
    const base: Vec3 = [0.3, 0.3, 0.3];
    const S = simulationMatrix('tritan', 1);
    const axis = confusionAxis('tritan');
    const moved = (dir: Vec3): Vec3 => [base[0] + 0.1 * dir[0], base[1] + 0.1 * dir[1], base[2] + 0.1 * dir[2]];
    const along = deltaEOK(apply(S, base), apply(S, moved(axis)));
    const across = deltaEOK(apply(S, base), apply(S, moved([1, -1, 0])));
    expect(along).toBeLessThan(across * 0.6);
  });
});

describe('correction matrix', () => {
  const profiles = PROFILES.map((p) => p.id);
  it('strength 0 is exactly identity', () => {
    for (const p of profiles) close(correctionMatrix({ profile: p, strength: 0, mode: 'natural' }), IDENTITY, 1e-12);
  });
  it('preserves neutral greys for every profile/mode/method/strength', () => {
    for (const p of profiles) for (const mode of ['natural', 'enhanced'] as const) for (const method of ['axis', 'fidaner'] as const) for (const k of [0.25, 0.6, 1]) {
      close(apply(correctionMatrix({ profile: p, strength: k, mode, method }), [0.4, 0.4, 0.4]), [0.4, 0.4, 0.4], 1e-6);
    }
  });
  it('preserves luminance (Y-row invariant) before gamut clipping', () => {
    for (const p of profiles) for (const mode of ['natural', 'enhanced'] as const) for (const method of ['axis', 'fidaner'] as const) {
      const M = correctionMatrix({ profile: p, strength: 1, mode, method });
      for (const c of PALETTE) {
        const o = apply(M, c);
        const y0 = LUMA[0] * c[0] + LUMA[1] * c[1] + LUMA[2] * c[2];
        const y1 = LUMA[0] * o[0] + LUMA[1] * o[1] + LUMA[2] * o[2];
        expect(Math.abs(y1 - y0)).toBeLessThan(1e-6);
      }
    }
  });
  it('axis method increases simulated separation of confusion-axis pairs for every profile and mode', () => {
    for (const p of profiles) for (const mode of ['natural', 'enhanced'] as const) {
      const fam = getProfile(p).family;
      const sim = simulationMatrix(fam, effectiveSeverity(p));
      const M = correctionMatrix({ profile: p, strength: 1, mode });
      for (const lvl of thresholdLevels(fam)) {
        expect(simulatedDistance(sim, lvl.a, lvl.b, M)).toBeGreaterThan(simulatedDistance(sim, lvl.a, lvl.b) * 1.5);
      }
    }
  });
  it('enhanced separates confusion-axis pairs more than natural on average (gamut clipping can erase the gain at single levels)', () => {
    for (const p of profiles) {
      const fam = getProfile(p).family;
      const sim = simulationMatrix(fam, effectiveSeverity(p));
      const levels = thresholdLevels(fam);
      const mean = (mode: 'natural' | 'enhanced') => {
        const M = correctionMatrix({ profile: p, strength: 1, mode });
        return levels.reduce((s, l) => s + simulatedDistance(sim, l.a, l.b, M), 0) / levels.length;
      };
      expect(mean('enhanced')).toBeGreaterThan(mean('natural'));
    }
  });
  it('EVALUATION (300 seeded random in-gamut confusion pairs per profile): axis projection beats the Fidaner-style baseline', () => {
    let seed = 7;
    const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    const lines: string[] = [];
    for (const p of profiles) {
      const fam = getProfile(p).family;
      const sim = simulationMatrix(fam, effectiveSeverity(p));
      const v = confusionAxis(fam);
      const pairs: Array<[Vec3, Vec3]> = [];
      while (pairs.length < 300) {
        const base: Vec3 = [0.1 + 0.8 * rand(), 0.1 + 0.8 * rand(), 0.1 + 0.8 * rand()];
        const mk = (t: number): [Vec3, Vec3] => [
          [base[0] - (v[0] * t) / 2, base[1] - (v[1] * t) / 2, base[2] - (v[2] * t) / 2],
          [base[0] + (v[0] * t) / 2, base[1] + (v[1] * t) / 2, base[2] + (v[2] * t) / 2],
        ];
        let lo = 0;
        let hi = 1;
        for (let i = 0; i < 30; i++) {
          const mid = (lo + hi) / 2;
          const [x, y] = mk(mid);
          if (deltaEOK(x, y) < 0.06) lo = mid; else hi = mid;
        }
        const pr = mk((lo + hi) / 2);
        if ([...pr[0], ...pr[1]].every((c) => c >= 0 && c <= 1)) pairs.push(pr);
      }
      const mean = (M?: Mat3) => pairs.reduce((s, [x, y]) => s + simulatedDistance(sim, x, y, M), 0) / pairs.length;
      const before = mean();
      for (const mode of ['natural', 'enhanced'] as const) {
        const fid = mean(correctionMatrix({ profile: p, strength: 1, mode, method: 'fidaner' }));
        const axis = mean(correctionMatrix({ profile: p, strength: 1, mode, method: 'axis' }));
        lines.push(`${p}/${mode}: before ${before.toFixed(4)} fidaner ${fid.toFixed(4)} axis ${axis.toFixed(4)}`);
        expect(axis).toBeGreaterThan(fid * 1.3);
        if (getProfile(p).anomalous) expect(axis).toBeGreaterThan(before * 1.5);
      }
      // Fidaner-style transfer does not reliably help protan/tritan anomalous trichromats (it can even reduce separation).
      if (p === 'protanomaly' || p === 'tritanomaly') {
        expect(mean(correctionMatrix({ profile: p, strength: 1, mode: 'natural', method: 'fidaner' }))).toBeLessThan(before * 1.05);
      }
    }
    expect(lines.length).toBe(12);
  });
  it('colours that differ only along the intact axis are left alone', () => {
    const d = intactAxis('deutan');
    const c: Vec3 = [0.4 + 0.1 * d[0], 0.4 + 0.1 * d[1], 0.4 + 0.1 * d[2]];
    close(apply(correctionMatrix({ profile: 'deuteranopia', strength: 1, mode: 'enhanced' }), c), c, 1e-9);
  });
  it('is invertible and the inverse round-trips', () => {
    const M = correctionMatrix({ profile: 'deuteranopia', strength: 0.6, mode: 'natural' });
    const inv = inverse(M) as Mat3;
    expect(inv).not.toBeNull();
    close(mul(M, inv), IDENTITY, 1e-9);
  });
  it('severity is ignored for dichromacy and clamped for anomalies', () => {
    expect(effectiveSeverity('deuteranopia', 0.2)).toBe(1);
    expect(effectiveSeverity('deuteranomaly', 5)).toBe(1);
    expect(effectiveSeverity('deuteranomaly', -3)).toBe(0.05);
    expect(effectiveSeverity('deuteranomaly', Number.NaN)).toBe(0.6);
  });
  it('higher strength means larger deviation from identity', () => {
    const d = (k: number) => correctionMatrix({ profile: 'protanopia', strength: k, mode: 'natural' }).reduce((s, v, i) => s + Math.abs(v - IDENTITY[i]), 0);
    expect(d(0.2)).toBeLessThan(d(0.5));
    expect(d(0.5)).toBeLessThan(d(1));
  });
  it('personalised severity changes the matrix for anomalous profiles only', () => {
    const a = correctionMatrix({ profile: 'deuteranomaly', strength: 1, mode: 'natural', severity: 0.3 });
    const b = correctionMatrix({ profile: 'deuteranomaly', strength: 1, mode: 'natural', severity: 0.9 });
    expect(a).not.toEqual(b);
    const c = correctionMatrix({ profile: 'deuteranopia', strength: 1, mode: 'natural', severity: 0.3 });
    const d = correctionMatrix({ profile: 'deuteranopia', strength: 1, mode: 'natural', severity: 0.9 });
    expect(c).toEqual(d);
  });
});

describe('svg filter serialisation', () => {
  it('emits a 4x5 feColorMatrix with untouched alpha', () => {
    const vals = feColorMatrixValues(IDENTITY).split(' ').map(Number);
    expect(vals).toHaveLength(20);
    expect(vals.slice(15)).toEqual([0, 0, 0, 1, 0]);
    expect(vals.slice(0, 5)).toEqual([1, 0, 0, 0, 0]);
  });
});
