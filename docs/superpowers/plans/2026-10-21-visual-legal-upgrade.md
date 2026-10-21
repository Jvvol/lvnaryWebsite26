# LVNARY Visual Upgrade + Legal/Compliance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign lvnary.com ("Night over the ridge") and add privacy/cookie/terms/accessibility compliance with a code-gated consent manager and a mailing-list form.

**Architecture:** Plain static multi-page site on GitHub Pages, no build step. Shared `css/tokens.css` + `css/styles.css`, `js/main.js`, self-contained `js/consent.js`. Dev-only Playwright + axe tests run against a local static server.

**Tech Stack:** HTML, CSS custom properties, vanilla JS (ES2020, no modules needed), Playwright, @axe-core/playwright, http-server, sharp (image resizing script), Lighthouse CLI.

**Spec:** `docs/superpowers/specs/2026-10-21-visual-legal-upgrade-design.md`

## Global Constraints

- No third-party requests on page load from any page (fonts self-hosted; no CDN).
- All colors, font sizes, spacing, radii, durations, z-index come from `css/tokens.css` custom properties; no raw hex in `styles.css`/`legal.css`.
- Palette exactly: `#0A0920` void, `#151338` ridge navy, `#6A4BE0` signal violet, `#5FA8FF` cold blue, `#C9BEFF` lavender, `#EEF0FF` starlight, `#A6A3CC` dusk text.
- Fonts: Michroma (display/headings only) + IBM Plex Sans 400/500/600. No monospace face.
- Sentence case copy; no `→` on buttons/links; no eyebrow labels above headings; no middle-dot meta strings.
- External links: `target="_blank" rel="noopener noreferrer"` + accessible "(opens in new tab)".
- Every animation disabled under `prefers-reduced-motion: reduce`; native cursor always.
- Unknown values written literally as `[TODO: ...]`.
- Footer on every page: Privacy · Cookies · Terms · Accessibility · Cookie settings (button) · Do Not Sell or Share My Personal Information · © 2026 LVNARY.
- Consent storage key `lvnary-consent`, `CONSENT_VERSION = 1`.

## Review Focus

1. `localStorage` throws (Safari private mode, blocked storage) → no gated script loads, no console error, page works. Test in Task 5.
2. JavaScript disabled → all content, nav links, footer legal links visible and usable (no content hidden behind JS-added classes). Test in Task 4.
3. Long venue names / several shows at 375px → no horizontal page scroll. Test in Task 4.
4. Corrupt stored consent JSON → discarded, treated as no consent. Test in Task 5.
5. Signup submitted while action URL is still the placeholder → clear "coming soon" message, no network request. Test in Task 6.

---

### Task 1: Dev tooling and the first failing test

**Files:**
- Create: `package.json`, `playwright.config.js`, `.gitignore`, `tests/helpers.js`, `tests/network.spec.js`

**Interfaces:**
- Produces: `tests/helpers.js` exporting `PAGES: string[]` (list of site paths; Task 1 = `['/']`, extended by Task 7) and `externalRequests(page): string[]` (attaches a request listener, returns array collecting URLs whose origin ≠ `http://localhost:4173`).
- Produces: npm scripts `serve` (`http-server . -p 4173 -c-1 -s`) and `test` (`playwright test`). Playwright `webServer` runs `npm run serve`, `baseURL: http://localhost:4173`, projects `mobile` (375×812) and `desktop` (1280×800), Chromium only.

- [ ] **Step 1:** Create `package.json` (private, devDependencies: `@playwright/test`, `@axe-core/playwright`, `http-server`, `sharp`, `lighthouse`), `.gitignore` (`node_modules/`, `test-results/`, `playwright-report/`), config, helpers. Run `npm install && npx playwright install chromium`.
- [ ] **Step 2: Write failing test** `network.spec.js`: for each path in `PAGES`, `goto` with `waitUntil: 'networkidle'`, `expect(external).toEqual([])`.
- [ ] **Step 3:** Run `npx playwright test network` → Expected FAIL listing `fonts.googleapis.com`.
- [ ] **Step 4: Commit** `chore: add Playwright test harness`.

### Task 2: Self-hosted fonts, tokens, file moves

**Files:**
- Create: `fonts/michroma-400.woff2`, `fonts/plex-sans-{400,500,600}.woff2`, `css/tokens.css`
- Move: `styles.css` → `css/styles.css`, `script.js` → `js/main.js` (git mv)
- Modify: `index.html` head

