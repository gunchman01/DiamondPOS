# Connecting DiamondPOS to QuickBooks Desktop Enterprise

Version 0.3.22 sends one Sales Receipt for each eligible POS sale, including its customer name, item descriptions, serial numbers when present, amount and payment method. Inventory quantities and equipment records stay in DiamondPOS. The connector does not update QuickBooks inventory.

## One-time connection

1. If QuickBooks is on the Store Server PC, use the direct connector file on Home → Sync w/ QuickBooks.
2. If QuickBooks is on another PC, install/run DiamondPOS there as a Till, turn on **Run the QuickBooks bridge on this computer**, and use the connector file for QuickBooks on another PC. Keep that app running.
3. Open QuickBooks Enterprise as Admin in the intended company file. Open File → Update Web Services and add the downloaded DiamondPOS.qwc file. Grant the required access and enter the password shown in DiamondPOS.
4. Run the connector once to load accounts, tax items, tax codes and payment methods. Sending can remain off while lists are read.
5. Select the start date, sales tax item, taxable/non-taxable codes, income account mappings and deposit/payment accounts. Save the mapping.
6. Preview a day in DiamondPOS. Confirm the customer, items, tax and receipt total.
7. Switch on **Send individual sales to QuickBooks**, and run the connector again. Today's sales are eligible immediately.

## Customer handling

A selected customer's displayed name receives a short POS identifier, for example `Greg Barnes [DP123]`. It distinguishes two people with the same name and avoids automatically merging an unrelated existing accounting customer. The complete QuickBooks name is limited to 41 characters, so long names are shortened before adding the identifier. Colons and control characters are removed. Once a name has been recorded for export, later sales reuse it after a local rename. Customer contact/address details are not transferred.

The connector queries that exact name and creates it if missing. Existing unsuffixed QuickBooks customers are not automatically matched or merged. Sales with no customer selected use the configured walk-in customer name.

## Transactions and retries

- Each sale gets its own stable QuickBooks reference, such as DP1 or DP2 (base-36 POS receipt ID). The memo contains the ordinary POS receipt number.
- POS items use Other Charge accounting items by department, not QuickBooks inventory items. The item description identifies what was sold and any serial number.
- The configured QuickBooks tax item calculates tax. A non-taxable reconciliation line accounts for the difference from the tax actually collected by DiamondPOS; inspect your tax reports as part of the first connection test.
- The connector checks for the reference before adding it. A previous receipt is recognized only when its POS identifying memo, customer and total match. A conflicting reference is flagged for reconciliation.
- If an add response is lost, the next sync checks for the existing receipt. Do not also enter that sale by hand while its outcome is unknown.
- Problems are shown in Sent to QuickBooks and the sync log. Fix the mapping/problem and choose Retry.

## Exceptions requiring entry by hand

Refunds, zero-total exchanges and split-tender sales are explicitly flagged. They are not silently skipped or sent to an incorrect deposit account. Enter the appropriate refund, credit or split-payment accounting transaction in QuickBooks, then mark the receipt **Entered by hand** in DiamondPOS.

## Upgrading from daily exports

Migration 22 turns sending off once and keeps the original `qb_exports` history. Review the start date and mapping before enabling individual sending. If any old daily export record exists for a date, individual receipts on that date are flagged for reconciliation, even if the old export is pending or errored: a request might already have reached QuickBooks. Do not enter those receipts again if the daily export already included them. Old daily history remains in the database; the screen lists the new individual exports.

Avoid running an older server version after switching to individual exports: it still knows the old daily-export format. If rollback is necessary, turn sync off first and reconcile before resuming exports.

## First connection check on Greg's PC

These changes have automated mocked Web Connector coverage, but have not been tested against a running QuickBooks Enterprise company file here.

1. Use the company's intended test setup and confirm the correct company is open.
2. Preview a small named-customer cash sale and a card sale, then sync them.
3. In QuickBooks, verify the customer names, item descriptions, totals, taxes and deposit accounts.
4. Run the connector a second time and confirm no additional receipts appear.
5. Confirm a refund is listed as Enter by hand, and practice the reconciliation workflow.

Reference: [Intuit QuickBooks Desktop SDK guide](https://static.developer.intuit.com/resources/QBSDK_ProGuide.pdf).
