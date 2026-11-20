# DiamondPOS v0.3.52 — store acceptance tests

Fix: after recalling a held receipt, Cancel sale now cancels the saved hold and releases its reserved stock. It previously only cleared the screen. Schema 42 adds notification audit records; no website changes.

Validation: 342 regression checks, typecheck and production build passed. Real Windows interaction remains for your store check.

1. Note an item's on-hand stock, put a sale containing it on hold, and confirm the normal reservation.
2. Recall that hold. Click Cancel sale and decline the confirmation: the ticket and reservation must remain.
3. Click Cancel sale and confirm. The screen should clear, the hold should disappear from Held Receipts, and inventory should return to its pre-hold amount.
4. Repeat with several quantities/items. Cancel from Held Receipts remains supported.
5. If connectivity fails, the sale stays on screen. Retry cancellation; a lost response must not release stock twice.
6. Ring up another held receipt normally: inventory must remain deducted once. A completed hold cannot be cancelled with the held-delete endpoint; use the saved receipt's existing void process if appropriate.

Apply the Store Server update first, then tills, because the server now handles cancellation retries idempotently. No QuickBooks transaction is created for cancelling an unpaid hold. Payment/hold recovery still blocks cancellation of uncertain saves. The separate Citizen blank-receipt issue remains unconfirmed; test with the actual printer.


## New work-order/customer checks

- Type gr in the Sale customer search: matching active first/last/company prefixes should appear. Select by mouse and by arrow keys/Enter; confirm customer tax handling remains correct.
- Unpaid estimate fee: Add estimate fee to bill, edit its amount, and verify it is charged once. Remove it to waive. Decline another repair and verify checkout/closed-ticket totals/printing charge only the fee, excluding unused repair lines. Verify an upfront paid fee still gets its repair credit.
- Configure Mobile Text Alerts with your own key/callback and verified custom-message sender. Save with a blank key and verify it keeps the key. No actual texts were sent in development.
- With a self-address/self-number test customer: send an estimate by email only, text only and both. Both channels must share one decision link; use the link to approve/decline, and verify website response/notice behavior. Text-only must not claim an email was sent.
- Ready for Pickup: select each channel, review previews and customer number, confirm service-text permission and send manually. Verify mandatory unmonitored-reply instructions and callback number.
- Check per-channel result/history. Accepted is provider handoff, not confirmed delivery. For Unknown or interrupted sends, check the provider before deliberately sending again. Repeating the same request must not send a duplicate.
- Test STOP/provider suppression on the self-number using provider instructions. Replies do not create a POS inbox; service contacts must not be placed in marketing sends.

Install the Store Server first, then all tills (minimum 0.3.51). Hardware/Windows/real delivery acceptance remains pending.


## v0.3.52 regression checks

- Open Work Orders → Work order settings. Confirm Enable, API key and callback fields appear instead of Work order not found. Save the provider key, reopen settings, and save blank to retain it.
- Edit a customer. Confirm OK to text service updates starts off, save it on, reopen customer and verify persistence. It must not change OK to e-mail (marketing).
- Reopen the work order: Text should be disabled when customer permission is off, available when on. Sending must be blocked by the server if permission was revoked on another till after the dialog opened.
- Change the destination phone/mobile: permission clears; reconfirm only with the customer's agreement. No stage change or customer save sends a message automatically.
