import { useMemo } from 'react';
import { useSettings, useSiteState, type SiteState } from './hooks';
import { Preview } from './Preview';
import { PROFILES, getProfile, type CorrectionMode, type Family } from '../engine/profiles';
import type { Settings } from '../settings/schema';

const FAMILY_ORDER: { family: Family; title: string }[] = [
  { family: 'protan', title: 'Protan (red)' },
  { family: 'deutan', title: 'Deutan (green)' },
  { family: 'tritan', title: 'Tritan (blue)' },
];

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)} />
  );
}

function StatusCard({ settings, site, onSiteToggle }: { settings: Settings; site: SiteState; onSiteToggle: (host: string, to: 'on' | 'off' | null) => void }) {
  let tone: 'ok' | 'warn' | 'off' = 'off';
  let title = 'Checking this page…';
  let detail = '';
  let action: { label: string; run: () => void } | null = null;

  if (!settings.enabled) {
    title = 'Correction is off';
    detail = 'Turn it on with the switch above.';
  } else if (site.kind === 'unsupported') {
    tone = 'warn';
    title = 'Not active on this page';
    detail = site.detail;
  } else if (site.kind === 'ready') {
    const host = site.host;
    if (site.blocked) {
      tone = 'warn';
      title = 'This page keeps removing the filter';
      detail = 'ColorVision stopped retrying to avoid slowing the page.';
    } else if (site.applied) {
      tone = 'ok';
      title = 'Active on this site';
      detail = host;
      action = { label: 'Pause on this site', run: () => onSiteToggle(host, settings.auto ? 'off' : null) };
    } else if (site.reason === 'site-off') {
      title = 'Paused on this site';
      detail = host;
      action = { label: 'Resume on this site', run: () => onSiteToggle(host, 'on') };
    } else if (site.reason === 'auto-off') {
      title = 'Not applied here';
      detail = 'Automatic mode is off. Enable it for ' + host + '.';
      action = { label: 'Enable on this site', run: () => onSiteToggle(host, 'on') };
    } else if (site.reason === 'strength-zero') {
      title = 'Intensity is 0%';
      detail = 'Raise the intensity to see a change.';
    } else {
      title = 'Starting…';
      detail = host;
    }
  }

  return (
    <section className="card status" data-tone={tone} aria-live="polite" aria-label="Current website status">
      <span className="dot" aria-hidden="true" />
      <div className="status-text">
        <strong>{title}</strong>
        {detail && <span>{detail}</span>}
      </div>
      {action && (
        <button type="button" className="btn" onClick={action.run}>
          {action.label}
        </button>
      )}
    </section>
  );
}

export function App() {
  const { settings, update, reset, flush } = useSettings();
  const site = useSiteState(settings);
  const profile = useMemo(() => (settings ? getProfile(settings.profile) : null), [settings]);

  if (!settings || !profile) return <main className="popup"><p className="hint">Loading…</p></main>;

  const setSite = (host: string, to: 'on' | 'off' | null) => {
    const sites = { ...settings.sites };
    if (to === null) delete sites[host];
    else sites[host] = to;
    update({ sites });
  };

  const percent = Math.round(settings.strength * 100);
  const calibrated = settings.calibration && settings.calibration.family === profile.family;

  return (
    <main className="popup">
      <header className="top">
        <div className="brand">
          <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">
            <defs>
              <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#f0524f" />
                <stop offset="0.5" stopColor="#3fbf6b" />
                <stop offset="1" stopColor="#4a63f0" />
              </linearGradient>
            </defs>
            <circle cx="16" cy="16" r="11" fill="none" stroke="url(#g)" strokeWidth="6" />
          </svg>
          <div>
            <h1>ColorVision</h1>
            <span className="sub">Easier-to-tell-apart colors</span>
          </div>
        </div>
        <Switch checked={settings.enabled} onChange={(enabled) => update({ enabled })} label="Enable color correction" />
      </header>

      <StatusCard settings={settings} site={site} onSiteToggle={setSite} />

      <section className="card section" aria-labelledby="profile-h">
        <h2 id="profile-h">Color vision profile</h2>
        <div role="radiogroup" aria-labelledby="profile-h" className="profile-grid">
          {FAMILY_ORDER.map(({ family, title }) => (
            <div key={family} className="profile-col">
              <span className="col-title">{title}</span>
              {PROFILES.filter((p) => p.family === family).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={settings.profile === p.id}
                  className="chip"
                  title={p.description}
                  onClick={() => update({ profile: p.id })}
                >
                  <span className="chip-name">{p.label}</span>
                  <span className="chip-sub">{p.short}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
        <p className="hint">{profile.description}</p>
      </section>

      <section className="card section" aria-labelledby="int-h">
        <div className="section-head">
          <h2 id="int-h">Intensity</h2>
          <output htmlFor="intensity" className="value">{percent}%</output>
        </div>
        <input
          id="intensity"
          className="slider"
          type="range"
          min={0}
          max={100}
          step={1}
          value={percent}
          aria-label="Correction intensity"
          aria-valuetext={`${percent} percent`}
          onChange={(e) => update({ strength: Number(e.target.value) / 100 }, { debounce: true })}
          onPointerUp={flush}
          onKeyUp={flush}
          onBlur={flush}
        />
        <div role="radiogroup" aria-label="Correction mode" className="segmented">
          {(['natural', 'enhanced'] as CorrectionMode[]).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={settings.mode === m} onClick={() => update({ mode: m })}>
              {m === 'natural' ? 'Natural' : 'Enhanced'}
            </button>
          ))}
        </div>
        <p className="hint">
          {settings.mode === 'natural'
            ? 'Natural: gentle shifts that keep pages looking familiar.'
            : 'Enhanced: stronger separation of confusable colors; hues change more.'}
        </p>
      </section>

      <Preview settings={settings} />

      <section className="card section rows">
        <div className="row">
          <div>
            <strong>Apply automatically</strong>
            <span className="hint">Correct every website. When off, enable sites one by one.</span>
          </div>
          <Switch checked={settings.auto} onChange={(auto) => update({ auto })} label="Apply correction automatically on all sites" />
        </div>
        <div className="row">
          <div>
            <strong>Correct video</strong>
            <span className="hint">Off partly reverses it for video (approximate; saturated colors may still shift).</span>
          </div>
          <Switch checked={settings.processVideo} onChange={(processVideo) => update({ processVideo })} label="Correct video" />
        </div>
      </section>

      <footer className="foot">
        <button type="button" className="btn primary" onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL('calibration.html') })}>
          {calibrated ? 'Recalibrate' : 'Personal calibration'}
        </button>
        <button type="button" className="btn ghost" onClick={() => void reset()}>
          Reset settings
        </button>
      </footer>
      <p className="legal">
        ColorVision improves how easily colors can be told apart. It does not restore normal color vision, and it is not a medical device or a
        diagnosis. Settings stay on this device.
      </p>
    </main>
  );
}
