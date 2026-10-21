// ── LVNARY site script ──
// Progressive enhancement only: every section and link works without this file.

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

// ── NAV ──
function initNav() {
  const header = document.getElementById('siteHeader');
  const toggle = document.querySelector('.nav-toggle');
  const links = document.getElementById('nav-links');
  if (!header || !toggle || !links) return;

  const setOpen = open => {
    toggle.setAttribute('aria-expanded', String(open));
    links.classList.toggle('open', open);
  };

  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  links.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setOpen(false)));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      setOpen(false);
      toggle.focus();
    }
  });

  // Pages without the hero keep a solid header.
  const hasHero = Boolean(document.querySelector('.hero'));
  const onScroll = () => header.classList.toggle('scrolled', !hasHero || window.scrollY > 40);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Highlight the nav link for the section in view.
  const navLinks = [...links.querySelectorAll('a[href^="#"]')];
  const sections = navLinks.map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      navLinks.forEach(a => a.classList.toggle('active', a.getAttribute('href') === `#${entry.target.id}`));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  sections.forEach(s => io.observe(s));
}

// ── STARFIELD ──
function initStarfield(canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let stars = [];
  let width = 0;
  let height = 0;
  let running = false;
  let visible = true;

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.round(Math.min(160, (width * height) / 6000));
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      // Denser toward the top, like a sky over the ridges.
      y: Math.pow(Math.random(), 1.6) * height * 0.85,
      r: Math.random() * 1.3 + 0.3,
      base: Math.random() * 0.6 + 0.25,
      speed: Math.random() * 0.0012 + 0.0004,
      phase: Math.random() * Math.PI * 2,
      drift: Math.random() * 0.004 + 0.001,
    }));
  };

  const draw = t => {
    ctx.clearRect(0, 0, width, height);
    for (const s of stars) {
      const twinkle = t ? 0.5 + 0.5 * Math.sin(t * s.speed + s.phase) : 0.75;
      const x = t ? (s.x + t * s.drift) % width : s.x;
      ctx.globalAlpha = s.base * (0.45 + 0.55 * twinkle);
      ctx.fillStyle = s.r > 1.2 ? '#C9BEFF' : '#EEF0FF';
      ctx.beginPath();
      ctx.arc(x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  const loop = t => {
    if (!running) return;
    draw(t);
    requestAnimationFrame(loop);
  };

  const update = () => {
    const shouldRun = visible && !document.hidden && !reducedMotion.matches;
    if (shouldRun && !running) {
      running = true;
      requestAnimationFrame(loop);
    } else if (!shouldRun) {
      running = false;
      draw(0);
    }
  };

  resize();
  draw(0);
  update();

  window.addEventListener('resize', () => { resize(); draw(0); });
  document.addEventListener('visibilitychange', update);
  reducedMotion.addEventListener('change', update);
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); }).observe(canvas);
}

// ── HERO PARALLAX ──
function initHeroParallax() {
  const ridges = [...document.querySelectorAll('.ridge')];
  if (!ridges.length) return;
  const depth = [0.18, 0.1, 0.04]; // far, mid, near
  let ticking = false;

  const apply = () => {
    ticking = false;
    const y = reducedMotion.matches ? 0 : Math.min(window.scrollY, window.innerHeight);
    ridges.forEach((r, i) => r.style.setProperty('--parallax', `${(y * depth[i]).toFixed(1)}px`));
  };

  window.addEventListener('scroll', () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(apply);
    }
  }, { passive: true });
}

// ── SHOWS ──
// Shows are authored in index.html as .show-row elements with data attributes.
function renderShows(listEl) {
  if (!listEl) return;
  const rows = [...listEl.querySelectorAll('.show-row[data-month]')];

  if (!rows.length) {
    const empty = document.createElement('p');
    empty.className = 'shows-empty';
    empty.append('No shows booked right now. ');
    const join = document.createElement('a');
    join.href = '#mailing-list';
    join.textContent = 'Join the mailing list';
    empty.append(join, ' to hear first.');
    listEl.replaceChildren(empty);
    return;
  }

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };

  rows.forEach(row => {
    const { month = '', day = '', venue = '', location = '', tickets = '' } = row.dataset;

    const date = el('p', 'show-date');
    date.append(el('span', 'show-month', month), el('span', 'show-day', day));

    const info = el('div', 'show-info');
    info.append(el('p', 'show-venue', venue), el('p', 'show-location', location));

    let action;
    if (/^https?:\/\//.test(tickets)) {
      action = el('a', 'show-ticket btn btn-ghost', 'Tickets');
      action.href = tickets;
      action.target = '_blank';
      action.rel = 'noopener noreferrer';
      action.setAttribute('aria-label', `Tickets for ${venue} (opens in new tab)`);
    } else {
      action = el('p', 'show-ticket-none', 'Tickets soon');
    }

    row.replaceChildren(date, info, action);
  });
}

// ── MAILING LIST SIGNUP ──
// Posts straight to the mailing-list provider; no provider script runs on this site.
function initSignup(form) {
  if (!form) return;
  const email = form.elements.email_address;
  const consent = form.elements.consent;
  const button = form.querySelector('button[type="submit"]');
  const status = form.querySelector('[role="status"]');
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const setError = (field, message) => {
    const error = document.getElementById(`${field.id}-error`);
    error.textContent = message;
    error.hidden = !message;
    if (message) {
      field.setAttribute('aria-invalid', 'true');
      field.setAttribute('aria-describedby', error.id);
    } else {
      field.removeAttribute('aria-invalid');
      field.removeAttribute('aria-describedby');
    }
  };

  const setStatus = (message, tone = '') => {
    status.textContent = message;
    status.dataset.tone = tone;
  };

  const setBusy = busy => {
    button.disabled = busy;
    button.textContent = busy ? 'Subscribing…' : 'Subscribe';
  };

  const validate = () => {
    const value = email.value.trim();
    const emailError = !value ? 'Enter your email address.'
      : !EMAIL_PATTERN.test(value) ? 'Enter an email address like name@example.com.'
      : '';
    const consentError = consent.checked ? '' : "Check the box to confirm you're 16 or older and want our emails.";
    setError(email, emailError);
    setError(consent, consentError);
    if (emailError) email.focus();
    else if (consentError) consent.focus();
    return !emailError && !consentError;
  };

  form.addEventListener('submit', async e => {
    e.preventDefault();
    setStatus('');
    if (!validate()) return;

    if (form.getAttribute('action').includes('[TODO')) {
      setStatus('Signup opens soon. Follow us on Instagram for news in the meantime.');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      form.reset();
      setStatus('Check your inbox to confirm your subscription.', 'success');
    } catch (err) {
      // fetch throws TypeError when the request can't complete (offline, or the provider
      // doesn't send CORS headers). Never resubmit: the provider may already have the signup.
      setStatus(err instanceof TypeError
        ? "We couldn't reach the signup service. Check your connection and try again."
        : 'Something went wrong on our end. Try again in a minute.', 'error');
    } finally {
      setBusy(false);
    }
  });
}

// ── FOOTER YEAR ──
function initYear() {
  document.querySelectorAll('[data-year]').forEach(n => { n.textContent = String(new Date().getFullYear()); });
}

initNav();
initStarfield(document.querySelector('.starfield'));
initHeroParallax();
renderShows(document.getElementById('showsList'));
initSignup(document.getElementById('signup'));
initYear();
