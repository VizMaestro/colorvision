/**
 * Content script entry. Runs in the TOP frame only: child iframes are composited under the top
 * document's <html> filter, so injecting into them as well would correct their colours twice.
 */
import { Corrector } from './corrector';
import { decideForHost, type Settings } from '../settings/schema';
import { loadSettings, matrixFromSettings, onSettingsChanged, paramsFromSettings } from '../settings/storage';
import { inverseCorrectionMatrix } from '../engine/correction';
import { MSG_STATUS, type StatusReply } from '../messages';

declare global {
  interface Window {
    __colorvisionLoaded?: boolean;
  }
}

function isHtmlDocument(): boolean {
  const root = document.documentElement;
  return !!root && root.namespaceURI === 'http://www.w3.org/1999/xhtml';
}

if (window === window.top && !window.__colorvisionLoaded && isHtmlDocument()) {
  window.__colorvisionLoaded = true;
  const host = location.hostname;
  const corrector = new Corrector(document);
  let current: Settings | null = null;

  const reconcile = (s: Settings): void => {
    current = s;
    const decision = decideForHost(s, host);
    if (!decision.apply) {
      corrector.remove();
      return;
    }
    const params = paramsFromSettings(s);
    corrector.apply({
      matrix: matrixFromSettings(s),
      videoInverse: s.processVideo ? null : inverseCorrectionMatrix(params),
    });
  };

  loadSettings().then(reconcile).catch(() => undefined);
  onSettingsChanged(reconcile);

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === MSG_STATUS) {
      const decision = current ? decideForHost(current, host) : null;
      const reply: StatusReply = {
        host,
        applied: corrector.state === 'applied' && corrector.isLive,
        blocked: corrector.state === 'blocked',
        reason: decision ? decision.reason : 'loading',
      };
      sendResponse(reply);
    }
    return false;
  });
}
