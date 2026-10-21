# LVNARY Site: Visual Upgrade + Legal/Compliance Pass — Design

**Date:** 2026-10-21
**Status:** Approved in conversation; pending written-spec review
**Branch:** `site-upgrade`

## 1. Intent

LVNARY is an independent, unincorporated progressive post-hardcore band from Morgantown, WV. The site (lvnary.com, GitHub Pages) needs:

1. A more distinctive visual design that keeps the purple/blue space identity and fits a sci-fi / ambient post-hardcore band from West Virginia.
2. A legal/compliance pass that minimizes lawsuit exposure (ADA/WCAG, privacy, consent), based on what the site actually does.

**Success criteria**
- No existing content, links, or sections (Home, Music, Shows, Merch, About) lost or broken.
- Zero third-party network requests on page load before consent.
- WCAG 2.1 AA: zero axe violations on every page at 375px and 1280px.
- Policies describe the site's real data practices; every unknown value is marked `[TODO: ...]`.

**Out of scope:** changing hosting, adding analytics for real, adding embeds, redesigning the Big Cartel store.

## 2. Audit findings (baseline)

| Item | Finding |
|---|---|
| Stack | Static `index.html` + `styles.css` + `script.js`; no build, no tests; GitHub Pages with CNAME `lvnary.com` |
| Third parties on load | Google Fonts CSS + font files only (`Blanka` loaded but unused) |
| Cookies / storage | None |
| Forms | None |
| Embeds / pixels / analytics | None (verified by grep: no iframe, no third-party script) |
| Outbound links | Spotify, Apple Music, YouTube Music, Amazon Music, Big Cartel, Instagram, TikTok, Facebook, YouTube |
| A11y defects | `cursor: none`; `<div onclick>` hamburger; no focus styles, skip link, or `<main>`; `--muted` #6b6b8a ≈3.9:1 contrast; ambiguous social alt text; no reduced-motion handling; `target=_blank` without `rel`; 5.6 MB image |

## 3. Architecture

Plain static multi-page site — no build step, deploy unchanged.

```
index.html
privacy/index.html
cookies/index.html
terms/index.html
accessibility/index.html
do-not-sell/index.html
404.html
css/tokens.css        design tokens (only place raw color/size values live)
css/styles.css        components + layout, consumes tokens
css/legal.css         long-form prose styles for policy pages
js/main.js            nav, reveal, starfield, shows, signup form
js/consent.js         consent manager (self-contained, no deps)
fonts/                self-hosted woff2 + @font-face in tokens.css
images/               recompressed/resized; originals replaced
package.json          devDependencies only (Playwright, axe-core, lighthouse); not used by Pages
tests/                Playwright specs
```

Header/footer markup is duplicated across pages (small, static; avoids JS dependency for legal links). Legal pages use root-relative URLs (`/css/...`), valid because the site is served from the domain root.

## 4. Visual design — "Signal from the Ridge"

Concept: the Appalachian night sky seen through a spacecraft HUD. Dark, ambient, precise.

- **Hero:** existing band photo, layered SVG Appalachian ridgeline silhouette across the bottom, single `<canvas>` starfield with slow parallax drift (replaces 180 DOM nodes), nebula radial glows. Eyebrow telemetry line: `39.63° N / 79.95° W · MORGANTOWN, WV`.
- **Motifs:** thin 1px HUD linework, corner brackets on cards, mono "telemetry" labels (e.g. `TRK 01`, `SIG // LIVE`).
- **Typography (self-hosted, OFL):** Michroma (display/wordmark/headings), IBM Plex Sans (body), IBM Plex Mono (labels). Fluid type scale via `clamp()`.
- **Color tokens:** deep void background, indigo surfaces, violet/blue accents, lavender highlight. Every text/background pair used for text verified ≥4.5:1 (≥3:1 for large text and UI boundaries).
- **Tokens:** color, type scale, spacing scale, radii, shadows/glows, motion durations/easings, z-index layers — all in `css/tokens.css`.
- **Interaction states:** hover, `:focus-visible` glow ring, active (pressed), disabled; signup form idle/loading/success/error; shows empty state ("No transmissions scheduled — check back soon").
- **Motion:** reveal-on-scroll, starfield drift, subtle hero zoom. All disabled under `prefers-reduced-motion: reduce`. Custom cursor removed entirely; native cursor always.
- **Responsive:** verified at 375, 768, 1280px. Shows rows keep ticket link visible on mobile (stacked), not hidden.
- **Performance:** images resized to ≤ 1600px wide (hero) / ≤ 600px (member photos), JPEG q≈78 plus WebP where useful; `loading="lazy"` below the fold; explicit width/height to prevent layout shift.

## 5. Accessibility (WCAG 2.1 AA)

- Skip link to `#main`; landmarks `header/nav/main/footer`; one `h1` per page, ordered headings.
- Hamburger → `<button aria-expanded aria-controls>`; Escape closes; focus returns to button.
- Visible focus on all interactive elements.
- Social links: `aria-label="LVNARY on Instagram (opens in new tab)"`, icons `alt=""`. Member links name the member.
- All external links: `target="_blank" rel="noopener noreferrer"` with new-tab indication.
- Form: visible `<label>`s, `aria-describedby` for errors, `aria-live="polite"` status region.
- Consent dialog: native `<dialog>` with focus trap via `showModal()`, labelled, Escape closes (= no change).
- Decorative canvas/SVG `aria-hidden="true"`.
- Accessibility Statement page: conformance target, known limitations, contact for issues, date.

## 6. Consent manager (`js/consent.js`)

