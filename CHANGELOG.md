# What's new in Diamond POS

Each release has a section below. The section for a version is shown on the **Updates** screen in the app,
so staff can see what an update changes before installing it. Write it for the people using the tills.

How to write a section (newest at the top):

```
## v1.2.3 - 6 Nov 2026
> Update the Store Server PC first.        <- only when the release changes the database
- What's new, in plain words
- Fixed: what was wrong
```

---

## v0.3.61 - 24 Nov 2026
- Service texts can be selected directly on an estimate or ready-for-pickup notice. Removed the separate customer-page opt-in checkbox and extra permission confirmation. Texts remain manually selected and sent; provider STOP handling still applies.
- Verify existing customer details at the kiosk: open the customer, save any edits, then select Verify customer on kiosk. The customer can accept the contact details or edit and save them to the same customer record.
- Kiosk verification shows contact details only, protects staff-only information, detects conflicting staff edits and clears displayed details after finishing. Reload the kiosk page after updating.

## v0.3.60 - 23 Nov 2026
- Match each checkout tax location/rate to its own QuickBooks sales tax item. Exmark customer-location sales keep the tax rate saved on the sale when sent to QuickBooks.
- Missing, removed or mismatched tax mappings show a clear problem and prevent adding the sale or account invoice with the wrong rate. Correct the mapping and retry; already confirmed transactions are not resent.
- Historical tax rates remain available for mapping after checkout rates are edited. QuickBooks preview shows the actual mapped tax item.
- Separate Sales and Labor income account settings. Work-order labor and items assigned to Service Labor use POS Labor; parts, merchandise and fees continue using POS General. Blank Labor retains the existing general mapping.

## v0.3.59 - 23 Nov 2026
> Update the Store Server PC first.
- Customer billing address prints by default when a customer with an address is selected, including serialized-unit purchases. Walk-in receipts omit it.
- Customer address is selectable and movable in Receipt Designer; it can be hidden or limited to serialized purchases if needed.
- New receipts save the address at checkout so later customer edits do not change it. Older receipts use the current customer address because they have no saved address snapshot.

## v0.3.58 - 23 Nov 2026
- Adjusted Windows-dialog receipt layout to fit the Star driver's printable area, with narrower margins and wrapped long item descriptions.
- Windows-dialog receipts use bold Arial and larger ordinary text to improve faint thermal output. This applies to test receipts and saved-sale receipts using that mode.

## v0.3.57 - 23 Nov 2026
- Added Test receipt using Windows dialog and an optional saved Windows-dialog receipt mode for drivers that accept silent jobs but print blank.
- This mode shows the receipt and uses Windows printer preferences without forcing a custom paper size. Normal receipt, label and full-page defaults remain available.

## v0.3.56 - 23 Nov 2026
- Fixed receipt printing stopping with “Script failed to execute” before reaching Windows. The isolated print window now allows the receipt measurement step to run.
- Test-print progress and errors appear near the test receipt button as well as at the top of Printing settings. Buttons show when a test is running.

## v0.3.55 - 23 Nov 2026
- Updated thermal receipt printing to wait for receipt rendering and send an explicit page width and measured length to Windows. This addresses a possible cause of blank feed-and-cut receipts on the Star TSP100.
- Empty or oversized receipt rendering now shows an error before printing. Test receipts and saved-sale receipts use the same sizing path.

## v0.3.54 - 20 Nov 2026
- Simplified QuickBooks income setup to one POS General row. Vendor/department income rows are removed.
- Future sales and work-order exports use the selected default income account. Existing QuickBooks transactions stay unchanged; sales tax reconciliation remains in place.

## v0.3.53 - 20 Nov 2026
- Fixed taking payment for Ready for Pickup work orders when an online estimate was unsent, pending, failed or no longer matched the current bill. You do not have to send another approval message just to collect payment.
- Home backup status now displays your saved backup frequency and the actual next scheduled run instead of always saying 15 minutes. Last verified time and running state come from the Store Server.
- Checkout charges the current bill and leaves online approval history unchanged. Earlier-stage and already-closed tickets still cannot be rung up as repairs.

## v0.3.52 - 20 Nov 2026
> Update the Store Server PC first.
- Fixed Work Order Settings showing “Work order not found” instead of the Mobile Text Alerts API-key fields.
- Added “OK to text service updates” in customer Contact Info, separate from marketing email permission. Existing customers default to off. Texting requires this saved permission, even if someone checks Text in the send dialog.
- Changing the phone/mobile number clears permission until it is confirmed again. No automatic messages are sent.

## v0.3.51 - 20 Nov 2026
> Update the Store Server PC first.
- Send estimate approvals and ready-for-pickup notices by Email, Text, or both. Configure Mobile Text Alerts in Work Order Settings; replies are not monitored. Customers approve or decline through the estimate link.
- Each channel shows its own send result, with protection against duplicate requests. An uncertain result requires checking the provider before resending.
- Add an unpaid estimate fee to the work-order bill, change its amount or waive it. A declined repair can charge only that fee; upfront fee credits still work as before.
- Customer suggestions appear while typing at least two characters in Make a Sale.
- Includes the held-sale cancellation fix from v0.3.50.

