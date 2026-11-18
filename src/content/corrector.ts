/**
 * DOM side of the correction: one hidden SVG <filter> (feColorMatrix, linearRGB) referenced from a
 * single stylesheet rule on <html>. The page's own DOM is never rewritten, so:
 *  - removal is exact and immediate (delete two nodes),
 *  - nothing can be transformed twice (there is one filter, applied once, at the root),
 *  - dynamically inserted content, shadow DOM, iframes, images, canvas, WebGL and video are all
 *    corrected by the compositor with no per-node work and no mutation loops.
 *
 * A MutationObserver (childList only, no subtree, debounced, rate limited) exists purely to
 * re-attach our two nodes if the page removes them or replaces <html> (document.open/write).
 */
import { feColorMatrixValues } from '../engine/svgFilter';
import type { Mat3 } from '../engine/matrix';

export const SVG_ID = 'colorvision-svg';
export const STYLE_ID = 'colorvision-style';
export const FILTER_ID = 'colorvision-filter';
export const INVERSE_FILTER_ID = 'colorvision-filter-inverse';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MAX_REATTACH = 20;
const REATTACH_WINDOW_MS = 10_000;

export interface CorrectorOptions {
  matrix: Mat3;
  /** Approximate inverse, applied to <video> to leave it uncorrected. null = leave video corrected. */
  videoInverse: Mat3 | null;
}

export type CorrectorState = 'idle' | 'applied' | 'blocked';

export class Corrector {
  private svg: SVGSVGElement | null = null;
  private style: HTMLStyleElement | null = null;
  private observer: MutationObserver | null = null;
  private timer: number | null = null;
  private reattachTimes: number[] = [];
  private _state: CorrectorState = 'idle';

  constructor(private readonly doc: Document = document) {}

  get state(): CorrectorState {
    return this._state;
  }

  /** True if our nodes are really in the document right now. */
  get isLive(): boolean {
    return !!this.svg?.isConnected && !!this.style?.isConnected;
  }

  apply(opts: CorrectorOptions): void {
    // Re-applying (settings changed on an open page) must replace, never stack, the previous nodes.
    this.svg?.remove();
    this.style?.remove();
    this.build(opts);
    this.attach();
    this.observe();
    this._state = 'applied';
    this.reattachTimes = [];
  }

  remove(): void {
    this.observer?.disconnect();
    this.observer = null;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.svg?.remove();
    this.style?.remove();
    this.svg = null;
    this.style = null;
    this._state = 'idle';
  }

  private build(opts: CorrectorOptions): void {
    const svg = this.doc.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    svg.setAttribute('id', SVG_ID);
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;');
    const defs = this.doc.createElementNS(SVG_NS, 'defs');
    defs.appendChild(this.filterNode(FILTER_ID, opts.matrix));
    if (opts.videoInverse) defs.appendChild(this.filterNode(INVERSE_FILTER_ID, opts.videoInverse));
    svg.appendChild(defs);

    const style = this.doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      `html{filter:url(#${FILTER_ID}) !important;}` +
      (opts.videoInverse ? `:where(video){filter:url(#${INVERSE_FILTER_ID});}` : '');

    this.svg = svg;
    this.style = style;
  }

  private filterNode(id: string, m: Mat3): SVGFilterElement {
    const filter = this.doc.createElementNS(SVG_NS, 'filter') as SVGFilterElement;
    filter.setAttribute('id', id);
    filter.setAttribute('color-interpolation-filters', 'linearRGB');
    filter.setAttribute('x', '0');
    filter.setAttribute('y', '0');
    filter.setAttribute('width', '100%');
    filter.setAttribute('height', '100%');
    const fe = this.doc.createElementNS(SVG_NS, 'feColorMatrix');
    fe.setAttribute('type', 'matrix');
    fe.setAttribute('values', feColorMatrixValues(m));
    filter.appendChild(fe);
    return filter;
  }

  private attach(): void {
    const root = this.doc.documentElement;
    if (!root || !this.svg || !this.style) return;
    if (!this.style.isConnected) root.appendChild(this.style);
    if (!this.svg.isConnected) root.appendChild(this.svg);
  }

  private observe(): void {
    this.observer?.disconnect();
    this.observer = new MutationObserver(() => this.schedule());
    this.observer.observe(this.doc, { childList: true });
    if (this.doc.documentElement) this.observer.observe(this.doc.documentElement, { childList: true });
  }

  private schedule(): void {
    if (this.timer !== null || this._state !== 'applied') return;
    this.timer = window.setTimeout(() => {
      this.timer = null;
      if (this._state !== 'applied' || this.isLive) return;
      const now = Date.now();
      this.reattachTimes = this.reattachTimes.filter((t) => now - t < REATTACH_WINDOW_MS);
      if (this.reattachTimes.length >= MAX_REATTACH) {
        // The page keeps removing us: stop fighting instead of looping forever.
        this.observer?.disconnect();
        this._state = 'blocked';
        return;
      }
      this.reattachTimes.push(now);
      this.attach();
      this.observe();
    }, 60);
  }
}
