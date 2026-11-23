# DiamondPOS: Project Notes

> **For Claude / anyone picking this up:** read this file first. It records how the project is set up, what's done, and what's next. Keep it updated at the end of each work session.

_Last updated: 20 November 2026 (pending receiving alerts and display fitting)_

---

## What this is

DiamondPOS is a Windows point of sale app for one store location with several tills.

- **One installer** for every PC. On first launch you choose **Store Server** (one PC per store, which can also be a till) or **Till**.
- The **store server** runs inside the app: an Express API on **port 4580** plus a **SQLite** database. Tills connect over the LAN using the server's IP address and an 8-character **pairing code**.
- **Card payments** happen on a **standalone third-party terminal**. The POS records the amount and optional card brand; there's no integration.
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

### v0.3.59 direct check-in — 23 November 2026: customer address on receipts
- Greg accepted current Windows-dialog Star output as close enough to use (slight right-edge issue remains; do not claim perfect alignment or silent path resolved). Requested customer address selection in Receipt Designer, then clarified default ON for ALL customer receipts, not only serialized sales.
- Added customerAddress to designer text fields and growing middle blocks. Default/new layouts include a left-aligned address block before item lines, omitted when no address. Existing layouts gain it once using customerAddressConfigured marker; explicit saved removal/disabled state thereafter respected. Header/footer field creation reserves18mm; normal move/resize controls retained. Optional serialized-only checkbox defaults false and only tests positive serial purchases; returns alone don't satisfy it.
- Schema43 adds nullable sales.customer_address_snapshot. New sales capture billing street/street2/city/region/postcode transactionally, including empty string if absent. getSale uses snapshot; legacy NULL uses current customer record without backfilling invented historical addresses. Full-page sales use this same captured address; work-order ticket customer blocks keep their existing live contact behavior. HTML escapes address text. No new mandatory address-entry validation.
- 367 regressions, typecheck and build pass: real serialized checkout capture/retry/reprint, changed customer address preservation, field/block escaping, optional serial filters, saved design preferences/default upgrade/removal, walk-in omission, full-page snapshot and legacy fallback. Actual Windows designer/address receipt print still needs Greg's shop check.
- Version/minimum client0.3.59, schema43: update Store Server first then every till. Baseline main3e21448858dd6b05ff793850b43866968822fe91. Direct GitHub update authorized while at shop; release tag remains GitHub UI step. No real hardware print/payment/message or deployment here.

### v0.3.58 direct check-in — 23 November 2026: native receipt width and thermal text
- Greg confirmed v0.3.57 Windows-dialog receipt actually printed on Star TSP100, but right edge cut off and all non-bold text faint. Native path now confirmed to produce paper content; normal silent path remains unresolved. No photo available/required.
- Native driverMode receiptHtml uses body68mm +2mm horizontal margins for total72mm within Star's72mm Receipt page on80mm roll.58mm mode body46+4=50mm. Fixed table layout with27mm right amount column and anywhere wrapping of long item names prevents table min-content widening. Native mode uses Arial/sans bold700 throughout, block text at least10pt and solid black text/color-adjust. Applied consistently to native test and saved-sale receipt HTML; normal mode/designer/default saved template unchanged.
- Run existing359 regressions, typecheck and build before direct commit. Actual visual/Star darkness/fit still require shop test; no confirmed final hardware pass. No driver heat/density settings changed, no actual hardware print/payment/message here.
- Version0.3.58, schema42/min client0.3.52. Baseline main d41bba1f04a77411d3bc7d95df8c74e6faacc99f. Greg authorizes direct updates while at shop; release tag via GitHub UI still required.

### v0.3.57 direct check-in — 23 November 2026: native Windows receipt path
- Greg's log after v0.3.56: print-started, receipt-page-80x111mm, print-finished, but blank feed/cut persists. Rendering/Windows callback now succeed; physical driver output unresolved. Windows test page works. Do not infer a confirmed driver root cause from those logs.
- Added explicit Test receipt using Windows dialog plus saved per-PC receiptWindowsDialog option (default false). Native receipt jobs set silent:false, omit custom pageSize/measurement/CSS overrides, and show a focusable visible sandboxed receipt window so the native dialog is accessible. Use Star72mm x Receipt/app80mm for standard80mm roll. Other receipt mode preserves measured explicit page sizing. Labels/Letter remain as before. Native dialog has180s timeout; no auto retry. A successful callback is still only Windows acceptance.
- Added tests for selected Star/native silent:false/no custom paper/no measurement and restriction to receipt jobs.359 regressions pass; typecheck/build checked before direct commit. Actual Windows dialog/Star paper test remains pending. No DB/dependency changes, version0.3.57/schema42/min client0.3.52.
- Baseline main05501766cbe97155a2addf0ed4e484dc7c5c3a55. Greg authorized direct GitHub while at shop; new release tag still needs GitHub UI. No actual messages/payments/QB/hardware print or deployment performed here.

### v0.3.56 direct check-in — 23 November 2026: receipt measurement script and visible status
- At shop Greg running 0.3.55 reported no paper/no visible error. Status was below the fold; after scrolling he supplied print:job error Script failed to execute. v0.3.55 incorrectly kept hidden print window javascript:false while relying on executeJavaScript to measure receipt. Corrected to javascript:true with sandbox:true/nodeIntegration:false/contextIsolation:true; backgroundThrottling:false retained. All document HTML is generated by the application, and the measurement script is fixed trusted text.
- Receipt measurement failure now explicitly says it occurred before Windows received the job. Settings shows preparation/progress/result at top and next to receipt test button, disables all test buttons while a test is pending and distinguishes Windows acceptance from actual paper output. Previous duplicate/timeout/label/size guards retained.
- 357 regressions pass including new pre-spool script failure propagation/no print call; typecheck/build checked before committing. Physical Star output remains unverified. Windows test page works; current paper setting72mm x Receipt and app80mm should be retained for80mm roll.
- Greg authorized direct GitHub updates while at shop without source laptop. Baseline main f60b86308147e038c717451b46e2d9933605e73e. Version0.3.56, schema42/min client0.3.52 unchanged. Release tag must still be created through GitHub web UI: current connector cannot create tags and CLI unauthenticated. No actual hardware print/payment/message performed here.

### v0.3.55 source update — 23 November 2026: Star receipt rendering and page sizing
- Greg clarified hardware is Star TSP100, Windows test page prints correctly, only DiamondPOS receipt/test job feeds half-inch/cuts blank. Windows paper is 72mm x Receipt (normal printable-width name for 80mm roll). Earlier Citizen identity was incorrect for this shop printer. Do not change working Windows driver/paper based on earlier diagnosis.
- Thermal PrintJob adds receiptWidthMm; actual and test receipts pass configured 58/80 width. Main awaits trusted fixed DOM measurement (fonts/image decode/layout), rejects empty/invalid/>3m receipt, adds a valid width/height @page rule and matching Electron micron pageSize/100% scale. Removed invalid mixed 80mm auto CSS size. Page-authored scripts remain disabled; hidden print window disables background throttling. Content measurement errors retain messages; 30s timeout, quit cancellation and explicit named labels unchanged. Labels/full pages retain existing sizing.
- 356 regressions pass, including measured Star page dimensions/long 58mm receipt/empty and oversize refusal, existing print timeout/cancel/label tests and financial checks. Typecheck/build pass. This is a proposed app-side fix, not a confirmed hardware resolution. Live Electron render probe could not complete in this Linux environment (headless startup segmentation fault/socket restrictions); no actual Windows/Star receipt printed here. Greg must test the update at the shop.
- Package v0.3.55, schema42/min client0.3.52 unchanged. Main baseline e59a7ed317a06eb303c55824f093d4a78b4d832a (v0.3.54). ZIP/user-commit workflow; no remote write/tag/deployment/payment/message performed.

### v0.3.54 source update — 20 November 2026: generic QuickBooks income mapping
- Greg requested removal of vendor-name rows under Income account for each department, leaving POS General. Replaced the UI department table rows with one All sales / POS General / default income selection.
- Individual paid-sale and account-invoice summaries use qbItemName('') and defaultIncomeAccount for every merchandise/service/fee line. Legacy daily summaries aggregate all departments into taxable/non-taxable POS General lines. POS product departments and line descriptions remain; no deletion of catalog/vendors or existing QB transactions/items/exports. Historical saved departmentAccounts retained for compatibility but ignored by new summary generation. Dedicated tax-rounding item still uses default income to preserve reconciliation.
- Added tests for multiple brand/service departments, stale override accounts, cash/account export lines, XML general-item references, unchanged local catalog departments and daily taxable/non-taxable totals. Version 0.3.54; schema 42 and minimum client 0.3.52 unchanged. Server first for export logic, then tills for simplified screen. No actual QB calls or remote writes/tags/deployment.
- Baseline main fa5137d4955d56b6739f05ef21f895e0a8d99b87 (Greg committed v0.3.53). Source ZIP/user-commit workflow. Validation: 352 regression checks, typecheck and production build pass. Actual Windows/QuickBooks tests remain pending.

