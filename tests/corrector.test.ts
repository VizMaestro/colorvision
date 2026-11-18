// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Corrector, FILTER_ID, INVERSE_FILTER_ID, STYLE_ID, SVG_ID } from '../src/content/corrector';
import { correctionMatrix, feColorMatrixValues, inverseCorrectionMatrix } from '../src/engine';

const opts = (strength: number, video = true) => {
  const p = { profile: 'deuteranopia' as const, strength, mode: 'natural' as const };
  return { matrix: correctionMatrix(p), videoInverse: video ? inverseCorrectionMatrix(p) : null };
};

describe('Corrector (DOM)', () => {
  afterEach(() => {
    document.documentElement.innerHTML = '<head></head><body></body>';
    document.documentElement.removeAttribute('style');
  });

  it('applies exactly one svg + one style, and removes them cleanly', () => {
    const c = new Corrector(document);
    c.apply(opts(0.6));
    expect(document.querySelectorAll(`#${SVG_ID}`)).toHaveLength(1);
    expect(document.querySelectorAll(`#${STYLE_ID}`)).toHaveLength(1);
    expect(c.isLive).toBe(true);
    c.remove();
    expect(document.documentElement.outerHTML).not.toContain('colorvision');
    expect(c.state).toBe('idle');
  });

  it('re-applying with new settings replaces nodes instead of stacking them', () => {
    const c = new Corrector(document);
    c.apply(opts(0.3));
    c.apply(opts(0.9));
    c.apply(opts(0.5));
    expect(document.querySelectorAll(`#${SVG_ID}`)).toHaveLength(1);
    expect(document.querySelectorAll(`#${FILTER_ID}`)).toHaveLength(1);
    const vals = document.querySelector(`#${FILTER_ID} feColorMatrix`)!.getAttribute('values');
    expect(vals).toBe(feColorMatrixValues(opts(0.5).matrix));
    c.remove();
  });

  it('only emits the video inverse filter when requested', () => {
    const c = new Corrector(document);
    c.apply(opts(0.6, true));
    expect(document.getElementById(INVERSE_FILTER_ID)).not.toBeNull();
    expect(document.getElementById(STYLE_ID)!.textContent).toContain('video');
    c.apply(opts(0.6, false));
    expect(document.getElementById(INVERSE_FILTER_ID)).toBeNull();
    expect(document.getElementById(STYLE_ID)!.textContent).not.toContain('video');
    c.remove();
  });

  it('never touches the page inline style or other nodes', () => {
    document.body.innerHTML = '<p id="x">hello</p>';
    const c = new Corrector(document);
    c.apply(opts(0.6));
    expect(document.documentElement.getAttribute('style')).toBeNull();
    expect(document.getElementById('x')!.outerHTML).toBe('<p id="x">hello</p>');
    c.remove();
  });

  it('re-attaches after the page removes the nodes, then gives up if it keeps doing so', async () => {
    const c = new Corrector(document);
    c.apply(opts(0.6));
    document.getElementById(SVG_ID)!.remove();
    await new Promise((r) => setTimeout(r, 200));
    expect(c.isLive).toBe(true);

    let removals = 0;
    const hostile = new MutationObserver(() => {
      const el = document.getElementById(SVG_ID);
      if (el) {
        el.remove();
        removals++;
      }
    });
    hostile.observe(document.documentElement, { childList: true });
    document.getElementById(SVG_ID)!.remove();
    // 20 allowed retries at ~60ms each, then the corrector must stop.
    await new Promise((r) => setTimeout(r, 2500));
    hostile.disconnect();
    expect(c.state).toBe('blocked');
    expect(removals).toBeLessThanOrEqual(21);
    c.remove();
  }, 10000);
});
