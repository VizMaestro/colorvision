export type Family = 'protan' | 'deutan' | 'tritan';
export type ProfileId =
  | 'protanopia'
  | 'protanomaly'
  | 'deuteranopia'
  | 'deuteranomaly'
  | 'tritanopia'
  | 'tritanomaly';
export type CorrectionMode = 'natural' | 'enhanced';

export interface ProfileInfo {
  id: ProfileId;
  family: Family;
  /** true = anomalous trichromacy (reduced sensitivity); false = dichromacy (cone class absent). */
  anomalous: boolean;
  label: string;
  short: string;
  description: string;
  /** Severity (0..1) assumed until the user calibrates. Dichromacy is always 1. */
  defaultSeverity: number;
}

export const PROFILES: readonly ProfileInfo[] = [
  {
    id: 'protanomaly',
    family: 'protan',
    anomalous: true,
    label: 'Protanomaly',
    short: 'Weak red',
    description: 'Reduced sensitivity to red light (anomalous L-cones).',
    defaultSeverity: 0.6,
  },
  {
    id: 'protanopia',
    family: 'protan',
    anomalous: false,
    label: 'Protanopia',
    short: 'No red',
    description: 'No functioning red (L) cones.',
    defaultSeverity: 1,
  },
  {
    id: 'deuteranomaly',
    family: 'deutan',
    anomalous: true,
    label: 'Deuteranomaly',
    short: 'Weak green',
    description: 'Reduced sensitivity to green light (anomalous M-cones). The most common type.',
    defaultSeverity: 0.6,
  },
  {
    id: 'deuteranopia',
    family: 'deutan',
    anomalous: false,
    label: 'Deuteranopia',
    short: 'No green',
    description: 'No functioning green (M) cones.',
    defaultSeverity: 1,
  },
  {
    id: 'tritanomaly',
    family: 'tritan',
    anomalous: true,
    label: 'Tritanomaly',
    short: 'Weak blue',
    description: 'Reduced sensitivity to blue light (anomalous S-cones). Rare.',
    defaultSeverity: 0.6,
  },
  {
    id: 'tritanopia',
    family: 'tritan',
    anomalous: false,
    label: 'Tritanopia',
    short: 'No blue',
    description: 'No functioning blue (S) cones. Very rare.',
    defaultSeverity: 1,
  },
];

export function getProfile(id: ProfileId): ProfileInfo {
  const p = PROFILES.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown profile: ${id}`);
  return p;
}

export function isProfileId(v: unknown): v is ProfileId {
  return typeof v === 'string' && PROFILES.some((p) => p.id === v);
}
