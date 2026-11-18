export const MSG_STATUS = 'colorvision:status';

export interface StatusReply {
  host: string;
  /** Our filter is really in the page right now. */
  applied: boolean;
  /** The page keeps removing the filter; we gave up to avoid fighting it. */
  blocked: boolean;
  reason: 'auto' | 'site-on' | 'disabled' | 'site-off' | 'auto-off' | 'strength-zero' | 'loading';
}
