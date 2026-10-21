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
fonts/                self-hosted woff2 (Michroma, IBM Plex Sans) + @font-face in tokens.css
images/               recompressed/resized; originals replaced
package.json          devDependencies only (Playwright, axe-core, lighthouse); not used by Pages
tests/                Playwright specs
```

Header/footer markup is duplicated across pages (small, static; avoids JS dependency for legal links). Legal pages use root-relative URLs (`/css/...`), valid because the site is served from the domain root.

## 4. Visual design — "Night over the ridge"

Revised with the frontend-design skill. The first draft leaned on generic "sci-fi HUD" chrome (uppercase mono telemetry labels, coordinate strings, eyebrow labels over every heading, middle-dot meta strings, arrow-suffixed buttons, corner-bracket cards, fade-up on every section). All of that is cut. Boldness is spent in one place: the hero.

**The one memorable thing:** the band photo dissolves downward into three layered Appalachian ridgelines (inline SVG, each a deeper indigo), under a canvas starfield. On load, one orchestrated sequence (~1.6s): stars fade in, ridges rise in staggered parallax, the wordmark letter-spacing settles from wide to final. Scrolling gives the ridges gentle depth parallax. Nothing else on the page animates on its own.

**Color (tokens)**
| Name | Hex | Role |
|---|---|---|
| Void indigo | `#0A0920` | page background (a real night-sky indigo, not tinted black) |
| Ridge navy | `#151338` | surfaces, nearest ridge |
| Signal violet | `#6A4BE0` | primary buttons (white text 5.7:1) |
| Cold signal blue | `#5FA8FF` | links, focus ring (7.9:1 on void) |
| Lavender haze | `#C9BEFF` | secondary emphasis |
| Starlight | `#EEF0FF` | body text |
| Dusk text | `#A6A3CC` | muted text (≈8:1 on void) |

**Type:** two families, clearly distinct, self-hosted.
- **Michroma** — wordmark and section headings only, sentence case (no forced uppercase); wordmark gets generous tracking as the brand mark.
- **IBM Plex Sans** (400/500/600) — everything else, including dates (tabular figures). No monospace face.
- Scale: modular ratio 1.25 from 1.0625rem body; line-height 1.6 body, 1.1 headings; prose measure ≤ 68ch.

**Layout:** left-aligned content on a single 72rem column with a 16px+ gutter; only the hero wordmark is centered (it is a logo lockup).

```
┌──────────────────────────────────────────┐
│ LVNARY            Music Shows Merch About│  sticky, transparent → solid on scroll
│                                          │
│          [band photo, darkened]          │
│               L V N A R Y                │  wordmark, centered
│    Progressive post-hardcore from        │
│    Morgantown, West Virginia             │
│      [Listen]  [See shows]               │
│ /\/\__/\___/\/\____/\/\__ (ridge 3)      │
│ __/\/\____/\__/\/\_______ (ridge 2)      │
│ ____/\________/\__________ (ridge 1)     │
├──────────────────────────────────────────┤
│ Music                                    │  heading, no eyebrow
│ Temporary — single, 2024                 │
│ [Spotify] [Apple Music] [YT Music] [Amz] │
├─ ridge contour divider ──────────────────┤
│ Shows  (chronological list, date-led)    │
│ Merch  · About + members · Mailing list  │
│ Footer: legal links, cookie settings, ©  │
└──────────────────────────────────────────┘
```

**Rework (2026-10-21, at the user's request, frontend-design):** below the hero the page reads like liner notes. Section titles sit in a sticky left rail on wide screens (stacked on mobile); shows are a tour-date list (large day number over month, rows separated by thin lines, no cards); member portraits are circles ("three moons") with an orbit ring that answers hover/focus; repeated wavy dividers are removed. The ridge returns once at the top of the footer, which closes with a large decorative wordmark, so the page begins and ends at the ridge.

**Structure as information:** section dividers are a thin single ridge contour (reuses the hero motif; separates sections). Shows are date-led rows because they are a chronological sequence. "For fans of" stays as a plain sentence-case list, not pill tags.

**Copy rules:** sentence case everywhere; buttons say what happens ("Listen on Spotify", "Shop merch", "Subscribe", "Save choices"); no arrows appended; pronunciation becomes "Pronounced loo-nuh-ree."; empty shows state: "No shows booked right now. Join the mailing list to hear first."; errors say what's wrong and how to fix it.

**Interaction states:** hover (color/underline shift, no lift-on-every-card), `:focus-visible` 2px cold-blue ring with offset, active (slight inset), disabled; signup idle/loading/success/error.

**Motion:** only the hero sequence + ridge parallax + slow star twinkle. Per-section scroll reveals removed. Everything off under `prefers-reduced-motion: reduce`. Custom cursor removed.

**Responsive:** verified at 375, 768, 1280px. Shows rows keep the ticket link visible on mobile (stacked). Member grid 1 → 3 columns.

**Performance:** hero ≤ 1600px wide, member photos ≤ 600px, about photo ≤ 1400px; JPEG q≈78; `loading="lazy"` below the fold; explicit width/height.

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
