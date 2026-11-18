/**
 * CPU image processing: apply a linear-RGB 3x3 matrix (correction or simulation) to pixel data.
 * Uses LUTs for the sRGB transfer function. Works on any ImageData-like object, so it is usable
 * in the popup preview, in a Web Worker, and in tests.
 */
import { byteToLinear, linearToByte } from '../engine/linear';
import type { Mat3 } from '../engine/matrix';

export interface PixelBuffer {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

export function applyMatrixToPixels(buf: PixelBuffer, m: Mat3): void {
  const d = buf.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = byteToLinear(d[i]);
    const g = byteToLinear(d[i + 1]);
    const b = byteToLinear(d[i + 2]);
    d[i] = linearToByte(m[0] * r + m[1] * g + m[2] * b);
    d[i + 1] = linearToByte(m[3] * r + m[4] * g + m[5] * b);
    d[i + 2] = linearToByte(m[6] * r + m[7] * g + m[8] * b);
  }
}

export function cloneBuffer(buf: PixelBuffer): PixelBuffer {
  return { data: new Uint8ClampedArray(buf.data), width: buf.width, height: buf.height };
}

/** Return a processed copy; the input is untouched. */
export function transformed(buf: PixelBuffer, m: Mat3): PixelBuffer {
  const out = cloneBuffer(buf);
  applyMatrixToPixels(out, m);
  return out;
}