**Interfaces:**
- Produces token names used by all later CSS: `--c-void --c-ridge --c-violet --c-blue --c-lavender --c-text --c-muted --c-border`; `--font-display --font-body`; `--step--1 --step-0 --step-1 --step-2 --step-3 --step-4 --step-5` (ratio 1.25, base 1.0625rem, clamp() for ≥ step-3); `--space-1..--space-8` (0.25,0.5,0.75,1,1.5,2,3,5 rem); `--radius-sm 4px --radius-md 10px`; `--dur-fast 150ms --dur-med 300ms --dur-slow 1600ms --ease-out cubic-bezier(.2,.7,.2,1)`; `--z-nav 100 --z-banner 200 --z-dialog 300`; `--focus-ring 0 0 0 2px var(--c-void), 0 0 0 4px var(--c-blue)`.

- [ ] **Step 1:** Download woff2 files from `@fontsource/michroma` and `@fontsource/ibm-plex-sans` (latin subset) via `npm pack` into scratchpad, copy into `fonts/`. Add OFL license text as `fonts/OFL.txt`.
- [ ] **Step 2:** Write `css/tokens.css` with `@font-face` (`font-display: swap`) and the tokens above. Remove Google Fonts `<link>`s; link `css/tokens.css` then `css/styles.css`; script `js/main.js`.
- [ ] **Step 3:** Run `npx playwright test network` → Expected PASS.
- [ ] **Step 4: Commit** `feat: self-host fonts and add design tokens`.

### Task 3: Image optimization

**Files:**
- Create: `scripts/optimize-images.mjs`
- Modify: everything in `images/band/`

- [ ] **Step 1: Failing test** `tests/assets.spec.js`: every `images/band/*.jpg` ≤ 400 KB (read via `fs.statSync`).
- [ ] **Step 2:** Run → FAIL (`james-kawasaki.jpg` 5.6 MB).
- [ ] **Step 3:** Script with sharp: `hero-band` max width 1600, `band-live` 1400, members 600, JPEG quality 78, mozjpeg, auto-orient; overwrite in place. Run it; view each output image to confirm it still looks right (orientation/crop).
- [ ] **Step 4:** Run test → PASS. **Commit** `perf: resize and compress band photos`.

### Task 4: Home page redesign + accessibility

**Files:**
- Modify: `index.html`, `css/styles.css` (rewrite against tokens), `js/main.js`
- Test: `tests/home.spec.js`, `tests/a11y.spec.js`

**Interfaces:**
- Produces shared header/footer markup (copied by Task 7): `<a class="skip-link" href="#main">Skip to content</a>`, `<header class="site-header">` with `<nav aria-label="Primary">`, `<button class="nav-toggle" aria-expanded="false" aria-controls="nav-links">`, `<main id="main">`, `<footer class="site-footer">` containing `<nav aria-label="Legal">` and `<button type="button" data-open-consent>Cookie settings</button>`.
- Produces in `main.js`: `initNav()`, `initStarfield(canvas)`, `initHeroParallax()`, `renderShows(listEl)`; shows still authored as `.show-row[data-month][data-day][data-venue][data-location][data-tickets]` (keep existing commented examples).

- [ ] **Step 1: Failing tests** (`home.spec.js`):
  - `skip link is first focusable and moves focus to main`: Tab once → focused element text `Skip to content`; Enter → `document.activeElement.id === 'main'` (`<main tabindex="-1">`).
  - `mobile menu toggles with keyboard` (mobile project): toggle `aria-expanded` false→true on Enter, Escape → false and focus back on toggle.
  - `no horizontal overflow`: inject 3 show rows with 60-char venue names before `renderShows`, at 375px `scrollWidth <= clientWidth`.
  - `ticket link visible on mobile`: row with `data-tickets="https://example.com"` shows a visible link named `Tickets for <venue>`.
  - `empty shows state`: text `No shows booked right now. Join the mailing list to hear first.`
  - `works without JS` (context `javaScriptEnabled: false`): headings Music/Shows/Merch/About and footer link `Privacy` visible.
  - `reduced motion`: emulate `reducedMotion: 'reduce'`; computed `animation-name` of `.hero-wordmark` is `none`, and canvas has no ongoing draw (starfield draws one static frame).
  - `external links safe`: every `a[target=_blank]` has rel containing `noopener`.
