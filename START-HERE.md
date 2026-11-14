# DiamondPOS v0.3.28 — QuickBooks transaction sync queue

Apply this source update over your working v0.3.27 project. Baseline: main 4ec86549. No database migration or new dependencies are required.

## Apply and test locally

Close the POS and any development instance. Extract this ZIP. Copy everything **inside** `DiamondPOS-update-v0.3.28` into your existing Git project folder, merge folders and replace matching files. Keep `.git` and all other project files.

In PowerShell from your actual project folder:

```powershell
npm run typecheck
npm test
npm run build
npm run dev
```

Use `npm.cmd` if required by PowerShell policy.

## Using the queue

Open **Sync with QuickBooks**. Transaction sync queue is near the top, above the connection/account setup sections.

- Every POS transaction is represented, including those not yet examined by Web Connector.
- Filter by Waiting, Synced/entered, Failed, Manual entry needed or Excluded; search by receipt/customer/QB number or date range.
- Each page has 50 rows. Select eligible Waiting/Failed rows, then click **Queue selected for sync**. Select-all only selects eligible rows on the current page. Changing page/filters clears the selection.
- This prepares the next connector run. Click **Update Selected** in Web Connector or wait for Auto-Run. Normal sales remain automatic.
- Queueing does not enable sending or fix missing mappings. If sending is off, it stays off until you enable it.
- Synced/entered-by-hand transactions cannot be resent with this action. Refunds, zero-total exchanges, split/missing/mismatched payments and legacy daily overlaps remain manual reconciliation cases. Before-start, future-dated and noncompleted sales stay excluded. There is no new hold/release feature.
- Queue changes are blocked during an active connector session. If a selection became synced or ineligible, the whole action is rejected; refresh and select again.
- Existing export reference numbers and remote duplicate checks remain in place. Marked-by-hand transactions are labelled Entered by hand rather than claiming QuickBooks confirmed them.

The existing export history, Retry/manual-entry controls and connector log remain below. A manual exception without an export record will appear in that history after the connector examines it; until then the queue explains its restriction.

## On-PC checks

Create a small test sale and confirm it appears as Waiting before the connector examines it. Select it and queue it, then run Web Connector: it should become Synced. Run the connector again and confirm no duplicate. Check that synced and refund rows cannot be selected. Try search/date filters and confirm failed transfers can be queued after fixing their cause.

Automated tests cover the data/action safeguards and mocked connector behavior; visual operation of the new screen in Windows and a live queue-to-QuickBooks run still require your checks.

## Commit and publish on main

Review first:

```bash
git branch --show-current
git status --short
git diff
```

After checks pass, on main:

```bash
git add -A
git commit -m "v0.3.28: QuickBooks transaction sync queue"
git push origin main
git tag v0.3.28
git push origin v0.3.28
```

Do not overwrite an existing tag. If v0.3.28 already exists, choose the next unused version and match the changelog heading before tagging.

Wait for the GitHub Release workflow to finish. Update **Store Server first, then tills** via POS Updates: the new screen needs the new server endpoints.

## Validation

47 Electron/SQLite regression checks passed, plus TypeScript checks and the production build. These include all prior checkout/backup/sync checks and new queue eligibility, idempotency, stale selection, transaction atomicity, date/filter/pagination, session-lock and authorization checks. The backup suite deliberately logs one simulated failure.
