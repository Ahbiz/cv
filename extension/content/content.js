'use strict';

let observer = null;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'FILL_FORM' && msg.profile) {
    sendResponse(runFillEngine(msg.profile));
  }
  return true;
});

function runFillEngine(profile) {
  const fieldMap = buildFieldMap(profile);
  const filled = fillAllFields(fieldMap);
  setupObserver(fieldMap);
  showToast(filled);
  return { filled };
}

// Uses native prototype setters to bypass React/Vue/Angular controlled inputs
function triggerNativeSet(el, value) {
  if (!value) return false;

  const proto = el instanceof HTMLInputElement ? HTMLInputElement
    : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement
    : el instanceof HTMLSelectElement ? HTMLSelectElement : null;

  const setter = proto && Object.getOwnPropertyDescriptor(proto.prototype, 'value')?.set;
  if (!setter) return false;

  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('blur', { bubbles: true }));
  return true;
}

// 8-strategy label resolution: label[for] → aria-label → aria-labelledby →
// placeholder → name → data-automation-id → id → parent walk
function resolveLabel(el) {
  if (el.id) {
    const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (lbl?.textContent.trim()) return lbl.textContent.trim().toLowerCase();
  }

  const aria = el.getAttribute('aria-label');
  if (aria) return aria.toLowerCase();

  const ariaBy = el.getAttribute('aria-labelledby');
  if (ariaBy) {
    const ref = document.getElementById(ariaBy);
    if (ref?.textContent.trim()) return ref.textContent.trim().toLowerCase();
  }

  if (el.placeholder) return el.placeholder.toLowerCase();
  if (el.name) return el.name.toLowerCase().replace(/[_\-\[\]]/g, ' ');

  const autoId = el.getAttribute('data-automation-id');
  if (autoId) return autoId.toLowerCase().replace(/[_\-]/g, ' ');

  if (el.id) return el.id.toLowerCase().replace(/[_\-]/g, ' ');

  // Walk up to 4 ancestors looking for label text
  let parent = el.parentElement;
  for (let i = 0; i < 4 && parent; i++) {
    const lbl = parent.querySelector('label');
    if (lbl?.textContent.trim()) return lbl.textContent.trim().toLowerCase();

    const texts = [];
    for (const node of parent.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) texts.push(node.textContent.trim());
    }
    if (texts.length) return texts.join(' ').toLowerCase();
    parent = parent.parentElement;
  }

  return '';
}

function buildFieldMap(profile) {
  const p = profile.personal || {};
  const l = profile.links || {};
  return [
    { kw: ['first name', 'fname', 'given name', 'first_name', 'firstname'], val: p.firstName },
    { kw: ['last name', 'lname', 'surname', 'family name', 'last_name', 'lastname'], val: p.lastName },
    { kw: ['full name', 'your name', 'candidate name', 'legal name'], val: [p.firstName, p.lastName].filter(Boolean).join(' ') },
    { kw: ['email', 'e-mail', 'email address'], val: p.email },
    { kw: ['phone', 'mobile', 'tel', 'phone number', 'telephone', 'cell'], val: p.phone },
    { kw: ['city', 'town'], val: p.city },
    { kw: ['state', 'province', 'region'], val: p.state },
    { kw: ['country'], val: p.country },
    { kw: ['zip', 'postal', 'zip code', 'postal code', 'zipcode'], val: p.zipCode },
    { kw: ['linkedin', 'linked in'], val: l.linkedin },
    { kw: ['github', 'git hub'], val: l.github },
    { kw: ['portfolio', 'website', 'personal site', 'url', 'web site'], val: l.portfolio },
  ];
}

// Fuzzy-match select dropdown options
function matchSelectOption(select, target) {
  if (!target) return false;
  const t = target.toLowerCase().trim();
  let bestIdx = -1, bestScore = 0;

  for (let i = 0; i < select.options.length; i++) {
    const text = select.options[i].text.toLowerCase().trim();
    const val = select.options[i].value.toLowerCase().trim();

    if (text === t || val === t) { bestIdx = i; bestScore = 100; break; }
    if (text.includes(t) || t.includes(text)) {
      const score = (Math.min(text.length, t.length) / Math.max(text.length, t.length)) * 80;
      if (score > bestScore) { bestIdx = i; bestScore = score; }
    }
  }

  if (bestIdx >= 0 && bestScore > 30) {
    select.selectedIndex = bestIdx;
    triggerNativeSet(select, select.options[bestIdx].value);
    return true;
  }
  return false;
}

const SKIP_TYPES = new Set(['hidden', 'submit', 'button', 'file', 'checkbox', 'radio', 'image', 'reset']);

function fillAllFields(fieldMap) {
  const elements = document.querySelectorAll('input, textarea, select');
  let filled = 0;

  for (const el of elements) {
    if (SKIP_TYPES.has(el.type) || el.disabled || el.readOnly) continue;
    if (el.value?.trim() && el.tagName !== 'SELECT') continue;

    const label = resolveLabel(el);
    if (!label) continue;

    for (const entry of fieldMap) {
      if (!entry.val) continue;
      if (entry.kw.some(kw => label.includes(kw))) {
        const ok = el.tagName === 'SELECT' ? matchSelectOption(el, entry.val) : triggerNativeSet(el, entry.val);
        if (ok) { filled++; break; }
      }
    }
  }

  return filled;
}

// Re-fill when dynamic form sections load (multi-step wizards)
function setupObserver(fieldMap) {
  if (observer) observer.disconnect();

  let debounce = null;
  observer = new MutationObserver((mutations) => {
    if (mutations.some(m => m.addedNodes.length > 0)) {
      clearTimeout(debounce);
      debounce = setTimeout(() => fillAllFields(fieldMap), 800);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 120000); // Auto-disconnect after 2min
}

function showToast(filled) {
  document.getElementById('af-toast')?.remove();
  const toast = document.createElement('div');
  toast.id = 'af-toast';
  toast.textContent = filled > 0
    ? `⚡ AutoFill: ${filled} field${filled !== 1 ? 's' : ''} filled`
    : '⚡ AutoFill: No matching fields found';
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateY(12px)'; setTimeout(() => toast.remove(), 300); }, 4000);
}
