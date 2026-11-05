# DiamondPOS: Project Notes

> **For Claude / anyone picking this up:** read this file first. It records how the project is set up, what's done, and what's next. Keep it updated at the end of each work session.

_Last updated: 5 November 2026 (register-style Sale screen)_

---

## What this is

DiamondPOS is a Windows point of sale app for one store location with several tills.

- **One installer** for every PC. On first launch you choose **Store Server** (one PC per store, which can also be a till) or **Till**.
- The **store server** runs inside the app: an Express API on **port 4580** plus a **SQLite** database. Tills connect over the LAN using the server's IP address and an 8-character **pairing code**.
- **Card payments** happen on a **standalone third-party terminal**. The POS records the amount and the terminal's reference number; there's no integration.
- Prices **include GST** (15% by default). Tax is worked out on the server.
- **Update and rollback:** GitHub Actions builds the installer when a version tag is pushed and publishes it to GitHub Releases. The in-app **Updates** screen can install any release, newer or older.
- Design decision: the server must always be reachable. There's no offline mode for tills (can be added later).

**Stack:** Electron 33 + React 18 + TypeScript, built with electron-vite. Installers come from electron-builder (NSIS), updates from electron-updater, the API from Express, and the database is better-sqlite3.

---

## Developer environment (Greg's PC)

