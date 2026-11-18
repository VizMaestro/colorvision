/** sRGB <-> linear-light transfer functions (IEC 61966-2-1). Channel values are 0..1 unless noted. */

export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(c: number): number {
  const v = c <= 0 ? 0 : c >= 1 ? 1 : c;
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

/** Luminance weights for linear sRGB primaries (Rec. 709 / D65). */
export const LUMA: readonly [number, number, number] = [0.2126, 0.7152, 0.0722];

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

const BYTE_TO_LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i++) BYTE_TO_LINEAR[i] = srgbToLinear(i / 255);

export function byteToLinear(b: number): number {
  return BYTE_TO_LINEAR[b];
}

const LINEAR_TO_BYTE_SIZE = 4096;
const LINEAR_TO_BYTE = new Uint8Array(LINEAR_TO_BYTE_SIZE + 1);
for (let i = 0; i <= LINEAR_TO_BYTE_SIZE; i++) {
  LINEAR_TO_BYTE[i] = Math.round(linearToSrgb(i / LINEAR_TO_BYTE_SIZE) * 255);
}

/** Fast linear (0..1, clamped) to sRGB byte using a 4096-entry LUT. */
export function linearToByte(v: number): number {
  return LINEAR_TO_BYTE[Math.round(clamp01(v) * LINEAR_TO_BYTE_SIZE)];
}

export function hexToRgbBytes(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbBytesToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
