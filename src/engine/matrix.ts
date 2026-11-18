/** 3x3 matrices stored row-major as a flat tuple of 9 numbers. */
export type Vec3 = readonly [number, number, number];
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

export const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function mul(a: Mat3, b: Mat3): Mat3 {
  const r = new Array<number>(9);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
    }
  }
  return r as unknown as Mat3;
}

export function add(a: Mat3, b: Mat3): Mat3 {
  return a.map((v, i) => v + b[i]) as unknown as Mat3;
}

export function sub(a: Mat3, b: Mat3): Mat3 {
  return a.map((v, i) => v - b[i]) as unknown as Mat3;
}

export function scale(a: Mat3, k: number): Mat3 {
  return a.map((v) => v * k) as unknown as Mat3;
}

/** Linear interpolation (1-t)*a + t*b. */
export function lerp(a: Mat3, b: Mat3, t: number): Mat3 {
  return a.map((v, i) => v + (b[i] - v) * t) as unknown as Mat3;
}

export function apply(m: Mat3, v: Vec3): [number, number, number] {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

export function det(m: Mat3): number {
  return (
    m[0] * (m[4] * m[8] - m[5] * m[7]) -
    m[1] * (m[3] * m[8] - m[5] * m[6]) +
    m[2] * (m[3] * m[7] - m[4] * m[6])
  );
}

/** Returns null for (near-)singular matrices. */
export function inverse(m: Mat3): Mat3 | null {
  const d = det(m);
  if (Math.abs(d) < 1e-9) return null;
  const inv = [
    m[4] * m[8] - m[5] * m[7],
    m[2] * m[7] - m[1] * m[8],
    m[1] * m[5] - m[2] * m[4],
    m[5] * m[6] - m[3] * m[8],
    m[0] * m[8] - m[2] * m[6],
    m[2] * m[3] - m[0] * m[5],
    m[3] * m[7] - m[4] * m[6],
    m[1] * m[6] - m[0] * m[7],
    m[0] * m[4] - m[1] * m[3],
  ].map((v) => v / d);
  return inv as unknown as Mat3;
}

export function cross(a: Vec3, b: Vec3): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function norm(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

export function row(m: Mat3, i: number): [number, number, number] {
  return [m[i * 3], m[i * 3 + 1], m[i * 3 + 2]];
}