### v0.3.53 source update — 20 November 2026: work-order payment and Home backup status
- Greg hit the current-estimate approval guard at checkout. Removed online-estimate state/hash as a payment eligibility condition: ready_pickup still required (or existing not_fixed deferred-fee-only case), with the same current bill/fee credits/account/stock/duplicate-sale logic. No auto-email/text or invented customer approval.
- Checkout history notes the previous online estimate status/details mismatch when applicable; the approval row is not rewritten. Existing matching-hash/site/stage rules for website decisions remain; late decisions cannot reopen a closed ticket. UI changed-estimate warning describes optional revised online approval and in-person/phone confirmation, without saying payment is blocked.
- Home backup card had hard-coded Every 15 minutes text. It now displays saved frequency plus next scheduled backup, running/stopped state and verified time from the same backup manager as Settings. operations/status uses a lightweight synchronous liveStatus snapshot without directory scans. No backup schedule, retention or verification behavior changed; still refreshes every 30s and labels cached history when unavailable. Overdue calculation uses actual next run with 5-minute grace, excludes running/stopped and uses only known intervals for old-server fallback.
- Tests now cover cash checkout with pending/changed-approved estimates, account checkout with failed estimates, actual charged current total, repeated request identity, preserved approval state, closed-ticket rejection and late-decision review. 349 regression checks pass, including actual HTTP Home operations vs backup-manager timestamp/schedule comparison and saved frequency/overdue checks. Final typecheck/build pass before packaging. No schema change (42), minimum client stays 0.3.52, package v0.3.53. Update Store Server first for the server-side fix.
- Baseline main c863bc0c8b3aaca5f21be6e25d321273a2386d99 (user committed v0.3.52). ZIP-first/user-commit workflow; no GitHub writes/tags/deployment or live payment/QB/messages here.

### Pending v0.3.52 — 20 November 2026: settings route and saved customer text permission
- Greg reported visible text-settings heading followed by Work order not found. Confirmed static GET/PUT /api/workorders/text-settings were below dynamic /:id routes. Moved both ahead of dynamic routes and added actual HTTP GET/PUT/readback tests (earlier tests exercised the settings helper but missed routing).
- Schema 42 adds default-off customers.ok_to_service_text; customer Contact Info exposes OK to text service updates. Separate from marketing opt-ins. Work-order reads expose permission, send dialog disables Text without it, and server independently rejects an unpermitted text even if a request claims permission. Mobile preferred, otherwise phone. Phone edits clear the UI choice and partial number updates clear stored permission unless explicitly renewed. Unrelated stale editor saves preserve current permission when unchanged.
- Prepared v0.3.52/minimum client 0.3.52; Store Server first then every till. ZIP-first/user-commit workflow restored: no remote writes, tags or deployment. Cumulative source overlay includes v0.3.51 for users who have not copied that ZIP. Existing main already has 779bb5d; pull that with a clean working tree before applying this update and committing.
- Validation: 342 regression checks, typecheck and production build pass, including real local HTTP GET/PUT settings resolution/readback, permission persistence/default-off/send enforcement and changed-number clearing. No live texts/emails. Real Windows/provider delivery still require user tests.

### v0.3.51 check-in — 20 November 2026
- Greg authorized checking in the cumulative batch on main. Main baseline 25eb2c031a845c3c71e431d431a755bacb04dded was unchanged. Include v0.3.50 cancellation plus all pending notification/fee/search work, preserving existing main files.
- Prepared version/minimum client 0.3.51 for schema 41; Store Server first, then all tills. This check-in does not tag/publish an installer or send messages. START-HERE.md contains pull/test and separate later-release commands. Real Windows/provider delivery still pending.

### Pending batch — 20 November 2026: work-order notifications, deferred estimate fees and live customer suggestions
- Manual Notify dialog offers Email, Text, or both for estimates and Ready for Pickup; other stages retain email. Text requires staff confirmation of customer service-text permission and uses mobile first, otherwise phone. Both channels use the same new estimate revision/link. Mandatory reply-not-monitored instructions appear in emails/texts, with website decisions and store callback; no reply inbox/webhooks or automatic messages.
- Settings → Work Orders includes Mobile Text Alerts enable/API key/store callback. Secret omitted from settings views; blank retains it. Uses verified official v3/send API with one E.164 subscriber, no group/all-subscriber sends, 20s deadline/cancellation and no redirects. HTTP acceptance is not delivery. Provider handles STOP; provider account/verified custom-message sender still required and actual outbound verification is pending. No live texts/email sent here.
- Schema 41 persists request identity/result before/after network sends. Repeated requests return saved outcomes without duplicate paid sends; unfinished requests block automatic resending. Per-channel failures/uncertain results go to ticket history and the result banner; no secret/provider response bodies exposed. Preserve decision links when another channel accepts or might have accepted; all definite failures do not start follow-up. Server first on eventual release; update all tills together and raise minimum client version for fee statuses/new notification flow. Check-in candidate is version 0.3.51, minimum client 0.3.51; no release tag created.
- Add estimate fee to bill converts unpaid fee into one separate fee line, idempotently. No upfront-payment credit for deferred charges; original paid fee credit unchanged. Declined repairs bill only the diagnostic fee, including closed totals/printed page, not unused parts/labor. Editing/removing fee updates or waives its fee record. Supports existing on-account checkout.
- Sale customer search suggests active first/last/company/name/email/customer-number prefixes after two characters with 150ms debounce, phone prefixes and stale-response protection. Existing full picker remains available. Corrected an unrelated vendor API query typo caught by typecheck.
- Validation: 338 regression checks pass including provider mocks, duplicate/uncertain sends, text-only approval timer, rejected text, email failure with successful text preserving approval, deferred fees and customer prefixes. Final typecheck and production build pass. Windows interaction/real provider delivery still require store testing. User authorized check-in on main after validation; no release tag, ZIP or deployment.


### v0.3.50 — 20 November 2026: cancel recalled hold completely
- User reported v0.3.49 Cancel sale left a recalled receipt in Held Receipts. Changed confirmation and cancellation flow: await DELETE held before clearing the draft, refresh held count, release reserved inventory and prevent pointer/keyboard actions during server confirmation. Errors preserve the draft/link for retry.
- DELETE held is idempotent for status deleted, returns 409 for a completed hold, 404 for nonexistent. Entire status/stock change stays in one DB transaction. No new database migration; work orders and completed receipts unaffected.
- Added tests for cancelled hold absence, already-completed refusal, one-time stock release and async confirmation/failure ordering. 322 regressions, typecheck/build pass. Small source overlay against main 25eb2c031a845c3c71e431d431a755bacb04dded, package version 0.3.50; min client remains 0.3.49. Greg publishes/updates, no remote writes performed here.

### Release candidate v0.3.49 — 20 November 2026
- Removed Quick Picks from Sale, item setup/list filter/columns and import/export templates; retained legacy DB/model fields for compatibility. Sale loads settings without the Quick Pick request.
- ALU is a default sale column and configurable Items-block receipt option (on by default). Schema 39 snapshots lookup values, including original values on linked returns; legacy rows fall back to current catalog. Full-page sales print lookup too.
- Schema 40 persists new website estimate decision notices atomically with decision handling. Header polls unread every 15s, pulses until clicked/acknowledged, opens a response list with ticket links. Review cases included, historical notices not backfilled, shared acknowledgement; reduced-motion preference respected.
- Version 0.3.49 and minimum till version 0.3.49. Schemas now 40. Cumulative overlay built against unchanged main 73e3634867bb8c6fefd7c21d41d3dd3d9266a9f2, including v0.3.48 changes. 318 regressions pass; typecheck/build pass. No real messages, commits/tags, installer deployment, AOD config or customer DB changes performed here.
- Store Windows/125% UI and hardware checks required. SMS still unfinished; Citizen blank receipt not confirmed fixed. See TESTING-NOTES.md. Ready for Greg to apply source, commit/tag and test.

### Pending batch — 20 November 2026: Credit / Debit replaces new brand choices
- Added CARD_TYPES (Credit/Debit) for sale/refund/account-payment selectors. Credit default, no Visa/Mastercard/etc or Unknown option for new UI entries. Historical CARD_BRANDS keys remain accepted/read for saved data and immutable recovery requests.
- Schema 38 adds payments.card_type with a Credit/Debit CHECK; original payments.card_brand CHECK and historical data remain untouched. Account payments use their existing unconstrained classification field. Payment method stays card throughout settlement and QB.
- Sale reads, original receipt returns, end-of-day sales/voids, receipt labels and QuickBooks summaries preserve Credit/Debit. QB settings expose only the two new mappings, retaining old saved mappings for pending historical exports; blank uses general Card mapping. Previously synced transactions are not rewritten.
- Typecheck/build pass; 315 regression checks pass including new payment persistence/idempotence/refund/readback, receipt labels, QB method mapping/memo, end-of-day net and account-payment mapping; historical Visa tests still pass. No real payment/QB call made.
- Held in pending batch without version/release/package/deployment. Store Server must update before tills for schema 38.

### Pending batch — 20 November 2026: receiving work-order alerts and Auto fit
- Posted receivings now include read-only matches for inventory parts on Waiting on Parts tickets. Popup appears after posting before label options; grouped by ticket/customer/equipment/mechanic and matching SKU/quantity. Duplicate receipt/ticket part lines aggregate. All-part shortage flag uses existing work-order stock rules. Quantities are not promised separately to each matching ticket; no automatic stage/customer notification/inventory allocation changes.
- Open work order navigates to that ticket via an explicit App intent. Posted receiving has Review waiting work orders to refresh current matches; drafts/other stages excluded. Alert is on the posting computer; not a cross-till notification feed. No migration.
- Settings → Display: default Auto fit responds to main-window content size in device-independent pixels, accounting for Windows DPI scaling. Fits a 1366×850 workspace, bounded 85–100%; manual 80/85/90/95/100/110/125% per-PC overrides. Uses main-window getContentSize instead of renderer dimensions to avoid zoom feedback. Apply on ready/load and debounced resize. No Windows DPI setting change and separate print windows are unaffected.
- Typecheck/build pass; 311 regression checks pass. Added actual receiving API tests for post-match/duplicates/partial shortage/repeated-post/current-stage behavior and display math/validation checks. Physical Windows 125% display check remains pending.
- AOD repaired approvals hosting per Greg; functional end-to-end acceptance not independently verified. Flashing unread estimate-response header is still unimplemented, as is final service-SMS integration. No release/package/version/deployment yet.