## v0.3.50 - 20 Nov 2026
- Fixed Cancel sale after recalling a held receipt: confirmation now cancels the saved hold and releases its reserved stock, instead of leaving it in Held Receipts.
- The sale screen clears only after server confirmation. Retrying a lost reply cannot return inventory twice. Completed sales still require the existing void process.

## v0.3.49 - 20 Nov 2026
> Update the Store Server PC first.
- Redesigned Make a Sale with top scanning/customer search, a full-width item grid, bottom payments, Cancel sale and Take payment on account. Removed Quick Picks.
- Added internal cost columns and Alt lookup on receipts, with a receipt-layout checkbox and saved lookup values for new receipts.
- New card payments offer Credit or Debit; earlier card-brand information remains intact.
- Added On the Bench, mechanic assignment/settings, and customer-visit groups such as 1 of 4 work orders.
- Receiving now flags matching work orders waiting on parts, with ticket links and remaining-shortage information.
- Added Auto fit and per-computer display sizes for scaled Windows screens.
- New website estimate responses pulse in the header until opened, with an unread list retained across restarts.
- Includes the earlier input-focus, backup-worker and shutdown fixes from v0.3.48.
- Store testing still required for the new layout and physical printers. The Citizen blank-receipt problem is not confirmed fixed. Work-order texting is not included yet.

## v0.3.48 - 18 Nov 2026
- **Typing/focus:** confirmations now stay inside the POS instead of browser-native popups. Cancel/Escape safely cancels, and focus returns after the prompt.
- **Printing:** hidden print windows cannot take keyboard focus, have a timeout and are always cleaned up. An unresponsive printer cannot leave an invisible window keeping the app open.
- **Closing:** closing/Alt+F4 stops background connections and timers together, shows Closing while cleanup runs, and has a bounded fallback instead of waiting indefinitely.
- **Backups:** snapshot integrity checks run on a worker thread. Shutdown can cancel an unfinished unpublished backup while keeping earlier verified copies.
- **Help:** Restore keyboard focus and Open diagnostic logs provide recovery information if an intermittent lockup happens again. No financial workflow, database schema or cPanel update required.

## v0.3.47 - 17 Nov 2026
> Update the Store Server first, then tills. Upgrade all cPanel marketing files, preserving private data and the configured path. New map markers require optional private geolocation setup.
- **Campaign insights:** interactive world/U.S. mainland map of approximate request locations, with open/click markers, zoom, pan and location details.
- New graphs for daily opens/clicks, Central-Time activity by hour, recipient engagement and top locations. Choose7/30/90 days or all time; export report data to Excel.
- Totals distinguish mapped activity from unknown locations. Older opens without stored geography stay unknown; no customer-address guesses are added.
- Optional private IPGeolocation.io lookup uses coarse coordinates, caching, a daily cap and safe unknown-location fallback. Location/provider issues do not drop ordinary tracking counts.
- Includes previous confirmed re-subscription and typing improvements. Consent checks, tests/transactional separation and old link functionality remain in place.

## v0.3.46 - 17 Nov 2026
> Update the Store Server first, then all tills. Upgrade the cPanel marketing service, preserving the private configuration/database and your configured path.
- **Subscribe again:** customers can request an email confirmation on the website, or staff can request one from a saved customer. Permission returns only after the customer explicitly confirms a valid link.
- Confirmation links expire after 24 hours. Newer opt-outs invalidate old links; imports and checkbox changes still cannot override an unsubscribe. Old skipped campaign messages are not resent.
- Uses your existing SMTP account while the Store Server is running. Settings → Email shows request delivery/audit and recent confirmed permissions. No new customer is created by the public subscription form.
- Consent replay distinguishes restored history from new opt-outs, protecting newer confirmed choices. Confirmation mail and customer consent changes have durable audit/retry safeguards.
- **Campaign typing:** preview updates follow a brief typing pause. List/status refreshes omit full flyer images; existing-draft loading and audience refreshes no longer overwrite newer input/choices.
- Saving unrelated customer edits from an older open window preserves a freshly confirmed marketing permission when its checkbox/email were unchanged.

## v0.3.45 - 17 Nov 2026
> Update the Store Server first, then all tills. Upgrade the existing cPanel marketing service and preserve its private configuration/database.
- **Service-history audiences:** target customers with any service, mower, handheld or other equipment work orders. Choose completed-only or include in-progress jobs, with check-in date and customer-type filters. No purchase is required.
- **Delete old campaigns:** remove drafts or finished/stopped campaigns with confirmation. Active/in-flight sends are protected; customer unsubscribe history and old emailed links are preserved.
- **Campaign activity inside Marketing:** see recipients with detected opens and clicks, first/latest timestamps, observed counts and links clicked. Filter recipients and export results to Excel.
- Campaign list shows distinct engaged recipients out of tracked messages sent. Older messages are marked untracked; no activity is inferred retroactively.
- The website collects events and the Store Server syncs about once a minute. Manual sync and history replay preserve accurate counts across retries/restores.
- Tracking is enabled for future campaigns and can be turned off in Settings → Email. Tests/previews, work-order messages and estimate emails remain separate and untracked.
- Open detection is estimated. Image privacy features and security scanners affect results; no detected open does not establish unread mail. Forwarding/deleting cannot be identified.
- Keeps existing unsubscribe links and suppression safeguards. Confirmed unsubscribes stop future engagement collection for that address.

