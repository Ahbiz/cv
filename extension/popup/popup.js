'use strict';

const DEFAULT_BACKEND = 'https://formfiller-extension.vercel.app';
const STORAGE_KEYS = { profile: 'af_profile', backendUrl: 'af_backend_url' };

const $ = (sel) => document.querySelector(sel);
const dom = {
  statusDot: $('#statusDot'), statusText: $('#statusText'),
  settingsBtn: $('#settingsBtn'), settingsPanel: $('#settingsPanel'),
  backendUrlInput: $('#backendUrlInput'), saveSettingsBtn: $('#saveSettingsBtn'),
  uploadScreen: $('#uploadScreen'), profileScreen: $('#profileScreen'),
  fileInput: $('#fileInput'), filePreview: $('#filePreview'),
  fileName: $('#fileName'), fileMeta: $('#fileMeta'), clearFileBtn: $('#clearFileBtn'),
  errorBox: $('#errorBox'), errorText: $('#errorText'),
  parseBtn: $('#parseBtn'), parseBtnText: $('#parseBtnText'), parseSpinner: $('#parseSpinner'),
  avatar: $('#avatar'), profileName: $('#profileName'),
  profileEmail: $('#profileEmail'), profilePhone: $('#profilePhone'),
  locationRow: $('#locationRow'), locationText: $('#locationText'),
  expCount: $('#expCount'), eduCount: $('#eduCount'), skillCount: $('#skillCount'),
  skillsContainer: $('#skillsContainer'), skillsChips: $('#skillsChips'),
  fillBtn: $('#fillBtn'), reuploadBtn: $('#reuploadBtn'),
  fillFeedback: $('#fillFeedback'), fillFeedbackText: $('#fillFeedbackText'),
};

let selectedFile = null;
let backendUrl = DEFAULT_BACKEND;
let currentProfile = null;

// --- Init ---

document.addEventListener('DOMContentLoaded', async () => {
  const stored = await chrome.storage.local.get([STORAGE_KEYS.backendUrl, STORAGE_KEYS.profile]);
  backendUrl = stored[STORAGE_KEYS.backendUrl] || DEFAULT_BACKEND;
  dom.backendUrlInput.value = backendUrl;

  if (stored[STORAGE_KEYS.profile]) {
    currentProfile = stored[STORAGE_KEYS.profile];
    showProfileScreen(currentProfile);
  } else {
    showUploadScreen();
  }

  checkBackendHealth();
  bindEvents();
});

// --- Events ---

function bindEvents() {
  dom.settingsBtn.addEventListener('click', () => dom.settingsPanel.classList.toggle('hidden'));

  dom.saveSettingsBtn.addEventListener('click', async () => {
    const url = dom.backendUrlInput.value.trim();
    if (!url) return;
    backendUrl = url.replace(/\/$/, '');
    await chrome.storage.local.set({ [STORAGE_KEYS.backendUrl]: backendUrl });
    dom.settingsPanel.classList.add('hidden');
    checkBackendHealth();
  });

  dom.fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    selectedFile = file;
    dom.fileName.textContent = file.name;
    dom.fileMeta.textContent = `${formatSize(file.size)} • ${file.name.endsWith('.pdf') ? 'PDF' : 'DOCX'}`;
    dom.filePreview.classList.remove('hidden');
    dom.parseBtn.classList.remove('hidden');
    hideError();
  });

  dom.clearFileBtn.addEventListener('click', () => {
    selectedFile = null;
    dom.fileInput.value = '';
    dom.filePreview.classList.add('hidden');
    dom.parseBtn.classList.add('hidden');
    hideError();
  });

  dom.parseBtn.addEventListener('click', parseResume);
  dom.fillBtn.addEventListener('click', fillCurrentPage);

  dom.reuploadBtn.addEventListener('click', async () => {
    await chrome.storage.local.remove(STORAGE_KEYS.profile);
    currentProfile = null;
    selectedFile = null;
    dom.fileInput.value = '';
    dom.filePreview.classList.add('hidden');
    dom.parseBtn.classList.add('hidden');
    showUploadScreen();
  });
}

// --- Backend Health ---

async function checkBackendHealth() {
  dom.statusDot.className = 'status-dot warming';
  dom.statusText.textContent = 'Connecting...';

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(`${backendUrl}/health`, { signal: ctrl.signal });
    clearTimeout(timer);

    if (res.ok) {
      dom.statusDot.className = 'status-dot online';
      dom.statusText.textContent = 'Online';
    } else {
      throw new Error();
    }
  } catch {
    dom.statusDot.className = 'status-dot offline';
    dom.statusText.textContent = 'Offline';
  }
}

