import { describe, expect, it } from 'vitest';
import {
  CALIBRATION_JND, STRENGTH_CANDIDATES, comparisonPairs, estimateSeverity, matrixFor, modeTrial, pickMode, pickStrength,
  strengthTrials, suggestProfile, thresholdLevels, type Preference,
} from '../src/calibration/model';
import { makeObserver } from '../src/testing/observer';
import { deltaEOK } from '../src/engine';
import { linearToSrgb } from '../src/engine/linear';
import type { Family } from '../src/engine/profiles';

const FAMILIES: Family[] = ['protan', 'deutan', 'tritan'];

describe('calibration stage 1: threshold ladder', () => {
  it('keeps every pair inside the sRGB gamut and ordered by difficulty', () => {
    for (const f of FAMILIES) {
      const levels = thresholdLevels(f);
      expect(levels).toHaveLength(7);
      levels.forEach((l, i) => {
        for (const c of [...l.a, ...l.b]) expect(c).toBeGreaterThanOrEqual(0);
        for (const c of [...l.a, ...l.b]) expect(c).toBeLessThanOrEqual(1);
        if (i > 0) expect(l.typicalDistance).toBeGreaterThan(levels[i - 1].typicalDistance);
      });
    }
  });
  it('every level is clearly distinguishable for a typical observer', () => {
    for (const f of FAMILIES) for (const l of thresholdLevels(f)) expect(l.typicalDistance).toBeGreaterThanOrEqual(CALIBRATION_JND - 1e-6);
  });
  it('hardest pairs are (nearly) invisible to a full dichromat of the family, easiest pairs are not for anomalous trichromats', () => {
    for (const f of ['protan', 'deutan'] as const) {
      const dich = makeObserver(f, 1);
      expect(dich.perceivedDistance(thresholdLevels(f)[0].a, thresholdLevels(f)[0].b)).toBeLessThan(0.005);
    }
    for (const f of FAMILIES) {
      const mild = makeObserver(f, 0.3);
      const last = thresholdLevels(f)[6];
      expect(mild.canDistinguish(last.a, last.b)).toBe(true);
    }
  });
  it('severity estimate tracks a simulated observer within one ladder step', () => {
    for (const f of FAMILIES) {
      const levels = thresholdLevels(f);
      let prev = -1;
      for (const trueSeverity of [0.2, 0.4, 0.6, 0.8, 1]) {
        const obs = makeObserver(f, trueSeverity);
        const first = levels.findIndex((l) => obs.canDistinguish(l.a, l.b));
        const answer = first === -1 ? 'none' : first === 0 ? 'all' : first;
        const est = estimateSeverity(f, answer);
        expect(est).toBeGreaterThanOrEqual(0.05);
        expect(est).toBeLessThanOrEqual(1);
        // monotone in the true severity
        expect(est).toBeGreaterThanOrEqual(prev - 1e-9);
        prev = est;
      }
    }
  });
  it('protan/deutan estimates are within 0.25 of truth for moderate and strong cases', () => {
    for (const f of ['protan', 'deutan'] as const) {
      const levels = thresholdLevels(f);
      for (const t of [0.5, 0.7, 0.9]) {
        const obs = makeObserver(f, t);
        const first = levels.findIndex((l) => obs.canDistinguish(l.a, l.b));
        const est = estimateSeverity(f, first === -1 ? 'none' : first === 0 ? 'all' : first);
        expect(Math.abs(est - t)).toBeLessThan(0.25);
      }
    }
  });
});

describe('calibration stage 2: preferences', () => {
  it('runs 6 round-robin trials with each pair of strengths exactly once', () => {
    const t = strengthTrials();
    expect(t).toHaveLength(6);
    const keys = new Set(t.map((x) => [x.left.strength, x.right.strength].sort().join('-')));
    expect(keys.size).toBe(6);
  });
  it('a simulated observer who prefers larger perceived separation picks a high strength', () => {
    const family: Family = 'deutan';
    const obs = makeObserver(family, 1);
    const pairs = comparisonPairs(family);
    const trials = strengthTrials();
    const answers: Preference[] = trials.map((t) => {
      const score = (m: ReturnType<typeof matrixFor>) => pairs.reduce((s, [a, b]) => s + obs.perceivedDistance(a, b, m), 0);
      const l = score(matrixFor('deuteranopia', 1, t.left));
      const r = score(matrixFor('deuteranopia', 1, t.right));
      return Math.abs(l - r) < 1e-3 ? 'same' : l > r ? 'left' : 'right';
    });
    expect(pickStrength(trials, answers)).toBeGreaterThanOrEqual(0.75);
  });
  it('all "no difference" answers resolve to the weakest strength (conservative)', () => {
    const trials = strengthTrials();
    expect(pickStrength(trials, trials.map(() => 'same' as Preference))).toBe(STRENGTH_CANDIDATES[0]);
  });
  it('mode trial compares natural vs enhanced at the same strength', () => {
    const t = modeTrial(0.5);
    expect(t.left).toEqual({ strength: 0.5, mode: 'natural' });
    expect(t.right).toEqual({ strength: 0.5, mode: 'enhanced' });
    expect(pickMode('right')).toBe('enhanced');
    expect(pickMode('left')).toBe('natural');
    expect(pickMode('same')).toBe('natural');
  });
  it('profile suggestion maps severity to anomaly vs dichromacy within the same family', () => {
    expect(suggestProfile('deutan', 0.3)).toBe('deuteranomaly');
    expect(suggestProfile('deutan', 0.95)).toBe('deuteranopia');
    expect(suggestProfile('tritan', 0.5)).toBe('tritanomaly');
  });
  it('rendered pair colours stay within gamut after correction (CSS conversion is safe)', () => {
    for (const f of FAMILIES) for (const [a, b] of comparisonPairs(f)) {
      const m = matrixFor(f === 'protan' ? 'protanopia' : f === 'deutan' ? 'deuteranopia' : 'tritanopia', 1, { strength: 1, mode: 'enhanced' });
      expect(m).toHaveLength(9);
      expect(deltaEOK(a, b)).toBeGreaterThan(0);
      expect(linearToSrgb(0.5)).toBeGreaterThan(0);
    }
  });
});
