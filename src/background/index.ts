/** Minimal service worker: keyboard shortcut to switch correction on/off instantly. No network, no data. */
import { loadSettings, saveSettings } from '../settings/storage';

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-correction') return;
  const s = await loadSettings();
  await saveSettings({ ...s, enabled: !s.enabled });
});
