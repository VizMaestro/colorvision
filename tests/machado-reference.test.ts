import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MACHADO_TABLE, simulationMatrix } from '../src/engine';

/**
 * Independent check: re-parses a saved copy of the authors' page
 * (https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html, Table 1:
 * severities 0.0..1.0 x protan/deutan/tritan, 9 numbers each) and compares every number with the
 * table the engine uses.
 */
describe('Machado 2009 table equals the authors\' published Table 1', () => {
  const html = readFileSync(resolve(__dirname, 'reference/CVD_Simulation.html'), 'utf8');
  const nums = [...html.replace(/<[^>]*>/g, ' ').matchAll(/-?\d\.\d{6}/g)].map((m) => Number(m[0]));

  it('the reference page contains 3 types x 11 severities x 9 numbers', () => {
    expect(nums).toHaveLength(297);
  });

  it('every engine matrix equals the published one (order: severity, then protan, deutan, tritan)', () => {
    const fams = ['protan', 'deutan', 'tritan'] as const;
    for (let s = 0; s <= 10; s++) {
      fams.forEach((f, k) => {
        const published = nums.slice((s * 3 + k) * 9, (s * 3 + k) * 9 + 9);
        published.forEach((v, i) => expect(Math.abs(MACHADO_TABLE[f][s][i] - v)).toBeLessThan(1e-9));
      });
    }
  });

  it('interpolates linearly between table steps and hits the table at exact steps', () => {
    for (const f of ['protan', 'deutan', 'tritan'] as const) {
      expect(simulationMatrix(f, 0.5)).toEqual(MACHADO_TABLE[f][5]);
      const mid = simulationMatrix(f, 0.55);
      mid.forEach((v, i) => expect(v).toBeCloseTo((MACHADO_TABLE[f][5][i] + MACHADO_TABLE[f][6][i]) / 2, 9));
    }
  });
});
