# DiamondPOS v0.3.29 — serialized equipment and work-order stage colors

Apply over your working v0.3.28 project. Baseline: main c3e58baa. No new dependency or database schema migration is required. Receiving remains quantity-only; serials are entered when sold.

## Apply and run locally

Close the installed POS and any development app. Extract the ZIP. Copy everything **inside** `DiamondPOS-update-v0.3.29` into your existing Git project folder, merging folders and replacing files. Preserve `.git` and other existing project files.

In PowerShell from that project folder:

```powershell
npm run typecheck
npm test
npm run build
npm run dev
```

Use `npm.cmd` if PowerShell blocks npm scripts. The tests intentionally log one simulated backup failure.

## Serialized checkout checks

- A product marked **Use Serial #** needs a serial number. Every sale line carrying a serial requires a customer, even if Use Serial # was not set on that product. One serialized unit per line, maximum 80 characters.
- The Store Server enforces these independently of the till. Old held receipts missing a serial should be corrected by removing/rescanning that item before payment.
- Duplicate matching is store-wide, ignores letter case and trims leading/trailing spaces. Internal spaces/punctuation remain meaningful. Duplicates within the same cart or against completed, unreturned sales are blocked.
- A receipt-linked return permits resale and retains the previous customer/equipment record as inactive while creating the new sale/customer association. A linked return and resale can occur on one exchange.
- A no-receipt return cannot identify/release an original sold serial. If resale is blocked, find the original receipt and reconcile the return; do not bypass by editing equipment activity flags. Historical transactions are not rewritten.

Test a serialized item without a customer, a valid customer/serial sale, a duplicate serial (including different case), and return/resale. Existing checkout retries remain idempotent.

## Equipment lookup

Open **Work Orders → Find equipment by serial**. Scan/type the full serial. The results show associated customer, linked sale receipt, and recent service tickets. Previous/inactive equipment records remain visible. Limits: up to 100 matching unit records and 50 recent tickets per unit. Click a receipt or ticket to inspect it.

## Stage colors

Open **Work Orders → Work order settings → Stage colors**. Each stage has a color picker and preview. Save settings to apply. Reset stage colors restores defaults when saved.

Colors apply to Work Orders list/filter badges and ticket current-stage indicators. Text automatically chooses black/white for readability; names remain visible. Settings are shared on the server. Other tills refresh these colors within 30 seconds while the list/ticket is open, or when reopened. Workflow stages, stock rules, printed documents and email templates are not changed by choosing a color.

Test a very light and very dark color, Save, reopen the list and ticket, and verify a second till sees the setting. Run the color picker and scanner workflow on Windows; that visual/hardware check has not been performed here.

## Commit and release from main

In MobaXterm in your actual project folder, review:

```bash
git branch --show-current
git status --short
git diff
```

After checks pass, on main:

```bash
git add -A
git commit -m "v0.3.29: serialized checkout safeguards and work-order stage colors"
git push origin main
git tag v0.3.29
git push origin v0.3.29
```

Do not overwrite an existing release tag. If v0.3.29 exists, choose the next unused version and match the changelog heading before tagging.

Wait for GitHub Release to finish. Update **Store Server first, then every till** via POS Updates. The serial checks, lookup endpoint and shared color settings require the new server.

## Validation

56 regression checks passed with Electron and real SQLite, including all previous checkout/backup/sync queue checks. New checks cover serial/customer requirements, duplicate rejection, linked unit/receipt records, legitimate resale/exchanges, color validation/defaults/contrast/persistence, settings sharing and authenticated serial lookup. TypeScript checks and production build passed. Real Windows visuals, scanner and cross-till color refresh still need your local checks.
