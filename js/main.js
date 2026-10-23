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
      ctx.fillStyle = s.r > 1.2 ? '#E2CCFF' : '#EEEAE3';
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

// ── SCROLL REVEAL ──
// Tags the blocks below the hero so they fade up as they come into view, once. Tagging happens here
// rather than in the markup, so if this script never runs nothing is left hidden.
const REVEAL = '.section-title, .lede, .signup, .up-next, .release-head, .player, .shows-list, .section-action, .about-photo, .about-copy, .subhead, .socials-band, .booking';
const REVEAL_GROUPS = '.platform-links, .merch-strip, .members';

function initReveal(root) {
  if (!root || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-in');
      io.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px' });

  root.querySelectorAll('.section').forEach(section => {
    section.querySelectorAll(REVEAL).forEach(el => { el.classList.add('reveal'); io.observe(el); });
    section.querySelectorAll(REVEAL_GROUPS).forEach(el => { el.classList.add('reveal-group'); io.observe(el); });
  });
}

// ── SHOWS ──
// Shows are authored in index.html as .show-row elements with data attributes.
function renderShows(listEl) {
  if (!listEl) return;
  const rows = [...listEl.querySelectorAll('.show-row[data-month]')];

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };
  const link = (href, text) => Object.assign(el('a', '', text), { href });

  if (!rows.length) {
    const panel = el('div', 'shows-none');
    const insta = link('https://www.instagram.com/wearelvnary/', 'Follow us on Instagram');
    Object.assign(insta, { target: '_blank', rel: 'noopener noreferrer' });
    insta.setAttribute('aria-label', 'Follow us on Instagram (opens in new tab)');
    const empty = el('p', 'shows-empty');
    empty.append('No shows booked right now. ', link('#mailing-list', 'Join the mailing list'), ' to hear first. ', insta, ' for dates.');
    const book = el('p', 'shows-book');
    book.append('Want us in your town? ', link('mailto:wearelvnary@gmail.com?subject=Booking%20LVNARY', 'Email us to book a show'), '.');
    panel.append(el('p', 'shows-none-title', 'Dates coming soon'), empty, book);
    listEl.replaceChildren(panel);
    return;
  }

  // A show whose data-date has passed is marked Played and moves below the upcoming ones.
  const today = new Date().toISOString().slice(0, 10);
  const isPast = row => /^\d{4}-\d{2}-\d{2}$/.test(row.dataset.date || '') && row.dataset.date < today;
  rows.filter(isPast).forEach(row => { row.classList.add('is-past'); listEl.append(row); });

  rows.forEach(row => {
    const { month = '', day = '', venue = '', location = '', tickets = '', status = '' } = row.dataset;

    const date = el('p', 'show-date');
    date.append(el('span', 'show-month', month), el('span', 'show-day', day));

    const info = el('div', 'show-info');
    info.append(el('p', 'show-venue', venue), el('p', 'show-location', location));

    let action;
    if (row.classList.contains('is-past')) {
      action = el('p', 'show-tag', 'Played');
    } else if (status === 'sold-out') {
      row.classList.add('is-sold-out');
      action = el('p', 'show-tag show-tag-sold', 'Sold out');
    } else if (/^https?:\/\//.test(tickets)) {
      action = el('a', 'show-ticket btn btn-primary', 'Tickets');
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
// Posts to the store worker, which saves the address. No third-party script runs on this site.
function initSignup(form) {
  if (!form) return;
  const email = form.elements.email;
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

    setBusy(true);
    try {
      const res = await fetch(form.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.value.trim(), consent: consent.checked, website: form.elements.website.value }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.fieldErrors) {
        setError(email, data.fieldErrors.email || '');
        setError(consent, data.fieldErrors.consent || '');
        (data.fieldErrors.email ? email : consent).focus();
        return;
      }
      if (res.status === 429) { setStatus(data.error, 'error'); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      form.reset();
      setStatus("You're on the list. Thanks for signing up.", 'success');
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

// ── MERCH STRIP ──
// A few products from the store file, each linking to that item on the merch page.
// If the file can't load, the section still has its intro and "Shop merch" button.
async function renderMerchStrip(list) {
  if (!list) return;
  try {
    const res = await fetch('/merch/products.json', { cache: 'no-cache' });
    if (!res.ok) return;
    const { products } = await res.json();
    const shown = (Array.isArray(products) ? products : []).filter(p => p && p.status !== 'hidden' && p.photos && p.photos[0]).slice(0, 4);
    list.style.setProperty('--tiles', String(Math.max(3, shown.length)));
    list.replaceChildren(...shown.map(p => {
      const photo = p.photos[0];
      const soldOut = p.status === 'sold_out' || (Array.isArray(p.variants) && p.variants.every(v => !(v.stock > 0)));
      const link = document.createElement('a');
      link.className = 'merch-tile';
      link.href = `/merch/#product-${encodeURIComponent(p.id)}`;
      const img = document.createElement('img');
      Object.assign(img, { src: photo.src, alt: '', width: photo.width, height: photo.height, loading: 'lazy', decoding: 'async' });
      const name = document.createElement('span');
      name.className = 'merch-tile-name';
      name.textContent = p.name;
      const frame = document.createElement('span');
      frame.className = 'merch-tile-photo';
      frame.append(img);
      link.append(frame, name);
      if (soldOut) {
        const note = document.createElement('span');
        note.className = 'merch-tile-note';
        note.textContent = 'Sold out';
        link.append(note);
      }
      const item = document.createElement('li');
      item.append(link);
      return item;
    }));
  } catch { /* offline or broken file: the button still goes to the store */ }
}

// ── SPOTIFY PLAYER ──
// Nothing from Spotify loads until the visitor asks for it. The link works on its own without JavaScript.
function initPlayer(box) {
  const trigger = box && box.querySelector('[data-embed]');
  if (!trigger) return;
  trigger.addEventListener('click', e => {
    e.preventDefault();
    const frame = document.createElement('iframe');
    Object.assign(frame, {
      src: trigger.dataset.embed,
      title: 'LVNARY on Spotify',
      loading: 'lazy',
      allow: 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture',
    });
    frame.className = 'player-frame';
    // Fade in once Spotify has drawn. The timer covers a load event that never comes (blocked or offline).
    const ready = () => frame.classList.add('is-ready');
    frame.addEventListener('load', ready, { once: true });
    setTimeout(ready, 3000);
    box.classList.add('is-loaded');
    box.replaceChildren(frame);
    frame.focus();
  });
}

// ── TONIGHT'S MOON ──
// Phase from the mean synodic month, counted from a known new moon (6 Jan 2000, 18:14 UTC).
// Accurate to within about a day, which is all a name like "waxing crescent" needs.
function initMoon(el) {
  if (!el) return;
  const SYNODIC = 29.530588853;
  const age = (((Date.now() - Date.UTC(2000, 0, 6, 18, 14)) / 864e5) % SYNODIC + SYNODIC) % SYNODIC;
  const lit = (1 - Math.cos((2 * Math.PI * age) / SYNODIC)) / 2;
  const names = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
  const name = names[Math.floor(((age / SYNODIC) * 8 + 0.5)) % 8];
  el.querySelector('.moon-text').textContent = `${name}, ${Math.round(lit * 100)}% lit`;

  // Lit shape: a half disc on the lit side, closed by the terminator, an ellipse whose width follows the phase.
  const r = 48;
  const waxing = age < SYNODIC / 2;
  const rx = Math.abs(1 - 2 * lit) * r;
  const outer = waxing ? 1 : 0;
  const inner = (lit > 0.5) === waxing ? 1 : 0; // crescent: terminator bulges toward the lit side
  el.querySelector('.moon-lit').setAttribute('d',
    `M0 ${-r} A${r} ${r} 0 0 ${outer} 0 ${r} A${rx.toFixed(2)} ${r} 0 0 ${inner} 0 ${-r}Z`);
  el.hidden = false;
}

// ── FOOTER YEAR ──
function initYear() {
  document.querySelectorAll('[data-year]').forEach(n => { n.textContent = String(new Date().getFullYear()); });
}

initNav();
initStarfield(document.querySelector('.starfield'));
initHeroParallax();
initReveal(document.getElementById('main'));
renderShows(document.getElementById('showsList'));
renderMerchStrip(document.getElementById('merchStrip'));
initSignup(document.getElementById('signup'));
initPlayer(document.getElementById('player'));
initMoon(document.getElementById('moon'));
initYear();
