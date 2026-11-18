/** Thin wrapper over chrome.storage.local. Everything stays on the device. */
import { DEFAULT_SETTINGS, SETTINGS_KEY, sanitizeSettings, type Settings } from './schema';
import { correctionMatrix, effectiveSeverity, type CorrectionParams } from '../engine/correction';
import { getProfile } from '../engine/profiles';
import type { Mat3 } from '../engine/matrix';

export async function loadSettings(): Promise<Settings> {
  const res = await chrome.storage.local.get(SETTINGS_KEY);
  return sanitizeSettings(res[SETTINGS_KEY]);
}

export async function saveSettings(s: Settings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: s });
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = sanitizeSettings({ ...(await loadSettings()), ...patch });
  await saveSettings(next);
  return next;
}

export async function resetSettings(): Promise<Settings> {
  const fresh = sanitizeSettings(DEFAULT_SETTINGS);
  await saveSettings(fresh);
  return fresh;
}

export function onSettingsChanged(cb: (s: Settings) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && changes[SETTINGS_KEY]) cb(sanitizeSettings(changes[SETTINGS_KEY].newValue));
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

/** Personalised severity applies only when the calibration was done for the same family. */
export function paramsFromSettings(s: Settings): CorrectionParams {
  const fam = getProfile(s.profile).family;
  const severity = s.calibration && s.calibration.family === fam ? s.calibration.severity : undefined;
  return { profile: s.profile, strength: s.strength, mode: s.mode, severity };
}

export function matrixFromSettings(s: Settings): Mat3 {
  return correctionMatrix(paramsFromSettings(s));
}

export function severityFromSettings(s: Settings): number {
  const p = paramsFromSettings(s);
  return effectiveSeverity(p.profile, p.severity);
}