### Pending batch — 19 November 2026: take account payment from Make a Sale
- Added Take payment on account to the Sale footer and I want to menu, available without selecting a customer or adding items.
- Searchable modal lists only customers with positive DiamondPOS invoice debt, their balance and open invoice count. Names/company/customer number/email/phone supported; inactive/account-disabled customers with existing debt remain included. Authenticated GET /api/accounts/balances computes the same per-invoice remaining-balance formula as invoiceDue, including QuickBooks checks and subsequent local payment allocations.
- Selection opens the existing CustomerAccount dialog/payment logic for a separate accountCustomer, leaving the in-progress sale's customer/cart/returns/date untouched. Existing idempotent cash/card/check payments, recovery and QB allocation/sync reused. List reloads on each opening and has Refresh; account dialog rereads balances before taking payment.
- Clarifies these are POS-raised invoices, not back-office-only invoices; last QB refresh still matters. Blocks opening during checkout/hold recovery. No schema change.
- Typecheck/build pass; 304 regression checks pass, including debt-only search/auth, inactive/disabled debt, partial payment, QB reconciliation and zero-balance exclusion. Visual review pending as noted above; no release/deployment yet.

### Pending batch — 19 November 2026: Sales Receipt workspace and cost columns
- Redesigned Make a Sale from Greg's QBPOS screenshot: blue title/controls, top scan and prefilled customer search, large striped item grid, lower-right totals, bottom Cash/Credit-Debit/Check/Account and Amount Due, footer Hold/Cancel/Reprint. No Gift or placeholder Save actions. Existing payments/returns/account/held/work-order behavior retained.
- I want to menu houses the existing F-key actions; Quick Picks becomes a compact popover. Quantity +/- controls remain below the grid. Date override is in Sale options and visible in its heading when active. Tax exemption, fee credits, last receipt/change due retained.
- Default grid columns now match the reference (Item #/Item Name/Attribute/Size/Qty/Price/Ext/Tax). Existing saved selections preserved.
- Optional Cost uses configured order cost (previous Cost column showed inventory average), Last received cost uses latest posted invoice cost excluding freight, Current average cost uses current inventory average. Shared cost-summary endpoint reused with bounded four-request concurrency only while cost columns visible. Product, repair-part and return rows supported; fee/credit rows blank. Unknown/unavailable/zero distinguished; no cost added to receipts/labels.
- Typecheck/build pass; 299 regressions pass including cost value distinctions/visibility. Actual Sale component server rendering was checked for top toolbar, grid, payment and footer actions. Interactive screenshot/browser check could not start: this runtime denies Chromium ProcessSingleton AF_UNIX sockets. Final visual/store interaction review is pending; do not claim a browser/hardware test passed.
- No release/version/package/commit/deployment; retained in cumulative pending batch.

### Pending batch — 18 November 2026: Cancel sale
- Added a visible Cancel sale button in the Sale header. One confirmation clears all current item/return lines, customer, work-order checkout attachment, selected tax rate/exemption and overridden sale date/time, then returns focus to scanning. The last completed receipt stays available for reprint.
- This clears the unsaved checkout only. A recalled held receipt remains saved/reserved in Held Receipts; an attached work order retains its ticket and reservations. The confirmation states these effects. Completed sales still use the existing void process.
- Cancellation is blocked while checkout/hold is in flight or has an unresolved recovery record, including a recheck after confirmation. It never removes pending recovery storage or contacts QuickBooks. Draft generation checks prevent a late scan/customer/work-order lookup from repopulating a cancelled draft.
- Typecheck/build pass; 297 regression checks pass, including decline, pending recovery, checkout-starts-during-confirmation, and confirmed clear.
- Added to the cumulative pending batch without release/version/package/deployment.

### Pending batch — 18 November 2026: printer defaults with per-job choice
- Reused Settings → Printing per-PC receipt/full-page/label defaults. Added a nonblocking in-app printer prompt for item/receiving labels (once per batch), work-order labels/pages, designer tests, settings test prints and custom reports. Saved printer is preselected only if installed; no selected/available printer blocks Print. Selection is for that job only; defaults remain in Settings.
- Labels now carry a label-job flag. Main process rejects a label job without an explicitly named printer instead of silently falling back to Windows default. Prompt Cancel/close/shutdown never submits the job; stale selections and overlapping requests cannot approve another job.
- Receipt sale chooser retains the existing Ask which printer every time preference. Keep it enabled for the requested sale printing behavior.
- Typecheck/build pass; 293 regression checks pass, including explicit named-printer requirement, label dimensions, chooser cancellation and stale choices. Hardware printing / Windows dialog appearance still need store testing.
- Citizen blank receipt issue remains unresolved: narrow receipt content renders on laser, Citizen feeds/cuts blank according to Greg; QuickBooks POS currently prints there. Review receipt page-size/driver interoperability; do not change the working QuickBooks setup. No hardware test is available while Greg is away from store.
- Changes held in cumulative batch, no new version/package/commit/deployment.

### Pending batch — 18 November 2026: group equipment from one customer visit
- Explicit customer-visit groups: each unit retains its own work-order number, stage, mechanic, estimate/approval, parts reservation and payment. No financial merging.
- Ticket actions add another unit with customer preselected (creation/linking in one DB transaction), link an existing same-customer ticket/group with confirmation, open sibling tickets, or remove a ticket from the group. Grouping history records the staff member.
- Work orders show live “1 of 4” numbering in the list, ticket header/group panel, and manually printed full-page work order. Closed tickets remain in visit counts; unlinking renumbers current members and a single remaining ticket becomes ungrouped.
- Schema 37 adds indexed work_orders.group_id. Existing tickets remain ungrouped; customers' unrelated visits are never automatically linked.
- Typecheck/build pass; 290 regressions pass, including four-ticket group merges, unchanged stock/totals/stages, cross-customer rejection, atomic failed-creation rollback, closed-member counts and clean ungrouping.
- Held in the cumulative pending batch; no release/package/version change or changes to Greg's PC.

### Pending batch — 18 November 2026: bench stage and mechanics
- Restored On the Bench as an active stage with shared configurable color, list counts/filter, and ticket flow. Enter from Approved/Waiting on Parts (or review rework) after listed parts are available; no repeat stock deduction and no automatic email/printing.
- Work Order Settings manages active mechanics. Removal deactivates instead of deleting, retaining existing ticket assignments/history; re-adding a name restores the same identity.
- Tickets allow assignment/unassignment and record staff/time/history. Work-order list shows assigned mechanic; closed assignments are read-only.
- Schema 36 adds mechanics and nullable work_orders.mechanic_id. Released retirement migration remains unchanged: previously converted tickets stay Approved until manually moved back.
- Validation: typecheck/build pass; 285 regression checks pass, including approval/parts bench guards, stock preservation, assignment history, removal and restoration.
- Keep changes pending with the cumulative batch; no version bump, release ZIP, tag, commit, or deployment yet. SMS integration remains unfinished; latest requested scope is estimate approval links and pickup messages only, no conversation inbox.

### v0.3.43 — customer equipment and service history display
Added authenticated read-only /api/customers/:id/equipment, returning existing owned customer_units with customer+unit-scoped work-order history (all stages, including closed). Exposes inactive units and serialized-sale purchase links; no creation/migration/stock action. Positive integer/customer existence validation prevents misleading empty results for invalid owners.

CustomerEditor right column embeds CustomerEquipmentPanel, with fresh loads, explicit refresh, expandable details and purchase receipt links through existing SaleDialog. Work-order history opens a read-only portal dialog for reported problem, diagnosis, work done, notes, parts/charges before tax and audit history. No nested form or ticket edit/payment controls. Existing duplicate unit records are not automatically merged. Phone/photos remain proposed, not implemented.

Final typecheck/build and 212 SQLite/API regression checks passed, including unsold intake units with active+closed tickets, ownership isolation, inactive equipment, non-mutating reads, serialized-sale linkage, pairing and actual unit creation/check-in → equipment refresh. Windows visual checks remain local. Bundle is cumulative over main 6be322ff0553da169b660e26e50468db887c91b0 / v0.3.41, including pending v0.3.42 End of Day/schema 30. No commit/push/tag performed.


### v0.3.42 — researched End of Day / drawer reconciliation
Based on Intuit QBPOS User Guide cash-drawer/X-Z terminology and supported DiamondPOS data. Existing Home End of Day placeholder now routes to a dedicated screen, optional navigation entry and Reports shortcut. Source reference and deviations documented in docs/END_OF_DAY_REFERENCE.md.

Migration 30 adds idempotent end_day_closeouts request/hash/snapshot table. Authenticated routes preview calendar-day store/per-till report, list tills/history and save a fixed server-generated snapshot. Canonical source hash excludes generated time but includes underlying report values; stale saves reject 409. Save retries return the original snapshot and mismatched-ID payloads reject. Renderer persists pending save per server until definite completion/rejection. No closeout edits/deletes or accounting postings.

Business-date sales aggregate completed receipts, returns/tax, exemptions, account charges, recorded regular-price reductions and known linked-return reversals. Actual entry-day tenders include all original posted payment records (even subsequently voided), cash change once, account payments, and original-method void reversals at actual void till/time. This preserves cross-day cash flow with editable business dates. Till filtering uses original till for payment entry and void till for reversal. Void payment note is shown; actual refund/cancel must be confirmed outside reporting. Optional cash adjustments are reconciliation inputs only, requiring notes.

Fixed snapshots include by/notes/counts, calculated over-short/deposit and optional terminal/check variances. Manual HTML full-page print and multi-sheet Excel export. No reset/lock, since-last-close shifts, bill/coin counts, employee authentication, gift cards, reason-coded discounts, integrated terminal settlement, auto-QB or automatic backup/print. Existing daily API is retained for compatibility; new screen uses dedicated endpoints.

Validation: 207 SQLite/API regression checks including returns, account payments, cash change, till filtering, tax, given/returned markdowns, backdated/future entry money, void reversals, reconciliation, stale-source and duplicate-ID guards, fixed saved history and HTML escaping. Typecheck/build passed; Windows visual/hardware printing remains a store check. Baseline main 6be322ff0553da169b660e26e50468db887c91b0 / v0.3.41. No Git commit, push or tag created; no live database/QB transaction modified.


### v0.3.41 — sale business date/time and entry audit
Migration 29 adds sales.recorded_at/date_overridden and held_sales.sale_at; backfills old entry times from unchanged created_at. Existing created_at is explicitly the business timestamp so receipt/history/report/QuickBooks SQL retains consistent behavior. createSale validates canonical ISO before writes, sets recorded_at to actual server UTC, and applies the business timestamp before account invoice/due-date creation. Request hashes freeze the date across retries. No completed-sale date-edit endpoint.

Sell date/time-local control defaults to actual checkout, verifies server capability via health.saleDates before override, converts local input to UTC with invalid/DST-gap rejection, resets after hold/completion. Held save/recall retains choice; omitted old-client hold updates preserve date, old-client held checkout inherits it, and legacy v40 pending-hold hashes are recognized when no date was provided. Explicit null clears the choice. No automatic event discount or delayed tender/stock action.

Future ordinary exports already defer by local sale day; account invoice planning now also filters out future business dates. Their pending payment allocations wait for invoice sync. Ad hoc report fields expose saleTime, enteredAt and dateOverridden; SaleDialog marks selected dates and entry timestamp. All PCs should share shop time zone. Sync-start and existing reconciliation checks still apply.

Final typecheck/build and 194 SQLite/API/QuickBooks regression checks passed: v28 migration history, canonical/local date validation, past/ordinary/future checkout, idempotency, selected-day reports and QB summaries, due dates, future invoice deferral and held recall. Windows UI, printers and actual QB company remain local checks. Baseline main 2a08212a58d5b6ce725bfb69be06f00a01712a15 / v0.3.40. No commit/push/tag or real transaction created here.


### v0.3.40 — server backup settings and safe retention
Shared settings validate fixed minute options 15/30/60/240/1440 and retention integer 1–365; fallback defaults 60 minutes / 12. Stored in existing settings table, no migration. WeakMap per-DB manager shared by startup scheduler and authenticated GET /api/backups, PUT /api/backups/settings, POST /api/backups/run routes. One in-flight Promise joins manual/scheduled runs, resettable timeout reflects config changes, stop awaits work. Overview reports next due time, verified status, server folder/storage/counts and distinct cleanup errors.

Pruning runs only after online snapshot, integrity check and rename. Exact generated store-auto ISO names only; keep current verified file plus latest N-1. Never prunes store-before-v migration snapshots, partials, unknown names, directories or symlinks. Existing old generated snapshots are eligible after the first successful new backup. New unpublished snapshot is set to journal_mode DELETE before integrity verification, avoiding readonly verifier WAL/SHM sidecars and delivering a standalone DB. Live store remains WAL. No off-site copy, custom directory or restore feature added.

Settings → Backups works from all paired tills. HomeStatus overdue threshold now max(30 minutes, configured interval × 1.5); interval carried in operation status with compatibility fallback. Final validation: 183 regression checks, typecheck and production build passed. Actual Windows UI/physical disk failure remain local checks. Regression coverage includes defaults, validation, settings persistence/rescheduling, concurrent jobs, retention scope, failed snapshot preserving history/files, cleanup failure/retry and authenticated API. Baseline main 46a764546417e2b4acac226e32f8b0771668f05a / v0.3.39. No commit/push/tag or user backup deletion performed here.


### v0.3.39 — import mapping, Item List layout and bulk cleanup
ImportItems adds pick/map/preview/done with per-destination source selects, sample values, shared conversion validation, arbitrary headings, same source to multiple destinations, opt-in unmapped extras, duplicate SKU/UPC checks and preview-only dry run. A mapped value preview precedes saving. Blank/unmapped fields preserve existing values; numeric stock remains an explicit overwrite when mapped. Mapping is per open file, not persisted.

ItemColumns derives all defined import fields into display columns. ColumnMenu accepts optional column/default collections while keeping Sale defaults. Item layout/order is normalized and stored locally; name is mandatory. Item and customer lists add explicit shown/entire/clear selection, delete all selected IDs across filter changes, and label global/inactive scope. Existing delete routes reject malformed/over-limit ID batches instead of silently truncating. Held customer and non-inventory item references are retained through deactivation. No data was deleted on Greg's PC or in QB.

Final validation: 169 SQLite/API/Excel regression checks, typecheck and production build passed. Browser fixture QA confirmed right-click toggles, reorder and reload persistence; file chooser stalled/lost the browser tab, so interactive import upload remains a Windows check. Direct real XLSX parsing and mapped import dry-run/commit were tested against disposable SQLite. Baseline main d0d1fb8f90dacf9a57fd4fccf8ea6d37f1c12ef4 / v0.3.38. No schema migration, website upload, Git commit, push or tag performed.


### v0.3.38 — manual printing
Removed automatic label dispatch from WorkOrders onCreated and automatic receipt dispatch after Sell completion. PrintSettings exposes manual-print guidance instead of auto toggles; printSettings normalizes legacy auto flags to false. Manual print buttons, printer selection, templates, copy counts and print previews remain available. Typecheck and production build passed. Targeted settings checks confirmed default/legacy auto flags are false while printer choices and copies remain intact. Windows physical printing remains a local check. No schema/site change. Baseline main e6b7301d4fc9c1ca6b1341f12c8a575deadbc0a2 / v0.3.37. No commit, push or tag created here.


### 14 Nov 2026: v0.3.30 card brands, drawer and top scan bar
- Baseline main 448319e1 / v0.3.29. Moved Sale scan/search DOM and grid area above receipt with downward suggestions in all Quick Pick/responsive layouts; line actions stay below.
- Migration 23 adds optional payments.card_brand with enum check. Server validates card-only brands; absent card brands become unknown. Card brand round-trips through sale/refund history and receipts. New checkout sends reference only for checks; legacy references remain in DB/history. One card brand per transaction (different-brand split-card payloads rejected; existing cash/card split behavior unchanged).
- QuickBooks per-brand PaymentMethod mappings fall back to general Card; same deposit account and brand memo, no changes to synced references/transactions. Existing config partial writes preserve mappings. No payment terminal/reader integration; user declined that separate idea.
- Manual per-PC drawer button and Settings → Printing section. Defaults disabled, COM3/hello, Button only. IPC uses saved validated configuration and fixed cmd echo redirection; no arbitrary executable/shell text. Windows-only, timeout, concurrency/cooldown protection. Optional app-focused F1/F10/F11/F12; remove old Windows F1 shortcut binding before assigning F1 here. Signal acknowledgment is not physical drawer-state feedback. No automatic opening on cash sale.
- 65 regression checks passed, including card brand persistence/refund/receipt/QuickBooks fallback, legacy reference preservation, check numbers, drawer configuration rejection and mocked execution/concurrency guards. TypeScript/build pass. COM3 hardware, Windows shortcuts, top scan layout and live brand-mapped QuickBooks transfers require on-PC validation.


### 14 Nov 2026: v0.3.29 serialized checkout and stage colors
- Based on main c3e58baa, latest release v0.3.28. Server now requires serials for use_serial products, customer association for every item carrying a serial, one unit per line and at most 80 serial characters. Checks run inside checkout's existing transaction/idempotency boundary.
- Duplicate detection is case-insensitive for ASCII letters with trimmed ends, store-wide: same-request duplicates or positive sold quantities not offset by completed receipt-linked returns. Valid planned receipt-linked returns on the same exchange count; no-receipt returns and manual equipment deactivation cannot bypass sold-history checks. Historical receipts remain unchanged.
- Existing addUnitFromSale/finishReturns links preserve original/new customer records. Added paired equipment-by-serial lookup and Work Orders dialog showing associated customer, receipt and up to 50 recent tickets per unit (at most 100 matching unit records).
- Added validated per-stage #RRGGBB colors to existing server settings, defaults and old-client partial-save preservation. Shared UI list/filter badges and ticket current-stage indicators refresh within 30 seconds; settings previews and reset use automatic black/white contrast. Stage names/stock transitions/email rules unchanged. No schema/dependency changes.
- 56 Electron/SQLite regression checks passed: required customer/serial, duplicates/atomic rollback, customer-unit linkage, legitimate resale and same-exchange return/resale, settings/color validation/contrast/persistence, shared API and paired equipment lookup. TypeScript/build pass; Windows scanner/color-picker/till-to-till visual checks remain local.


### 14 Nov 2026: v0.3.28 transaction sync queue
- Based on main 4ec86549 (latest release v0.3.27). New authenticated GET/POST /api/qb/queue, complete sales-based queue independent of export-row existence; status/customer/receipt/date filters and 50-row pagination. Counts apply to search/date filters, independent of status selection.
- Selection of waiting/failed transactions revalidates IDs, current start date, completion/payment/legacy status and known sync state inside one SQLite transaction. Whole selection rejected when stale/ineligible. No implicit enabling, before-start override, synced resend, or manual-exception bypass. UI selections are current-page only. Active sessions block queue mutations.
- Selected existing export records keep their reference/identity; prepared records are picked up by the unchanged automatic planner and remote duplicate query. Summary builder accepts a bounded sale-ID subset for queue preparation. Reading queue creates no export rows. Manual confirmations display Entered by hand rather than claiming remote confirmation.
- 47 regression checks cover unexamined rows, idempotent preparation, failed retry, stale sent state, mixed-selection atomicity, start dates, filters, sending-off preservation, authorization/session lock, change-only cash tender, old daily overlaps, pagination and queued connector completion. TypeScript/build and on-PC visual checks described in package instructions. No schema/dependency changes.


### 14 Nov 2026: v0.3.27 direct receipt quantity editing
- Main d5968288 (latest installed release v0.3.26) matched local source except previous package metadata. Added Qty editors and −/+ controls to sale and return rows. Saves on Enter/Tab/blur, Escape restores, invalid values leave saved state unchanged. Numeric input key events stay isolated from scanner/F-key handlers.
- New quantity parsing/rules reject fractional/nonfinite/scientific/scanner-like input and enforce ±9999, one serialized unit, negative return signs and receipt availability including other pending return lines. Zero always removes. Negative sale edits enter existing return details and cancellation preserves the original cart line.
- Return edits retain reason/restock and original-tax snapshots. Work order/credit/fee quantities remain read-only. Existing toolbar +1 now adjusts the selected line through the same rules, preserving its serial/price context.
- User confirmed actual QuickBooks test sales transfer and no duplicates on repeated sync. Broader accounting validation remains separate.
- 35 regression checks (32 existing plus 3 quantity validation groups), TypeScript checks and production build. Windows visual/keyboard/scanner validation remains local. No schema/dependency changes.


### 13 Nov 2026: v0.3.26 Home bottom status
- Based on main baf0195f (Greg reports installed v0.3.25). Home now places a responsive status strip below the Navigator: sales/tenders, QuickBooks, verified backups and server reachability. Independent 30-second polling uses settled requests and ignores updates after unmount; no overlapping refreshes.
- New authenticated `/api/operations/status` returns only operational metrics, never connector credentials. QuickBooks history and backup history persist in settings; no schema migration. Defaults are unknown, not fabricated from old files/logs.
- Backup success recorded only after integrity check and rename; failures preserve last verified timestamp. QB completion records successful connection on a clean finished session and successful sync only when mapping/sending is ready. Failed/incomplete sessions do not replace success history. Existing export counts show outstanding attention.
- 32 Electron/SQLite regression checks passed, including actual scheduler success/failure, persisted backup history, pairing protection, credential exclusion and successful vs interrupted/failed connector sessions. Type checks and production build passed. Windows visual and real QuickBooks testing remain local.


### 13 Nov 2026: v0.3.23 persistent left navigation
- App shell now has a left menu on every main screen, with active-screen indication, independent scrolling, pinned Home/Settings/Updates and existing home-menu configuration. Defaults include Receiving, Marketing and QuickBooks. Saved custom menus are preserved.
- Home's duplicate shortcut column becomes a horizontal Today summary. The Sale component mounts on first visit and stays mounted while hidden so navigation retains the cart. Hidden sales do not handle global shortcuts or scanner focus. Register layout adapts to the menu width on smaller windows.
- Version remains v0.3.23. No dependency or database changes. Visual/scanner validation on Windows remains required.

### 13 Nov 2026: v0.3.23 negative-quantity returns
- Follow-up: + Sale / − Return sign buttons in Change quantity keep the quantity magnitude and make sale/return selection explicit. Version remains v0.3.23 as requested.
- Change qty / F3 accepts negative whole quantities and opens InlineReturnDialog for the scanned item; no menu navigation or second item lookup. Positive cart state is untouched until Apply return, so Cancel preserves it.
- Uses the existing ReturnLine model and server return validation rather than negative normal sale items. Reason/restock required as applicable; optional original receipt filters by product/serial and subtracts existing pending return quantities. Preserves original price/tax snapshots and receipt/customer association.
- No-receipt returns use the regular current product price; the API now retains the optional serial and checks one unit when serial is supplied. No DB migration. Work order payments still cannot be combined with returns.
- Added five regression checks for conversion/validation, linked limits, exchange totals/stock, serial matching and damaged equipment. Full suite: 23 checks. Type check and build pass; on-PC visual and scanner testing remains.


### 13 Nov 2026: v0.3.22 update package
- Restored the Phase 1 verified SQLite online backup scheduler from PR #1 (startup + 15 minutes, waits before DB close). Added `npm run verify:backup` using Electron's SQLite ABI.
- Migration 22 adds checkout request IDs/hashes and separate per-sale QuickBooks export records. Existing daily export records remain intact. Migration disables QuickBooks sending once so the new start date/mapping can be reviewed.
- Checkout writes the pending request to localStorage before submission and recovers it across retries/restarts. Server repeats the original receipt for the same ID and rejects a changed payload under that ID. Held receipt completion checks row count and rolls back conflicts.
- Refund tax uses an allocation of the original charged tax and cumulative returned quantity; server and till share the calculation.
- QuickBooks uses individual receipts, customer-specific names with POS ID suffixes, item/serial descriptions and existing department accounting items. Today's sales are eligible. Refunds/zero totals/split payments/legacy daily overlaps are manual exceptions. Customer names already exported are reused after a local rename.
- Connector sessions serialize; receipt checks compare identifying memo, customer and total before recognizing a previous export. Missing/failed prerequisites stop dependent posting. Lists can load while sending is disabled.
- Regression checks run with Electron's Node runtime through `npm test`; CI/release workflows now run them. The Windows installer and real QuickBooks Enterprise connection still require Greg's local validation.


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

### 9 Nov 2026: Delete items and customers (next release **v0.3.19**, no DB change)
- [x] `src/main/server/deleting.ts`: `POST /api/products/delete` and `/api/customers/delete` `{ ids }` → `DeleteResult` (`shared/deleting.ts`). No history → row erased (customers: their units without work orders, marketing send rows removed, held receipts unlinked). On sales / work orders (products: `sale_items`, `work_order_lines`; customers: `sales`, `work_orders`) → `active = 0` (products also leave Quick Picks), with the reason.
- [x] UI: 🗑 Delete in the item and customer windows; tick boxes + "tick all shown" + **Delete selected (n)** on the Item List and Customer List; plain-words result (`renderer/src/deleteText.ts`).
- Verified: new `deleting.ts` test (erase vs inactive for items and customers, not found, receipts unaffected, held receipt unlinked, hidden from search); TypeScript.

### 9 Nov 2026: Receiving (next release **v0.3.20**, DB migration 20)
- [x] **DB migration 20**: `receivings` (vendor, invoice_no, po_number, invoice_date, received_by, freight_cents, freight_to_cost, notes, till_name, status draft/posted, created_at, posted_at), `receiving_lines` (qty, unit_cost, note + snapshots at posting: on hand, avg cost, order cost, price before; landed cost, new avg, new price, cost_updated), `products.last_received_at`.
- [x] `shared/receiving.ts`: types, `receivingNumber` (RV-000001), `landedCosts` (freight spread by value), `newAverageCost` (weighted; stock <= 0 or no average -> new cost), `receivingTotals`, `marginPct`.
- [x] Server `receiving.ts`: list/search (drafts first), get, create, update/delete (drafts only, 409 when posted), `POST /api/receivings/:id/post` `{lines: PostLineChoice[]}` (on_hand += qty for inventory, cost_cents = new average, order_cost_cents = landed cost if updateCost, optional new price; one transaction), `GET /api/products/:id/receivings` (last 20). Deleting an item on a receiving makes it inactive.
- [x] UI `screens/Receiving.tsx`: list + editor (header fields, type-ahead add, grid with on hand / last cost / avg -> new / price / margin / note, totals), Save draft, **Receive items…** review dialog (update cost per line, new regular price, margin), then `TagPrintDialog` with `lines` (qty = received, per-line label Auto / priced / no-price). Wired: Home Purchasing "Receiving History" tile, menus "Receive items" (intent `receive`) + "See receivings", item window **Receiving history** panel.
- Verified: new `receiving.ts` test (freight spread, weighted average, updateCost off, new price, services no stock, post twice 409, history, delete -> inactive); deleting/items/import/held/returns suites pass; TypeScript web + node.

### 9 Nov 2026: Click-to-change price (next release **v0.3.21**, DB migration 21)
- [x] **DB migration 21**: `sale_items.regular_price_cents` (set when the price was changed at the till). `SaleRequest.items[].unitPriceCents` (optional override, whole cents 0..`MAX_PRICE_CENTS` = $100,000, in `shared/pricing.ts`); `SaleItem.regularPriceCents`. Held items keep `priceCents` in items_json (no migration).
- [x] UI: `PriceCell` in `saleColumns.tsx` (text with dashed underline; click -> input, Enter/blur saves, Esc cancels). Sale screen cart lines (`CartLine.priceCents`, `unitOf`), `setPrice` (typing the regular price clears it); Price column now required. Repair pick-up work order rows on the Sale screen are editable too: `setWoPrice` calls `woUpdateLine` and reloads the ticket (fractional labor hours: typed amount = line total). Work order ticket uses `PriceCell` (MoneyCell removed).
- Verified: new `priceedit.ts` test (bad prices 400, override + regular price stored, tax on changed price, $0 allowed, held keeps price); held/returns/checks/exempt/qb/workorders/wofees/taxes suites pass; TypeScript web + node.

---

## Next up (backlog, in rough priority order)

- Install v0.3.59 server first/all tills; verify default address on ordinary/serialized customer receipts, designer placement and one old receipt. New receipts retain captured address; old ones reflect current customer data.

- Shop test v0.3.58 Test receipt using Windows dialog with Star72mm x Receipt: confirm right-hand prices/totals fit and non-heading text is now dark. If successful enable/save receiptWindowsDialog and reprint an existing sale. Silent path remains unconfirmed.

- Greg: after installing v0.3.57 use Test receipt using Windows dialog; verify receipt visible on screen, select Star72mm x Receipt and compare physical output. If it works, enable/save receiptWindowsDialog. If blank persists, collect native preview/queue result and actual Star driver version before further changes.

- Publish v0.3.56 tag from GitHub UI and wait for installer build, then install on shop print computer and retry test receipt. Confirm script error is gone before judging Star output. Do not claim physical printing fixed until Greg confirms.

- Greg at shop: apply v0.3.55 and test Star TSP100 test receipt and long saved receipt. Windows test print already confirmed good. If blank persists, inspect diagnostics/application.log for receipt-page dimensions and print callback, and capture exact installed Star driver. Do not mark hardware fixed until confirmed.

- Apply v0.3.54 server first, confirm only POS General is visible and the default income account is selected, then check one new paid sale and one account invoice in the QuickBooks test company. Do not delete historical QB items to apply this change.

- Apply v0.3.53 on Store Server first, verify Home backup status against Settings and test current-total checkout of a Ready for Pickup repair with old/pending online approval; verify receipt, closure and existing QuickBooks sync.

- Investigate Citizen CT-S310 blank slip from DiamondPOS while QuickBooks prints correctly. Receipt jobs currently inherit driver paper sizing; cause unconfirmed and physical test pending.

- Apply v0.3.52 route/customer-permission fix, then configure Mobile Text Alerts and run a self-number estimate/pickup test. Verify both-channel partial failure results, STOP handling and no duplicate resend; no live messages have been sent here.
- Store test pending bench/mechanic changes in the next cumulative update; update Store Server first for schema changes.

- Verify Customer Equipment on Windows with a real repair intake unit. Proposed next feature: limited store-Wi-Fi mechanic phone access and unit/work-order photos, including backup/restore of photo data. Not yet implemented.


- Wednesday store rehearsal: verify End of Day per-till vs all-till totals, actual drawer/terminal counts, manual printer layout and saved closeout reprints.


- Validate v0.3.41 on Windows and QB test company: normal/past/future dates, receipt/report time zones and deferred account invoices. Confirm vendor event requirements separately; no automatic discount rule added.


- Verify Settings → Backups on Windows: actual folder, chosen interval/next run and Back Up Now; confirm separately protected pre-migration files. Arrange an off-server copy before production.


- On Windows, verify v0.3.39 mapping/file-picker with a few inventory rows before importing the full file; verify manual labels after changes. Optional future saved import profiles and sheet selection are not included.


- Verify manual work-order label and sale receipt printing on Windows after v0.3.38 is installed on each PC.


**Update prepared: v0.3.30** (optional card brands, manual configurable COM drawer and top item scan). Apply over v0.3.29, test and publish v0.3.30. Store Server first for migration 23, then tills. Drawer setup is local to each PC and starts disabled.

Next: test with QuickBooks Enterprise and actual printers on Greg's PC; decide whether to automate refund and split-payment accounting; add off-PC backup destination and retention settings. Phase 1 backups are local and do not prune history.

0. Build out the "coming soon" tiles as needed: End of Day, Purchasing (POs and a vendor list; receiving done in v0.3.20; next: build a receiving from a PO, print a receiving report), Departments, QuickBooks sync
   - ~~Tax-inclusive vs tax-added~~ (tax added at checkout since v0.3.16). Still to do: apply customer Discount % and Custom Price levels (from QB POS) by customer type; selling by case (Unit of Measure 1); QuickBooks tax item per tax rate
   - Ideas: Quick Pick order/colours, hold/recall sale
1. Staff PINs and an audit log (who rang up each sale)
2. ~~Refunds~~ (done). Still to do: **void** a sale the same day (the `sales.status` column already exists); manager PIN to approve no-receipt returns; print a barcode on receipts so scanning finds them instantly; a "no-receipt returns" report
3. ~~Receipt printer~~ (printing setup done in v0.3.11). Still to do: cash drawer kick (most drawers open from the receipt printer; needs a raw ESC/POS command)
4. Off-PC backup destination and retention (local verified backups restored in v0.3.22)
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


## v0.3.31 vendor list

Adds shared vendors types, authenticated CRUD routes, list and QBPOS-style editor. Migration 24 seeds trimmed/case-insensitive supplier names from products and receivings, preserving their existing text, and attaches nullable vendor_id links. Item insert/update and Receiving create/draft updates link matching vendor names. Rename updates linked item master names, preserves voucher snapshots, and history uses stable IDs. No deletion; inactive filters suggestions. Unknown free text remains permitted for compatibility. Terms are reference only; no POs, payables or vendor QuickBooks export added.

Validated with typecheck, build and 70 SQLite/API regression checks. Windows visual verification remains a local check. Release package is a changed-source overlay against main f7a82ed6bdc7d9a646a537f4a8c2bd40bfcbe0a5 / v0.3.30. User commits/tags main; no branch or push created here.


## v0.3.32 implementation

Report builder uses shared field/preset allowlists and parameterized server-side SQL (receipt/item/voucher grains respectively). Supports projections, AND filters, group SUMs/counts, relative/custom local dates and sorting. Explicit 10,000-row output cap, full-match totals. Saved definitions (up to 100) are stored in reports_saved_v1 in settings, shared across tills. No raw SQL or per-item historical profit reporting. Excel/CSV export + full-page print. DailyCloseout retains old Reports UI and refreshes after viewing/voiding receipts.

Migration 25 adds sale_voids and sale_items.stock_removed. New sale lines snapshot stock quantity removed; pre-v32 lines stay null and require operator acknowledgment based on current product type. Void service atomically retains original amounts/payments, marks status=void, restores stock and deactivates sold units, with permanent reason/by/till/payment note/stock JSON. Repeat requests are idempotent. Restricted to ordinary positive sales without return/work-order/manual/legacy dependencies. Operator name is typed audit data, not authenticated role enforcement. Terminal payment reversal is manual and explicitly confirmed.

Web Connector runs pending void tasks before normal exports when sending is enabled, regardless of configured sale start date. Known TxnID queries or ref-number recovery check ownership memo, customer, original amount; TxnVoidRq is followed by a zero-value/VOID-marker query. Failures remain error until explicit retry; lost responses recover by querying. Pending/failed voids are counted in operations and shown in queue without ordinary-sale resend eligibility. No external QuickBooks company file was modified during development; mocked SOAP tests exercise protocols. Validate against Greg's Windows test company before relying on live behavior.

Receiving API + new-form defaults freight allocation false; draft PUT omission preserves saved preference. Posted voucher tag actions fetch exact full product records, avoiding search caps/stale price data. Item cost summary aggregates all posted receiving lines with quantity weighting (invoice and landed bases), independent from 20-row preview. Current average remains products.cost_cents; averages exclude opening/import stock without vouchers. Last cost uses posted_at/id/line ordering.

Source overlay targets main 969294769f2be459867194827b4953ed99a8e08e / v0.3.31. All files copied over existing project; no push/tag performed here. Update server then every till. Windows UI/printing and real test-company validation are local checks.

Validation for v0.3.32: npm run typecheck, npm run build and npm test passed (104 regression checks, including mocked QBWC void/recovery/error responses, report totals/caps, cost weighting and freight defaults). No physical printer or real QuickBooks Desktop run was performed here.


## v0.3.33 estimate-email stock notice

Shared partsOrderingNotice checks Needs Estimate and Approved to Fix only, aggregating tracked part lines by product and comparing total required with current on-hand plus this ticket's allocated stock. Work-order buildEmail adds the live notice separately from stored template body, so customized templates and includeBill=false cannot silently omit it. Both woEmailHtml and woEmailText include the notice; descriptions are escaped in HTML. Preview and send call the same builder and each reload the ticket. No SMTP messages were sent during validation. No schema or template migration.

Source overlay baseline main 0b8eef0e0cb383149fce02cc591fa241e9974d41 / v0.3.32. Tests cover partial/exact stock, repeated item lines, allocated stock, untracked charges, custom templates, HTML/text safety and live preview after restocking. Typecheck/build/full regression validation included in update instructions.


## v0.3.34 approvals / cPanel handoff

Migration 26 creates work_order_estimates with immutable snapshots/hash/revision and sent/decision/contact state. Adds Waiting on Customer (partsTaken false), estimate email template, 3-day configurable call reminders, contact-note/snooze endpoint, badges/filter and idle-ticket refresh. Only successful explicit estimate sends start the timer. Existing check-in emails remain non-estimates.

approvals.ts stores redacted approval_config with tested service identity and cursor. Requests use HTTPS and X-DiamondPOS-Key, strict host allowlist (staging or morethanmowers.com), no redirects and 15-second timeout. Server polls at 60 seconds; shutdown awaits its current check. Web decisions are transactionally matched to pending sent snapshot, live ticket hash/stage and service identity, then stock/stage/history apply once. Prepared sends defer cursor handling. Failures remain visible; unknown local IDs cannot mutate tickets. Stale/terminal remote links are cancelled once; publication replaces unanswered old links. Recorded estimates block repair checkout without a matching current approval. The hash excludes informational stock notice and remaining balance after fee payments, but binds repair lines, diagnosis, tax/total, customer/unit identity.

extras/cpanel-approval is standalone PHP with PDO SQLite private storage outside document root. Public index.php path points to private configuration; no real key is shipped. 256-bit per-revision tokens are hashed on website, 30-day expiry; GET never records decisions; POST confirms name/choice with CSRF/session. Security headers/no referrers/no caches; rendered customer text escaped. API is keyed; database identity protects accidental service replacement. Decisions are append-only cursor events. No router port forwarding, external mailbox reads or payment processing. Names are customer-entered labels, not independently verified identities. Staging test_mode is a banner, not a simulation gate.

Baseline overlay targets main 0b8eef0e0cb383149fce02cc591fa241e9974d41 / v0.3.32 and includes uncommitted v0.3.33 changes. Tag v0.3.34 when local checks pass. No commit, push, hosting upload, real customer email or live decision was performed here. Handoff includes a public-only cPanel ZIP plus POS update and detailed private-folder setup guide. Local PHP CLI integration tests run with a temporary private database; POS tests stub remote/SMTP transports. Windows visuals and actual cPanel/SMTP integration remain user checks.

Final v0.3.34 validation: typecheck/build passed; 122 POS SQLite/API regression checks passed; 12 real PHP/HTTP integration checks passed using PHP 8.4 and a temporary private SQLite database. No staging upload, SMTP delivery or physical Windows/printing checks were performed.


## v0.3.35 remove On the Bench

Removed on_bench from WoStatus, STAGES, next-stage buttons, ticket FLOW and default template settings. Approved -> waiting_parts/ready_review; waiting_parts -> approved/ready_review; ready_review rework -> approved. Stage rendering recognizes the legacy DB value only to show truthful retired labels in history/last-email records. Settings normalization ignores the retired color/template while preserving other saved values.

Migration 27 inserts one audit history entry per on_bench ticket and updates its status to approved, with no stock SQL or reconcile call. Previously deducted stock_taken and product on_hand are preserved; normal reconciliation at approved is a no-op for already-taken quantities. Existing history and last_emailed_status are not rewritten. Migration is idempotent through schema_migrations.

Validated typecheck/build and 126 SQLite/API regression checks, including a v26 database with a bench ticket/allocated stock, historical events, custom colors/templates and repeat startup. No PHP/site upload or approval-service change. Source overlay against main aaf5aa0d74222e2a19260f4f564400cea0b1e987 / v0.3.34. User commits/tags main; no branch, commit, push or release created here.


## v0.3.36 initial ticket estimate fee

NewWorkOrder uses an editable dollar amount, category default on unit selection, Use default and No fee controls. Defaults must load successfully before check-in. Validation uses parseMoney plus safe-integer cents. Collection routing uses the server-returned ticket fee. API accepts optional feeCents (safe integer >=0); omitted retains the default and older noFee:true still waives. Validation precedes transactional ticket/shop-supply/hour changes. Non-default fee history records both amounts without changing wo_settings or existing tickets. Existing fee payment/credit calculations already use the saved ticket fee.

No schema migration, cPanel upload or approval-flow change. Typecheck/build and 131 regression checks passed, including omitted defaults, lower/higher overrides, zero-default override, zero/legacy waiver, fee collection and invalid-request rollback. Overlay baseline main e1a153eb1905e8f32bc33840970459be0332109e / v0.3.35. User commits/tags main; no commit/push/tag was made here. Windows visual verification remains a local check.


## v0.3.37 customer accounts and immediate inventory allocation

Migration 28 adds opt-in customer accounts, invoice/payment/allocation ledgers, request-id protection for held receipts, and held_stock. It reserves existing open holds and unallocated open WO parts transactionally; already-taken stock remains unchanged. Holds reconcile absolute quantities; checkout releases and re-deducts atomically. All open WO stages reserve parts; Not Fixed restores.

Account sales retain sale/tax/stock records but create unpaid InvoiceAdd instead of SalesReceiptAdd. ReceivePaymentAdd uses exact oldest-first invoice allocations, unique references/memos, query-before-add and post-add verification. Invoice totals use Subtotal + SalesTaxTotal for real SDK responses. QB balances track sent local allocations to avoid double subtraction. Failed states require review/retry; active connector sessions prevent concurrent manual retry. Customer balance excludes imported balances and unrelated QB invoices. Account void/credit/refund, payment reversal and overpayment flows remain unsupported and guarded where applicable.

Validated 162 SQLite/API regression checks, typecheck and production build. Mock SOAP tests cover lost replies, tax, multi-invoice allocation, external payment conflicts, retries and migration/stock lifecycles. Actual Windows UI, printing and QuickBooks Desktop must be tested locally. Overlay baseline main 1e0b120d10b8cff9999fef6881d020d52114740d / v0.3.36. No commit, push, tag, release or cPanel upload performed.

## v0.3.44 — Marketing consent (17 Nov 2026)

Schema 31 adds durable address suppression and outgoing opt-outs. `marketing/consent.ts` owns normalized email tombstones, authenticated HTTPS website sync (commit then ACK, retained replay), one-minute scheduler, final pre-send check/link preparation, synchronized CSV eligibility and settings routes. Save/update/import/audience/send paths honor suppression; imports and checkbox edits cannot reactivate it. Existing pending campaigns fail closed until configured. SMTP configuration tests and transactional work-order delivery bypass marketing consent. Website/API failures pause campaign recipients; suppressed/changed/deactivated queued customers become skipped. Shutdown awaits sender/sync jobs before database close.

New `extras/cpanel-marketing` is independent of existing approval hosting: private PDO SQLite plus config/key outside public root; opaque hashed recipient tokens; scanner-safe GET confirmation and explicit POST; suppression/event/ACK API. No reconsent endpoint or destructive event pruning. URL/key changes republish local tombstones; replay restores history both ways. Public-only ZIP and setup guide prepared; no deployment or real email. Current SMTP campaign delivery remains in POS; website dashboard/provider tracking and unsubscribe webhooks are not implemented.

Validation: 230 regression checks, typecheck/build and real local PHP/SQLite HTTP tests. Still verify actual cPanel/PHP permissions, SMTP email link and Windows screen on user's system. Next: deploy/configure consent service and run self-address end-to-end test; then design website campaign dashboard/provider with mandatory suppression preflight. Protect both POS and separate private website backups. Avoid old sender versions after this feature is enabled. No commit/push/tag performed.

## v0.3.45 — Campaign activity (17 Nov 2026)

User verified v0.3.44 works and approved open/click tracking with results inside POS Marketing. GitHub baseline 3c3c4e5429728063e24fd6f142fc607f2f14a7fb. Schema 32 adds stable tracking identity/inclusion flag to marketing_sends and indexed activity events keyed by immutable event IDs. Main server awaits both consent and activity jobs before closing DB. Website URL/key changes reset both feed cursors; local results persist. Activity sync is independent of consent, atomically advances cursors, validates batches and deduplicates replays. A stale/error feed preserves prior results. Tracked preparation fails closed against an old service, while activity-poll failure alone does not pause sends.

Existing POS SMTP campaign sends add opaque pixel/redirect tokens after consent preflight. Body HTTP(S) URLs are linkified/rewritten after personalization; footer unsubscribe/reply links are not tracked. Shared template escapes message HTML and includes a brief notice. Test sends/previews and transactional messages do not collect metrics. Tracking toggle defaults on for future sends; successful SMTP handoff records whether tracking actually was included. Counters use distinct engaged recipients / successfully sent tracked recipients; legacy sends are explicitly untracked. Sent only means SMTP accepted. Never claim confirmed read/unread/forward/delete/inbox delivery.

cPanel tracking.php is required by updated index.php, using the SAME private database/config. New public-only ZIP includes both PHP files plus .htaccess; preserve custom configPath on upgrade. Stable private delivery identities map to hashed opaque tokens. Authenticated preparation fixes destinations; public click query parameters cannot redirect elsewhere. GET records image/click observations, filters obvious bots/preview/prefetch and ignores HEAD; coalesces same-token requests within 60 seconds. No app-level IP/UA storage. Opt-outs stop new activity recording without breaking old redirects. Old unsubscribe tokens survive upgrade. Tracking cannot infer people or distinguish forwarded-message activity. Keep old endpoints/private databases for sent links.

Frontend: campaign list summary and CampaignActivity report below the existing editor, per-recipient counts/times/link details, filters, Excel export, manual sync and all-campaign replay. Polls local report every 30 seconds; Store Server polls website every 60 seconds. Settings → Email controls future tracking. No separate website dashboard/provider webhook/marketing composer added. No commit/push/deploy/real email. Next: user upgrades public files preserving private path/data, releases v0.3.45 server-first, then verifies actual external HTML email with a self-only real campaign. Hardware rehearsal and full website dashboard remain future work.

Additional v0.3.45 scope approved during development: service-history audience mode (any/mower/handheld/other, ready_pickup/closed by default or any noncancelled stage, check-in-date lookback, existing customer-type/active/consent/dedup rules). Not Fixed jobs are excluded, including closed jobs whose last prior recorded stage was not_fixed. Uses real work orders; no purchase needed. Older audience JSON defaults to purchases. Copying campaigns retains the normalized service criteria. Unit categories are current recorded categories; no invented classification. The normalizer/query/UI preserve existing purchase and all-list modes.

Campaign removal endpoint now transactionally deletes local sends (activity cascades) then campaign, allowing draft/sent/cancelled but rejecting sending and currently in-flight campaigns even after cancellation. Background sender exposes active-campaign guard and rechecks campaign state before SMTP. UI confirms irreversible local deletion. It does not delete customer/suppression records or call remote token deletion; old links keep working, and unknown delivery activity is safely ignored on feed replay. No campaigns were deleted on user's systems.

Validation: 250 regression checks plus typecheck/build, real PHP service HTTP suite (including legacy unsubscribe token preservation) and real PHP ↔ POS SQLite integration with no SMTP. Actual Windows UI/cPanel/outbound delivery still require user's self-address check. Suggested release commit/title: Track campaigns and target service customers. No commit, push or tag performed.

## v0.3.46 — Confirmed re-subscription and marketing typing (17 Nov 2026)

User approved explicit confirmation-based re-subscription, and reported delays typing campaign name/subject/message. GitHub baseline 3fb26375a27e200487977c86ddb1d4754c546940, v0.3.45. Keep main/source-overlay workflow; no commits/tags/deployment or real email. User handles external email/cPanel/Windows verification.

Schema 33: outbox gains intent and stable change_id; confirmation evidence and subscription request audit tables. Website subscriptions.php migrates event kind/request_id, queues public/staff requests, hashes opaque 24-hour confirmation tokens, validates baseline email consent revision and requires explicit POST. Public GET never subscribes. Newer opt-outs cancel outstanding requests; used/old/expired links cannot reactivate. Confirmation event replay is ordered/idempotent and updates all matching customer permissions without activating inactive customer records. Skipped campaign sends remain skipped.

Consent protocol 2/capability check occurs before outbox writes; both sides reject old/incompatible syncing. Restore/backfill intent ignores a newer website confirmation, while genuine pending/new opt-outs win. Stable opt-out IDs prevent lost-response retries from cancelling a later request. Promoting a restore outbox entry to a genuine opt-out creates a distinct change identity. An opt-out arriving while a confirmation batch is in flight prevents local activation. Confirmation evidence survives even if a newer opt-out currently suppresses the address. Website history/old tokens must remain in private backups.

New subscription worker reuses sendEmail/SMTP, sends only to matching active stored customers, contains no marketing/tracking, saves SMTP success before website ACK and retries ACK without resending. Roughly one-minute schedule, max20 requests/pass capped by SMTP perMinute, failed preparations retry after5min with3 attempts/request. Ambiguous SMTP delivery can still duplicate a confirmation email, never auto-confirm consent. Worker is awaited on shutdown before DB close. Unknown public requests do not create customers/send emails; public responses are generic. Form uses expiring HMAC CSRF + honeypot + 5min/address cooldown,3/address/day,5/IP/hour hashed buckets and300/day service cap. No separate PHP SMTP account required; offline POS queues requests until running. Requests/evidence are visible in Settings → Email, staff request action beside saved customer email permission. Pending local opt-outs can invalidate a request on reconnect; request again after sync. Only explicit customer email confirmation removes suppression, not imports or the checkbox.

Customer save adds preserveEmailConsent for unchanged checkbox/same address in a stale form, preventing unrelated edits from reversing newly synchronized permission. Existing intentional changes/import opt-outs still work. Backend suppression enforcement remains final.

Typing: memoized MailerPreview isolated from urgent inputs; subject/message preview debounced250ms. Existing campaign fields wait until complete load; cancelled load responses cannot overwrite edits and failed loading does not expose a blank overwrite form. Stale audience responses ignored. List/progress use a slim SQL selection/API summary flag that avoids reading/transmitting entire flyers repeatedly; initial full editor fetch retains image. Windows responsiveness still requires user's check; no measured Windows timing claim.

Validation:261 regression checks, typecheck/build, real PHP/SQLite HTTP suite and PHP ↔ POS SQLite integration through mocked SMTP. Includes legacy unsubscribe/tracking preservation, confirmation request/GET/POST/expiry/stale/replay tests, worker ACK idempotency, shared-address permission restoration, local opt-out precedence, protocol capability safety, stale customer form preservation and large-flyer summary regression. Setup guide includes exact Git release commands and all4 public files. Next: user uploads helpers/index preserving configPath/private data, updates server/tills, verifies real self-address mail and typing; optionally add subscription link to website footer. Do not downgrade to old consent protocol or delete private consent/token history.

## v0.3.47 — Campaign geography and graphs (17 Nov 2026)

User requested a map of where marketing opens are observed and nice graphs, accessed inside POS. GitHub main remains3fb26375a27e200487977c86ddb1d4754c546940 (v0.3.45), so this source overlay includes all v0.3.46 changes as well. No user Git operations/deployments/real emails/provider lookups performed. Schema34 adds nullable activity location_json and a send/time index. Old events stay unknown, never backfilled from customer addresses or invented IP history.

New CampaignDashboard under CampaignActivity: local Natural Earth public-domain SVG outline, pan/zoom/World/U.S. mainland, open/click markers, keyboard selection, daily trend, hourly histogram, engagement rings, top locations/table and Excel data export. Period7/30/90/all, timeZone America/Chicago; observes distinct sent tracked recipients vs request event counts. Unknown geography counts remain in totals. Analytics paired API validates periods/campaign IDs, groups local events, ignores invalid stored geo as unknown and retains coarse location/provenance. Sync uses existing immutable event IDs and validates optional geography; provider health is redacted. No map CDN/tiles, no new npm dependencies. Actual Windows interaction remains unverified; user must run self-only test.

New public geography.php with optional private geo_enabled=false/key defaults. User must supply their own IPGeolocation.io key (official docs verified free Developer commercial eligibility1000/day at preparation). Fixed HTTPSv3 endpoint, TLS checks/no redirects,700ms connect/1500ms total, no live external calls in tests. Explicit lookup opt-in and disclosure that provider transiently receives request IP. Stored activity only rounded0.1° city/region/country/code/source/coordinates; cache stores daily HMAC identity with no raw IP/key/full provider response, expiry24h (failure5min). Default900/day app cap max1000 including failed attempts. Defaults ignore all forwarded headers; only CF-Connecting-IP from explicit trusted CIDRs accepted, public/private IP validated. Provider failures/cache/quotas cannot break fixed click redirects; unknowns still count. Lookup outside activity transaction, with suppression/dedup recheck before recording, so confirmed opt-outs still stop new collection. Prior PHP tables/tokens preserved.

Public package now5files including subscriptions.php/geography.php; restore custom configPath after upload, keep same private database/key. GEOGRAPHY-SETUP.md is the primary new guide, CPANEL-SETUP.md retained updated release commands for consent/re-subscribe. New MAP-DATA-NOTICE.md records Natural Earth source/license and provider limitations. Existing unsubscribe/re-subscribe/typing improvements remain. Existing links can collect new location if geo enabled, but no old activity can be reconstructed. Don't treat proxy/forwarded requests as proof of customer's location/reading.

Validation:268 regression checks, typecheck/build, real PHP HTTP suite, mocked-provider geography validation/cache/IP/CIDR/budget tests and real PHP-to-POS integration with an explicitly injected coarse geography fixture and mocked SMTP. Actual API credentials/network/cPanel/Windows behavior requires user verification. Next: user applies cumulative update, uploads5publicfiles preserving private path, obtains optional providerkey and enables private config/cURL, then self-only campaign checks map/graphs/consent.

## v0.3.48 — Intermittent typing lockup and ghost process (18 Nov 2026)

User reports app sometimes stops accepting text everywhere and closing leaves it alive until killed; trigger unknown. Verified GitHub main73e3634867bb8c6fefd7c21d41d3dd3d9266a9f2 (v0.3.47). Investigation found real failure paths: unbounded hidden print window/callback, serial shutdown waits with no cancellation/deadline, synchronous full snapshot integrity check on Electron main, and browser-native confirmation calls throughout UI. Exact Windows lockup not reproduced; do not claim definitive root-cause proof. All changes source overlay on main; no commit/push/tag/deployment/live-PC data change. No cPanel change, no schema change (34).

Replaced31 global confirm calls across21 screens using scope-aware TS AST edit; Sell's two local payment helper functions named confirm are untouched. createDialogQueue + ApplicationDialogs uses HTML dialog.showModal in the renderer, no separate native JS popup, Cancel initially focused, Escape cancels, focus restored, duplicate requests denied, stale responses ignored, pending prompts cancelled on closing. Root host mounted alongside App. Async conversions preserve confirmation guards, payment/deletion/consent actions. Dialog key events do not leak to sale shortcuts. Print manager creates non-focusable hidden windows, deadline30s covering load + print callback, exactly-once completion, always destroy, cancellation during quit and no auto-reprint. Sale commits remain independent of printing.

Quit controller covers close/Alt+F4/before-quit/updater quit, prevents main window disappearing during cleanup, shows Closing banner/title, single cleanup,20s fallback with max250ms log flush. Stops bridge and server in parallel, aborts background HTTP including bodies, stops schedulers together, closes raw SMTP sockets, HTTP close1s grace, then DB. Soft fallback handles stalled async tasks, not a totally blocked native main thread. SMTP uses nodemailer's documented getSocket hook with tracked raw TCP sockets; nodemailer still performs configured SSL/STARTTLS/cert validation. No custom auth/TLS bypass. Real local SMTP success + stalled greeting teardown verified; real provider TLS not tested. BackgroundIO pause/resume and SMTP resume ensure safe restart/tests. QuickBooks bridge timeout and upstream teardown prevent remote idle clients holding close.

Backup verification moved to separate src/main/backupVerifier.ts worker. electron.vite.config.ts now builds index and backupVerifier entry, installer must include out/main/backupVerifier.js. scripts/test.cjs also builds matching worker using Electron ABI. SQLite online backup still yields100pages/step; unpublished snapshot integrity/journal cleanup is in worker. Manager.stop(cancel=false) retains wait semantics for explicit callers/tests; stopServer passes cancel=true and waits cancellation before closing DB. Aborted partial never published; last verified backup retained. Native worker termination is awaited before removing its snapshot.120s verification cap; app quit fallback protects pathological shutdown. No restore or live-data test performed.

Help adds explicit Restore keyboard focus (blur/focus/webContents focus) and Open diagnostic logs. Logs under userData/diagnostics/application.log, rotate1MiB+previous; sanitized lifecycle/backup durations/main-loop delay/print events and renderer responsiveness, no customer/payment/credentials/URL contents. If recurrence, ask user time + server/till role and that log. New preload methods for focus/logs/closing event.

Validation282 checks + typecheck + build: print missing callback/load, duplicate/stale/cancelled confirmations, quit idempotence/deadline, real hanging HTTP socket, abort controller, real loopback SMTP and greeting cancellation, real worker SQLite integrity with main-loop timer progressing, worker/backup cancellation, all existing financial/stock/QB tests. Optional Chromium DOM/focus test supplied, but runtime blocked AF_UNIX process-singleton socket so it was NOT validated here. Do not report browser/Windows pass. Actual Windows X/Alt+F4, focus after Cancel/Continue, hardware printing, live SMTP TLS and installer quit require user testing. No real external mail. Next: user applies v0.3.48, updates server/tills, runs Windows checks; inspect diagnostics if freeze persists. npm run dev watcher requires Ctrl+C even after Electron exits.
