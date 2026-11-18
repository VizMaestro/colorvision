import { isProfileId, type CorrectionMode, type Family, type ProfileId } from '../engine/profiles';
import type { CalibrationResult } from '../calibration/model';

export const SETTINGS_KEY = 'settings';
export const SETTINGS_VERSION = 1;

export type SiteOverride = 'on' | 'off';

export interface Settings {
  version: number;
  /** Master switch. Off = nothing is ever applied. */
  enabled: boolean;
  profile: ProfileId;
  /** 0..1 */
  strength: number;
  mode: CorrectionMode;
  /** true = correct every site automatically; false = only sites switched on by the user. */
  auto: boolean;
  /** Per-hostname overrides. */
  sites: Record<string, SiteOverride>;
  /** Correct <video> too. Off applies a best-effort partial reversal to video (saturated colours still shift). */
  processVideo: boolean;
  calibration: CalibrationResult | null;
}

export const DEFAULT_SETTINGS: Settings = {
  version: SETTINGS_VERSION,
  enabled: false,
  profile: 'deuteranomaly',
  strength: 0.6,
  mode: 'natural',
  auto: true,
  sites: {},
  processVideo: true,
  calibration: null,
};

const FAMILIES: Family[] = ['protan', 'deutan', 'tritan'];

function sanitizeCalibration(v: unknown): CalibrationResult | null {
  if (!v || typeof v !== 'object') return null;
  const c = v as Record<string, unknown>;
  if (!FAMILIES.includes(c.family as Family)) return null;
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
  const severity = num(c.severity);
  const strength = num(c.strength);
  if (severity === null || strength === null) return null;
  return {
    family: c.family as Family,
    severity: Math.min(1, Math.max(0, severity)),
    strength: Math.min(1, Math.max(0, strength)),
    mode: c.mode === 'enhanced' ? 'enhanced' : 'natural',
    completedAt: num(c.completedAt) ?? 0,
  };
}

/** Defensive parse of whatever is in storage. Unknown/invalid fields fall back to defaults. */
export function sanitizeSettings(raw: unknown): Settings {
  const d = DEFAULT_SETTINGS;
  if (!raw || typeof raw !== 'object') return { ...d, sites: {} };
  const r = raw as Record<string, unknown>;
  const sites: Record<string, SiteOverride> = {};
  if (r.sites && typeof r.sites === 'object') {
    for (const [host, v] of Object.entries(r.sites as Record<string, unknown>)) {
      if (v === 'on' || v === 'off') sites[host] = v;
    }
  }
  const strength = typeof r.strength === 'number' && Number.isFinite(r.strength) ? r.strength : d.strength;
  return {
    version: SETTINGS_VERSION,
    enabled: typeof r.enabled === 'boolean' ? r.enabled : d.enabled,
    profile: isProfileId(r.profile) ? r.profile : d.profile,
    strength: Math.min(1, Math.max(0, strength)),
    mode: r.mode === 'enhanced' ? 'enhanced' : 'natural',
    auto: typeof r.auto === 'boolean' ? r.auto : d.auto,
    sites,
    processVideo: typeof r.processVideo === 'boolean' ? r.processVideo : d.processVideo,
    calibration: sanitizeCalibration(r.calibration),
  };
}

export type SiteDecision =
  | { apply: true; reason: 'auto' | 'site-on' }
  | { apply: false; reason: 'disabled' | 'site-off' | 'auto-off' | 'strength-zero' };

export function decideForHost(s: Settings, host: string): SiteDecision {
  if (!s.enabled) return { apply: false, reason: 'disabled' };
  if (s.strength <= 0) return { apply: false, reason: 'strength-zero' };
  const o = s.sites[host];
  if (o === 'off') return { apply: false, reason: 'site-off' };
  if (o === 'on') return { apply: true, reason: 'site-on' };
  return s.auto ? { apply: true, reason: 'auto' } : { apply: false, reason: 'auto-off' };
}