// --- Resume Parsing ---

async function parseResume() {
  if (!selectedFile) return;
  setParsing(true);
  hideError();

  try {
    const formData = new FormData();
    formData.append('resume', selectedFile);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60000);

    const res = await fetch(`${backendUrl}/api/resume/parse?userId=extension_user`, {
      method: 'POST',
      body: formData,
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Something went wrong.');
    }

    const data = await res.json();
    if (data.profile) {
      currentProfile = data.profile;
      await chrome.storage.local.set({ [STORAGE_KEYS.profile]: currentProfile });
      showProfileScreen(currentProfile);
    }
  } catch (err) {
    const msg = err.message || '';
    if (msg.includes('aborted')) showError('Request timed out. Is the backend running?');
    else if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) showError('Cannot reach the backend. Check your connection or backend URL.');
    else showError(msg);
  } finally {
    setParsing(false);
  }
}

// --- Fill Page ---

async function fillCurrentPage() {
  if (!currentProfile) return;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return showFillFeedback('No active tab found', true);

    const response = await chrome.tabs.sendMessage(tab.id, {
      action: 'FILL_FORM',
      profile: currentProfile,
    });

    showFillFeedback(`✓ ${response?.filled ?? 0} fields filled`);
  } catch {
    // Content script not loaded — inject and retry
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/content.js'] });
      setTimeout(async () => {
        try {
          const res = await chrome.tabs.sendMessage(tab.id, { action: 'FILL_FORM', profile: currentProfile });
          showFillFeedback(`✓ ${res?.filled ?? 0} fields filled`);
        } catch { showFillFeedback('Cannot fill on this page', true); }
      }, 500);
    } catch {
      showFillFeedback('Cannot fill on this page', true);
    }
  }
}

// --- UI Helpers ---

function showUploadScreen() {
  dom.uploadScreen.classList.remove('hidden');
  dom.profileScreen.classList.add('hidden');
}

function showProfileScreen(profile) {
  dom.uploadScreen.classList.add('hidden');
  dom.profileScreen.classList.remove('hidden');

  const p = profile.personal || {};
  dom.avatar.textContent = ((p.firstName?.[0] || '') + (p.lastName?.[0] || '')).toUpperCase();
  dom.profileName.textContent = `${p.firstName || ''} ${p.lastName || ''}`.trim();
  dom.profileEmail.textContent = p.email || '';
  dom.profilePhone.textContent = p.phone || '';

  const loc = [p.city, p.state, p.country].filter(Boolean).join(', ');
  dom.locationRow.classList.toggle('hidden', !loc);
  if (loc) dom.locationText.textContent = loc;

  dom.expCount.textContent = profile.experience?.length || 0;
  dom.eduCount.textContent = profile.education?.length || 0;
  dom.skillCount.textContent = profile.skills?.length || 0;

  if (profile.skills?.length > 0) {
    dom.skillsContainer.classList.remove('hidden');
    dom.skillsChips.innerHTML = profile.skills.slice(0, 12).map(s => `<span class="chip">${esc(s)}</span>`).join('');
  } else {
    dom.skillsContainer.classList.add('hidden');
  }
}

function setParsing(active) {
  dom.parseBtn.disabled = active;
  dom.parseBtnText.textContent = active ? 'Parsing...' : 'Parse Resume';
  dom.parseSpinner.classList.toggle('hidden', !active);
}

function showError(msg) {
  dom.errorText.textContent = msg;
  dom.errorBox.classList.remove('hidden');
}

function hideError() { dom.errorBox.classList.add('hidden'); }

function showFillFeedback(msg, isError = false) {
  dom.fillFeedbackText.textContent = msg;
  dom.fillFeedback.style.background = isError ? 'var(--error-dim)' : 'var(--success-dim)';
  dom.fillFeedback.style.borderColor = isError ? 'var(--error)' : 'var(--success)';
  dom.fillFeedback.style.color = isError ? 'var(--error)' : 'var(--success)';
  dom.fillFeedback.classList.remove('hidden');
  setTimeout(() => dom.fillFeedback.classList.add('hidden'), 3000);
}

// --- Utils ---

function formatSize(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