- [ ] **Step 2:** `a11y.spec.js`: for each `PAGES` path, `new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze()` → `violations` equal `[]`. Run both specs → FAIL.
- [ ] **Step 3:** Rebuild `index.html` per spec §4 wireframe and copy rules: hero (photo bg, `<canvas aria-hidden>`, 3 inline ridge `<svg aria-hidden>` paths filled `--c-ridge` at decreasing lightness, wordmark `<h1>`, tagline, "Listen" and "See shows" buttons), Music (`<h2>Music</h2>`, "Temporary", "Single, released 2024", platform links "Listen on Spotify" etc.), Shows, Merch ("Shop merch" to Big Cartel), About (bio, "Pronounced loo-nuh-ree.", members as `<ul>` with `<h3>` names, social links `aria-label="Jacob Wolfe on Instagram (opens in new tab)"` with `alt=""` icons, "For fans of" sentence list, band socials), mailing-list section placeholder `<section id="mailing-list">` (filled in Task 6), footer. Ridge-contour divider between sections as one shared inline SVG `<svg class="divider" aria-hidden>` repeated. Images get width/height, `loading="lazy"` below hero, member alt `"Portrait of Jacob Wolfe"`.
- [ ] **Step 4:** Rewrite `css/styles.css` consuming only tokens. Hero load sequence is the only keyframe set (stars fade 0–600ms, ridges rise staggered 200/400/600ms, wordmark `letter-spacing` 0.6em → 0.32em over `--dur-slow`). Section content visible by default (no `.reveal`). `@media (prefers-reduced-motion: reduce)` sets `animation: none; transition: none`.
- [ ] **Step 5:** Rewrite `main.js`: `renderShows` builds rows with `createElement`/`textContent` (no `innerHTML` from data attributes); starfield on one canvas, DPR-aware, ~160 stars, `requestAnimationFrame` twinkle, paused when `document.hidden`, single static frame under reduced motion; ridge parallax via `transform` on scroll, skipped under reduced motion; nav: toggle, Escape, close on link click, `scrolled` class, active link via `IntersectionObserver`; footer year `new Date().getFullYear()` into `[data-year]`.
- [ ] **Step 6:** Run `npx playwright test home a11y network` → PASS. Screenshot `/` at 375/768/1280 to scratchpad and review against spec §4; fix anything off.
- [ ] **Step 7: Commit** `feat: redesign home page and fix accessibility`.

### Task 5: Consent manager

**Files:**
- Create: `js/consent.js`, `tests/fixtures/consent-test.html`, `tests/consent.spec.js`
- Modify: `css/styles.css` (banner + dialog styles), every page includes `<script src="/js/consent.js" defer></script>` before `main.js`

**Interfaces:**
- Produces global `window.lvnaryConsent = { open(): void, get(): {version:number, timestamp:string, categories:{necessary:true, analytics:boolean, marketing:boolean, functional:boolean}} | null }` and dispatches `window` event `lvnary:consent` with `detail` = stored record.
- Gated markup contract: `<script type="text/plain" data-consent="analytics|marketing|functional" data-src="URL">` (or inline body) and `<iframe data-consent="..." data-src="URL">`.
- Consent UI is created by JS (banner `<div role="region" aria-label="Cookie consent">` and `<dialog aria-labelledby>`). Clicking any `[data-open-consent]` calls `open()`.

- [ ] **Step 1:** Fixture page: normal site header/footer, plus `<script type="text/plain" data-consent="analytics" data-src="https://example.invalid/analytics.js">` and `<script type="text/plain" data-consent="marketing" data-src="https://example.invalid/marketing.js">`.
- [ ] **Step 2: Failing tests** (`consent.spec.js`, route `https://example.invalid/**` to fulfill 200 empty JS and record hits):
  - `dormant on real pages`: `/` shows no banner; clicking "Cookie settings" opens dialog containing `This site doesn't currently use any optional cookies or trackers.`
  - `nothing loads before consent` on fixture: banner visible, 0 hits.
  - `accept all loads gated scripts`: click "Accept all" → hits contain analytics.js and marketing.js; reload → still loaded, banner hidden.
  - `reject all loads nothing`: click "Reject all" → 0 hits; reload → banner hidden, 0 hits.
  - `buttons equally prominent`: Accept/Reject bounding boxes equal width and height (±1px), same computed background-color.
  - `customize grants per category`: open Customize, toggle analytics only, "Save choices" → only analytics.js hit.
  - `GPC honored`: `addInitScript(() => Object.defineProperty(navigator,'globalPrivacyControl',{get:()=>true}))`; Accept all → analytics hit, marketing not; dialog shows `Global Privacy Control signal detected and honored.` and marketing toggle disabled.
  - `storage throws`: init script overrides `Storage.prototype.getItem/setItem` to throw → no page errors (`page.on('pageerror')` empty), 0 hits, banner visible.
  - `corrupt record discarded`: preset `localStorage['lvnary-consent']='{bad'` → banner visible, 0 hits.
  - `version bump re-prompts`: preset record with `version: 0` → banner visible.
  - `withdrawal`: Accept all, then Cookie settings → Reject all → page reloads, 0 hits after reload.
  - `dialog keyboard`: open via keyboard, Escape closes and focus returns to opener.
- [ ] **Step 3:** Run → FAIL.
- [ ] **Step 4:** Implement `consent.js` per spec §6. Copy: banner text "We'd like to use optional cookies for {categories in use}. You can accept, reject, or choose." Buttons "Accept all", "Reject all", "Customize"; dialog "Save choices". Only categories present on the page are listed in the banner; dialog lists all four with `necessary` locked on.
- [ ] **Step 5:** Run `npx playwright test consent network a11y` → PASS. Screenshot banner + dialog at 375/1280.
- [ ] **Step 6: Commit** `feat: add consent manager with GPC support`.