## v0.3.44 - 17 Nov 2026
> Update the Store Server first, then every till. Upload/configure the new cPanel service before sending marketing campaigns.
- **Website unsubscribes:** marketing emails include a confirmation link. Confirmed opt-outs stop future marketing and automatically clear OK to email on all matching customer records.
- **Settings → Email:** consent-service setup, sync status, recent unsubscribes, history replay and an eligible-contact CSV export.
- Customer imports and checkbox edits cannot overwrite saved unsubscribes. Queued campaigns check consent again before each message; skipped recipients are shown separately. If the website check fails, campaigns pause instead of sending unchecked.
- Staff opt-outs sync to the website when connected. Repair estimates and work-order emails remain separate.
- Includes a standalone cPanel PHP/SQLite consent service and setup guide. A website campaign dashboard and tracking integration are future work.

## v0.3.43 - 16 Nov 2026
- **Customer Equipment:** open a customer to see their existing units, including equipment checked in for repair even if it was not bought at Diamond P.
- Expand a unit for brand, model, serial number, hours, notes and purchase information. Purchase receipts open through the existing receipt view.
- Shows active and completed work-order history per unit. Open a ticket for read-only problem/diagnosis/work-done/charge/history details; make changes and take payment from Work Orders.
- Refresh equipment to pick up newly created units/tickets while the customer window is open. Uses existing links and creates no duplicate units or stock movements.
- The equipment addition needs no new database migration. Update the Store Server first for its new read-only endpoint, then tills. This source package also includes v0.3.42 End of Day and migration 30 if not yet installed.

## v0.3.42 - 16 Nov 2026
> Update the Store Server PC first, then all tills.
- **End of Day is now live:** the existing Home icon opens a QBPOS-style store summary and drawer reconciliation. Also available from Reports → End of Day & receipts and the optional navigation entry.
- Sales, returns, tax, account charges, tax-exempt totals, recorded price reductions given/returned, payment-method totals, card brands, account payments, voids, noncash detail and per-till totals.
- Enter opening/counted/leave cash, optional other cash movements with notes, terminal/check totals and your name. Calculates expected cash, over/short and cash deposit. Choose one till or all tills.
- Saves fixed numbered closeout snapshots with retry protection. Later changes require a new snapshot; stale previews must be refreshed. Print full-page reports or export Excel manually.
- Business sales use the selected sale date; drawer money uses actual entry dates and void reversals use actual void dates, so backdated/future sales do not distort today's cash count.
- Migration 30 adds saved closeout records. Reporting does not reset/lock the day, settle cards, run QuickBooks sync or print automatically. No website upload needed.

## v0.3.41 - 16 Nov 2026
> Update the Store Server PC first, then all tills.
- **Sale date and time:** checkout defaults to now. Tick Choose sale date and time to record the day/time of an open-house sale, including a past or future date.
- Receipts, sales history, daily/ad hoc reports and QuickBooks transactions use the selected business date. The actual time entered is retained separately and shown in sale details; ad hoc Sales reports can include Entered at and Sale time.
- Held tickets remember their chosen date. Completed tickets keep their original saved date; retrying a checkout does not change or duplicate it.
- Future-dated sales and account invoices wait until the selected day for QuickBooks sync. Completing a sale still takes payment and deducts inventory immediately; use Hold if it is not ready to complete.
- Migration 29 preserves existing dates and backfills their entry timestamps. This feature does not automatically apply an event discount or alter already synced sales. No website upload needed.

## v0.3.40 - 16 Nov 2026
- **Settings → Backups:** choose every 15 minutes, 30 minutes, hour, 4 hours or 24 hours; choose 1–365 recent copies to keep. Defaults are hourly and 12 copies.
- **Back Up Now** creates and verifies a Store Server snapshot. See the last successful backup, next scheduled time, server folder, file count, size and errors from any connected till.
- Older managed copies are removed only after a new snapshot passes integrity verification. Scheduled, startup and Back Up Now snapshots share the retention limit. Pre-migration backups and other files are kept separately.
- The first successful backup after updating can clean up old scheduled backups down to the retention limit. Changing settings alone does not delete files. Cleanup failures are shown separately from backup failures.
- The Home backup-overdue indicator follows the configured frequency. Backups still require the Store Server POS to be running and are stored on that PC; keep another copy off the server.
- No database migration or website upload needed. Update the Store Server first, then tills.

