/**
 * Procedural preview scene used by the popup: a hue ramp, red/green/blue data bars, a "traffic light"
 * style legend, and a few semantic swatches. Drawn with the 2D canvas API, no assets required.
 */
export function drawPreviewScene(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);

  const rampH = Math.round(h * 0.26);
  for (let x = 0; x < w; x++) {
    ctx.fillStyle = `hsl(${Math.round((x / w) * 330)}, 78%, 50%)`;
    ctx.fillRect(x, 0, 1, rampH);
  }

  const cols = ['#d62728', '#2ca02c', '#1f77b4', '#ff7f0e', '#9467bd', '#8c564b'];
  const barW = Math.floor((w - 14) / cols.length) - 4;
  const chartTop = rampH + 8;
  const chartH = Math.round(h * 0.42);
  cols.forEach((c, i) => {
    const bh = chartH * (0.45 + ((i * 37) % 55) / 100);
    ctx.fillStyle = c;
    ctx.fillRect(7 + i * (barW + 4), chartTop + chartH - bh, barW, bh);
  });

  const sw = [
    ['#e53935', '#43a047'],
    ['#c0392b', '#27ae60'],
    ['#8e44ad', '#2980b9'],
    ['#f39c12', '#7cb342'],
  ];
  const sy = chartTop + chartH + 8;
  const sh = h - sy - 6;
  const cw = Math.floor((w - 14) / sw.length);
  sw.forEach(([a, b], i) => {
    const x = 7 + i * cw;
    ctx.fillStyle = a;
    ctx.fillRect(x, sy, cw / 2 - 1, sh);
    ctx.fillStyle = b;
    ctx.fillRect(x + cw / 2, sy, cw / 2 - 4, sh);
  });
}
