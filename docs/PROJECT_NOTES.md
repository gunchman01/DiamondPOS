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
# Before tagging: add a "## vX.Y.Z - date" section at the top of CHANGELOG.md and commit it
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
| `src/main/server/workorders.ts`, `src/shared/workorders.ts`, `screens/WorkOrder*.tsx` | Work orders, customer units, stages, stock rule, stage emails |
| `src/main/server/marketing/*`, `src/shared/mailerTemplate.ts` | Marketing: audiences, email mailers, background sender |
| `src/main/server/quickbooks/*`, `src/main/qbBridge.ts` | QuickBooks Desktop Web Connector service, daily summary, qbXML, localhost bridge |
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

### 5 Nov 2026: Tax-exempt sales (released as **v0.3.0**)
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

### 5 Nov 2026: QuickBooks Desktop daily summary (next release, **v0.3.1**)
Store setup: **QuickBooks Enterprise Gold (latest)** on the same network; QuickBooks does **not** track inventory; items and prices live only in DiamondPOS; **daily summary**. Staff guide: **`docs/QUICKBOOKS_SETUP.md`**.
- [x] **Intuit QuickBooks Web Connector** (SOAP) served by the store server at **`POST /qbwc`** (`src/main/server/quickbooks/qbwc.ts`); the support page is `/qbwc/support`. Login = user `diamondpos` + generated password (QuickBooks screen). The `.qwc` file comes from `GET /api/qb/qwc?via=direct|bridge`.
  - ⚠️ The Web Connector only allows **http to localhost**. QuickBooks on the server PC → `http://localhost:4580/qbwc`. QuickBooks on another PC → DiamondPOS on that PC (till mode) with **`qbBridge`** on relays `http://127.0.0.1:4581/qbwc` → store server (`src/main/qbBridge.ts`, `QB_BRIDGE_PORT`; only `/qbwc` is relayed)
