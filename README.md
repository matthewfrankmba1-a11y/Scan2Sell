# Scan2Sell

A phone web app for scanning a stack of sneaker boxes and turning it into a
spreadsheet with **style code, size, description, and comparable prices** from
eBay, StockX, and GOAT.

It runs in Safari (or any modern phone browser). You don't need the App Store,
a Mac, or an Apple developer account. Add it to your home screen and it opens
full-screen like a normal app.

> The `ios/` folder has an earlier native SwiftUI version of the same app, for
> use with Xcode. The web app in `web/` is the recommended one.

## What it does

1. **Scan.** Tap **Scan** and point the camera at box after box. Each new
   barcode beeps and is added to the list. Holding a box in view counts it
   once. Scanning the same UPC later raises its quantity. Each scan has
   **Undo** and **+1** buttons, and you can type a UPC by hand.
2. **Reads the box label.** It also reads the label text for the style code
   (`DZ5485-612`) and size (`US 10`), which covers barcodes that aren't in any
   database. You can turn this off in Settings.
3. **Looks up each pair** in the background:
   | Source | What you get |
   |---|---|
   | UPCitemdb | Barcode → product name, brand, color (free, no key) |
   | StockX API | Exact product + size (matched by barcode), clean title, retail, **lowest ask / highest bid** |
   | eBay API | **Median, low, high** for that style + size, with outliers removed. Uses **sold** prices once eBay approves your app, otherwise **current listings** |
   | GOAT | A search link and a price field you fill in by hand (GOAT has no public API) |
4. **Review and fix.** Tap a pair to edit the style code or size, add notes,
   type a GOAT price, open the eBay sold, StockX, or GOAT pages, or re-run the
   lookup.
5. **Export.** Tap the share icon to get a `.csv` spreadsheet from the iPhone
   share sheet. You can save it to Files, open it in Numbers, Excel, or Google
   Sheets, AirDrop it, or email it.

**Spreadsheet columns:** Scanned · UPC · Brand · Style Code · Size · Description ·
Colorway · Qty · Retail · eBay Median / Low / High / Comps / Basis ·
StockX Lowest Ask / Highest Bid · GOAT Price · Est. Value (each) · Value Source ·
Est. Value (total) · eBay Sold / StockX / GOAT links · Notes · Lookup Status

Your scanned list is stored on your phone, in the browser. Export to keep a
copy.

**Import.** Settings → **Import spreadsheet (CSV)** merges a Scan2Sell
spreadsheet back into the list by UPC. Filled-in cells update items, blank
cells leave them alone, and unknown UPCs are added. Use it to load
corrections made in Numbers, Excel or Google Sheets, to restore a backup, or
to move your list to another phone.

## Put it online (free, about 10 minutes)