- **Categories:** `necessary` (always on), `analytics`, `marketing`, `functional`.
- **Gating:** non-essential scripts are authored as `<script type="text/plain" data-consent="<category>" data-src="...">`. They never execute until that category is granted; on grant, consent.js clones them into real scripts. Same for `<iframe data-consent data-src>` (future click-to-load embeds).
- **Dormant mode:** if the page contains no gated elements, no banner is shown. "Cookie Settings" footer link still opens the preferences dialog, which states no optional technologies are in use.
- **Active mode:** banner with **Accept all** and **Reject all** of identical size/style, plus **Customize** (per-category toggles, default off). Banner is non-blocking (not a cookie wall).
- **GPC:** if `navigator.globalPrivacyControl === true`, `marketing` is forced off and cannot be toggled on; dialog displays "Global Privacy Control signal detected and honored."
- **Storage:** `localStorage["lvnary-consent"] = {version, timestamp, categories}`; wrapped in try/catch; if storage is unavailable, treat as no consent (nothing loads). Bumping `CONSENT_VERSION` re-prompts.
- **Withdrawal:** choosing Reject after Accept stores the new state and reloads so already-loaded scripts stop.
- **API:** `window.lvnaryConsent.open()`, `.get()`, and a `lvnary:consent` event.

## 7. Mailing list

- Section near footer: email input + **required, unchecked** checkbox "I'm 16 or older and agree to receive emails from LVNARY about music, shows, and merch. Unsubscribe anytime." + link to Privacy Policy.
- 16+ gate covers COPPA (<13) and the strictest GDPR digital-consent age.
- Plain HTML `<form method="post" action="[TODO: provider form URL]">` — no provider JS on our pages. JS enhancement submits via `fetch` (`Accept: application/json`) to show loading/success/error without leaving the page; if the provider rejects the CORS request, JS falls back to a normal form submit (opens provider confirmation page). Without JS it is a normal POST.
- Recommended provider: Kit (ConvertKit) with double opt-in enabled. Provider choice is a `[TODO]`; while the action URL is still the placeholder, the form shows a clear "Signup coming soon" error instead of submitting.

## 8. Legal pages

All carry "Effective date: [TODO: publish date]" and the operator "LVNARY, an independent band based in Morgantown, West Virginia" with `[TODO: contact email]` and `[TODO: mailing address]`.

- **Privacy Policy:** what's collected (server logs by GitHub Pages; email + consent timestamp if you subscribe; whatever you send by email), purposes, legal bases (GDPR: consent for newsletter, legitimate interest for hosting logs), processors (GitHub, mailing provider), third-party links (Big Cartel handles all payments under its own policy; streaming/social platforms), retention, rights (access, deletion, correction, portability, opt-out, withdraw consent, complain to a supervisory authority), US state-law notice (no sale/sharing, no targeted ads, GPC honored), children (not directed at under-13s; no knowing collection; newsletter 16+; deletion contact), international transfers, changes, contact.
- **Cookie Policy:** states no cookies are set; lists the one localStorage item (consent choice, strictly necessary) once used; table by category (all other categories: none); third-party sites set their own cookies after you click away; how to change preferences.
- **Terms of Use:** acceptance, acceptable use, IP (music, artwork, photos, logo owned by LVNARY/members; limited personal-use license), user submissions (emails to the band), third-party links & Big Cartel purchases (refunds governed by store policy), DMCA/copyright notice with designated-agent `[TODO]`, disclaimers, limitation of liability, indemnity, governing law (West Virginia; venue Monongalia County), termination, changes, contact.
- **Accessibility Statement:** see §5.
- **Do Not Sell or Share:** plain statement that LVNARY does not sell or share personal information or use targeted advertising; GPC honored; contact to submit a request anyway.
- **Footer (all pages):** Privacy · Cookies · Terms · Accessibility · Cookie Settings (button) · Do Not Sell or Share My Personal Information · © 2026 LVNARY · Morgantown, WV. Year rendered statically and updated by JS.

## 9. Error handling

- consent.js: storage failures → default deny; malformed stored JSON → discard and re-prompt.
- Signup: client validation (email format, checkbox required) with inline errors; network failure → error state with retry; placeholder action → "coming soon" message.
- Shows: no data → empty state; ticket URL rendered via DOM APIs (no `innerHTML` with data attributes).
- 404 page in site style.

## 10. Testing & verification

Playwright (Chromium) against a local static server (`npx http-server`):
1. Every page: no requests to non-`localhost` origins on load.
2. Consent test fixture page (`tests/fixtures/consent-test.html`, not linked from the site) containing a gated analytics stub that requests `https://example.invalid/analytics.js`: not requested before consent; requested after Accept; not requested after Reject; analytics allowed but marketing blocked under emulated GPC.
3. Banner Accept/Reject buttons have equal dimensions.
4. Keyboard: skip link, hamburger open/Escape, consent dialog focus.
5. axe-core on every page at 375px and 1280px: zero violations.
6. Lighthouse (accessibility, best practices, SEO, performance) on home + one legal page; scores reported.
7. Screenshots at 375 / 768 / 1280 reviewed manually.

## 11. Risks for lawyer review

- Unincorporated band → members personally liable; consider an LLC.
- DMCA safe harbor requires registering a designated agent with the US Copyright Office ($6) — only matters if the site ever hosts user content; listed anyway.
- Mailing provider choice determines international transfer mechanism (SCCs/DPF).
- Governing-law/venue clause and limitation of liability enforceability vary by state and for consumers.
- Big Cartel store is a separate surface with its own policies — confirm its privacy/refund settings match.
