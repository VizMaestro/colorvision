import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_SETTINGS, sanitizeSettings, type Settings } from '../settings/schema';
import { loadSettings, onSettingsChanged, resetSettings, saveSettings } from '../settings/storage';
import { MSG_STATUS, type StatusReply } from '../messages';

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const latest = useRef<Settings>(DEFAULT_SETTINGS);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    loadSettings().then((s) => {
      if (!alive) return;
      latest.current = s;
      setSettings(s);
    });
    const off = onSettingsChanged((s) => {
      latest.current = s;
      setSettings(s);
    });
    return () => {
      alive = false;
      off();
    };
  }, []);

  const flush = useCallback(() => {
    if (timer.current === null) return;
    window.clearTimeout(timer.current);
    timer.current = null;
    void saveSettings(latest.current);
  }, []);

  // A popup can close at any moment: never leave a pending change unwritten.
  useEffect(() => {
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [flush]);

  /** Discrete changes (switches, profile, mode, pause, ...) are written immediately; only slider drags are coalesced. */
  const update = useCallback(
    (patch: Partial<Settings>, opts?: { debounce?: boolean }) => {
      const next = sanitizeSettings({ ...latest.current, ...patch });
      latest.current = next;
      setSettings(next);
      if (!opts?.debounce) {
        if (timer.current !== null) window.clearTimeout(timer.current);
        timer.current = null;
        void saveSettings(next);
        return;
      }
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, 60);
    },
    [flush],
  );

  const reset = useCallback(async () => {
    const fresh = await resetSettings();
    latest.current = fresh;
    setSettings(fresh);
  }, []);

  return { settings, update, reset, flush };
}

export type SiteState =
  | { kind: 'loading' }
  | { kind: 'unsupported'; detail: string }
  | { kind: 'ready'; host: string; applied: boolean; blocked: boolean; reason: StatusReply['reason'] };

/** Status of the active tab: what the user's settings say, and what the page actually reports. */
export function useSiteState(settings: Settings | null): SiteState {
  const [state, setState] = useState<SiteState>({ kind: 'loading' });
  const key = settings ? JSON.stringify([settings.enabled, settings.auto, settings.sites, settings.strength]) : '';

  useEffect(() => {
    if (!settings) return;
    let alive = true;
    const run = async () => {
      // Only the tab id is needed: the content script itself reports the host and its real state,
      // so no "tabs" permission and no page URL access are required.
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        if (alive) setState({ kind: 'unsupported', detail: 'No page is open in this window.' });
        return;
      }
      try {
        const reply = (await chrome.tabs.sendMessage(tab.id, { type: MSG_STATUS })) as StatusReply | undefined;
        if (!alive) return;
        if (reply) setState({ kind: 'ready', host: reply.host, applied: reply.applied, blocked: reply.blocked, reason: reply.reason });
        else throw new Error('no reply');
      } catch {
        if (!alive) return;
        // Without a "tabs" permission the page URL is unknown, so one honest message covers both causes.
        setState({
          kind: 'unsupported',
          detail:
            'Browser pages, the Chrome Web Store and local files cannot be adjusted. If this is a normal website that was open before ColorVision was installed or updated, reload the tab.',
        });
      }
    };
    // Query once the content script has had time to react, and again to settle after slow pages.
    const t1 = window.setTimeout(run, 120);
    const t2 = window.setTimeout(run, 700);
    return () => {
      alive = false;
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, !!settings]);

  return state;
}