The app needs a small server so your eBay/StockX keys stay secret. It's set up
for **[Vercel](https://vercel.com)**, whose free Hobby plan is enough.

1. Sign up at vercel.com with your GitHub account.
2. **Add New → Project**, then import **Scan2Sell**.
3. Leave the settings at their defaults. The repo's `vercel.json` tells Vercel
   how to build the app in `web/`. Setting Root Directory to `web` also works.
4. Under **Environment Variables**, add at least:
   - Optional: lock the app so strangers can't use your API quota. Use either
     one shared code (`APP_PASSWORD`) or per-person keys that people request
     and you approve in Discord (see [Access keys](#access-keys-optional)).
   - Your eBay and StockX keys (see below). You can add these later.
5. Click **Deploy**. You get a URL like `https://scan2sell-yourname.vercel.app`.

Vercel deploys the repo's **default branch**. Merge this branch into `main`
first, or pick the branch in Vercel's project settings.

### On your iPhone
1. Open your Vercel URL in **Safari**.
2. Tap **Share → Add to Home Screen**.
3. Open Scan2Sell from the home screen. Go to **Settings ⚙︎**, enter your
   access code, and allow camera access when you first tap Scan.

To share it with someone, send them the URL and the access code.

## Access keys (optional)

Lock the app so only people you approve can use it:

1. Someone opens the app, goes to **Settings**, enters their email and taps **Request**.
2. A message appears in your Discord channel with an **Approve & email key** button.
3. Tapping it opens an approval page. Confirm there, and they're emailed a key
   (`S2S-XXXX-XXXX-XXXX-XXXX-XXXX`) with a link that adds it to the app in one tap.

Set these Vercel environment variables, then redeploy:

| Variable | What to put |
|---|---|
| `ACCESS_KEY_SECRET` | A long random string (32+ characters). Turns the lock on. Changing it cancels every issued key. |
| `DISCORD_WEBHOOK_URL` | Discord → channel ⚙︎ → Integrations → Webhooks → New Webhook → Copy URL |
| `BREVO_API_KEY` | brevo.com (free) → SMTP & API → API Keys. Also verify your sender address under Senders. |
| `MAIL_FROM` | The verified sender, e.g. `Scan2Sell <you@gmail.com>` |
| `APP_PASSWORD` | Optional master code that always works |
| `REVOKED_KEYS` | Optional. Comma-separated keys to block. |

`RESEND_API_KEY` works instead of Brevo if you have your own domain. Without an
email provider, the approval page shows the key so you can send it yourself.

Keys are signed with `ACCESS_KEY_SECRET` instead of stored in a database, so
the same email always gets the same key.

## Price source setup

After changing environment variables in Vercel, **redeploy** (Deployments → ⋯ → Redeploy).
The app's Settings page shows which sources the server has keys for.

### eBay: `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`
1. Create a free account at <https://developer.ebay.com>, then go to
   **Application Keys** and create a **Production** keyset.
2. Set `EBAY_CLIENT_ID` (App ID) and `EBAY_CLIENT_SECRET` (Cert ID).
3. That gives you **current listing** prices. For real **sold** prices, apply
   for the **Marketplace Insights API**. eBay approves it case by case. Once
   approved, set `EBAY_USE_SOLD=true`. If sold data fails, the app falls back
   to current listings automatically.

Even without API access, every item's **eBay sold listings** link opens eBay's
own sold search for that style code and size.

### StockX: `STOCKX_API_KEY`, `STOCKX_CLIENT_ID`, `STOCKX_CLIENT_SECRET`, `STOCKX_REFRESH_TOKEN`
1. Sign up at <https://developer.stockx.com> and create an app. Set its
   **redirect/callback URL** to
   `https://YOUR-APP.vercel.app/api/stockx-callback`.
2. Set `STOCKX_API_KEY`, `STOCKX_CLIENT_ID`, and `STOCKX_CLIENT_SECRET`, then
   redeploy.
3. In the app, go to **Settings → Connect StockX account** and sign in. The
   page you land on shows a refresh token. Save it as
   `STOCKX_REFRESH_TOKEN` and redeploy.

### UPCitemdb: `UPCITEMDB_KEY` (optional)
Works without a key (about 100 lookups/day). For heavier use, buy a key at
<https://www.upcitemdb.com>.

All variables are listed in [`web/.env.example`](web/.env.example).

## Running it yourself instead of Vercel

Requires Node 22+.

```bash
cd web
npm install
cp .env.example .env   # fill in your keys
npm run build
npm start              # http://localhost:3000
```

Phones only allow camera access over **https**. To use it from your phone,
put it behind an HTTPS host or tunnel (e.g. Cloudflare Tunnel, Render,
Railway, Fly.io). `npm test` runs the unit and API tests.

## Limitations

- **GOAT** has no public API, so you get a link plus manual entry.
- **StockX** API gives the current market (lowest ask, highest bid), not its
  sales history.
- **eBay sold** prices need Marketplace Insights approval. Until then the
  numbers are current asking prices, and the "eBay Basis" column says which
  you got.
- **UPC databases cover sneakers unevenly.** When a barcode isn't found, the
  style code and size read from the box label are used. StockX's barcode
  match is the most accurate source when it's connected.
- **Label reading** downloads an OCR engine (about 5 MB) from a CDN the first
  time it's used.
- Comps are automated. Check big-ticket pairs using the links.

## Project layout

```
web/
  index.html, src/        Frontend (Vite, no framework): scanner, list, detail, settings
  shared/                 Logic used by browser + server: label parsing, price stats, CSV
  api/                    Serverless endpoints (Vercel): upc, stockx, ebay, health, StockX sign-in
  lib/                    Server-side API clients for UPCitemdb, StockX, eBay
  server.js               Same app as a plain Node server (self-hosting / local)
  test/                   node:test unit + API tests
api/, vercel.json         Thin wrappers so Vercel can deploy from the repo root
ios/                      Native SwiftUI version (optional, needs Xcode)
```
