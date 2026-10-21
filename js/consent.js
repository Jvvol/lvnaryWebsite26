// ── LVNARY consent manager ──
// Optional scripts and embeds never run until their category is granted.
//
// To gate something, author it inert:
//   <script type="text/plain" data-consent="analytics" data-src="https://..."></script>
//   <script type="text/plain" data-consent="marketing">/* inline code */</script>
//   <iframe data-consent="functional" data-src="https://..." title="..."></iframe>
// Categories: analytics, marketing, functional. "necessary" is always on.
//
// If a page has nothing gated, no banner appears; "Cookie settings" still opens
// the preferences dialog. Bump CONSENT_VERSION when the cookie policy changes
// to ask everyone again.
(() => {
  const CONSENT_VERSION = 1;
  const STORAGE_KEY = 'lvnary-consent';

  const CATEGORIES = [
    { id: 'necessary', label: 'Strictly necessary', description: 'Remembers your choices on this page. Always on.' },
    { id: 'analytics', label: 'Analytics', description: 'Helps us understand how many people visit and which pages they use.' },
    { id: 'marketing', label: 'Marketing', description: 'Used to measure or personalize ads on other sites.' },
    { id: 'functional', label: 'Functional', description: 'Loads embedded content such as videos or players from other services.' },
  ];
  const OPTIONAL = CATEGORIES.filter(c => c.id !== 'necessary').map(c => c.id);

  const gpc = navigator.globalPrivacyControl === true;
  let current = null; // the stored record, or null if no choice yet
  let banner = null;
  let dialog = null;
  let opener = null;

  // ── storage (fails closed: no storage means no consent) ──
  function read() {
    try {
      const record = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (record && record.version === CONSENT_VERSION && record.categories && typeof record.categories === 'object') {
        return record;
      }
    } catch (_) { /* blocked or corrupt: treat as no choice */ }
    return null;
  }

  function write(categories) {
    const record = { version: CONSENT_VERSION, timestamp: new Date().toISOString(), categories };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(record)); } catch (_) { /* choice lasts for this page only */ }
    return record;
  }

  // ── gating ──
  const gatedElements = () => [...document.querySelectorAll('script[type="text/plain"][data-consent], iframe[data-consent]')];
  // Counts activated elements too (they keep data-consent), so the dialog still offers Reject after Accept.
  const categoriesInUse = () => {
    const all = [...document.querySelectorAll('[data-consent]')];
    return OPTIONAL.filter(id => all.some(el => el.dataset.consent === id));
  };
  // GPC always wins, even over a choice saved before the signal was turned on.
  const granted = id => id === 'necessary' || (!(gpc && id === 'marketing') && Boolean(current && current.categories[id]));

  function activate() {
    gatedElements().forEach(el => {
      if (!granted(el.dataset.consent) || el.dataset.consentActive) return;
      if (el.tagName === 'IFRAME') {
        el.dataset.consentActive = 'true';
        if (el.dataset.src) el.src = el.dataset.src;
        return;
      }
      const script = document.createElement('script');
      [...el.attributes].forEach(attr => {
        if (!['type', 'data-src'].includes(attr.name)) script.setAttribute(attr.name, attr.value);
      });
      script.dataset.consentActive = 'true';
      if (el.dataset.src) script.src = el.dataset.src;
      else script.text = el.textContent;
      el.replaceWith(script);
    });
  }

  function save(categories) {
    const previous = current;
    const clean = { necessary: true };
    OPTIONAL.forEach(id => { clean[id] = Boolean(categories[id]) && !(gpc && id === 'marketing'); });
    current = write(clean);
    removeBanner();
    window.dispatchEvent(new CustomEvent('lvnary:consent', { detail: current }));

    // Scripts that already ran can't be unloaded, so withdrawing consent reloads the page.
    const withdrew = previous && OPTIONAL.some(id => previous.categories[id] && !clean[id] && categoriesInUse().includes(id));
    if (withdrew) {
      window.location.reload();
      return;
    }
    activate();
  }

  const allOn = () => Object.fromEntries(OPTIONAL.map(id => [id, true]));
  const allOff = () => Object.fromEntries(OPTIONAL.map(id => [id, false]));

  // ── UI helpers ──
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'className') node.className = v;
      else if (k === 'text') node.textContent = v;
      else node.setAttribute(k, v);
    });
    node.append(...children);
    return node;
  }

  function listCategories(ids) {
    const labels = ids.map(id => CATEGORIES.find(c => c.id === id).label.toLowerCase());
    if (labels.length < 2) return labels.join('');
    return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
  }

  const policyLink = () => el('a', { href: '/cookies/', text: 'cookie policy' });

  // ── banner ──
  function showBanner() {
    const accept = el('button', { type: 'button', className: 'btn consent-choice', text: 'Accept all' });
    const reject = el('button', { type: 'button', className: 'btn consent-choice', text: 'Reject all' });
    const customize = el('button', { type: 'button', className: 'link-button', text: 'Customize' });
    accept.addEventListener('click', () => save(allOn()));
    reject.addEventListener('click', () => save(allOff()));
    customize.addEventListener('click', () => open(customize));

    const text = el('p', { className: 'consent-text' },
      `We'd like to use optional cookies for ${listCategories(categoriesInUse())}. You can accept, reject, or choose. Read our `,
      policyLink(), '.');

    banner = el('div', { className: 'consent-banner', role: 'region', 'aria-label': 'Cookie consent' },
      text,
      el('div', { className: 'consent-actions' }, reject, accept, customize));
    document.body.append(banner);
  }

  function removeBanner() {
    if (banner) banner.remove();
    banner = null;
  }

  // ── preferences dialog ──
  function buildDialog() {
    const used = categoriesInUse();
    const title = el('h2', { id: 'consent-title', className: 'consent-title', text: 'Cookie settings' });
    const close = el('button', { type: 'button', className: 'consent-close', 'aria-label': 'Close' }, '×');
    close.addEventListener('click', () => dialog.close());

    const body = el('div', { className: 'consent-body' });

    if (gpc) {
      body.append(el('p', { className: 'consent-note', text: 'Global Privacy Control signal detected and honored. Marketing stays off.' }));
    }

    if (!used.length) {
      body.append(
        el('p', { text: "This site doesn't currently use any optional cookies or trackers." }),
        el('p', {}, 'It only stores your cookie choice in your browser. See our ', policyLink(), ' for details.'));
      const done = el('button', { type: 'button', className: 'btn btn-primary', text: 'Done' });
      done.addEventListener('click', () => dialog.close());
      body.append(el('div', { className: 'consent-actions' }, done));
    } else {
      const form = el('form', { method: 'dialog', className: 'consent-form' });
      CATEGORIES.forEach(c => {
        const id = `consent-${c.id}`;
        const locked = c.id === 'necessary' || (gpc && c.id === 'marketing');
        const input = el('input', { type: 'checkbox', id, name: c.id });
        if (locked) input.disabled = true;
        const row = el('div', { className: 'consent-option' },
          input,
          el('label', { for: id },
            el('span', { className: 'consent-option-label', text: c.label }),
            el('span', { className: 'consent-option-desc', text: c.description })));
        form.append(row);
      });

      const reject = el('button', { type: 'button', className: 'btn consent-choice', text: 'Reject all' });
      const accept = el('button', { type: 'button', className: 'btn consent-choice', text: 'Accept all' });
      const saveBtn = el('button', { type: 'submit', className: 'btn btn-ghost', text: 'Save choices' });
      reject.addEventListener('click', () => { dialog.close(); save(allOff()); });
      accept.addEventListener('click', () => { dialog.close(); save(allOn()); });
      form.addEventListener('submit', e => {
        e.preventDefault();
        const chosen = Object.fromEntries(OPTIONAL.map(id => [id, form.elements[id].checked]));
        dialog.close();
        save(chosen);
      });
      form.append(el('div', { className: 'consent-actions' }, reject, accept, saveBtn));
      body.append(el('p', {}, 'Choose which optional cookies we can use. Read our ', policyLink(), '.'), form);
    }

    dialog = el('dialog', { className: 'consent-dialog', 'aria-labelledby': 'consent-title' },
      el('div', { className: 'consent-head' }, title, close), body);
    dialog.addEventListener('close', () => {
      if (opener && document.contains(opener)) opener.focus();
      opener = null;
    });
    document.body.append(dialog);
  }

  function syncDialog() {
    const form = dialog.querySelector('form');
    if (!form) return;
    CATEGORIES.forEach(c => {
      const input = form.elements[c.id];
      input.checked = c.id === 'necessary' || (granted(c.id) && !(gpc && c.id === 'marketing'));
    });
  }

  function open(from) {
    opener = from || document.activeElement;
    if (!dialog) buildDialog();
    syncDialog();
    dialog.showModal();
  }

  // ── init ──
  function init() {
    current = read();
    document.addEventListener('click', e => {
      const trigger = e.target.closest('[data-open-consent]');
      if (trigger) open(trigger);
    });
    if (current) activate();
    else if (categoriesInUse().length) showBanner();
  }

  window.lvnaryConsent = {
    open: () => open(),
    get: () => current,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