- [x] **DB migration 9**: `sale_items.department` + `sale_items.taxable` **snapshot** (backfilled from products) so past summaries never change; `qb_exports` (one row per day + method: ref number, total, status pending/sent/error, TxnID, error, attempts); `qb_log`
- [x] Settings live in the `settings` table: `qb_config` (JSON), `qb_lists` (lists read from QuickBooks), `qb_ids` (OwnerID/FileID)
- [x] **Each sync session** (job queue with "plan" steps): CompanyQuery → (daily or on request) Account / ItemSalesTax / SalesTaxCode / PaymentMethod / ItemOtherCharge queries → CustomerQuery → plan: if the mapping is complete, CustomerAdd if missing, ItemOtherChargeAdd for missing `POS <Department>` items, then per closed day + method (**SalesReceiptQuery by RefNumber** to avoid duplicates → **SalesReceiptAdd**). At most 40 receipts per session. Errors wait for **Retry**.
- [x] **Daily summary** (`quickbooks/summary.ts`): per day + method (the sale's largest payment); per department a taxable line (gross − allocated tax, largest-remainder) and a non-taxable line (non-taxable items + everything on tax-exempt sales); QuickBooks adds tax = tax item rate × taxable lines; **`POS Tax Rounding`** line = our tax − QuickBooks' tax, so the **receipt total = money taken**. RefNumber `POS{YYMMDD}{C|D}` (≤ 11 chars).
- [x] qbXML **13.0** builders in exact SDK element order (`quickbooks/qbxml.ts`); small XML parser (`quickbooks/xml.ts`, no dependency)
- [x] **QuickBooks screen** (`screens/QuickBooks.tsx`, Home → Sync w/ QuickBooks): status + what's missing, enable switch, connector files, password (show/copy/change), bridge tick box (till mode), mapping (start date, customer, tax item with the QuickBooks rate, tax codes, default + per-department income accounts, deposit account + payment method for cash/card), **Preview a day**, sent history with **Retry**, sync log
- Verified: TypeScript checks pass; **simulated Web Connector + simulated QuickBooks company** end-to-end (`server-test/qb.ts`: wrong password / disabled, lists, mapping, customer + item creation, element order, references, totals = money taken, tax + rounding = tax collected, tax-exempt and gift card on Non lines, today not sent, no duplicates incl. a lost reply, error + Retry, start date); bridge relay test; all earlier suites pass
- ⚠️ Not yet tested against a **real** QuickBooks file. First live run: use **Preview**, set the start date to today, watch the log. Likely tweaks: account/type filters in drop-downs, QuickBooks' own validation messages.
- Later: refunds/voids (negative lines) once refunds exist; a "Send now" button would need the Web Connector to be triggered manually (Update Selected)

### 5 Nov 2026: Marketing mailers (email) (next release after the QuickBooks one)
- [x] **New dependency `nodemailer` ^6.9 (+ `@types/nodemailer`)** for SMTP. **Run `npm install` and commit `package-lock.json`.** (In Claude's sandbox it's replaced by a fake for tests.)
- [x] **DB migration 10**: `marketing_campaigns` (name, subject, message, flyer as data: URL, audience JSON, status draft/sending/sent/cancelled, last_error) + `marketing_sends` (one row per recipient: email, status pending/sent/failed, error) + `store_address` setting. SMTP settings live in `settings.smtp_config` (JSON, password stored locally and never sent to the screen).
- [x] **Audience engine** (`server/marketing/audience.ts`): rows of {department, brand/manufacturer, vendor, name contains}. Every filled part must match the **same item**; rows are **OR**. Optional time window (months) and customer types, or "everyone on the email list". Matching is case-insensitive; LIKE wildcards are escaped. Uses the `sale_items.department` snapshot (falls back to the product) plus the product's manufacturer/vendor. **Only `ok_to_email` customers with a valid email**; the rest are counted as excluded; duplicate emails are de-duplicated.
- [x] **Email** (`server/marketing/mailer.ts`, template `shared/mailerTemplate.ts` shared with the screen preview): table-based HTML + plain text; the **flyer embedded inline (CID)**; `{name}` personalisation; footer with **store postal address + "reply UNSUBSCRIBE"** and a **`List-Unsubscribe: <mailto:…>` header** (CAN-SPAM; the server isn't on the internet, so there's no web unsubscribe link)
  - **Background sender** started with the store server: one email every `60/perMinute` s, resumes after a restart; a recipient error (e.g. 550 bad mailbox) → that recipient failed; a **server/login error** (EAUTH, ECONNECTION, 535…) → **pause** with `last_error`, retry in 5 min, nobody marked failed
  - Presets: Gmail/Workspace (app password), Microsoft 365 (SMTP AUTH must be enabled), Outlook.com, Yahoo, custom
- [x] **API** `/api/marketing/*`: options, audience preview, campaigns CRUD (edit/delete drafts only), copy, test send, send (recipients fixed at that moment), cancel, sends list, SMTP get/save/test
- [x] **Marketing screen** (Home → Marketing tile in Operations): mailer list; editor with **1. mailer** (name, subject, message, **flyer upload** resized to 1200 px JPEG), **2. who gets it** (rule rows with drop-downs from your data, "+ OR", time window, customer types, **live count** + excluded counts + who list), **3. preview** (exact email), **4. send** (save draft, send test, send to N with confirm, progress, stop, make a copy); **Email settings** tab
- [x] **Settings**: Store postal address (required before sending)
- Verified: TypeScript checks pass; server test with a fake mail server (options, the chainsaw / blower / Exmark-mower audience, 12-month window, customer types, name contains, literal %, opt-in / no-email exclusions, duplicate email, SMTP validation + password never returned, blocked without SMTP / address, test email contents: CID flyer, address, unsubscribe header, {name}, then real send with one bounce, pause on login failure, cancel, copy, delete drafts only); previews of the editor and audience builder; all earlier suites pass
- Later ideas: "Unsubscribe" button on a customer, open/click tracking (needs an internet-reachable link), saved audiences, printed postcard mailers (export the list to Excel)

### 5 Nov 2026: Work orders (repairs) + customer units (released as **v0.3.4**)
- [x] **DB migration 11**: `customer_units` (customer, category handheld/mower/other, unit type, brand, model, serial, hours (mowers only, optional), purchased_here, purchase_date, sale_id, notes, active); `sale_items.serial`; `work_orders` (customer, unit, status, problem, diagnosis, work_done, internal_notes, hours_in, last emailed); `work_order_lines` (kind part/labor/shop/misc, product, description, qty (= hours for labor), unit price (tax incl.), taxable, **stock_taken**); `work_order_history`. Settings in `settings.wo_settings` (JSON).
- [x] **Serialized items at the till**: an item with **Use Serial #** asks for the serial (type/scan) when added; one line per serial; a customer is required before payment. The server stores `sale_items.serial` and **creates the customer's unit** (brand = manufacturer, model = item name, type = department, category guessed from department/name). The receipt prints the S/N.
- [x] **Stages** (`shared/workorders.ts` → `STAGES`): Needs Estimate → Approved to Fix → Waiting on Parts → On the Bench → Ready for Review → Ready for Pick Up; Ready for Pick Up – NOT FIXED!!; Picked Up (closed). Each stage has suggested next buttons plus "move to any stage".
- [x] **Stock rule** (`server/workorders.ts` → `reconcileStock`): parts are taken from inventory only in stages with `partsTaken` (Approved and later); Needs Estimate / NOT FIXED put them back; qty changes and removed lines adjust stock; closed keeps them taken. Lines track `stock_taken`, so stock can't drift.
- [x] **Red "NOT IN STOCK"** parts: on hand < still needed, or taken into negative stock; the ticket banner suggests Waiting on Parts; the list shows "N part(s) not in stock"
- [x] **Shop supplies** added automatically at check-in by category (default hand-held $7.95, mower $14.95, other $9.95); labor uses the default rate ($85/hr); labor taxable / shop taxable settings. Totals use the shared sale pricing (tax-inclusive) and the customer's current tax exemption.
- [x] **Stage emails** (all stages except Ready for Review and Picked Up): editable **template per stage** (subject, message, "include itemized bill") with `{first_name} {customer} {wo_number} {unit} {serial} {status} {total} {diagnosis} {work_done} {store}`. **Ready for Pick Up includes the final bill** by default. Preview before sending; sent through the Marketing email account (`sendEmail` in `marketing/mailer.ts`); recorded in history. These are service emails (no OK-to-email needed; the customer just needs an email address).
- [x] Screens: **Work Orders** (Home tile / quick button) with stage chips + counts, search (customer, phone, serial, brand, model, WO #), days in shop; **New work order** (customer → their units or **+ Add a unit** → what's wrong + hour meter for mowers); **Unit editor** (type list sets hand-held/mower; hours only for mowers, optional); **Ticket** (stage flow + buttons, parts/labor/shop/other with inline qty & price edits, red short parts, totals, notes, hour meter, history, email preview + send); **Work order settings** (labor, shop supplies, templates with reset)
- Verified: TypeScript checks pass; server test (serial sale → unit, units incl. optional hours, check-in + shop supplies by category, estimate leaves stock alone, short parts, approve takes stock, qty change / remove / add-after-approval, NOT FIXED returns stock, emails per stage incl. the final bill, no email at Ready for Review, customer without email, closed locked, search/counts, settings + custom template); previews of the list and ticket; all earlier suites pass
- Next for work orders: ~~ring up at the till~~ (done, see below); print a work order / claim tag; units list on the customer window; mechanic assignment + time clock

### 5 Nov 2026: Estimate fees + paying for work orders at the till (next release)
- [x] **DB migration 12**: `work_orders.fee_cents`, `fee_status` (none / unpaid / paid / applied / kept), `fee_sale_id`, `fee_applied_sale_id`, `sale_id` (pick-up receipt); `sales.work_order_id`
- [x] **Settings** (`wo_settings.estimateFee`): fee per category (default hand-held **$35**, mower **$70**, other $35; 0 = none), receipt wording, taxable (default no). Set at check-in from the unit's category; "Charge the estimate fee" can be unticked per ticket (`noFee`).
- [x] **Three ways to pay** (`SaleRequest.workOrder = { id, mode }`, built by the shared `workOrderSaleLines` + `priceWithFeeCredit`, so the till and server match):
  - `fee`: at drop-off, sale line "Estimate fee… - WO-xxxxxx" (dept **Estimate Fees**) → ticket fee **paid**
  - `repair` (Ready for Pick Up only): the ticket's lines (parts keep their product/department but are **not taken from stock again**; labor → **Service Labor**, shop → **Shop Supplies**, other → **Service Other**; part hours = one line) + any extra scanned items, then **"Estimate fee credit −$X"** (Estimate Fees, non-taxable) → ticket **closed**, fee **applied**
  - `credit` (NOT FIXED with a paid fee): the customer buys new instead → the fee is credited on that sale → ticket closed, fee applied
  - The credit never exceeds the sale; any rest is **kept** (noted in history). **Zero-total sales need no payment** (repair fully covered). Normal sales still need a payment.
- [x] **NOT FIXED pick-up**: `POST /api/workorders/:id/pickup-not-fixed` closes the ticket and marks a paid fee **kept**
- [x] ⚠️ **Bug fixed**: closing a ticket used to re-take parts from stock (Picked Up counted as "parts taken"), so a NOT FIXED unit's returned parts were deducted again. Now **closing never changes stock** (`reconcileStock` skips closed tickets).
- [x] Ticket: fee bar (not paid → **Collect at till** / paid / credited / kept); Ready for Pick Up → **💳 Ring up at till · $X due**; NOT FIXED → **Buying new instead → credit $X at till** or **Picked up: keep $X fee**; totals show fee paid + **balance due**. Check-in: **Check in & collect $X at till** or collect later. List: "fee not paid" pill, "$X due".
- [x] Sale screen: **🔧 Work order** button (picker: collect fee / ring up repair / credit to new purchase); ticket lines locked on the receipt; customer locked to the ticket; **Balance due** label; fee credit + "fee not used (kept)" lines
- [x] Pick-up email: bill shows "Estimate fee already paid −$X" + **Balance due**; new placeholders `{balance_due}`, `{estimate_fee}`
- Reports / QuickBooks: Estimate Fees, Service Labor, Shop Supplies, Service Other are departments, so **map them on the QuickBooks screen** (e.g. Estimate Fees → a service income account)
- Verified: server test of all flows (fees by category, fee paid once, wrong customer, repair not ready, pick-up with an extra item, totals = ticket balance, no double stock, credit to a new blower with tax on the full price, declined + kept, credit bigger than the purchase, zero-total pick-up, tax-exempt ticket = till, QuickBooks departments + totals) + the closing-stock regression; previews of the pick-up ticket and the till; all earlier suites pass

### 5 Nov 2026: Returns / refunds / exchanges (next release, **v0.3.6**, DB migration 13: update the Store Server PC first)
- [x] **DB migration 13**: `sale_items.kind` (item / wo / credit / return / feekept), `return_of_item_id`, `return_of_sale_id`, `return_reason`, `restocked`, `tax_cents`; `sales.no_receipt_return`. Older sales are back-filled so work order and fee-credit lines can't be returned.
- [x] **↩ Return** button on the Sale screen → find the receipt by **receipt #** (type or scan), **by customer** (their recent receipts), or **No receipt**. Tick items, qty, **reason**, and **Back to stock / Damaged – don't restock** per line. Shows bought / already returned; work order charges, fee credits and already-returned lines are greyed out.
- [x] Returned lines go on the sale as **negative lines at the price actually paid** (incl. tax-exempt price, tax worked out the same way: shared `src/shared/returns.ts`). The customer of the receipt is put on the sale.
- [x] **Exchanges**: scan new items on the same sale; the total is the difference. If the customer owes, normal Cash/Card; if negative → **Refund due** (dark box) with **Refund cash** ("give back $X") / **Refund card** (refund on the terminal, enter its reference). The original payment type is suggested.
- [x] Server rules (`src/main/server/returns.ts`): can't return more than bought on that receipt (across all returns), a reason is required, refund payments must be negative and exactly the refund, returns can't go on a work order payment, receipt customer must match. **Stock goes back up** only for "back to stock"; a returned **serial unit is removed from the customer's units**.
- [x] Receipt with an **estimate fee credit**: refunds can't add up to more than was paid; the rest is a **"Not refunded: estimate fee credit is kept"** line (Estimate Fees).
- [x] **No-receipt returns**: today's price, sale flagged `no_receipt_return` (manager approval once PINs exist).
- [x] Receipt prints **\*\*\* REFUND \*\*\*** / **EXCHANGE**, RETURN lines with "From receipt #N – reason", "Card refund"/"Cash refund", original receipt # and a signature line.
- [x] Reports: **Returns (n) −$X** stat, takings are after refunds, Refund / Exchange pill in the sales list. Marketing audiences ignore returned lines.
- [x] **QuickBooks**: refunds net out in the day's Sales Receipt (negative lines per department; the tax split now handles negatives). If refunds are more than sales for a payment type on a day, that export shows **"Enter by hand"** with instructions (enter a Refund Receipt / Credit Memo in QuickBooks) and an **Entered by hand** button. Not sent automatically.
- Verified: new server test `returns.ts` (limits, reasons, refund sign/amount, different customer, restock vs damaged, serial unit removed, exchanges both ways, no-receipt, tax-exempt receipt, fee credit kept, reports, QuickBooks preview) + QuickBooks Web Connector test for a net-positive refund day and a negative "manual" day; previews of the Return window and an exchange with card refund; TypeScript checks; all earlier suites pass

### 5 Nov 2026: Release notes on the Updates screen (ships with **v0.3.6**)
- [x] **`CHANGELOG.md`** at the repo root: one `## vX.Y.Z - date` section per release, newest first, written for staff. A line `> Update the Store Server PC first.` marks releases that change the database. Back-filled from v0.2.0 (no entries for v0.2.8 and v0.3.3: add them if you remember what they were).
- [x] Release workflow: after publishing, `scripts/release-notes.mjs <tag>` takes that version's section and sets it as the **GitHub release notes** (`gh release edit --notes-file`). Missing section = warning in the Actions log and "No release notes were written" (the release still goes out).
- [x] App: `listReleases` uses the GitHub release notes, or falls back to `CHANGELOG.md` on the `main` branch (so releases made before this get notes too). Parser: `src/shared/changelog.ts`.
- [x] **Updates screen**: a **"What's new in vA – vB"** box listing every version newer than the one installed, a yellow warning when any of them changes the database (worded for the Store Server or a till), formatted notes on each release card, and the confirm box now says what's included / what a revert removes.
- Verified: changelog parser + release-notes script (code-fence examples ignored, missing version), TypeScript checks, preview of the Updates screen

### 5 Nov 2026: Help / user manual in the app (ships with **v0.3.6**)
- [x] Manual: **`src/renderer/src/help/USER_MANUAL.md`** (plain Markdown, written for store staff; each `## ` heading is a section). Bundled into the app with Vite's `?raw` import (`raw.d.ts` declares it).
- [x] **Help screen** (`screens/Help.tsx`): contents list on the left (highlights the section you're reading), search box that filters sections and highlights matches. Opened from **? Help** in the top bar, **F1** anywhere, or **Help / Manual** on Home. F1 / ? Help open the section for the current screen (`HELP_TOPIC` in `App.tsx`, ids = slugified headings).
- [x] Shared `Markdown.tsx` renderer (headings, paragraphs, nested bullet + numbered lists, tables, > notes, **bold**, `code`, search highlight); release notes use it too
- Verified: TypeScript checks; preview (F1 from the Sale screen opens "Making a sale")

### 6 Nov 2026: Feedback & enhancement requests (ships with **v0.3.6**, DB migration 14)
- [x] **DB migration 14**: `feedback` table (kind idea/problem/question, subject, message, name, reply email, till, version, screen, status pending/sent/failed, error, sent_to, sent_at). Setting `feedback_email` (default **gbarnes27@gmail.com**, `DEFAULT_FEEDBACK_EMAIL` in `src/shared/feedback.ts`; change it in Settings; blank = default).
- [x] Server `src/main/server/feedback.ts`: `POST /api/feedback` saves first, then emails via the store SMTP account (`sendEmail`, now with an optional reply-to = the sender's email). Subject `[DiamondPOS Idea|Problem|Question] title`; body has the message + store, till, screen, version. If email isn't set up / fails → saved as failed with the reason; retried automatically after the next successful send, or `POST /api/feedback/:id/resend`. `GET /api/feedback` lists the last 100.
- [x] UI: **💬 Feedback** in the top bar (remembers the screen you came from), **Feedback & Requests** on Home, "Can't find it? Send feedback" on Help. Feedback screen: type chips, title, details, name, reply email, list with Sent / Not sent yet + **Send again**. Manual section added.
- Verified: server test `feedback.ts` (validation, not set up → kept, sent + backlog retried, reply-to, HTML escaped, failure → Send again, address change + default); TypeScript checks; all suites pass

### 6 Nov 2026: Logo, app icon, "Diamond POS" name (released as **v0.3.10**, no DB change)
- Released so far: **v0.3.6** returns, **v0.3.7** release notes on Updates, **v0.3.8** Help manual, **v0.3.9** feedback (CHANGELOG split into those versions; check they match what was actually tagged).
- [x] Logo redrawn as a vector from Greg's "P" diamond image: **`build/logo.svg`** (source). Generated **`build/icon.ico`** (16–256 px) + `build/icon.png` (512). electron-builder picks up `build/icon.ico` automatically (buildResources = build) for the exe, installer, desktop shortcut and taskbar.
- [x] In-app logo: `src/renderer/src/Logo.tsx` (same drawing, inline SVG) at the top left and on the first-run Setup screen.
- [x] Display name **"Diamond POS"** (window title, top bar, Setup, manual, feedback subject, QuickBooks screen text, test email, Excel file names). **Not changed on purpose:** `productName: DiamondPOS` (install folder and `%APPDATA%\DiamondPOS` data folder, renaming would lose the data), the repo name, `DiamondPOS.qwc` and the QuickBooks customer "DiamondPOS Daily Sales" (renaming would create a new QuickBooks customer).
- [x] Updater: a release whose body is the workflow placeholder ("No release notes were written…") now falls back to CHANGELOG.md, so v0.3.7–v0.3.9 show notes once v0.3.10 is installed.
- [x] **Sale screen columns**: right-click the receipt grid header → menu (`src/renderer/src/saleColumns.tsx`): show/hide any of #, Item #, UPC, ALU, Description*, Item Details, Department, Manufacturer, Vendor, Size, Attribute, Unit, Serial #, On Hand, Tax, Reg Price, Qty*, Price, Ext. Price* (*always shown), move the clicked column left/right, reset. Saved per computer in `pos-config.json` (`AppConfig.saleColumns`). Work order / return rows fill the item-only columns with blanks.
- [x] **Receipt viewer** `screens/SaleDialog.tsx` (header, lines incl. returns, totals, payments, Reprint): opened by clicking a sale in the customer window's History and in Sales History / Reports.
- To regenerate the icon after changing `build/logo.svg`: render each size (16, 24, 32, 48, 64, 128, 256) to PNG and pack them into `build/icon.ico` (ImageMagick + Pillow were used).

### 6 Nov 2026: Check payments, printing setup, Settings menu (next release **v0.3.11**, DB migration 15)
- [x] **DB migration 15**: rebuilds `payments` (same columns + data) so `method` can be `'check'` (SQLite can't change a CHECK constraint in place). Older apps still work with it.
- [x] **Check tender**: `PaymentMethod` adds `check` (`PAYMENT_LABEL`); server requires the check # (`reference`), no change from a check (only cash gives change). Sale screen **Check** button (no F-key: F10/F11 are taken by Windows/Electron menus), check # dialog; receipts "Check #1234"; daily report `checkCents`; Home "Checks". QuickBooks: `QbMethod` adds `check` (Sales Receipt No. ends in **K**, default payment method "Check", deposit Undeposited Funds); config PUT keeps a method an older screen didn't send.
- [x] **Printing** (per computer, `AppConfig.printing`, `src/shared/printing.ts`): receipt printer + width (80/58 mm) + copies + auto-print; full-page (Letter) printer + rules (serial-numbered sales, work order receipts); Zebra label printer + size presets + tag contents. Main process IPC `print:printers` (getPrintersAsync) and `print:job` (silent print to a named printer, Letter or custom page size in mm). Renderer `printing.ts` routes: `printSale`, `printWorkOrder`, `printTags`, `testPrint`. Templates in `printTemplates.ts` (full-page sale, work order, tags) and `receipt.ts` (now takes the width). Code 128 barcodes: `code128.ts` (set B + set C for digit runs).
- [x] **Price tags**: `TagPrintDialog` (Item List 🏷 Print tags, item window 🏷 Tags): add by scan/search, qty per item (click On hand for one per item in stock), add all "Print Tags" items. **Work order 🖨 Print** on the ticket.
- [x] **Settings menu**: Settings is now tiles (Store, This Computer, Printing, Email, Customer Kiosk); each opens its page with ← Settings. Add a tile to `TILES` in `Settings.tsx` for new areas. Email settings reuse Marketing's `EmailSettings`.
- Verified: new server test `checks.ts` (migration 15 on a v14 DB keeps payments, check # required, no change from a check, split check + cash, report, QuickBooks check summary + K ref); all suites pass; TypeScript; previews of Settings menu, Printing page, full-page receipt and tags. **Not tested on real printers** (receipt, laser, Zebra): check on site, especially the Zebra driver label size.

### 6 Nov 2026: Label Designer + Receipt Layout (next release **v0.3.13**; no DB migration, new server API)
- [x] **Print designs** (`src/shared/printDesigns.ts`), shared by all tills, stored on the server in `settings.print_designs` (JSON) via `GET/PUT /api/print-designs`; `normaliseDesigns` cleans everything (clamps sizes/positions, unknown fields → defaults, max 30 labels × 40 elements, 40 receipt blocks).
  - **Label templates**: name, size (in), elements `{kind text|barcode|line, field, text, barcodeOf upc|sku|alu, showCode, x,y,w,h (in), fontPt, bold, align}`. Defaults: "Price tag" (`tag-price`) and "Part / bin label (no price)" (`tag-noprice`).
  - **Receipt layout**: ordered blocks `{type, on, align, fontPt, bold, text, widthPct, showSku, showUnitPrice, showSerial, always}` + font (mono/sans). Types: logo, storeName, address, title, saleInfo, customer, items, totals, taxExempt, payments, barcode (Code 128 of the receipt #), signature, footer, text, divider.
- [x] Per computer (`AppConfig.printing`): `priceTagTemplate` / `noPriceTagTemplate`. `printTags` picks the template per item (price > 0 → price tag) unless one is chosen in the tag dialog, and prints one job per template (page = template size).
- [x] **Label Designer** (`screens/LabelDesigner.tsx`): template list, size presets/custom, add field / barcode / line, drag to move, corner handle to resize (0.05" snap, Shift = 0.01"), arrow keys, Delete, properties panel (field, text, font, bold, align, x/y/w/h, barcode source), preview with a real item, test print. Rendering shared with printing via `labelElementInner` / `labelContentCss` / `labelElementStyle` in `printTemplates.ts`.
- [x] **Receipt Layout** (`screens/ReceiptDesigner.tsx`): tick/untick, drag (HTML5) or ▲▼ to reorder, add/duplicate/remove blocks, size/bold/align per block, items options, live preview iframe (sale / serial / refund, 80/58 mm). `receipt.ts` now renders from the layout (+ logo). `SaleItem.sku` added (joined from products) for "Show the Item #".
- [x] Settings menu gains **Label Designer** and **Receipt Layout** tiles; Printing page now picks the two label designs (old fixed label options removed).
- Verified: new server test `designs.ts` (defaults, save + clean bad values, new template id, receipt blocks, tag HTML per qty, receipt only shows chosen blocks, 58 mm); TypeScript; all suites; previews of both designers. Not tested on real printers.

### 6 Nov 2026: Held receipts, type-ahead, line ✕, Cost column (next release **v0.3.14**, DB migration 16)
- [x] **DB migration 16**: `held_sales` (customer, note, items_json `[{productId, qty, serial}]`, tax_exempt, till, status held/completed/deleted, sale_id). Server `src/main/server/held.ts`: `GET /api/held`, `/api/held/count`, `GET/PUT/DELETE /api/held/:id`, `POST /api/held`; items come back with current product details (inactive ones counted as `missing`), totals at today's price. `SaleRequest.heldId` closes the hold in the sale transaction (`completeHeld`). Stock is not touched while held. CORS now allows DELETE.
- [x] Sale screen: **F6 Hold receipt** (HoldDialog with note; holding a recalled receipt updates it) / **F6 Held receipts** when empty (HeldPicker), red count badge, held chip (H-00012) in the header. Clear sale button removed. **Held Receipts** screen from Home (search, Ring up at till, Delete). Shared `src/shared/held.ts`.
- [x] **Type-ahead** on the Item # / Barcode box: 2+ characters → top 8 matches (debounced), ↑ ↓ Enter / click to add; plain Enter (scanners) still does the exact lookup first.
- [x] **✕** column at the left of each item/return row (not part of the custom columns). **Cost** added to the column options.
- Verified: new server test `held.ts` (validation, hold, list/count, today's price, update, no stock taken, ring up closes it, inactive item left off, delete); TypeScript; all suites; preview of type-ahead + ✕ + Hold badge.

### 6 Nov 2026: Printer chooser, drag-and-drop receipt layout, kiosk help (next release **v0.3.15**, no DB change)
- [x] **PrintChooser** (`src/renderer/src/PrintChooser.tsx`): every receipt print (Sale screen print/reprint/auto-print, receipt viewer, Sales History reprint) asks Receipt or Full page + printer + copies; suggested format preselected (`suggestedFormat` = serial-numbered / work order rules). `PrintSettings.askPrinter` (default on); off = prints straight away. `printing.ts`: `printSaleAs(sale, format, printer, copies)`.
- [x] **Receipt layout v2** (`ReceiptLayout.version = 2`): `header` and `footer` zones `{heightMm, elements[]}` with free-placed `ReceiptElement`s (`kind text|logo|barcode|line`, `field` storeName/address/title/saleInfo/receiptNo/dateTime/till/customer/footer/text/signature, **x / w in % of the paper width** so one layout fits 80 and 58 mm, y / h in mm, font, bold, align, `onlyRefund` for the signature). Middle = `blocks` (items, totals, taxExempt, payments, divider, text). `normaliseDesigns` converts a v0.3.13 block layout (keeps middle blocks, adds default zones) and clamps zones. Rendering: `receiptElementInner` / `receiptElementCss` / zone HTML in `receipt.ts`.
- [x] **ReceiptDesigner** rewritten: Top / Bottom canvases (drag, corner resize, ⇕ to change area height, arrows/Delete/Shift), middle list (tick, drag/▲▼ reorder, add), properties panel, live preview iframe (sale / serial / refund, 80/58 mm).
- [x] **Help**: new "Kiosk tablet won't connect" section; the manual supports `{server_ip}`, `{server_ips}`, `{kiosk_url}`, `{kiosk_urls}`, `{port}` placeholders filled from this PC (`lanAddresses` on the server, the server URL's host on a till). Markdown renderer now shows ``` code blocks (copyable).
- Small: "GST included" → "Tax included" on the Sale screen and Reports.
- Verified: `designs.ts` updated (v1 → v2 conversion, zone clamping, signature/barcode in zones); TypeScript; all suites; previews of the printer chooser, receipt designer and kiosk help.

### 7 Nov 2026: Tax added at checkout + tax rates, work order label, "I want to" menus (next release **v0.3.16**, DB migration 17)
- [x] **Tax model switched (Greg chose this): prices are BEFORE tax, tax added at checkout** (US). `shared/pricing.ts` `priceSale` → `{lines (unit = shelf), subtotalCents, taxCents = round(taxable × rate), totalCents, taxExemptCents (tax not charged)}`. `MIN_CLIENT_VERSION` = 0.3.16 (old tills would show different totals).
- [x] **DB migration 17**: `sales.tax_mode` ('inclusive' for older rows, 'added' for new), `tax_rate`, `tax_rate_id`, `tax_rate_name` (older rows get the store rate). Nothing old is re-priced.
- [x] **Tax rates**: settings `tax_rates` (JSON `[{id,name,rate}]`) + `tax_rate_default`; `tax_rate` kept = default rate for older tills (a single-rate PUT updates the default). `StoreSettings.taxRates/defaultTaxRateId`, `TaxRate`, `taxRateLabel`. `SaleRequest.taxRateId` (unknown id → 400). Settings → **Taxes** (`TaxSettings.tsx`); Sale screen tax-line drop-down (resets to default after each sale). Work orders use the default rate.
- [x] **Returns** follow the ORIGINAL sale's mode and rate: `returnAmount(..., rate, mode)` → `{netCents, taxCents, amountCents}`; return lines are stored before tax (`line_total` = −net, `tax_cents` = −tax); refunded totals / daily refunds add `tax_cents` only for 'added' sales. `ReturnableSale.taxMode/taxRate`.
- [x] **QuickBooks summary** works per sale: 'added' sales' lines are already net; 'inclusive' sales have their tax taken out of their own taxable lines. Still one QuickBooks sales tax item: if a day mixes rates, the difference goes on the POS Tax Rounding line (a per-rate mapping could be added).
- [x] Receipts / full page / receipt viewer: Subtotal, "<rate name> x%", Total for 'added' sales; "Includes tax" for older ones. Work order bill/email/ticket: Subtotal + Sales tax (`WoTotals.subtotalCents`). Labels: "Taxable" (no GST), import note "before sales tax".
- [x] **Work order label**: label templates have `kind: 'item' | 'workorder'`; WO fields woCustomer/woNumber/woDate/woUnit/woSerial/woPhone/woProblem, barcode source `wo` (`WoLabelData`). Default "Work order label" (`tag-wo`, auto-added to older saved designs). `printWorkOrderLabel` (label printer, `woLabelTemplate`, `woLabelCopies`, `woLabelAuto` = print at check-in). Ticket **🏷 Label** button. Label Designer: + Work order label, WO field list, sample WO preview. WO search already accepts "WO-000412" (scan).
- [x] **Menus**: `renderer/src/menus.ts` (`MENU_ENTRIES` with screen + intent return/checkin/tags, `DEFAULT_MENUS`, `menuEntries`). Top bar **"I want to…"** drop-down (replaces the Home button); Home screen left buttons from `AppConfig.menus.home`. Settings → **Menus** (`MenuSettings.tsx`, per computer). Intents open the Return dialog / New work order / Print tags.
- ⚠️ Lost and restored `Sell.tsx` during this session (a script truncated it); restored from git HEAD (v0.3.15) and the tax changes re-applied. Everything verified afterwards.
- Verified: new `taxes.ts` (rates CRUD + validation, default/older-till PUT, per-sale rate, unknown rate, refund at original rate after a rate change, old inclusive sale refunded the old way); all suites updated to tax-added amounts and passing; `designs.ts` (WO label render + auto-added); TypeScript; previews of "I want to" and the Sale screen tax line.

### 9 Nov 2026: Customer import / export (QuickBooks POS format) (next release **v0.3.17**, DB migration 18)
- [x] **DB migration 18**: `customers.past_due_cents` (QB POS "Past Due", negative = credit), `customers.custom_field1`. Added to `CUSTOMER_FIELDS` (new `cents` kind); notes can now be up to 4,000 characters. Customer window: Past Due $ and Custom Field 1.
- [x] `src/shared/customerImport.ts`: `CUSTOMER_COLUMNS` = the 20 QB POS export columns in order (Company … Custom Field 1) + Diamond POS extras (Customer ID, Customer Type, Farm Tax ID, Tax ID Expires, Tax Card Copied, Active); `rowToCustomer` (Tax-exempt "Exempt" → exempt, Custom Field 1 → Farm Tax ID when none, invalid EMail → notes, state upper-cased, ZIP padded, company-only → track as company, Disc 0 → none), `customerToRow` for export.
- [x] Server `importCustomers` (customers.ts): matches by Customer ID, else last + first + company + phone digits (in-memory index, so 12k rows take < 1 s); dry run = preview; rows of the same person in one file merge. `POST /api/customers/import`, `GET /api/customers/all`. JSON body limit raised to 60 MB; client import calls have a 2-minute timeout (`request(..., timeoutMs)`).
- [x] UI: Customer List **Import from Excel** (`ImportCustomers.tsx`, template download, preview, shows the first 1,000 result rows) and **Export to Excel**.
- Verified with Greg's real "QB POS Customers Export.xlsx" (12,665 rows): all 20 columns recognised, 0 problems, 12,637 customers created (28 rows were the same person twice), 1,889 tax exempt (1,686 with a Farm Tax ID from Custom Field 1, 203 without), 9 non-email EMail values kept in notes, re-import = 0 new, export → import round trip matches every customer by Customer ID. TypeScript; customer/kiosk/exempt suites pass.

### 9 Nov 2026: Item import from QuickBooks POS inventory export (next release **v0.3.18**, DB migration 19)
- [x] **DB migration 19**: products `msrp_cents`, `price1_cents`..`price4_cents` (QB POS Custom Price 1-4 = price levels, not used in pricing yet), `extra_json` (other imported columns with data, JSON object column → value). `FIELDS`: new kinds `qty` (on hand: decimals and negatives allowed) and `json`; comments up to 4,000 chars.
- [x] `shared/itemImport.ts`: QB POS header aliases (Item Number, Department Name, Base Unit of Measure, Company Reorder Point, Serial Tracking, Eligible for Commission/Rewards, Qty 1…); new columns MSRP + Custom Price 1-4 (`cents0`: 0 = not set); Tax Code: anything but Non/No/Exempt = taxable (e.g. "VER"); Item Type "Assembly" → inventory; reorder point rounded; zero shipping sizes ignored; `cleanName` drops stray trailing keys (`'/[;`, `../`). `extraColumns` + `hasData` (blank / 0 / "No" = no data): unrecognised columns with data are stored per item in `extra`; `itemToRow`/`extraHeadersOf` export them again. Import dialog flags the same Item No. twice in one file. Server import limit 50,000 rows.
- [x] Item window: MSRP, Custom Prices 1-4, Unit of Measure is now free text with suggestions (imported "EACH"/"EA" kept), on-hand decimals, **Other details (imported)** list.
- Verified with Greg's real "QB POS Inventory Items Export.xls" (22,215 rows, 97 columns): 32 columns mapped to item fields, 18 more kept as other details (Order By Unit, Sell By Unit, Income/COGS/Asset Account, Department Code, Vendor Code, QB ListID, Unit of Measure 1 + its UPC/ALU/prices), 47 empty columns skipped; 22,214 items imported in < 1 s (dry run 1 s), 1 problem: Item Number 49113 is used twice (SUNGLASSES … and LEVER); re-import = 0 new; ALU lookup works; export → import round trip clean. TypeScript; items/import/customer import/designs suites pass.

---

## Next up (backlog, in rough priority order)

**Latest release: v0.3.15** (printer chooser, drag-and-drop receipt layout, kiosk help). Next release: **v0.3.16** (tax added at checkout + tax rates, work order label, "I want to" menus; DB migration 17: update the Store Server PC first, then every till). Then **v0.3.17**: customer import / export (DB migration 18), **v0.3.18**: QuickBooks POS inventory import (DB migration 19).

0. Build out the "coming soon" tiles as needed: End of Day, Purchasing (POs, receiving, vendors), Departments, QuickBooks sync
   - ~~Tax-inclusive vs tax-added~~ (tax added at checkout since v0.3.16). Still to do: apply customer Discount % and Custom Price levels (from QB POS) by customer type; selling by case (Unit of Measure 1); QuickBooks tax item per tax rate
   - Ideas: Quick Pick order/colours, hold/recall sale
1. Staff PINs and an audit log (who rang up each sale)
2. ~~Refunds~~ (done). Still to do: **void** a sale the same day (the `sales.status` column already exists); manager PIN to approve no-receipt returns; print a barcode on receipts so scanning finds them instantly; a "no-receipt returns" report
3. ~~Receipt printer~~ (printing setup done in v0.3.11). Still to do: cash drawer kick (most drawers open from the receipt printer; needs a raw ESC/POS command)
4. Automatic daily database backups
5. Windows code-signing certificate (removes the SmartScreen warning)
6. ~~App icon~~ (done in v0.3.10)
7. Later: offline mode for tills, multi-store / cloud reporting

---

## Rules to remember

- **DB migrations only add things.** Drop or rename columns only several releases later, and raise `MIN_CLIENT_VERSION` when you do. This is what keeps rollback safe.
- **Update the server PC first**, then the tills. When reverting, do the tills first.
- Prices and totals are always calculated **on the server**, never trusted from the till.
- Keep `package-lock.json` committed (CI uses `npm ci`).
- Version comes from the **git tag** (the workflow sets it). No need to edit `package.json` by hand.
- **Keep the user manual current**: when a feature is added or changed, update `src/renderer/src/help/USER_MANUAL.md` (and `HELP_TOPIC` in `App.tsx` for a new screen).
- **Every release gets a `CHANGELOG.md` section** (plain words for staff, plus the "Update the Store Server PC first" line if it has a migration). It's what people read on the Updates screen before installing.
