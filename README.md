# lvnary.com

The band's website. It's hosted free on GitHub Pages; anything you commit to the `main` branch goes live in about a minute.

- [How to update merch](#how-to-update-merch)
- [How to handle orders](#how-to-handle-orders)
- [How the store works](#how-the-store-works)
- [One-time setup](#one-time-setup)
- [Switching from test mode to live](#switching-from-test-mode-to-live)
- [For developers](#for-developers)

---

## How to update merch

Everything about the store lives in two files you can edit on GitHub, from a computer or a phone browser:

| File | What's in it |
|---|---|
| [`merch/products.json`](merch/products.json) | Products, prices, sizes, and stock |
| [`merch/settings.json`](merch/settings.json) | Shipping rates, card fee, Venmo/Cash App/Zelle handles |

### Editing a file

1. Go to the file on github.com (links above) and sign in.
2. Click the **pencil icon** (Edit this file). On a phone, tap **…** then **Edit file**.
3. Make your change. Only change the values: the numbers and the words inside quotes.
4. Click **Commit changes**, then **Commit changes** again.
5. Wait about a minute and reload [lvnary.com/merch](https://lvnary.com/merch/).

**Giving a band member access:** each person needs their own GitHub account. The repo owner goes to the repo's **Settings → Collaborators → Add people** and invites them. Once they accept, they can edit these files the same way.

**If something breaks:** GitHub checks the files after every commit. A green check ✔ next to your commit means it's fine. A red ✖ means there's a mistake: click the ✖, then **Details**, and it tells you what to fix in plain words (for example "Product 1: stock must be a whole number"). Until it's fixed, the store page says "The store is being updated" and nobody can check out, so nothing can go wrong with orders.

The most common mistake is punctuation. Every line in a list ends with a comma **except the last one**, and words need "straight quotes" around them.

### Change stock (after a show, a restock, etc.)

Find the size and change the number after `"stock":`

```json
{ "size": "M", "stock": 4 },
```

- `0` greys that size out and nobody can buy it.
- Online **card** orders lower these numbers by themselves. You only change stock for things sold in person, restocks, or cancelled orders.
- **Venmo/Cash App/Zelle orders placed on the site also lower stock right away** (to hold the items). If one gets cancelled, add the items back.

### Change a price

`take_home_price` is **what the band keeps** per item, in dollars, with no `$` sign:

```json
"take_home_price": 20,
```

The site adds Stripe's card fee and rounds up to the next 50¢, so a $20 take-home price shows as **$21.00**. You keep $20 whichever way the fan pays. To make one size cost more (say 2XL+ costs you more to print), give that size an `extra`:

```json
{ "size": "2XL", "stock": 3, "extra": 2 },
```

### Mark something sold out or hide it

Change `"status"` on the product:

- `"active"`: for sale
- `"sold_out"`: still shown, greyed out, with "Sold out for now"
- `"hidden"`: not shown at all (good for something you're not ready to sell yet)

To sell out just **one size**, set its stock to `0`.

### Add a product

1. Upload the photo: on GitHub, open the `images/merch` folder, click **Add file → Upload files**, and commit. Use a JPG about 900 pixels wide (any phone photo works; smaller files load faster).
2. In `products.json`, copy a whole product block, from its `{` to its `},`, and paste it right after another product's `},`.
3. Change everything in your copy:
   - `id`: short, lowercase, dashes instead of spaces, unique (e.g. `"tour-hoodie-2027"`). **Never change an id after something has sold.**
   - `name`, `description`, `take_home_price`, `status`
   - `ships_as`: `"letter"` for stickers and other flat things, `"parcel"` for clothing
   - `photos`: `src` is `/images/merch/` plus the file name you uploaded. Set `width` and `height` to the photo's size in pixels. `alt` describes the photo for people who can't see it ("Black hoodie with the moon logo on the back").
   - `variants`: one line per size. Stickers use a single `{ "size": "One size", "stock": 25 }`.
4. Commit and check for the green ✔.

### Remove a product

Set its status to `"hidden"`. That's safer than deleting it, and you can bring it back later.

### Shipping rates, free shipping, payment handles

All in `settings.json`, with notes at the top of the file:

- `shipping`: what **you pay** for postage per zone (US, Canada, everywhere else). `letter` is used when the whole order is stickers; anything with a shirt uses `parcel`. `first` is the first item, `each_additional` is every item after that. Stickers ride along free in a parcel. The site adds the card fee on top.
- `free_shipping`: set `"enabled": true` and a `"minimum_order"` (in dollars) to ship free above that amount in the listed `zones`.
- `pay_apps`: your Venmo, Cash App, and Zelle handles. Leave one as `""` to hide it.
- `card_fee`: Stripe's current fee. Check [stripe.com/pricing](https://stripe.com/pricing) once a year and update it if it changes.

---

## How to handle orders

### When an order comes in

You get an email at the band's order address for **every** order:

- **"New card order LV-XXXXXX: $NN.NN, paid"**: the money is in Stripe. The email has the shipping address, items, and sizes. Pack it and ship it.
- **"New Venmo order LV-XXXXXX: $NN.NN, NOT PAID YET"** (or Cash App or Zelle): **wait for the payment.** The buyer was told to put the order number in the payment note. Ship only once a payment for the right amount arrives with that number.

You can also see every card order in the Stripe dashboard: **Payments** → click the payment → the shipping address and items are listed there. The order email has a direct link.

### Shipping it

1. Buy postage (USPS.com Click-N-Ship, Pirate Ship, or the post office). For international orders, fill in the customs form using the items and prices in the order email.
2. Mail it.
3. Optional but appreciated: reply to the order email (it goes to the buyer) with the tracking number.

### Unpaid Venmo/Cash App/Zelle orders

If a payment hasn't come in after 3 days, email the buyer once. If you cancel, **add the items back to the stock** in `products.json`.

### Refunds

- **Card orders:** Stripe dashboard → **Payments** → click the payment → **Refund**. Stripe keeps its original fee, so a full refund costs the band that fee.
- **App orders:** send the money back through the same app.
- If you're refunding because something was oversold, the email will have said **"OVERSOLD"** at the top.

### Selling at shows

Take cash, Venmo, Cash App, or Zelle in person as usual. Afterward, lower the stock in `products.json` for what you sold, so the website doesn't sell something you no longer have.

---

## How the store works

- The merch page (`merch/index.html`) reads `products.json` and `settings.json` and shows the products. The bag is remembered in the fan's browser.
- When a fan checks out, the page sends the bag to a small **Cloudflare Worker** (free plan). The worker re-reads prices and stock **from GitHub**, so nobody can change a price in their browser. It then opens a **Stripe Checkout** page for card, Apple Pay, and Google Pay.
- When Stripe confirms a payment, it tells the worker. The worker lowers the stock in `products.json` (you'll see commits named "Card order LV-…: lower stock") and emails the band.
- **Costs:** $0 a month. Stripe charges 2.9% + 30¢ per US card payment (plus 1.5% for cards from other countries); the site builds that into prices and shipping so the band keeps the take-home price plus postage. Cloudflare, GitHub, and the email forwarding are free at our size.
- **Overselling:** stock is checked when checkout opens and again when payment arrives. If two people buy the very last shirt within the same minute, the second order email says **OVERSOLD** so you can refund it. That's the one gap a free setup can't fully close.
- **Fees and the law:** card fees are built into prices instead of being added as a separate "card fee" line. A separate card surcharge would break Visa's 3% cap on almost every order (the 30¢ fixed fee alone is over 3% on anything under $10), can't be charged on debit cards, and is banned or limited in some states. Built-in prices are legal everywhere, and app buyers pay the same price.
- **Venmo/Cash App business profiles:** both apps' terms say goods should be sold through a business profile, not a personal one. Business profiles charge a fee (Venmo about 1.9% + 10¢; Cash App 2.75%), but they give buyers purchase protection and keep your account from being limited. Zelle has no purchase protection either way; use it with people you trust.
- **Sales tax:** not collected. Check with whoever does the band's taxes whether West Virginia sales tax applies to your merch sales. If it does, it can be added later.

---

## One-time setup

Do these in order. Everything here is free. Total time is about an hour. Have the band's email inbox open.

### 1. Stripe account

1. Sign up at [dashboard.stripe.com/register](https://dashboard.stripe.com/register) with the band email. You can do everything below in **test mode** before giving Stripe any bank details.
2. **Settings → Business → Public details**: set the public business name to `LVNARY` and the statement descriptor to `LVNARY MERCH` (what shows on fans' card statements).
3. **Settings → Payment methods**: make sure **Cards**, **Apple Pay**, and **Google Pay** are on. Turn off anything else you don't want (the store only charges in US dollars).
4. **Settings → Emails** (customer emails): turn on **Successful payments**, so buyers get a receipt.
5. **Settings → Team and security → Notifications** (or your profile's notification settings): turn on **Successful payments** for yourself if you want Stripe's own email too.
6. Make sure the **Test mode** toggle (top right) is **on** for now.
7. **Developers → API keys**: copy the **Secret key** (starts with `sk_test_`). You'll paste it in step 4. **Never put it in any file in this repo.**

### 2. GitHub access token (lets the worker update stock)

1. On GitHub: your profile picture → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Name: `lvnary-store-worker`. Expiration: 1 year (put a reminder in your calendar to renew it; when it expires, card orders still go through but stock stops updating).
3. **Repository access → Only select repositories →** `lvnaryWebsite26`.
4. **Permissions → Repository permissions → Contents → Read and write.** Nothing else.
5. Generate, then copy the token (starts with `github_pat_`). You'll paste it in step 4.

### 3. Cloudflare: email and storage

lvnary.com's DNS is already on Cloudflare.

1. Log in at [dash.cloudflare.com](https://dash.cloudflare.com) and open **lvnary.com**.
2. **Email → Email Routing → Get started / Enable.** Accept the DNS records it adds.
3. **Destination addresses → Add**: the inbox where the band wants order emails. Click the verification link Cloudflare emails you.
4. In this repo, open `worker/wrangler.toml` and replace **both** `TODO-band-email@example.com` with that address. Commit.

### 4. Deploy the worker

On a computer with [Node.js](https://nodejs.org) installed, in this folder:

```sh
npm install
npx wrangler login
npx wrangler kv namespace create STORE_KV --config worker/wrangler.toml
```

The last command prints an `id`. Paste it over `TODO-kv-namespace-id` in `worker/wrangler.toml`. Then add the secrets. Each command asks you to paste a value; it's stored encrypted by Cloudflare, not in the repo:

```sh
npx wrangler secret put STRIPE_SECRET_KEY --config worker/wrangler.toml      # sk_test_… from step 1
npx wrangler secret put GITHUB_TOKEN --config worker/wrangler.toml           # github_pat_… from step 2
npm run worker:deploy
```

The deploy sets up the worker at **https://shop-api.lvnary.com**. You can see and change secrets later in the Cloudflare dashboard: **Workers & Pages → lvnary-store → Settings → Variables and Secrets**.

### 5. Stripe webhook (tells the worker when someone paid)

1. Stripe dashboard (still in **test mode**) → **Developers → Webhooks → Add endpoint** (or **Add destination**).
2. Endpoint URL: `https://shop-api.lvnary.com/stripe-webhook`
3. Events: `checkout.session.completed` and `checkout.session.async_payment_succeeded`.
4. Save, then click **Reveal** under **Signing secret** and copy it (starts with `whsec_`).
5. Run:

   ```sh
   npx wrangler secret put STRIPE_WEBHOOK_SECRET --config worker/wrangler.toml
   ```

### 6. Turn the store on

1. In `merch/settings.json`, set `"checkout_api": "https://shop-api.lvnary.com"` and fill in your `pay_apps` handles.
2. In `merch/products.json`, set the real stock for every size, and check the prices.
3. The five legal pages (`privacy`, `terms`, `cookies`, `accessibility`, `do-not-sell`) have an effective date of October 22, 2026. When a policy changes, update both the text and the `datetime` on its `<time>` tag.
4. Commit everything to `main`.

### 7. Test the whole thing in test mode

1. Go to lvnary.com/merch, add a shirt, choose **United States**, and click **Pay by card**.
2. On Stripe's page, use card number `4242 4242 4242 4242`, any future expiry date, any 3-digit CVC, and any name and address.
3. You should land on the "Thanks for your order" page.
4. Within a minute you should get the order email marked **TEST MODE**, and see a commit "Card order LV-…: lower stock" on GitHub that lowered that size by one.
5. Try a declined card (`4000 0000 0000 0002`): Stripe shows the error and no order is created.
6. Try **Pay with Venmo…** with your own address and check the email arrives.
7. **Put the stock back** in `products.json` for the test orders.

---

### 8. Mailing list

The signup form on the home page saves addresses in the store worker's Cloudflare storage. It's free and needs no other account. Nothing to set up: it works once the worker is deployed.

**Download the list:** on a computer with this folder (after `npm install` and `npx wrangler login`), run:

```sh
npm run subscribers
```

That writes `subscribers.csv`: each address, when they signed up, and the exact wording they agreed to. The file is never committed, so keep it private.

**Someone asks to unsubscribe or be deleted:**

```sh
npm run subscribers -- --remove fan@example.com
```

**Sending an email to the list:** don't paste the list into Gmail's BCC. It looks like spam and Gmail limits it to a few hundred a day. Upload `subscribers.csv` into a free sending service (MailerLite, Brevo, or Kit all have free plans), which adds the unsubscribe link and the mailing address that US law (CAN-SPAM) requires at the bottom of every marketing email. A PO box works for that address. Then add the service's name to the "Who we share it with" list in `privacy/index.html`.

## Switching from test mode to live

1. Stripe dashboard: click **Activate payments** and fill in the band's details and bank account.
2. Turn **Test mode off**. Stripe live mode has its own keys and webhooks, so repeat these in live mode:
   - **Developers → API keys:** copy the live **Secret key** (`sk_live_…`), then run `npx wrangler secret put STRIPE_SECRET_KEY --config worker/wrangler.toml` and paste it.
   - **Developers → Webhooks:** add the same endpoint and events as setup step 5, copy the new signing secret, then run `npx wrangler secret put STRIPE_WEBHOOK_SECRET --config worker/wrangler.toml` and paste it.
   - **Settings → Emails:** turn on customer receipts in live mode too.
3. Make one real purchase of a sticker with your own card, check the email and stock commit, then refund it in Stripe.

To go back to test mode, put the `sk_test_` key and the test webhook secret back the same way.

---

## Security

- **Content-Security-Policy:** every page has a `<meta http-equiv="Content-Security-Policy">` tag near the top. It only lets the browser load this site's own files and talk to the store worker (`shop-api.lvnary.com`). If you add an embed (a Spotify or YouTube player) or an outside script, add its address to that tag on each page that uses it, or the browser blocks it. The home page already allows `https://open.spotify.com` in `frame-src` for the tap-to-load Spotify player; nothing from Spotify loads until someone taps Play. The tests fail if any page breaks its own policy.
- **One inline script:** the policy allows exactly one inline script, `document.documentElement.classList.add('js');`, by its hash. Put any other script in a file under `js/`.
- **Worker limits:** card checkout allows 10 tries a minute and signup 3 a minute per connection (`[[ratelimits]]` in `worker/wrangler.toml`). Venmo, Cash App, and Zelle orders allow 5 an hour, since each one holds stock.
- **Secrets** live only in Cloudflare (`npx wrangler secret put …`), never in this repo.

## For developers

```sh
npm install
npm test              # unit tests (pricing, worker) + Playwright (pages, accessibility)
npm run serve         # http://localhost:4317
npm run check:merch   # validate the store files
npm run worker:dev    # run the worker locally (needs a worker/.dev.vars with the three secrets)
```

- `js/store-core.js`: prices, shipping, and stock checks, shared by the page and the worker so totals always match.
- `js/merch.js`, `css/merch.css`, `merch/`: the store page.
- `worker/`: the Cloudflare Worker (`/checkout`, `/order`, `/stripe-webhook`). Secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `GITHUB_TOKEN`.