| Item | Setting |
|---|---|
| Project folder | `C:\dev\DiamondPOS` (previously `C:\dev\store-pos`) |
| Node.js | **v22 LTS**. Node 26 does NOT work: better-sqlite3 has no prebuilt binary for it, and building needs Python and VS Build Tools. |
| npm | Run from **PowerShell** (`npm run dev`). If it says "scripts disabled", use `npm.cmd` or `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`. |
| Git | Run from **MobaXterm** using an **SSH key** (`~/.ssh/id_ed25519`, added to GitHub). In MobaXterm the project is at `/drives/c/dev/DiamondPOS`. |
| GitHub | Account `gunchman01`, repo **`gunchman01/DiamondPOS`** (**public**, so the in-app updater can read releases) |
| Git remote | `git@github.com:gunchman01/DiamondPOS.git` |
| App data | `%APPDATA%\DiamondPOS\` holds `pos-config.json` plus `data\store.db` and `data\backups\`. The dev app and installed app share this folder, so only run one at a time. |

### Everyday commands

```bash
npm run dev         # PowerShell: run with live reload
npm run typecheck   # PowerShell: check types
git add -A && git commit -m "..." && git push        # MobaXterm
git tag vX.Y.Z && git push origin vX.Y.Z             # MobaXterm: publish a release
git tag vX.Y.Z-beta.1 && git push origin vX.Y.Z-beta.1   # beta (pre-release)
```

---

## Key files

| File | Purpose |
|---|---|
| `src/shared/types.ts` | All data shapes (Product, Sale, config, ...) |
| `src/shared/constants.ts` | Server port, `MIN_CLIENT_VERSION`, GitHub owner/repo for updates |
| `src/main/index.ts` | Electron start-up, window, IPC, receipt printing |
| `src/main/updater.ts` | List releases and install any version (update/rollback) |
| `src/main/server/index.ts` | API routes: products, sales, reports, settings |
| `src/main/server/migrations.ts` | DB schema changes. **Add only**; never edit released migrations. |
| `src/renderer/src/screens/*` | UI: Setup, Home (Navigator), Sell, Products (Item List), Reports, Settings, Updates |
| `src/main/server/kiosk.ts`, `kioskPage.ts` | iPad customer kiosk: pairing, live events, sign-up; the kiosk web page |
| `src/main/server/products.ts`, `customers.ts` | Item / customer fields, validation, import, search, stats |
| `src/renderer/src/icons.tsx` | Our own SVG icon set used by the Home screen |
| `electron-builder.yml` | Installer settings and GitHub publish target |
| `.github/workflows/release.yml` | Builds and publishes on a `v*` tag |
| `docs/GETTING_STARTED.md` | Beginner guide to the whole stack |

---

## Progress log

### 4–5 Nov 2026: setup and first releases
- [x] Scaffolded the app (server/till modes, Sell, Products, Reports, Settings, Updates screens)
- [x] Fixed environment issues: PowerShell execution policy, Node 26 → Node 22, GitHub auth via SSH in MobaXterm
- [x] Made the repo public (needed for the updater)
- [x] Released **v0.1.1** as "Store POS" (repo `gunchman01/store-pos`). Downloaded, installed and working.
- [x] Disabled the Update/Revert buttons in dev mode (they only work in the installed app)
- [x] **Renamed project to DiamondPOS** (app name, installer name, app ID, repo, docs)

### Rename follow-up
- [x] Rename the GitHub repo `store-pos` → `DiamondPOS`
- [x] `git remote set-url origin git@github.com:gunchman01/DiamondPOS.git`
- [x] Rename the local folder `C:\dev\store-pos` → `C:\dev\DiamondPOS`
- [x] Delete the old v0.1.x releases and tags (so "Revert" can't install the old Store POS app)
- [x] Uninstall the old "Store POS" app
- [x] Release **v0.2.0** as the first DiamondPOS version. Installed and working.
- [ ] Test update and rollback: release v0.2.1, update to it, then revert to v0.2.0

### 5 Nov 2026: register-style main screen (released as **v0.2.1**)
- [x] **Red theme** across the app (tokens in `styles.css`: `--red`, `--red-dark`, `--red-darker`, `--red-tint`)
- [x] Red header bar with tabs (Sale, Items, Reports, Settings, Updates), connection status, till name and clock
- [x] **Sale screen rebuilt** as a classic register layout (`screens/Sell.tsx`), inspired by desktop POS register screens (our own design, no third-party branding):
  - **Receipt grid**: # / Item # / Description / Qty / Price / Ext. Price, with selectable lines and −1, +1, Change qty, Remove
  - **All Items panel**: every active item, searchable by name, item # or barcode; click to add, Enter adds the top match
  - **Totals panel**: items, subtotal, GST included, big TOTAL, and Cash / Card buttons. After a sale it shows the change due and a Print receipt button.
  - **Function keys**: F2 Find item, F3 Quantity, F4 Remove line (or Delete), F6 Clear sale, F7 Cash, F8 Card, Esc clears the search. F10/F11 are avoided because Windows and Electron use them.
  - Scan bar: a barcode or exact item # adds directly; partial text filters All Items
- [x] "Products" renamed to "Items" in the UI
- Verified: TypeScript checks pass; visual preview at 1280×800 with mock data

### 5 Nov 2026: Quick Picks (released as **v0.2.2**)
- [x] **DB migration 3**: `products.quick_pick` (0/1, default 0). Additive, so rollback is safe.
  - `PUT /api/products/:id` uses `COALESCE`, so an older till that doesn't send `quickPick` won't clear it
  - `GET /api/products?quickPick=1` returns only Quick Pick items
- [x] **Items page**: "Quick Pick" checkbox in the edit dialog, a ✓ column, and a "Quick Picks only" filter
- [x] **Sale screen**: the All Items list was removed (the full list lives on the Items page) and replaced by a **Quick Picks** panel of big buttons
  - **No Quick Picks set** → the Quick Picks panel is hidden, the receipt goes **full width**, and the **totals move to the bottom right** (with Cash/Card side by side). A tip explains how to add Quick Picks.
- [x] **F2 Find Item dialog**: searches ALL items (↑/↓ to choose, Enter or click to add). Typing a partial name in the scan box opens it pre-filled.
- Verified: TypeScript checks pass; server test of migration v2→v3 (with automatic backup), quick pick filter and old-till compatibility; previews of both layouts and the Find dialog
- Release note: **update the Store Server PC first** (it runs migration 3), then the tills

### 5 Nov 2026: Home / Navigator screen (released as **v0.2.3**)
- [x] New **Home** tab (`screens/Home.tsx`), now the screen the app opens on. Our own design with the same structure as a desktop POS home screen:
  - **Left**: quick-launch buttons (Make a Sale, Item List, Customer List, Sales History, Reports, End of Day)
  - **Centre "Navigator"**: sections with vertical red labels and icon tiles joined by flow arrows
    - Point of Sale: Customer List → Make a Sale → Sales History → End of Day; Held Receipts under Make a Sale
    - Purchasing: Purchase Orders → Receiving History; PO List; Vendor List
    - Inventory: Item List, Department List
    - Operations column: Sync w/ QuickBooks, Reports, Settings
  - **Right**: "Today" totals (sales, takings, cash, card) and a tip
- [x] Original SVG icon set in `src/renderer/src/icons.tsx`
- Tiles that already have a page open it: Make a Sale → Sale, Item List → Items, Sales History / Reports → Reports, Settings. All the others show "coming soon" (cosmetic for now).
- Preview tooling (mock-data screenshots) lives outside the repo in Claude's working folder (`preview-tools/build.sh`)
- **Follow-up tidy-up (same day):**
  - Added a **Work Orders** tile (Customer List → Work Orders → Make a Sale) and a quick button (coming soon)
  - **Top tabs removed.** The header now shows a **◆ Home** button (on every screen except Home) and the current screen name. Every screen is opened from Home.
  - Added an **Updates** tile in Operations (it was only reachable from the old tabs)
  - Less empty space: the right-hand column is gone and Today's totals moved to the bottom of the left column; Inventory and Operations share one row; sections stretch to fill the height and tiles are centred; each section's grid is sized to its own tiles
  - Purchasing flow is now Vendor List → Purchase Orders → Receiving History, with PO List under Purchase Orders

### 5 Nov 2026: Full Add / Edit Item window (released as **v0.2.4**)
- [x] **DB migration 4**: added the full set of item columns: type (inventory / non_inventory / service), department, description, size, attribute, cost_cents, on_hand, taxable, quick_pick_group, vendor, order_cost_cents, reorder_point, alu, unit_of_measure, manufacturer, print_tags, unorderable, use_serial, earn_commission, earn_rewards, ship_weight/height/length/width, comments. Additive only.
- [x] New server module **`src/main/server/products.ts`**: one `FIELDS` list maps every item field to its column. It handles reading, validation, insert and update, so a new field = migration + one line in `FIELDS` (+ types + form).
  - `PUT` merges the request onto the existing item, so **older tills can't wipe fields they don't know about**
  - Lookup/scan also matches **ALU**; search also matches ALU and department
- [x] **Sales**: GST is now calculated on **taxable items only**. **On-hand qty goes down** when an *inventory*-type item is sold (non-inventory and service items aren't tracked).
- [x] **`screens/ItemEditor.tsx`**: an Add/Edit Item window with the same structure as a desktop POS item form, in our own styling:
  - Big Item Name box; **Basic Info** + **Comments** on the left; **More Info** + **Misc & Shipping** on the right; **Save & New / Save / Cancel**
  - Department / Vendor / Quick Pick Group suggest existing values; a margin % hint shows next to the price
  - Save & New keeps Type, Department and Vendor to speed up entering similar items
  - On-Hand and Reorder Point are disabled for non-inventory / service items
- [x] **Item List** now shows Item No., Name, Department, Type, UPC, On Hand (red when at or below the reorder point), Price, Quick Pick and Status
- Verified: TypeScript checks pass; server test (v3→v4 upgrade with backup, old-till merge, validation, taxable GST, on-hand, ALU lookup); preview of the edit window
- Not yet: Style / Pricing / Available / Alt. Vendor buttons (QB-style extras), departments and vendors as their own managed lists (they're free text with suggestions for now)

### 5 Nov 2026: Bulk import / export items with Excel (released as **v0.2.5**)
- [x] **New dependency `xlsx` (SheetJS 0.20.3)**, installed from the SheetJS CDN tarball (the npm-registry `xlsx` package is outdated). It's in devDependencies because it's bundled into the UI. **Run `npm install` and commit `package-lock.json`**, or the GitHub build (`npm ci`) will fail.
- [x] `src/shared/itemImport.ts`: the spreadsheet column definitions (template headers + accepted aliases such as SKU, Barcode, Dept, Price, Cost, Qty, GST, Supplier), cell conversion (money, Yes/No, Tax/Non-taxable, item types, barcodes stored as numbers) and item ↔ row conversion
- [x] `src/renderer/src/spreadsheet.ts`: reads the first sheet of .xlsx/.xls/.csv and writes .xlsx (Electron shows a Save dialog)
- [x] Server **`POST /api/products/import`** (`importProducts` in `products.ts`):
  - Matches by **Item No.**, then **UPC** (only if the row has no Item No., or the matched item has none, so a row can't hijack another item via its UPC)
  - Matched → update (**blank cells keep the current value**); unmatched → create; bad rows are skipped and reported
  - `dryRun: true` runs everything in a transaction and rolls it back, so the **preview is exactly what the real import will do**
  - `updateExisting: false` = add new items only. Up to 10,000 rows; JSON body limit raised to 20 MB.
  - `GET /api/products?all=1` removes the 500-row limit (used by Export)
- [x] **Item List**: **Import from Excel** (template download → choose file → preview with New / Update / Problem per row and recognised + ignored columns → Import) and **Export to Excel** (all items in the same layout, so export → edit in Excel → import is a bulk-edit round trip)
- Verified: TypeScript checks pass (with a stand-in for the xlsx types, since npm is blocked in Claude's sandbox); server tests for mapping, preview vs real import, blank-keeps-value, UPC matching, add-only mode, UPC conflicts and the export round trip; preview of the import window

### 5 Nov 2026: Customers (released as **v0.2.6**)
- [x] **DB migration 5**: new `customers` table (name, title, company, track-as-company, phone/mobile/email, OK-to-email, address, Customer ID, alt phone/contact, type, tax-exempt, discount %, accept cheques, ship-to address, notes, active) + `sales.customer_id`. Additive only; existing sales simply have no customer.
- [x] Server **`src/main/server/customers.ts`** (same field-list pattern as products):
  - `GET /api/customers?search=` matches name, "first last", company, email, Customer ID and phone numbers ignoring spaces / dashes
  - `GET /api/customers/:id` → customer + **statistics** (sales count, total, average receipt, last sale) + **history** (last 50 receipts)
  - `POST` / `PUT` (PUT merges, like items). Customer ID auto-generated as `C000123` if left blank; unique.
  - Rules: need a last name, first name or company; "Track as Company" needs a company; basic email check; discount 0–100%
  - `customerDisplayName()` in `shared/types.ts`: company for businesses, otherwise "First Last"
- [x] **Customer List** screen (`screens/Customers.tsx`), opened from the Home tile / quick button: search, show inactive, New customer
- [x] **Customer window** (`screens/CustomerEditor.tsx`), same structure as a desktop POS customer form: big Customer Info fields across the top; Contact Info + Customer Settings; Customer Notes (with **Date Stamp**) + Statistics; History + Ship-To Address; Save & New / Save / Cancel
- [x] **Sale screen**: a customer box in the header and an **F5 Customer** key → `screens/CustomerPicker.tsx` (search, ↑/↓/Enter, **+ New customer** pre-filled from what you typed). The customer is saved with the sale and cleared after it; Clear sale (F6) clears it too.
- [x] The customer name prints on the **receipt** and shows in the **Reports** sales list and the "Sale complete" box
- Stored but **not applied to prices yet**: Tax-Exempt and Discount % (they need the discounts / tax-exempt pricing work), Accept Cheques (no cheque tender yet)
- Verified: TypeScript checks pass; server test (v4→v5 upgrade with an existing sale, validation, Customer ID auto/unique, search incl. phone digits, partial update, sales linking, stats/history, sales list names); previews of the customer window and the Sale screen with a customer

### 5 Nov 2026: Customer kiosk on an iPad (to release as **v0.2.7**)
- [x] **Web kiosk, no installer.** The store server serves **`http://<server-ip>:4580/kiosk`** (`src/main/server/kioskPage.ts`, one self-contained HTML page with plain JS for iPad Safari). Screens: pairing code → store logo + welcome (idle) → sign-up form → thank you → logo.
  - iPad setup: open the URL in Safari → Share → **Add to Home Screen** → open it → pair → lock with **Guided Access**
  - The kiosk token is stored in the iPad's browser (localStorage). Clearing Safari data = pair again.
- [x] **DB migration 6**: `kiosks` table (name, linked till name, secret token) + `kiosk_welcome` setting; the logo is stored as `store_logo` (data URL) in `settings`
- [x] Server **`src/main/server/kiosk.ts`**:
  - Pairing: kiosk `POST /kiosk/api/pair-request` → 6-digit code (10 min, single use); till `POST /api/kiosks/pair {code, name, tillName}`; kiosk polls `/kiosk/api/pair-status/:code` → token
  - Live push to the iPad with **Server-Sent Events** `GET /kiosk/api/events?token=` (events: form / idle / thanks / branding / unpaired; 20 s keep-alive pings). ⚠️ Listen for disconnects on `res.on('close')`, not `req.on('close')`.
  - Till: `POST /api/kiosk-sessions {tillName}` picks the kiosk linked to that till (or the only kiosk) → pushes the form. The till polls `GET /api/kiosk-sessions/:id` every second. Cancel: `/api/kiosk-sessions/:id/cancel`. Times out after 5 min. A newer request replaces an older one.
  - Submit `POST /kiosk/api/submit`: needs first + last name and a mobile or email. **Matches an existing customer by email or mobile/phone digits** (fills blanks only, never overwrites); otherwise creates one with a "Signed up at kiosk" note.
  - **Kiosk security**: `/kiosk/*` endpoints need the kiosk token, only work for an open session and **never return customer data**; `/api/*` still needs the store pairing code. Unpair revokes the token immediately.
  - `PUT /api/settings/logo {dataUrl|null}` (PNG/JPEG/WebP/GIF, ≤ ~2 MB); `GET /kiosk/logo` serves it; kiosks refresh branding live
  - Sessions and pair codes are kept in memory (lost on a server restart, which is fine; kiosks reconnect by themselves)
- [x] Till UI:
  - **Settings → Customer Kiosk (iPad)** (`screens/KioskSettings.tsx`): logo upload (resized to ≤1000×600) / remove, welcome message, kiosk URL + step-by-step setup, pair with code, paired kiosks with online status, change the linked till, unpair
  - **Sale screen**: **F9 Kiosk** (function bar + "Kiosk sign-up" in the customer box) and **Send to kiosk** in the F5 customer search → `screens/KioskSignup.tsx` waits (spinner, Cancel, Send again); on submit the customer is attached to the sale ("New customer from kiosk" / "Found existing customer")
  - Renderer CSP now allows `img-src http:` so the logo preview loads from the store server
- Verified: TypeScript checks pass; end-to-end server test of the whole flow (pairing, single-use codes, bad tokens, offline kiosk, SSE events, validation, submit, existing-customer match, customer cancel, cashier cancel, replacing a request, logo, rename, unpair); previews of the iPad form, idle screen and the Settings card
- **Fix (logo upload):** "That file is not an image Windows can read" on every upload. The resize step loaded the image from a `blob:` URL, which the renderer CSP (`img-src 'self' data: http:`) blocks. It now reads the file with FileReader as a `data:` URL. JPEGs get a white background and the error messages are clearer. ⚠️ Don't use `URL.createObjectURL` for images in the renderer unless `blob:` is added to the CSP.
- Ideas next: the iPad as a **customer-facing display** (items + total while scanning, "Thank you" + change after payment), using the same event stream

### 5 Nov 2026: Kiosk sign-up fields + tax exempt with expiry (released as **v0.2.9**)
- [x] **DB migration 7**: `customers.tax_exempt_id`, `tax_exempt_card_copied`, `tax_exempt_expires` (YYYY-MM-DD). Additive. (Columns were added to migration 7 before it was released.)
- [x] **Kiosk form** (`kioskPage.ts`), **required**: first & last name, street address, city, state, ZIP, phone, email. **Optional**: business name (saved as Company, not "track as company"). "Yes, email me" opt-in.
  - **"I'm tax exempt"** reveals the required **Farm Tax ID** + **Expiration date** (iPad date picker) and a yellow note: *hand your tax-exempt card to the cashier so they can make a copy*. The thank-you screen repeats the reminder (shown for 9 s).
  - An already-expired date is refused ("please see the cashier"). Invalid phone (< 7 digits), email or ZIP are refused with the field highlighted.
- [x] **Server** `readKioskForm()` in `kiosk.ts` re-checks everything. Address → street/city/region(state)/postcode(zip); phone → `phone`.
  - Existing customer (matched by email or phone digits, ignoring spaces, dashes, brackets and dots): fills blanks only, **except** a tax ID / expiry typed at the kiosk **replaces** the stored one (it's their newest card) and resets "card copied"
  - Kiosk response only includes `{ok, firstName, taxExempt}` (still no customer data)
- [x] Shared **`taxExemptState(customer, today)`** in `shared/types.ts` → none / ok / expiring (≤ 30 days) / expired. Shown by **`TaxExemptBadge.tsx`** (green / amber / red):
  - **Sale screen** customer box + header message when a customer is attached: "Farm Tax ID has EXPIRED. Ask for their new card."
  - **Customer List** name column; **Customer window** has Farm Tax ID, ID Expires (date), Card copied fields + the badge
- [x] **Till after a kiosk sign-up**: if tax exempt and the card isn't copied, the kiosk dialog shows the Farm Tax ID + expiry with **"Card copied ✓"** (saves `taxExemptCardCopied`) or **"Do it later"**
- Still **not applied to pricing**: tax-exempt customers are still charged tax. Needs the tax-exempt sale work; should block or warn on an **expired** ID.
- Note: the kiosk form uses US wording (State, ZIP) as requested; the till's customer window still says Region / Postcode
- Verified: TypeScript checks pass; kiosk server test (required fields, phone/email/ZIP checks, tax ID + expiry required, invalid / past dates, renewal on a return visit, existing details kept, card-copied update, `taxExemptState`); kiosk page script syntax check; iPad preview with tax exempt ticked

### 5 Nov 2026: Tax-exempt sales (next release, **v0.3.0** suggested)
- [x] **DB migration 8**: `sales.tax_exempt`, `sales.tax_exempt_id` (the Farm Tax ID used, kept for audits), `sales.tax_exempt_cents` (tax removed)
- [x] **`src/shared/pricing.ts` → `priceSale(items, taxRate, exempt)`**, used by **both** the till (display) and the server (charging), so the totals always match. Shelf prices are tax-inclusive; for an exempt sale each taxable item's unit price becomes `round(price / (1 + rate))`; non-taxable items are unchanged; `taxCents = 0`; `taxExemptCents` = the tax removed.
- [x] **Server `createSale`**: `SaleRequest.taxExempt: true` is only accepted when the customer is tax exempt, **has a Farm Tax ID** and the ID is **not expired** (no expiry date on file = allowed). Otherwise 400 with a clear message. Saved lines store the ex-tax unit price.
- [x] **Sale screen**:
  - Attaching a tax-exempt customer with a current ID **switches the exemption on automatically**: a "Tax exempt (FT-…) −$x" line, a "Tax exempt sale" tick box (the cashier can untick it to charge tax), and "EX TAX" prices in the receipt grid
  - **Expired** (or no ID on file): tax is charged, the tick box is locked with the reason, a red header message shows, and an **Update Tax ID** button opens the customer window; saving re-checks and turns the exemption on
- [x] **Receipt** prints "TAX EXEMPT −$x" and the Farm Tax ID instead of the GST line; the "Sale complete" box shows the saving
- [x] **Reports**: daily "Tax exempt sales (count)" with the total tax removed
- Verified: TypeScript checks pass; `priceSale` unit tests; server tests (exempt sale totals/lines, overpayment refused, exemption not requested = taxed, blocked for expired / no ID / not-exempt / no customer, no-expiry allowed, stock still taken, report totals); all earlier suites still pass; previews of current and expired customers
- ⚠️ Pricing model is still **tax-inclusive (NZ GST style)**. If the store prices **before** tax (US sales tax added at checkout), we need a "prices include tax" store setting. `priceSale` is the single place to change.

---

## Next up (backlog, in rough priority order)

**Latest release: v0.2.9** (kiosk tax-exempt fields). Next release: **v0.3.0** (tax-exempt sales, DB migration 8: update the Store Server PC first).

0. Build out the "coming soon" tiles as needed: Work Orders, Held Receipts, End of Day, Purchasing (POs, receiving, vendors), Departments, QuickBooks sync
   - Decide **tax-inclusive vs tax-added-at-checkout** pricing (US sales tax); apply customer Discount %
   - Ideas: Quick Pick order/colours, hold/recall sale
1. Staff PINs and an audit log (who rang up each sale)
2. Refunds and voids (the `sales.status` column already exists)
3. Receipt printer (ESC/POS) and cash drawer kick
4. Automatic daily database backups
5. Windows code-signing certificate (removes the SmartScreen warning)
6. App icon (`build/icon.ico`, 256×256)
7. Later: offline mode for tills, multi-store / cloud reporting

---

## Rules to remember

- **DB migrations only add things.** Drop or rename columns only several releases later, and raise `MIN_CLIENT_VERSION` when you do. This is what keeps rollback safe.
- **Update the server PC first**, then the tills. When reverting, do the tills first.
- Prices and totals are always calculated **on the server**, never trusted from the till.
- Keep `package-lock.json` committed (CI uses `npm ci`).
- Version comes from the **git tag** (the workflow sets it). No need to edit `package.json` by hand.
