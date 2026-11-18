import type { Mat3 } from './matrix';

/** feColorMatrix `values` string (4x5, row-major) for a linear-RGB 3x3 matrix. Alpha is untouched. */
export function feColorMatrixValues(m: Mat3): string {
  const f = (v: number) => (Math.abs(v) < 1e-9 ? 0 : Number(v.toFixed(6)));
  return [
    `${f(m[0])} ${f(m[1])} ${f(m[2])} 0 0`,
    `${f(m[3])} ${f(m[4])} ${f(m[5])} 0 0`,
    `${f(m[6])} ${f(m[7])} ${f(m[8])} 0 0`,
    '0 0 0 1 0',
  ].join(' ');
}