### Task 6: Mailing-list form

**Files:**
- Modify: `index.html` (`#mailing-list`), `css/styles.css`, `js/main.js`
- Test: `tests/signup.spec.js`

**Interfaces:**
- Produces `initSignup(form)` in `main.js`. Form: `<form id="signup" method="post" action="[TODO: mailing list provider form URL]" novalidate>`; fields `email_address` (type email, required, autocomplete email, visible label "Email address") and checkbox `consent` (required, unchecked) label exactly: `I'm 16 or older and agree to receive emails from LVNARY about music, shows, and merch. Unsubscribe anytime.` followed by link "Privacy policy" to `/privacy/`; submit button "Subscribe"; status `<p role="status" aria-live="polite">`.

- [ ] **Step 1: Failing tests:**
  - `checkbox unchecked by default`.
  - `empty email error`: submit → `Enter your email address.` shown and input `aria-invalid="true"`, `aria-describedby` points at it.
  - `bad email error`: `abc` → `Enter an email address like name@example.com.`
  - `consent required`: valid email, unchecked → `Check the box to confirm you're 16 or older and want our emails.`
  - `placeholder action`: valid + checked → status `Signup opens soon. Follow us on Instagram for news in the meantime.` and zero non-localhost requests.
  - `success`: set `form.action='https://example.invalid/subscribe'`, route fulfills 200 JSON → button shows `Subscribing…` (disabled) then status `Check your inbox to confirm your subscription.`
  - `server error`: route 500 → `Something went wrong on our end. Try again in a minute.` and button re-enabled.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement per spec §7 (fetch with `Accept: application/json`; on TypeError/CORS failure call `form.submit()`). Detect placeholder by `action.includes('[TODO')`.
- [ ] **Step 4:** Run `npx playwright test signup a11y network` → PASS. **Commit** `feat: add mailing list signup with consent`.

### Task 7: Legal pages, shared footer, 404

**Files:**
- Create: `privacy/index.html`, `cookies/index.html`, `terms/index.html`, `accessibility/index.html`, `do-not-sell/index.html`, `404.html`, `css/legal.css`
- Modify: `tests/helpers.js` (`PAGES` += `/privacy/ /cookies/ /terms/ /accessibility/ /do-not-sell/ /404.html`), `index.html` links use `/privacy/` etc.
- Test: `tests/legal.spec.js`

- [ ] **Step 1: Failing tests:**
  - `footer on every page`: for each `PAGES`, footer contains links named Privacy, Cookies, Terms, Accessibility, Do Not Sell or Share My Personal Information (each `href` resolves 200) and a "Cookie settings" button that opens the dialog.
  - `effective date present`: each legal page contains `Effective date:`.
  - `privacy covers required topics`: `/privacy/` has `h2`s matching: What we collect, How we use it, Legal bases, Who we share it with, How long we keep it, Your rights, US state privacy rights, Children's privacy, International visitors, Changes, Contact.
  - `terms covers required topics`: `h2`s: Acceptable use, Intellectual property, Copyright and DMCA, Third-party links and purchases, Disclaimers, Limitation of liability, Indemnity, Governing law, Termination, Changes, Contact.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Write pages per spec §8 using shared header/footer from Task 4 and root-relative asset paths. Each page: single `h1`, prose ≤ 68ch, table for cookie list with `<caption>` and `<th scope>`. Placeholders literally `[TODO: contact email]`, `[TODO: mailing address]`, `[TODO: publish date]`, `[TODO: mailing list provider name]`, `[TODO: DMCA designated agent name/address]`. 404: "This page drifted out of orbit." + link "Back to the home page".
- [ ] **Step 4:** Run full suite `npm test` → PASS (network + a11y now cover all pages, both viewports).
- [ ] **Step 5: Commit** `feat: add privacy, cookie, terms, accessibility pages`.

### Task 8: Final verification

- [ ] **Step 1:** `npm test` → all pass; record counts.
- [ ] **Step 2:** `npx lighthouse http://localhost:4173/ --preset=desktop --only-categories=performance,accessibility,best-practices,seo --output=json` and the same for `/privacy/` and mobile preset; record scores.
- [ ] **Step 3:** Screenshots of `/`, `/privacy/`, consent fixture with banner at 375 and 1280 → review visually.
- [ ] **Step 4:** `grep -rn "\[TODO" --include=*.html .` → compile TODO list for the user.
- [ ] **Step 5:** Request whole-branch review (superpowers:requesting-code-review); fix findings; commit.
