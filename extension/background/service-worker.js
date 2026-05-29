const STORAGE_KEYS = { profile: 'af_profile', backendUrl: 'af_backend_url' };
const PROD_URL = 'https://formfiller-extension.vercel.app';

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(STORAGE_KEYS.backendUrl, (r) => {
    if (!r[STORAGE_KEYS.backendUrl]) chrome.storage.local.set({ [STORAGE_KEYS.backendUrl]: PROD_URL });
  });
  updateBadge();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STORAGE_KEYS.profile]) updateBadge();
});

async function updateBadge() {
  const r = await chrome.storage.local.get(STORAGE_KEYS.profile);
  const has = !!r[STORAGE_KEYS.profile];
  chrome.action.setBadgeText({ text: has ? '✓' : '' });
  chrome.action.setBadgeBackgroundColor({ color: has ? '#34D399' : '#F87171' });
}

chrome.runtime.onMessage.addListener((msg, _s, send) => {
  if (msg.action === 'PING') send({ status: 'alive' });
  return true;
});