## v0.3.39 - 16 Nov 2026
- **Choose your import columns:** select which spreadsheet column fills each POS item field, with sample values and a preview before saving. One source column can fill more than one field; unmapped fields stay unchanged on updates.
- **Customize Item List columns:** right-click a heading or choose Columns to show/hide fields, move a column left/right, or reset the layout. Choices are saved on that computer.
- **Bulk test-data cleanup:** Item and Customer lists now have Select shown, Select entire list and Clear selection. Entire-list selection includes inactive records and records beyond the 500-row view. Delete selected confirms the full count, including selections outside the current search.
- Items/customers with linked sales, work orders or open held receipts are made inactive; items on receiving records are also retained. Unlinked records are deleted. Export/back up before deleting.
- Fix names and tag descriptions by updating matching Item No./UPC records without deleting them. Keep stock quantities unmapped unless you want to replace them. No database migration or website update is needed; update the server and tills.

## v0.3.38 - 16 Nov 2026
- Printing is now manual. Work-order check-in and adding items do not automatically print a label, and completing a sale does not automatically print a receipt.
- Use **🏷 Label** on a work-order ticket or **Print receipt / Reprint last receipt** on Sell. Existing printer choices, designs and copies are preserved.
- Removed automatic-print options and ignore previously saved automatic-print settings. No database migration or website update is needed. Update all PCs for consistent behavior.

## v0.3.37 - 15 Nov 2026
> Update the Store Server PC first, then all tills.
- Enable customer accounts and payment terms. Charge sales to account as unpaid QuickBooks invoices; receive payments against oldest outstanding POS invoices and sync them as QuickBooks customer payments.
- View invoice balances, payment history and sync errors from the customer account window or QuickBooks account sync panel. Retry protection checks invoices and payments before posting duplicates.
- Held sales and work-order parts now reduce available stock immediately. Removing/deleting/declining restores allocations; checkout does not deduct twice.
- Migration 28 allocates existing open holds and previously unallocated work-order parts. Review available stock after updating. Back up first.
- Account balances cover POS-created invoices. Account credit/void/refund synchronization, overpayments and payment reversals are not included; reconcile account adjustments in QuickBooks. Send invoices from QuickBooks.
- No cPanel update is needed. Validate the invoice/payment workflow in your QuickBooks test company before use.

## v0.3.36 - 15 Nov 2026
- **Editable check-in estimate fee:** new work orders start with the configured fee for the selected unit category. Change the amount for that ticket, use **No fee** to waive it, or **Use default** to restore the configured amount.
- Check in and collect the adjusted amount immediately, or collect later. A zero fee needs no fee collection. Per-ticket changes are recorded in history and do not change the settings defaults or existing work orders.
- Invalid amounts are rejected before saving. No database migration or approval-website upload is needed. Update the Store Server before tills so it accepts the new per-ticket fee field.

## v0.3.35 - 14 Nov 2026
> Update the Store Server PC first.
- Removed **On the Bench** from work-order stages, progress indicators, stage colors and email-template choices.
- **Approved to Fix** now leads to **Waiting on Parts** or **Ready for Review**. Waiting on Parts can return to Approved to Fix or proceed to review; rework from review returns to Approved to Fix.
- Existing On the Bench tickets move to Approved to Fix during the update. Parts already deducted stay deducted, and original work-order/email history is retained with the old stage clearly marked retired.
- Migration 27 records the move in each affected ticket's history. Existing online estimate approvals and website setup continue unchanged.

## v0.3.34 - 14 Nov 2026
> Update the Store Server PC first.
- **Customer estimate decisions:** a separate PHP/cPanel approval page lets customers review an itemized estimate and confirm Approve or Decline. Each link belongs to one revision, expires after 30 days, and never takes payment.
- **Waiting on Customer:** a successfully sent estimate starts this stage and the follow-up timer. Parts stay in inventory until approval. The Store Server collects decisions from the website every minute while open, including responses recorded while POS was closed.
- **Call reminders:** Work Order Settings includes an enabled-by-default customer-call flag after 3 calendar days (adjustable 1–90). Overdue tickets have a badge and filter. Record a call/contact note and schedule the next reminder. No response is automatically approved, declined or cancelled by the timer.
- **Revision protection:** changed estimates need new approval. Conflicting/stale responses require staff review. Approved repairs with changed details/totals cannot be checked out against an older approval. Manual decisions and repeat syncs retain their audit history without duplicate stock movement.
- **Staging setup:** the upload package targets oho.staging.tulsapickem.com/pos-approval. Online approvals stay disabled until the private configuration/key is installed, the website identity is tested, and the setting is explicitly enabled. No site files were uploaded automatically.
- Includes the v0.3.33 shortage notice for estimate emails, including the new Waiting on Customer estimate template.
- Migration 26 adds estimate revisions and follow-up audit data. Existing work orders/templates remain available; no previous email is assumed to be a pending online estimate.

## v0.3.33 - 14 Nov 2026
- **Estimate email parts notice:** when required stock is short, estimate and repair-approval emails automatically name the parts that will have to be ordered and explain they could take a week to arrive.
- The notice checks the full required quantity, combines repeated lines for the same part, and counts stock already allocated to the ticket. It appears in both HTML and plain-text messages, including customized templates with the bill turned off.
- Stock is checked again for each preview/send. When enough stock arrives, the ordering notice is omitted. Pickup/declined-repair messages keep their existing wording. No database migration or template reset is required.

