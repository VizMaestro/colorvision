import { describe, expect, it } from 'vitest';
import { applyMatrixToPixels, transformed } from '../src/image/process';
import { IDENTITY, apply, correctionMatrix, linearToSrgb, srgbToLinear, hexToRgbBytes, rgbBytesToHex } from '../src/engine';

function px(...rgb: number[]) {
  const d = new Uint8ClampedArray(rgb.length / 3 * 4);
  for (let i = 0; i < rgb.length / 3; i++) { d[i * 4] = rgb[i * 3]; d[i * 4 + 1] = rgb[i * 3 + 1]; d[i * 4 + 2] = rgb[i * 3 + 2]; d[i * 4 + 3] = 200 + i; }
  return { data: d, width: rgb.length / 3, height: 1 };
}

describe('image processing', () => {
  it('identity leaves every 8-bit value unchanged and never touches alpha', () => {
    const vals: number[] = [];
    for (let v = 0; v < 256; v += 5) vals.push(v, 255 - v, (v * 7) % 256);
    const buf = px(...vals);
    const out = transformed(buf, IDENTITY);
    for (let i = 0; i < buf.data.length; i++) expect(Math.abs(out.data[i] - buf.data[i])).toBeLessThanOrEqual(1);
    for (let i = 3; i < buf.data.length; i += 4) expect(out.data[i]).toBe(buf.data[i]);
  });
  it('matches the engine on individual colours (CPU path == filter path)', () => {
    const M = correctionMatrix({ profile: 'protanopia', strength: 0.8, mode: 'enhanced' });
    const colours: Array<[number, number, number]> = [[214, 39, 40], [44, 160, 44], [31, 119, 180], [128, 128, 128], [255, 255, 255], [0, 0, 0]];
    const buf = px(...colours.flat());
    const out = transformed(buf, M);
    colours.forEach((c, i) => {
      const lin = c.map((v) => srgbToLinear(v / 255)) as [number, number, number];
      const exp = apply(M, lin).map((v) => Math.round(linearToSrgb(Math.min(1, Math.max(0, v))) * 255));
      for (let k = 0; k < 3; k++) expect(Math.abs(out.data[i * 4 + k] - exp[k])).toBeLessThanOrEqual(1);
    });
  });
  it('keeps greys and black/white fixed', () => {
    const M = correctionMatrix({ profile: 'tritanopia', strength: 1, mode: 'enhanced' });
    const buf = px(0, 0, 0, 255, 255, 255, 90, 90, 90);
    applyMatrixToPixels(buf, M);
    for (let i = 0; i < 3; i++) {
      const [r, g, b] = [buf.data[i * 4], buf.data[i * 4 + 1], buf.data[i * 4 + 2]];
      expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(2);
    }
  });
  it('does not mutate the source in transformed()', () => {
    const buf = px(214, 39, 40);
    const copy = new Uint8ClampedArray(buf.data);
    transformed(buf, correctionMatrix({ profile: 'deuteranopia', strength: 1, mode: 'natural' }));
    expect(Array.from(buf.data)).toEqual(Array.from(copy));
  });
  it('hex helpers round-trip', () => {
    expect(rgbBytesToHex(...hexToRgbBytes('#1f77b4'))).toBe('#1f77b4');
    expect(hexToRgbBytes('#fa0')).toEqual([255, 170, 0]);
  });
});
