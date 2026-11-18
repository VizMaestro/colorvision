import { useEffect, useMemo, useRef, useState } from 'react';
import type { Settings } from '../settings/schema';
import { matrixFromSettings, severityFromSettings } from '../settings/storage';
import { getProfile } from '../engine/profiles';
import { simulationMatrix } from '../engine/simulate';
import { IDENTITY, type Mat3 } from '../engine/matrix';
import { mul } from '../engine/matrix';
import { drawPreviewScene } from '../image/scene';
import { applyMatrixToPixels } from '../image/process';

const W = 168;
const H = 104;

function Canvas({ matrix, label, sim }: { matrix: Mat3; label: string; sim: Mat3 | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d', { willReadFrequently: true });
    if (!c || !ctx) return;
    drawPreviewScene(ctx, W, H);
    const img = ctx.getImageData(0, 0, W, H);
    applyMatrixToPixels(img, sim ? mul(sim, matrix) : matrix);
    ctx.putImageData(img, 0, 0);
  }, [matrix, sim]);
  return (
    <figure className="preview-fig">
      <canvas ref={ref} width={W} height={H} role="img" aria-label={label} />
      <figcaption>{label}</figcaption>
    </figure>
  );
}

export function Preview({ settings }: { settings: Settings }) {
  const [simulate, setSimulate] = useState(false);
  const corrected = useMemo(() => matrixFromSettings(settings), [settings]);
  const sim = useMemo(() => {
    if (!simulate) return null;
    return simulationMatrix(getProfile(settings.profile).family, severityFromSettings(settings));
  }, [simulate, settings]);

  return (
    <section className="card section" aria-labelledby="preview-h">
      <div className="section-head">
        <h2 id="preview-h">Preview</h2>
        <label className="check">
          <input type="checkbox" checked={simulate} onChange={(e) => setSimulate(e.target.checked)} />
          <span>Simulate my profile</span>
        </label>
      </div>
      <div className="preview-grid">
        <Canvas matrix={IDENTITY} sim={sim} label={simulate ? 'Original (simulated)' : 'Original'} />
        <Canvas matrix={corrected} sim={sim} label={simulate ? 'Corrected (simulated)' : 'Corrected'} />
      </div>
      <p className="hint">
        {simulate
          ? 'A simulation is an approximate model of how colors may appear with your profile. It is not a restoration of vision.'
          : 'Corrected colors are shifted so hard-to-separate colors differ along an axis you can see. Brightness is kept.'}
      </p>
    </section>
  );
}