## v0.3.32 - 14 Nov 2026
> Update the Store Server PC first.
- **Reports:** Sales, Inventory and Receiving report library with 13 ready-made reports. Build custom reports with chosen columns, filters, date periods, grouping and sorting. Save definitions for all tills, export Excel/CSV, or print full-page reports. Daily closeout and receipt reprinting remain available.
- **Audited voids:** open an ordinary completed sale and choose Void sale. A reason, operator name and payment-handling confirmation are required. The original receipt stays marked VOID, stock is restored once, and voids are excluded from normal sales totals. A separate Voided sales audit report keeps the history visible.
- **QuickBooks void corrections:** never-exported receipts stay excluded. Exported/uncertain receipts are checked, voided through Web Connector, and verified before being marked confirmed. Pending/failed corrections stay visible in QuickBooks and the Home status counts. This does not operate the standalone payment terminal.
- **Receiving tags:** tag selection opens after posting, using freshly loaded item prices. A prominent Print tags for received items button is available when reopening a posted voucher.
- **Freight:** Add freight to item cost starts unchecked for new receiving vouchers. Saved vouchers retain their allocation preference; freight still appears in voucher totals.
- **Item cost comparison:** item windows show the latest received unit cost, current inventory average, and lifetime quantity-weighted receiving averages with/without allocated freight. Lifetime averages use all posted receiving history, not only the last 20 displayed lines.
- Migration 25 adds void audit records and stock-movement snapshots for new sales. Older receipts require a stock review. Refunds/exchanges, work-order payments, returned originals and manually entered/legacy daily QuickBooks entries require their existing correction/reconciliation workflow.

## v0.3.31 - 14 Nov 2026
> Update the Store Server PC first.
- **Vendor List:** add, search and edit suppliers for parts and equipment. The editor follows the familiar QuickBooks POS sections: company, contact and address, payment terms, account settings, yellow notes and receiving history.
- **Faster purchasing:** select saved vendors in Item and Receiving forms, or add a vendor directly while working. Mark unused vendors inactive instead of deleting their history.
- Existing supplier names are converted into vendor records automatically. Renaming a vendor updates linked item records and keeps past voucher names intact.
- Payment terms are reference information only. Vendor records do not sync to QuickBooks; the existing sales/customer sync continues unchanged.
- Migration 24 adds vendor records and stable item/receiving links. A database backup is created before upgrading an existing store.

## v0.3.30 - 14 Nov 2026
> Update the Store Server PC first.
- **Item scanning at the top:** the Sale screen's item/barcode search is directly below the sale header, above the receipt. Suggestions open downward. Selected-line actions remain below the receipt.
- **Optional card brand:** choose Visa, Mastercard, Discover, American Express, Other or Unknown for card sales/refunds. The brand appears in sale history and receipts. Card checkout no longer asks for a terminal reference; checks still require a check number. Existing references remain in history.
- **QuickBooks card mappings:** optionally map each card brand to a QuickBooks payment method. Blank mappings use the general Card method and the same deposit account. The brand is included in the sale memo; already-synced transactions are not changed.
- **Cash Drawer button:** enable and configure per PC under Settings → Printing → Cash drawer. Defaults match the COM3 / hello trigger. A manual test button and optional in-app shortcut are provided; nothing opens automatically after a sale.
- Drawer shortcuts default to Button only. If assigning F1, remove F1 from the old Windows shortcut first to avoid duplicate signals. The Help button remains available.
- Migration 23 adds the optional card-brand field to payments. Payment processing remains on the standalone terminal; no card-reader/payment-gateway integration was added.

## v0.3.29 - 14 Nov 2026
- **Serialized sales require a customer and serial number.** Checkout checks are enforced on the Store Server as well as at the till. Serialized equipment stays one unit per line.
- Blocks duplicate serials on the same checkout or already sold on an unreturned completed receipt. A receipt-linked return permits legitimate resale while retaining previous customer/unit history.
- **Find equipment by serial** in Work Orders shows associated customers, linked sale receipts, and recent service tickets, including previous/inactive records.
- **Stage colors:** Work Orders → Work order settings now has a color picker, readable preview and reset option for each stage. Saved colors are shared across tills and used in list/filter badges and ticket stage indicators. Stage names remain visible; workflow rules are unchanged.
- Update the Store Server first, then tills. No database schema or dependency changes. Receiving still records quantities only; serials are captured when sold.

## v0.3.28 - 14 Nov 2026
- **QuickBooks transaction sync queue:** see every POS transaction, including sales the connector has not examined yet. Filter by status, date, receipt number or customer; browse 50 rows per page.
- Select Waiting or Failed transactions and choose **Queue selected for sync**. Web Connector performs the normal duplicate-checked transfer on its next run. Normal sales remain automatic.
- Synced transactions, manually entered transactions, excluded sales and manual-entry exceptions cannot be queued through this action. Selections are rechecked on the server and queue changes wait until an active sync session finishes.
- Shows reasons for failures, start-date exclusions, refunds/split payments and old daily-export overlaps. Transactions marked by hand are labelled separately from QuickBooks-confirmed syncs.
- Sending stays off if it was off; queuing does not enable it or bypass account mapping/start dates. Update the Store Server first, then tills for the new queue endpoints. No schema or dependency changes.

