import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, decideForHost, sanitizeSettings, type Settings } from '../src/settings/schema';

const base = (p: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, sites: {}, ...p });

describe('settings sanitising (storage is untrusted input)', () => {
  it('falls back to defaults for garbage', () => {
    for (const bad of [null, undefined, 42, 'x', [], {}]) expect(sanitizeSettings(bad)).toEqual(sanitizeSettings(DEFAULT_SETTINGS));
  });
  it('clamps and validates fields', () => {
    const s = sanitizeSettings({ enabled: true, profile: 'nope', strength: 7, mode: 'wild', auto: 'yes', sites: { 'a.com': 'on', 'b.com': 'maybe' } });
    expect(s.profile).toBe(DEFAULT_SETTINGS.profile);
    expect(s.strength).toBe(1);
    expect(s.mode).toBe('natural');
    expect(s.auto).toBe(true);
    expect(s.sites).toEqual({ 'a.com': 'on' });
    expect(sanitizeSettings({ strength: -4 }).strength).toBe(0);
    expect(sanitizeSettings({ strength: Number.NaN }).strength).toBe(DEFAULT_SETTINGS.strength);
  });
  it('keeps a valid calibration and drops an invalid one', () => {
    const ok = sanitizeSettings({ calibration: { family: 'deutan', severity: 0.4, strength: 0.5, mode: 'enhanced', completedAt: 1 } });
    expect(ok.calibration).toMatchObject({ family: 'deutan', severity: 0.4, mode: 'enhanced' });
    expect(sanitizeSettings({ calibration: { family: 'x', severity: 0.4, strength: 0.5 } }).calibration).toBeNull();
    expect(sanitizeSettings({ calibration: { family: 'deutan', severity: 'a', strength: 0.5 } }).calibration).toBeNull();
  });
  it('is off by default so nothing changes until the user opts in', () => {
    expect(DEFAULT_SETTINGS.enabled).toBe(false);
  });
});

describe('per-site decisions', () => {
  it('master switch off wins over everything', () => {
    expect(decideForHost(base({ enabled: false, sites: { 'a.com': 'on' } }), 'a.com')).toEqual({ apply: false, reason: 'disabled' });
  });
  it('auto applies everywhere except sites switched off', () => {
    const s = base({ enabled: true, auto: true, sites: { 'x.com': 'off' } });
    expect(decideForHost(s, 'a.com')).toEqual({ apply: true, reason: 'auto' });
    expect(decideForHost(s, 'x.com')).toEqual({ apply: false, reason: 'site-off' });
  });
  it('auto off applies only to sites switched on', () => {
    const s = base({ enabled: true, auto: false, sites: { 'y.com': 'on' } });
    expect(decideForHost(s, 'a.com')).toEqual({ apply: false, reason: 'auto-off' });
    expect(decideForHost(s, 'y.com')).toEqual({ apply: true, reason: 'site-on' });
  });
  it('strength 0 never applies a filter', () => {
    expect(decideForHost(base({ enabled: true, strength: 0 }), 'a.com')).toEqual({ apply: false, reason: 'strength-zero' });
  });
});