## v0.3.27 - 14 Nov 2026
- **Edit quantity in the receipt grid:** type directly in the Qty box, or use the − / + buttons beside it. Enter, Tab or clicking away saves; Escape cancels. Totals update when the quantity is saved.
- Negative sale quantities open Return details for that item. Zero removes the line. The existing F3 Change qty window remains available.
- Return quantities can be changed directly too; original-receipt limits and one-unit serial rules still apply. Reason, restocking choice and original-price/tax information are retained.
- Work order, credit and fee lines remain read-only for quantity. No database or dependency changes.

## v0.3.26 - 13 Nov 2026
- **Home status at the bottom:** today's sales, cash, card and checks now sit below the Navigator, alongside QuickBooks, database backup and store-server status.
- Shows the last successful QuickBooks sync separately from the last successful connection, plus queued exports, problems and transactions requiring manual entry. Click QuickBooks to open its settings/history.
- Shows the last verified scheduled backup, any latest failure, and an overdue warning after 30 minutes. Last good timestamps remain available after a server restart.
- Refreshes Home status every 30 seconds. If status cannot be confirmed, it is shown as unavailable rather than reporting success.
- Update the Store Server first, then tills, to enable the new status information. No database schema migration is required. Historical success times begin recording after this update; older backups and connector contacts are not guessed to be verified successes.

## v0.3.23 - 13 Nov 2026
- **Always-visible left menu:** switch directly between Sale, Items, Customers, Work Orders and other shortcuts. Choose shortcuts in Settings → Menus → Left menu buttons. Home, Settings and Updates are always available. The in-progress sale stays in memory when switching screens.
- **Return from the Sale screen:** scan or add an item, choose Change qty (F3), and click **− Return** or enter a negative whole quantity. **+ Sale** makes the quantity positive again. Choose the reason and whether it goes back into stock, then apply the return.
- Optionally enter the original receipt number to use its paid price, tax and return limits. Leave it blank for a return at today's regular price, flagged as no receipt.
- Cancel keeps the original sale line unchanged. Positive sale lines and negative return lines can share the same receipt for an exchange.
- Serial numbers are retained on returns without a receipt. Return serialized equipment one unit per line.

## v0.3.22 - 13 Nov 2026
> Update the Store Server PC first, then every till before taking sales.
- Automatic database backups run at server startup and every 15 minutes. Each backup is checked before it is kept.
- Checkout can recover a lost network response without saving the same sale twice. If Recover checkout appears, use Check / retry original checkout; do not take payment again.
- A held receipt can only be completed once, even when two tills recall it.
- Partial returns refund the tax pennies from the original sale consistently.
- QuickBooks now receives individual sales and customer names, instead of daily totals. Customers include a short [DP…] identifier to keep same-name people separate; inventory stays in DiamondPOS.
- QuickBooks sync is switched off once during this upgrade. Review the start date and account mapping before switching it back on. Refunds, zero-total exchanges, split payments and dates with old daily exports are flagged for entry by hand.
- Fixed server startup recovery when another program is using the store port.

## v0.3.21 - 9 Nov 2026
> Update the Store Server PC first.
- **Change a price by clicking it**: on the Sale screen, click the price on a line, type the new price and press Enter. It's for that sale only (the item's price doesn't change). Changed prices show in red with the regular price under them, and the sale remembers the regular price.
- Held receipts keep a changed price.
- **Work orders**: click a line's price on the ticket to change it. When ringing up a repair pick-up, its prices can also be clicked and changed on the Sale screen (the ticket is updated).
- The Price column on the Sale screen is now always shown.

## v0.3.20 - 9 Nov 2026
> Update the Store Server PC first.
- **Receiving** (Home → Receiving History, or I want to… → Receive items): when an order comes in, scan the items, enter the qty and the cost on the invoice, plus vendor, invoice #, PO #, invoice date, who received it, freight and notes. Save it to finish later, or receive it right away.
- When you receive, choose for each item whether to **update its cost** and change its **regular price**. Stock goes up and the **average cost** is worked out again each time. Freight can be added into the items' cost.
- Then it asks to **print tags** line by line: with price, no price, or skip, and how many of each.
- Every receiving keeps its number (RV-000001), date and before/after costs. The item window now shows its **receiving history**.

## v0.3.19 - 9 Nov 2026
- **Delete items and customers**: 🗑 Delete in the item or customer window, or tick several in the list and click **Delete selected**. Ones that are on past sales or work orders are made inactive instead (hidden), so old receipts stay correct.

## v0.3.18 - 9 Nov 2026
> Update the Store Server PC first.
- **Import your QuickBooks Point of Sale inventory export** (Item List → Import from Excel). Every column with data comes in: item number, name, description, alternate lookup, size, attribute, costs, regular price, MSRP, custom prices 1-4, tax code, UPC, order cost, item type, unit of measure, reorder point, print tags, unorderable, serial tracking, commission, rewards, department, vendor, manufacturer and quantity on hand.
- Other columns with data (accounts, order/sell units, case pricing for Unit of Measure 1…) are kept on the item and shown under **Other details** in the item window. Export to Excel writes them back out.
- Items now have **MSRP** and **Custom Price 1-4**. On-hand quantity can have decimals (feet, pounds) and go below zero.

## v0.3.17 - 9 Nov 2026
> Update the Store Server PC first.
- **Import and export customers with Excel** (Customer List). A QuickBooks Point of Sale customer export imports as it is, with every column: name, company, address, phones, alt contact, discount, tax exempt, email and email notification, past due, notes and custom field 1.
- Tax-exempt customers from QuickBooks POS get their Farm Tax ID from Custom Field 1. Importing the same file again updates customers instead of making doubles.
- Customers now have **Past Due $** and **Custom Field 1**.

## v0.3.16 - 7 Nov 2026
> Update the Store Server PC first, then **update every till** (sales tax now works differently).
- **Sales tax is now added at checkout**: shelf prices are before tax, and the Sale screen shows Subtotal, Sales tax and Total. Receipts, reports, returns and QuickBooks all follow. Sales made before this update keep their old (tax-included) amounts and are refunded the old way.
- **Several tax rates** (Settings → Taxes): add rates such as each county, choose the default, and pick a different rate for a sale from the tax line on the Sale screen.
- **Work order label**: when a unit is checked in, a label prints on the Zebra with the customer's name, work order #, date checked in and a barcode (🏷 Label on the ticket prints it again). Its design can be changed in the Label Designer.
- **"I want to…" menu** at the top left replaces the Home button: jump straight to making a sale, a return, held receipts, checking in a repair and more. Choose what's in it, and the Home screen buttons, in **Settings → Menus** (per computer).

## v0.3.15 - 6 Nov 2026
- **Choose the printer every time**: when a receipt prints, a window asks **Receipt** or **Full page**, and which printer. The usual choice is already picked (Enter prints it). Can be switched off in Settings → Printing.
- **Drag-and-drop Receipt Layout**: the top and bottom of the receipt are now drag-and-drop areas like the Label Designer (store name, address, logo, receipt #, customer, your own text, barcode, signature…). The middle (items, totals, payments) is a list you tick and reorder. Receipt layouts from v0.3.13 keep their middle settings and get the standard top and bottom.
- **Help: "Kiosk tablet won't connect"** step-by-step checks, showing this store's real server address.

## v0.3.14 - 6 Nov 2026
> Update the Store Server PC first.
- **Held receipts**: build a sale ahead of time (e.g. a part was ordered) and press **F6 Hold receipt** with a note. When the customer comes in, open it from **F6 Held receipts** on the Sale screen or **Held Receipts** on Home and take payment. Any till can open it; items load at today's price.
- **Type-ahead**: start typing an item # or description on the Sale screen and matching items pop up. Pick one with the mouse or ↑ ↓ and Enter.
- A red **✕** at the left of each line removes that item. The **Clear sale** button is gone (F6 is now Hold receipt).
- **Cost** can be shown as a column on the Sale screen (right-click the column headings).

## v0.3.13 - 6 Nov 2026
> Update the Store Server PC first.
- **Label Designer** (Settings → Label Designer): build your own tags. Add the item name, price, item #, UPC, department, barcode, your own text and more, then **drag them where you want** and resize them on the label. Make as many label designs as you need.
- **Two kinds of tags**: one design for items **with a price** and one for **parts with no price** (bin labels). Choose them per till in Settings → Printing; the right one is picked automatically when printing tags, or choose one for a print.
- **Receipt Layout** (Settings → Receipt Layout): pick what prints on receipts (logo, address, customer, items, totals, payments, your own text such as a return policy, signature line…), **drag the blocks into order**, and set the text size and alignment, with a live preview.
- Receipts can print a **barcode of the receipt number**; scan it on the Return screen to find the sale.

## v0.3.11 - 6 Nov 2026
> Update the Store Server PC first.
- **Check payments**: new **Check** button on the Sale screen. It asks for the check number, which prints on the receipt. Checks show on the daily report and go to QuickBooks as their own daily Sales Receipt (map them on the QuickBooks screen).
- **Printing setup** (Settings → Printing), set on each computer:
  - **Receipt printer** with paper width, copies and **automatic printing** after each sale.
  - **Full-page (laser) printer**: sales with a serial-numbered unit and work order receipts print on a full Letter page with the customer's details, serial numbers and a signature line.
  - **Zebra label printer** for **price tags** with barcodes: 🏷 Print tags on the Item List or 🏷 Tags in an item.
  - **Print** button on work order tickets.
- **Settings** is now a menu: Store, This Computer, Printing, Email and Customer Kiosk.

## v0.3.10 - 6 Nov 2026
- New **Diamond POS logo**: the red diamond with the white "P" is now the app icon (desktop, taskbar and installer) and appears at the top left of every screen.
- The name now shows as **Diamond POS** (two words) throughout the app.
- **Choose the columns on the Sale screen**: right-click the column headings to show item details such as UPC, Department, Manufacturer, Vendor, Size, On Hand or Serial #, and move columns left or right. Each till remembers its own layout.
- **Open a past receipt**: click a sale in a customer's History (or in Sales History) to see every item, payment and the total, and reprint it.
- Fixed: versions released without notes now show their notes on the Updates screen.

## v0.3.9 - 6 Nov 2026
> Update the Store Server PC first.
- **💬 Feedback** button at the top of every screen (also on Home and in Help): send an idea, enhancement request, problem or question. It's emailed to the developer with the till, version and screen.
- If email isn't working, feedback is saved and sent later. You can also click **Send again**.
- The address feedback goes to can be changed in **Settings**.

## v0.3.8 - 5 Nov 2026
- **Help / user manual** in the app: click **? Help** at the top of every screen, or press **F1**. It opens at the part for the screen you're on and you can search it.

## v0.3.7 - 5 Nov 2026
- The **Updates** screen now shows **what's new** in each version before you install it, and warns when the Store Server PC must be updated first.

## v0.3.6 - 5 Nov 2026
> Update the Store Server PC first.
- **Returns, refunds and exchanges.** New **↩ Return** button on the Sale screen.
  - Find the original sale by receipt number, or pick the customer and choose from their receipts.
  - Tick what's coming back, how many, the reason, and whether it goes **back to stock** or is **damaged**.
  - Refunds are the price the customer actually paid (including tax-exempt prices).
  - **Exchange**: scan the new items on the same sale and only the difference is paid or refunded.
  - **Refund cash** (give back from the drawer) or **Refund card** (refund on the card terminal and enter its reference).
  - You can't return more than was bought on that receipt. Returned serial-numbered units are taken off the customer's units.
  - **No receipt**: refunded at today's price and flagged.
- Receipts print **REFUND** / **EXCHANGE** with the original receipt number.
- Daily report shows returns; QuickBooks daily summaries net out refunds. A day with more refunds than sales is flagged on the QuickBooks screen to enter by hand.

## v0.3.5 - 5 Nov 2026
> Update the Store Server PC first.
- **Estimate fees** on work orders (hand-held $35, mower $70; change them in Work order settings). Collect the fee at check-in.
- The fee is credited toward the repair, or toward a new item if the customer buys new instead. It's kept if they decline.
- **Pay for a work order at the till**: 🔧 Work order button on the Sale screen, or **Ring up at till** on the ticket.
- Fixed: closing a NOT FIXED ticket took its parts out of stock a second time.

## v0.3.4 - 5 Nov 2026
> Update the Store Server PC first.
- **Work orders** for repairs: check in a customer's unit, estimate, approve, waiting on parts, on the bench, review, ready for pick-up.
- Parts come out of stock when the repair is approved; parts not in stock show in red.
- Emails to the customer at each stage, with templates you can change.
- Serial numbers: items marked "Use Serial #" ask for the serial at the till and are saved under the customer.

## v0.3.2 - 5 Nov 2026
> Update the Store Server PC first.
- **Marketing mailers**: upload a flyer (e.g. from Canva), choose who gets it ("bought a chainsaw from Stihl…"), and email it.
- Email (SMTP) settings for the store's mail account.

## v0.3.1 - 5 Nov 2026
> Update the Store Server PC first.
- **QuickBooks Desktop sync**: one Sales Receipt per day per payment type, split by department, sent through the QuickBooks Web Connector.

## v0.3.0 - 5 Nov 2026
> Update the Store Server PC first.
- **Tax-exempt sales** for customers with a current Farm Tax ID. Expired IDs are flagged and tax is charged.

## v0.2.9 - 5 Nov 2026
> Update the Store Server PC first.
- Kiosk sign-up now requires name, address, city, state, zip, phone and email (business name optional).
- Customers can tick **tax exempt** and enter their Farm Tax ID and expiry date.

## v0.2.7 - 5 Nov 2026
> Update the Store Server PC first.
- **Customer kiosk** on an iPad: send the sign-up form to the tablet, and the new customer is added to the sale.

## v0.2.6 - 5 Nov 2026
> Update the Store Server PC first.
- **Customers**: customer list, add/edit customers, and attach a customer to a sale (F5).

## v0.2.5 - 5 Nov 2026
- **Import and export items** with an Excel spreadsheet.

## v0.2.4 - 5 Nov 2026
> Update the Store Server PC first.
- Full **Add / Edit Item** window (department, cost, on hand, vendor, serial numbers and more).

## v0.2.3 - 5 Nov 2026
- **Home screen** with icons for each area. Top tabs removed.

## v0.2.2 - 5 Nov 2026
> Update the Store Server PC first.
- **Quick Picks**: tick "Quick Pick" on an item to show it as a button on the Sale screen.

## v0.2.1 - 5 Nov 2026
- New register-style Sale screen in red.

## v0.2.0 - 5 Nov 2026
- First DiamondPOS release.
