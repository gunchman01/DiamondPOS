# Diamond POS User Manual

## Getting started
Diamond POS runs on every computer in the store. One computer is the **Store Server**: it keeps the items, customers and sales for the whole store. Every other computer is a **Till** that connects to it. The Store Server can also be used as a till.

**First time on a computer**
1. Install Diamond POS and open it.
2. On the server PC choose **This is the Store Server**. On every other PC choose **This is a Till**.
3. For a till, enter the server's address and the **pairing code**. Both are shown on the Store Server under **Settings**.
4. Give the till a name (for example "Front Counter"). It is printed on receipts.

**The bar at the top** shows whether the till is **Connected** to the server, the till name, the time and the version.
> If it says **Server offline**, sales can't be saved. Check that the Store Server PC is on and connected to the network.

## The left menu
The buttons down the left remain available on every main screen. Click one to open Sale, Items, Customers, Work Orders or another shortcut. The current screen is highlighted. If the list is long, scroll the menu independently of the open screen.

**Settings → Menus → Left menu buttons** chooses this computer's shortcuts and their order. Home, Settings and Updates are always available. The top “I want to…” menu remains available for additional shortcuts.

An in-progress sale remains in memory while you visit other screens and return. It is not saved across closing the app unless it is held (checkout recovery is separately retained). Finish or cancel an open dialog before continuing your workflow.

## The Home screen
The bottom of Home now contains four status cards:

- **Today's sales:** receipt count, net takings, cash, card and checks. Click the heading to open Reports.
- **QuickBooks:** sending enabled/off, last successful sync, last successful connection and counts of queued exports, problems and manual entries. Click QuickBooks to see its full settings and history. A generic connector contact or incomplete/failed session does not count as a successful sync.
- **Database backup:** last verified scheduled backup, progress or latest failure. A backup older than 1.5 times the configured interval (with a minimum of 30 minutes) is marked overdue. Failures retain the last good backup time. These are local backups on the Store Server PC.
- **Store server:** whether the latest Home requests reached the server and when they were checked.

The cards refresh every 30 seconds while Home is open. Timestamps display in this PC's local time. Failed refreshes are labelled unavailable; any displayed older history is identified as such. “Not recorded yet” means no success has been recorded by this version, not that an older backup or sync never happened. Update the Store Server first so it can supply the new status endpoint.


Home is where every area of the app starts.

**"I want to…"**: the drop-down at the top left of every screen takes you straight to what you want to do: make a sale, return items, open held receipts, check in a repair, find a customer, look up an item, print price tags, see today's sales, go to the Home screen and more. Each computer can choose what's in it (Settings → Menus).
- The buttons on the left open the most-used screens (each computer can choose them in **Settings → Menus**). **Today** shows the number of sales and the takings so far.
- The tiles on the right are grouped like the store: Point of Sale, Purchasing, Inventory and Operations.
- Tiles marked "coming soon" (for example Held Receipts, End of Day and Purchase Orders) are not built yet.
- Press **F1** on any screen, or click **? Help** at the top, to open this manual.

## Making a sale
The **Item # / Barcode** scan/search bar is at the top, directly below the sale header and above the receipt. Type-ahead suggestions open downward. Use the same scan-and-Enter workflow as before; line-action buttons remain below the receipt.

**Card payments/refunds:** after the standalone terminal approves the payment, choose **Credit** or **Debit**. No terminal reference is requested for new card checkouts. Check numbers remain required for checks. Historical references are retained. Receipts/history show Credit or Debit; daily Card totals still combine both, with a separate card-type breakdown. No card-reader or payment-gateway integration is included.


**Serialized equipment:** select a customer for every sale containing a serial number. Items marked Use Serial # must have a serial at checkout, and every serialized unit must be on its own line. The Store Server independently checks these rules. Receiving remains quantity-only; serials are captured at sale time.

Duplicate matching is store-wide, case-insensitive for ordinary serial letters, and ignores leading/trailing spaces. Duplicate serials within one checkout or an existing completed, unreturned sale are blocked. Use a receipt-linked return before reselling a returned unit. A no-receipt return records its serial but cannot release an unidentified original sale's serial/ownership link. Historical sales are not rewritten. If an older held receipt is missing its required serial, remove/rescan that item to capture the serial before payment.


**Quantity directly on the receipt:** each item row has a Qty box with − and + buttons. Click the box and type a whole quantity. Enter, Tab or clicking away saves; Escape restores the previous value. Totals update after saving. Zero removes the line; a negative sale quantity opens Return details. Invalid quantities are shown beside the box without changing the saved quantity.

Serialized equipment stays at one unit per line. Return rows show negative quantities: − increases the number coming back and + reduces it toward zero. Receipt-linked returns cannot exceed the units still available, including other return lines already on this checkout. Editing a return retains its reason, stock choice, original price and tax. To sell an item instead of returning it, remove the return and scan it again. Work order/credit/fee quantities are not edited from this grid.

F3 / Change qty and its + Sale / − Return sign buttons are still available.


Open **Make a Sale**.
1. **Scan** the barcode, or start typing an item number or description: matching items pop up as you type. Click one, or use **↑ ↓** and **Enter** to add it. Typing a full item number and pressing Enter adds it straight away.
2. Use **F2 Find item** to search for an item when you do not have its barcode.
3. Click a line to select it, then use **+1 / −1**, **Change qty** or **Remove line**. The red **✕** at the left of each line removes that item.
   - **Change a price:** click the price on the line, type the new price and press **Enter** (Esc cancels). It's for this sale only; the item's regular price doesn't change. A changed price shows in red with the regular price crossed out under it, and the receipt keeps the regular price for reports. Type the regular price again to undo it. A held receipt keeps the changed price.
4. Add a **customer** if needed (F5), see below.
5. Take payment with **Cash (F7)**, **Card (F8)** or **Check**.

**Cash:** type the amount received (or tap Exact / $10 / $20…). The change is shown.
**Card:** enter the total on the card terminal. When it says APPROVED, choose Credit or Debit and click **Card approved – complete sale**.
**Check:** check the amount and signature, type the **check number** (required) and click **Check received – complete sale**. No change is given from a check.

After the sale, click **Print receipt** or **Reprint last receipt**. A window asks where to print: the **receipt printer** or a **full page**, on any printer. The usual choice is already picked, so just press Enter. Sales with a serial-numbered unit and work order payments can print on a full Letter page on the laser printer instead of the receipt printer.

| Key | What it does |
|---|---|
| F2 | Find any item by name, item # or barcode |
| F3 | Change the quantity of the selected line |
| F4 | Remove the selected line |
| F5 | Add or change the customer |
| F6 | Hold the receipt (or open held receipts when the sale is empty) |
| F7 | Cash |
| F8 | Card |
| F9 | Send the sign-up form to the customer kiosk (iPad) |
| Delete | Remove the selected line |

**Sales tax:** shelf prices are before tax. The totals show the **Subtotal**, the **sales tax** at the sale's rate, and the **Total** the customer pays. If the store has more than one tax rate (Settings → Taxes), pick the rate for this sale from the drop-down on the tax line; the next sale goes back to the default rate. Items marked non-taxable never get tax.

**Choosing the columns:** right-click the column headings on the receipt (Item #, Item Name, Qty…) to pick which columns show: UPC, ALU, Department, Manufacturer, Vendor, Size, Attribute, Unit, Serial #, On Hand, Tax, Cost, Last received cost, Current average cost, Reg Price and more. Right-click a heading to move that column left or right. **Reset to default** puts it back. Each till remembers its own choice. Item Name, Qty, Price and Ext. Price are always shown.

**Serial-numbered items** (items with "Use Serial #" ticked) ask for the serial number when scanned. Type it or scan the barcode on the unit. A customer must be on the sale, and the unit is saved under that customer for repairs later.

## Held receipts
Use a held receipt when a sale is built ahead of time, for example when a customer orders a part: ring up the items now, put it on hold, and when the part comes in and the customer arrives, it's ready to pay.

**Holding a sale**
1. Add the customer (F5) and the items.
2. Press **F6 Hold receipt**. Type a note (what it's waiting for, who to call) and click **Hold receipt**.
3. The screen clears. The sale is kept on the Store Server, so any till can open it. Stock isn't taken until it's paid.

**When the customer comes in**
- On the Sale screen with nothing on it, press **F6 Held receipts** (the red number shows how many are waiting), find it and click **Open**. Or open **Held Receipts** from Home and click **Ring up at till**.
- The items load at today's prices. Add or remove anything, then take payment as usual. The held receipt is closed when the sale is saved.
- Not ready yet? Press **F6** again to put it back on hold (the note can be updated).
- To get rid of a held receipt without selling it, click **Delete** on the Held Receipts screen.

## Customers on a sale
- Press **F5** (or **Add customer**) to search by name, phone, company or customer ID. You can also add a new customer from there.
- Or press **F9 Kiosk sign-up**: the sign-up form appears on the iPad at the counter. When the customer submits it, they're added to the sale.
- Click **✕** to take the customer off the sale.

**Tax-exempt customers**
- If the customer has a current **Farm Tax ID**, the sale is tax exempt automatically: no tax is added and the totals show how much tax was not charged. Untick **Tax exempt sale** to charge tax this time.
- If their Farm Tax ID has **expired**, the sale screen warns you and tax is charged. Click **Update Tax ID** to enter the details from their new card.
- Receipts for tax-exempt sales print the Farm Tax ID.

## Returns, refunds and exchanges
**Quick return on the Sale screen (like QuickBooks POS):**

1. Scan or add the item as usual. Enter its serial number when prompted for serialized equipment.
2. Type a negative quantity directly into the row’s Qty box and press Enter. Alternatively, select the line and choose **Change qty / F3**. Click **− Return** to make the quantity negative (or type **-1** / another negative quantity), then OK. **+ Sale** makes it positive again. The buttons keep the quantity magnitude; an empty or zero quantity becomes 1 or -1. Zero still removes the sale line.
3. In Return item, choose a reason and **Back to stock** or **Damaged — do not restock**.
4. If you have the original receipt, enter or scan its number, click **Find receipt**, and choose the matching line if more than one is shown. This uses the original paid price and tax, and checks the quantity still available to return.
5. Leave the receipt number blank to use today's regular price plus applicable tax. A price override on the scanned sale line is ignored, and the transaction is flagged as no receipt.
6. Click **Apply return**. The original positive line becomes a red negative return line. **Cancel** leaves the positive line unchanged. Add new items on the same screen for an exchange, or choose how to give the refund.

Serialized equipment is returned one unit per line. A receipt-linked serial must match the scanned unit. Without a receipt, the serial is retained on the return but the app cannot identify which original customer-unit record to retire. Complete a work order payment before starting a return.

You can also choose **I want to… → Return** on the Sale screen to start from a receipt or customer search.
1. Find the original sale:
   - type or **scan** the **receipt number** (receipts can print a barcode, see Receipt Layout), or
   - click **Find by customer** and pick the receipt from their list, or
   - click **No receipt** (see below).
2. Tick each item coming back. Enter how many, choose a **reason**, and choose **Back to stock** or **Damaged – don't restock**.
3. Click **Add to sale as return**. The items show in red as negative lines.
4. For an **exchange**, now scan the new items. Only the difference is paid or refunded.
5. If the customer is owed money the total box says **Refund due**:
   - **Refund cash**: give the amount back from the drawer.
   - **Refund card**: do a refund on the card terminal for that amount, then choose Credit or Debit and confirm.
   - The screen suggests the same way the original sale was paid.

**Good to know**
- Refunds are always the price the customer actually paid on that receipt, even if the price has changed since.
- You can't return more than was bought on a receipt. Items already returned are greyed out.
- Work order charges (labor, parts used, estimate fees) can't be returned here.
- A receipt-linked returned serial-numbered unit is removed from the customer's units.
- **No receipt**: pick the item. It's refunded at today's price and the sale is marked as a no-receipt return.
- The receipt prints **REFUND** or **EXCHANGE**, the original receipt number and a line for the customer's signature.

## Work orders (repairs)
**Stage colors:** open Work Orders → Work order settings → Stage colors. Choose a color for each stage, inspect the preview, then Save settings. Reset stage colors restores the defaults after saving. Text automatically uses black or white for contrast, and stage names remain visible. Colors are stored on the server; other tills refresh the work-order list/ticket colors within 30 seconds or when reopened. Color changes do not change stage transitions, stock rules or emails.

**Find equipment by serial:** on the Work Orders list, choose Find equipment by serial and enter/scan the full number. View the associated customer and sale receipt, plus up to 50 recent tickets per matching unit. Previous/inactive records remain visible after a return/resale; they are not presented as current ownership. Close the lookup to return to the list.


Open **Work Orders**. The coloured buttons at the top filter by stage; the search box finds a customer, phone, serial number, brand, model or WO number.

**Checking in a unit**
1. Click **+ New work order** and pick the customer.
2. Pick their unit, or click **+ Add a unit** (type, brand, model, serial; hours for mowers are optional).
3. Type what's wrong with it.
4. Review **Estimate fee for this ticket ($)**. It starts with the selected equipment category’s configured default. Enter a different amount, click **No fee**, or enter **0.00** to waive it. **Use default** restores the configured amount. For a positive fee, click **Check in & collect $X at till** to collect the edited amount now, or collect it later. Changing the fee here does not change the defaults in Settings. Selecting a different unit reloads that category’s default.

**Stages**
- **Needs Estimate**: add parts, labor and other charges. Tracked parts are taken from available stock as soon as they are added; parts not available show in red.
- **Approved to Fix**: already allocated parts are not deducted again.
- **NOT FIXED**: the customer declined. Any parts go back into stock.
- **Waiting on Parts**: waiting for required parts. Return to **Approved to Fix** when repair work resumes, or move directly to **Ready for Review** when complete.
- **Approved to Fix** can move directly to **Ready for Review**; there is no separate On the Bench stage.
- **Ready for Review**: for a manager to check the ticket. No email is sent at this stage.
- **Ready for Customer Pick Up**: the customer can collect it and pay.
- **Picked up / Closed**: the ticket is finished and locked.

**Work order label:** click **🏷 Label** on the ticket to print a label on the Zebra label printer with the **customer's name, the work order number, the date checked in and a barcode**. Stick it on the unit. Nothing prints automatically when you check in a unit or add work-order items. Use the same button for another copy. Scanning the barcode into the search box on the Work Orders screen finds the ticket. (Settings → Printing chooses the label design and copies; the Label Designer can change what's on it.)

**Changing a price:** click the price on any line of the ticket, type the new price and press **Enter**. When ringing up a repair pick-up on the Sale screen, the work order lines' prices can be clicked and changed there too: the ticket is updated. (Labor shown as hours × rate is changed as the line total.)

**Printing:** click **🖨 Print** on a ticket to print the work order on a full page (customer, unit, problem, diagnosis, parts and labor, totals and a signature line), for example as the claim ticket at drop-off or the estimate for approval.

**Emails:** each stage (except Ready for Review) has an **Email** button that sends the customer an update. The pick-up email includes the full bill. You can change the wording under **⚙ Work order settings**.

**Work order settings** also hold the labor rate, the shop supplies charge added to new tickets (by unit type), and the estimate fees.

## Estimate fees and paying for repairs
- An **estimate fee** is taken when a unit is dropped off (by default $35 for hand-held units and $70 for mowers).
- If the repair goes ahead, the fee is **credited** against the repair bill.
- If the customer buys a new unit instead, the fee is credited toward the new purchase: on the ticket click **Buying new instead → credit $X at till**, then scan the new item.
- If they decline and take the unit back, click **Picked up: keep $X fee**.

**Ringing up a repair:** when the ticket is Ready for Pick Up, click **💳 Ring up at till**. On the Sale screen you can also choose **I want to… → Work order** and choose the ticket. The ticket lines are locked on the sale, the fee credit is shown, and the box says **Balance due**. Extra items can be scanned onto the same sale.

## Items
Open **Item List**.
- Search by name, item #, UPC or department. Click an item to edit it; click **+ Add item** to add one.
- The item window holds price, cost, MSRP, Custom Prices 1-4, department, on-hand quantity, vendor, taxable, and more.
- Tick **Use Serial #** for items that have a serial number (mowers, saws, blowers…).
- Untick **Active** to hide an item from sales without deleting it.

**Price tags (Zebra label printer)**
- Click **🏷 Print tags** on the Item List, or **🏷 Tags** in an item's window.
- Scan or search items to add them, and set how many tags of each (click the On hand number for one tag per item in stock). **+ Items marked "Print Tags"** adds every item with Print Tags ticked.
- Click **Print**. The printer and label size are set in **Settings → Printing**.

**Excel import and export**
- **Export to Excel** saves every item to a spreadsheet.
- **Import from Excel** adds or updates items. A **QuickBooks Point of Sale inventory export** (.xls or .xlsx) imports as it is: Item Number, Item Name, Item Description, Alternate Lookup, Size, Attribute, Average Unit Cost, Regular Price, MSRP, Custom Price 1-4, Tax Code, UPC, Order Cost, Item Type, Base Unit of Measure, Reorder Point, Print Tags, Unorderable, Serial Tracking, Commission, Rewards, Department, Vendor, Manufacturer and Qty. You see a preview with any problems before anything is saved.
  - Any other column that has data (for example Income Account, Order By Unit, Unit of Measure 1 and its prices) is kept on the item and shown under **Other details (imported)** in the item window. Columns that are empty, all 0 or all "No" are skipped.
  - Stray characters at the end of QuickBooks item names (like `'/[;`) are removed. Tax codes other than "Non" (e.g. VER) mean taxable.
  - Items already in Diamond POS are matched by Item No. (or UPC) and updated, so importing again doesn't make doubles. If the same Item No. is in the file twice, the second one is listed as a problem: give it a new Item No. and import it again.


**Deleting items**
- Open one and click **🗑 Delete**, or tick several in the list (the box at the top ticks everything shown) and click **🗑 Delete selected**.
- Items with no history are erased for good. Items that are on past sales, work orders or receivings can't be erased (old receipts and reports must stay correct), so they're made **inactive** instead: hidden from searches and the Sale screen. To bring one back, find it and tick **Active** again.
- The item window shows **Receiving history** (the last 20 times it came in: date, RV #, vendor, qty, cost and the average cost after).

## Receiving
Use this when an order comes in from a vendor. Open **Receiving History** on Home (Purchasing), or **I want to… → Receive items**.

**1. Start a receiving.** Click **+ New receiving** and fill in what you have:
- **Vendor**, **Vendor invoice #**, **PO #**, **Invoice date**, **Received by**.
- **Freight / shipping $** from the invoice. With **Add freight to the items' cost** ticked, the freight is spread over the items by value, so their cost includes shipping (shown as "+ freight" under the cost).
- **Notes** (boxes damaged, backorders…).

**2. Add the items.** Scan or type an item #, UPC or description (matches pop up as you type). Scanning the same item again adds 1 to its qty. For each line set:
- **Qty in** and **Cost each** (the cost on this invoice). The cost box turns yellow when it's different from the item's last cost.
- The grid shows **On hand**, **Last cost**, the **average cost now → after this receiving**, the regular price and the margin. A **Note** can go on each line.

Click **Save (receive later)** to keep it as a draft: nothing changes in stock until it's received. Drafts stay at the top of the list marked **Not received yet**.

**3. Receive.** Click **✓ Receive items…**. A window lists every line:
- **Update cost**: tick to make this invoice's cost the item's order (last) cost. Lines where the cost changed are highlighted.
- **Regular price**: change it here if the price should go up (or down); the margin updates as you type.
- Click **✓ Receive items**. Stock goes up, and each item's **average cost** is worked out again: (on hand × old average + qty in × new cost) ÷ new on hand. If nothing was in stock, the new cost becomes the average. Services and non-inventory items don't get a stock count.

**4. Print tags.** A prominent **Print tags for received items** button is available at the top of a posted voucher. After posting, it asks **Print tags?** with one line per item: choose the label (**Auto** picks the price tag or the no-price tag, or choose one), and the number of tags (starts at the qty received). Set a line to 0 to skip it. Click **Print**, or close if you don't want tags. You can print them again later from **🏷 Print tags** on the received receiving.

**Finding a receiving.** Search by RV #, vendor, invoice #, PO # or an item. A received receiving can't be changed; it keeps the costs, prices and averages from before and after. Drafts can be deleted.

## Customer list
Open **Customer List** to search, add and edit customers.
- **Contact Info**: name, company, phone, email, address and "OK to e-mail" (needed for marketing mailers).
- **Customer Settings**: customer type, tax exempt with **Farm Tax ID**, expiry date and "card copied", discount, notes.
- **History** and **Statistics** show what they've bought. Click a sale in History to open that receipt, see every item and payment, and reprint it.

- **Past Due $** and **Custom Field 1** come over from QuickBooks Point of Sale (past due balance, and the custom field, often the Farm Tax ID or e.g. DISABLED VET).

**Excel import and export**
- **Import from Excel** adds or updates customers. A **QuickBooks Point of Sale customer export** imports as it is (Company, Last Name, First Name, Title, Street, Street2, City, State, ZIP, Phone 1, Phone 2, Alt Contact, Alt Phone, Disc %, Tax-exempt, EMail, EMail Notification, Past Due, Notes, Custom Field 1). You see a preview with any problems before anything is saved.
  - "Tax-exempt = Exempt" makes the customer tax exempt, and **Custom Field 1** becomes their Farm Tax ID.
  - EMail cells that aren't email addresses (fax numbers, web sites) are kept in the Notes.
  - Customers already in Diamond POS are matched by Customer ID, or the same name, company and Phone 1, and updated, so importing the same file twice doesn't create doubles.
- **Export to Excel** saves every customer in the same QuickBooks POS column layout, plus Customer ID, Customer Type, Farm Tax ID, Tax ID Expires, Tax Card Copied and Active.


**Deleting customers**
- Open one and click **🗑 Delete**, or tick several in the list (the box at the top ticks everything shown) and click **🗑 Delete selected**.
- Customers with no history are erased for good. Customers that are on past sales or work orders can't be erased (old receipts and reports must stay correct), so they're made **inactive** instead: hidden from searches and the Sale screen. Tick **Show inactive** to find them again and tick **Active** to bring one back.

## Customer kiosk (iPad)
The iPad on the counter shows the store logo until a till sends it the sign-up form.

**Setting it up** (Settings → **Customer Kiosk (iPad)**)
1. On the iPad, open Safari and go to the kiosk address shown in Settings.
2. The iPad shows a 6-digit code. Type it in Settings, choose which till it belongs to, and click **Pair**.
3. Optional: **Add to Home Screen** and turn on **Guided Access** so customers can't leave the page.
4. Upload the store logo in the same place.

**Using it:** press **F9** on the Sale screen. The customer fills in name, address, city, state, zip, phone and email (business name is optional). If they tick **tax exempt**, they enter their Farm Tax ID and expiry and are asked to hand their card to the cashier to copy.


> Tablet won't connect? See **Kiosk tablet won't connect** below for step-by-step checks.

## Sales history and reports
Open **Sales History** or **Reports**, choose **End of Day & receipts**, and pick a date.
- Totals across all tills: number of sales, takings (after refunds), tax, **cash** (after change), **card**, tax-exempt sales and **returns**.
- Every sale is listed with its till and customer. Refunds and exchanges are marked. Click a sale to open the full receipt, or **Reprint** for a printed copy.
> Compare "Card (terminal)" with the settlement total printed by the card terminal at the end of the day.

## QuickBooks

**Credit/Debit mappings:** in Where sales go in QuickBooks, map Credit and Debit to existing QuickBooks payment methods. Create missing methods in QuickBooks and refresh lists first. Blank mappings fall back to the general Card payment method; both retain the configured Card deposit account. The type appears in the sale memo. Historical brand details and mappings remain saved for older transactions; previously synced sales are not resent or rewritten.

The **Transaction sync queue** near the top of the QuickBooks screen lists all POS sales, including ones that have not created an export record yet. It refreshes every 15 seconds. Filter by status, POS receipt/customer/QuickBooks number, or date range; each page contains up to 50 transactions.

- **Waiting:** eligible for an automatic run. “Queued” means an export record is already prepared; a waiting sale without one is still picked up automatically.
- **Synced:** QuickBooks confirmed the transaction. **Entered by hand** identifies an operator's manual-entry confirmation instead. Neither can be selected to resend.
- **Failed:** an export needs attention. Read its error, fix the cause and select it for retry.
- **Manual entry needed:** refunds, zero-total exchanges, split/missing/mismatched payments, or old daily-export overlap require reconciliation rather than automatic sending.
- **Excluded:** before the sync start date, future-dated, or not a completed sale. The reason is shown. This view does not add an intentional hold/release feature.

Tick eligible Waiting/Failed rows (or select all eligible rows on the current page), then **Queue selected for sync**. Selection is limited to that page. This prepares a retry; it does not connect to QuickBooks immediately. Run **Update Selected** in Web Connector or wait for Auto-Run. If sending is off or account mapping is incomplete, fix that before expecting transfers. The action never enables sending or bypasses the start date. Original reference/duplicate checks remain in use.

Queue changes are blocked during an active connector session. A selection that became synced/excluded/manual is rejected as a whole; refresh and select eligible transactions again. Use the existing Sent to QuickBooks history/manual-entry controls and log below for reconciliation.

Diamond POS sends **individual Sales Receipts with customer names** to QuickBooks Desktop Enterprise. Inventory, equipment serial records, service work, kiosk sign-ups and marketing stay in DiamondPOS. Receipt descriptions include the sold items and any serial numbers; QuickBooks uses accounting items rather than inventory items.

1. On the **QuickBooks** screen, download the connector file and add it in QuickBooks Web Connector using the password shown. On a separate back-office PC, run DiamondPOS as a Till with the QuickBooks bridge enabled.
2. Run the Web Connector once to load the available accounts and tax settings. Lists can be read while sales sync is off.
3. Review **Start sending from**, tax settings, income accounts and payment deposit accounts, then **Save mapping**.
4. **Preview a day** shows each sale, customer, item descriptions and total. Selected customers use their name plus a short `[DP…]` POS identifier; same-name people are kept separate. A sale without a selected customer uses the configured walk-in customer.
5. Enable **Send individual sales to QuickBooks**. Today's sales can transfer on the next Web Connector run; no need to wait until tomorrow.
6. **Sent to QuickBooks** lists each receipt. A **Problem** can be fixed and then **Retry**'d. Retries look for the existing QuickBooks receipt before adding it again.

**After upgrading to v0.3.22:** sync is switched off once for you to review the new format and start date. If an old daily export exists for a date, individual sales for that date require reconciliation rather than automatic transfer.

**Enter by hand** means a refund, zero-total exchange, split payment, or overlap with an old daily export needs attention. Enter or reconcile the matching transaction in QuickBooks first; only then click **Entered by hand**. Do not enter a sale again if it was already included in a daily export.

See `docs/QUICKBOOKS_SETUP.md` for the full setup and first-run checks.

## Automatic backups and checkout recovery
The Store Server takes an online SQLite backup at startup and at the interval chosen under **Settings → Backups** while running (hourly by default). Only backups that pass an integrity check receive a finished `.db` filename. They are in `%APPDATA%\DiamondPOS\data\backups`. Migration backups are also kept before database upgrades.

These backups are kept on the server PC; copy completed backups to another drive for protection against PC or disk loss. As of v0.3.40, old generated snapshots are pruned to the configured retention count only after a new snapshot is verified. Pre-migration backups and other files are excluded from cleanup. Backup successes and failures are written to the server log.

If **Recover checkout** appears, keep that checkout open and use **Check / retry original checkout** after the network returns. The original request is retained on that PC across app restarts. Do not take payment again: recovery checks whether the original sale was already saved. A second till cannot complete a held receipt that has already been rung up.

For a developer restore check, run `npm run verify:backup` from the project folder. It verifies a temporary copy of the latest scheduled backup and never replaces the live database.

## Marketing mailers
Open **Marketing** to email a flyer to a group of customers.
1. First time: fill in the **email account used to send mailers** (SMTP settings from your email provider).
2. Click **+ New mailer**: give it a subject and message, and upload the flyer image (for example a Canva download).
3. **Who gets it**: for example "bought a Chainsaw" or "bought a Mower from Exmark", within the last so many months. You can add several rules.
4. **Preview**, then **Send**. Only customers with an email address and **OK to e-mail** ticked receive it.

## Settings
Open **Settings** and click the area you want to change. Click **← Settings** to go back to the menu.
- **Store** (shared by all tills): store name, store address (printed on full-page receipts, work orders and marketing emails), where feedback is emailed, and the receipt footer.
- **Taxes** (shared by all tills): the sales tax rates. Add as many as you need (for example each county you deliver to), give each a name and a rate such as 7.975, and choose the **default**. The Sale screen uses the default unless the cashier picks another rate.
- **Menus** (this computer): what's in the **"I want to…"** drop-down and the **Home screen buttons**, and in what order. Use ▲ ▼ to reorder, ✕ to remove and **+ Add** for more.
- **This Computer**: the till name. On the Store Server it also shows the address and **pairing code** that tills need to connect.
- **Printing**: which printers this computer uses (see below).
- **Label Designer**: build price tags and part labels (see below).
- **Receipt Layout**: choose what prints on receipts (see below).
- **Email**: the email account used for marketing mailers, work order emails and feedback.
- **Customer Kiosk**: pair iPads and upload the store logo.

## Printing
**Cash drawer:** open Settings → Printing → Cash drawer on each till. Enable the button, set the COM port (default COM3) and trigger text (default hello), then Save drawer settings. Test saved drawer setup sends the same style of line-ending trigger as the existing Windows shortcut. Confirm the drawer physically opens; “signal sent” is not a hardware-open confirmation.

The Cash drawer button is in the top bar. Opening is manual, not automatic after a sale. Settings stay on this PC. Shortcut defaults to Button only; optional F1/F10/F11/F12 shortcuts work while DiamondPOS is focused. If selecting F1, remove the shortcut key from the existing Windows drawer shortcut first, otherwise both may send a signal. F1 then triggers the drawer instead of Help, while the Help button still works. Configuration permits a COM port and plain trigger text, not arbitrary executable commands. Device protocol/port speed are unchanged from the working Windows setup.


Each computer has its own printers, so set this up on every till (**Settings → Printing**). Install the printers in Windows first.
- **Receipt printer**: choose the printer and paper width (80 mm or 58 mm). Receipts print only when you choose **Print receipt** or **Reprint last receipt**. **Ask which printer every time** (on by default) shows a window after you request a receipt, so you can send a small sale to the laser printer as a full page. Untick it to always print on the usual printer without asking.
- **Full-page printer (laser)**: prints on Letter paper. Choose what prints here instead of the receipt printer:
  - sales with a **serial-numbered unit** (mowers, saws, blowers…), with the customer's details, serial numbers and a signature line
  - **work order** receipts (estimate fee, repair pick-up)
  - Work order tickets (🖨 Print on a ticket) always print here.
- **Label printer (Zebra)**: choose the printer, then which label design to use for items **with a price** (price tag) and for items with **no price** (parts, bin labels), and the **work order label** stuck on a unit at check-in (copies). Design the labels under **Label Designer**.
- Use the **Print test** buttons to check each printer before saving, then click **Save printing settings**.
> For a Zebra printer, install the ZDesigner driver and set the same label size in the driver's printing preferences.

## Label Designer
**Settings → Label Designer** builds the tags printed on the Zebra printer. Every till uses the same designs.
- The list on the left has your labels. **Price tag**, **Part / bin label (no price)** and **Work order label** come ready-made. Click **+ New tag**, **+ Work order label** or **Copy** to make more, and set the name and label size.
- Work order labels have their own fields: customer name, work order #, date checked in, unit, unit serial #, customer phone and what's wrong. Their barcode is the work order number.
- To add something, pick it in the toolbar (Item name, Price, Item details, Item #, UPC, Department, Manufacturer, Vendor, Size, Store name, Your own text…) and click **+ Add field**. Click **+ Barcode** for a barcode or **+ Line** for a line.
- **Drag** an element to move it. Drag the **red corner square** to make it bigger or smaller. Arrow keys nudge it, **Delete** removes it, and holding **Shift** gives finer steps.
- On the right, change the font size, bold, alignment, or the exact position in inches. For a barcode, choose UPC, Item # or ALU.
- Type an item # or UPC and click **Preview** to see a real item on the label. **Print test label** prints one.
- Click **Save labels**.
> Which design prints is set per till in **Settings → Printing**: one for items with a price, one for items without. When printing tags you can also pick a design for that print.

## Receipt Layout
**Settings → Receipt Layout** designs the receipt for every till. The receipt has three parts:
- **Top of receipt**: drag-and-drop area. Put the store name, address, logo, receipt #, date, till, customer, REFUND title or your own text wherever you want.
- **Middle**: items, totals, tax exempt and payments. These grow with every sale, so they're a list: tick them on or off and drag them into order. You can add dashed lines and your own text here too.
- **Bottom of receipt**: drag-and-drop area for the signature line, receipt footer, receipt barcode, return policy, website and so on.

**Working with the top and bottom areas**
- Choose **Top** or **Bottom**, pick what to add, and click **+ Add** (or **+ Logo**, **+ Barcode**, **+ Line**).
- **Drag** an element to move it; drag the **red corner square** to resize it. Arrow keys nudge it, **Delete** removes it, **Shift** gives finer steps.
- Drag the **⇕** bar under an area to make it taller or shorter.
- On the left, change the text size, bold, alignment and exact position. The signature line can print on every receipt or only on refunds and exchanges.
- Things that don't apply to a sale (no customer, not a refund) print blank.

The preview on the right shows a real receipt (a sale, a serial-numbered sale or a refund) on 80 mm or 58 mm paper. Click **Save receipt layout** when you're done.
> Add the **Barcode** to print a barcode of the receipt number: scanning it on the **Return** screen finds the sale straight away.

## Updates
Open **Updates** to see the installed version and any newer ones.
- The **What's new** box lists what each newer version adds or fixes.
- Click **Update to vX.Y.Z** to install it. The app restarts.
- **Revert** installs an older version if something isn't working.
> When a version changes the database, a yellow note says so. **Update the Store Server PC first, then the tills.** When reverting, do the tills first, then the server.

## Feedback and requests
Have an idea that would make Diamond POS better, something that isn't working right, or a question? Click **💬 Feedback** at the top of any screen (or **Feedback & Requests** on Home).
1. Choose **Idea / enhancement request**, **Something isn't working** or **Question**.
2. Give it a short title and describe it. For a problem, say what you did, what happened and what you expected.
3. Add your name, and your email if you'd like a reply.
4. Click **Send feedback**. It's emailed to the developer along with the till name, the version and the screen you were on.

> Feedback is sent from the store's email account (set up on the Marketing screen). If email isn't working, the feedback is saved and shows **Not sent yet**. It's sent automatically the next time someone sends feedback, or click **Send again**.

The address it goes to can be changed under **Settings → Email feedback & requests to**.

## Kiosk tablet won't connect
If the tablet (iPad or Android) can't open the kiosk page, it's almost always the network or Windows Firewall, not the tablet. Work through these in order.

The Store Server's address: **{server_ips}**. The kiosk page is **{kiosk_urls}**.

### 1. Type the address exactly
- In Chrome (or Safari) on the tablet, type the full address including `http://` and the port: **{kiosk_url}**
- If the browser changes it to `https://`, type it again with `http://`.
- The address is also shown under **Settings → This Computer** on the Store Server PC. If it lists more than one, try each.

### 2. Check the tablet is on the same Wi-Fi as the server
- Not the guest network. Guest Wi-Fi usually blocks devices from reaching other computers.
- On the tablet, turn off **mobile data** while testing. Android sometimes sends traffic over mobile data when the Wi-Fi has no internet.
- Turn off any VPN on the tablet.

### 3. Check Windows Firewall on the Store Server PC
This is the most common cause. When Diamond POS first ran, Windows may have asked whether to allow it on networks, and that may have been dismissed or set to "Public".
- In Windows **Settings → Network & internet**, click the Wi-Fi or Ethernet connection and set it to **Private network**.
- Then open port {port}. Open **PowerShell as administrator** on the server PC and run:

```
New-NetFirewallRule -DisplayName "Diamond POS" -Direction Inbound -Protocol TCP -LocalPort {port} -Action Allow -Profile Private,Domain
```

### 4. Narrow down where it fails
- On the server PC itself, open `http://localhost:{port}/kiosk` in a browser. If that doesn't work, Diamond POS isn't running on the server.
- If it works there, open **{kiosk_url}** from another PC or a till:
  - **Works from the till but not the tablet:** it's the Wi-Fi. The tablet is on a guest network, or the router has "AP isolation" / "client isolation" switched on. Turn that off in the router, or move the tablet to the main network.
  - **Fails from the till too:** it's the firewall from step 3.

### 5. Check the IP hasn't changed
If it worked before and stopped, the server's IP address probably changed. Reserve a fixed IP for the server PC in your router so it doesn't keep changing.

## Troubleshooting
- **"Server offline"**: the till can't reach the Store Server. Check the server PC is on, Diamond POS is open on it, and both are on the store network.
- **An item won't scan**: check the barcode is on the item (Item List → UPC), or press F2 to search for it.
- **"Farm Tax ID has EXPIRED"**: ask for the customer's new card and click **Update Tax ID**.
- **Mailers aren't sending**: check the email account settings on the Marketing screen. The mailer shows the last error.
- **QuickBooks shows a Problem**: read the message, fix the account mapping, then click **Retry**.
- **The kiosk tablet won't connect**: see **Kiosk tablet won't connect** above.
- **Something broke after an update**: open Updates and **Revert** to the previous version.


## Vendor List

Open **Home → Purchasing → Vendor List**, or use the Vendor List navigation button. If your menu is customized, enable Vendor List under Settings → Menus.

Choose **Add vendor** and enter the required company name. Contact Info includes title, first/last name, email, website, mailing address, phone and mobile. Payment Terms records net days and early-payment discount details for reference only. Vendor Settings records your account number, alternate phone/contact and Inactive. Use the yellow Vendor Notes area for ordering instructions.

**Save** closes the editor; **Save & New** saves and clears it for the next supplier. Duplicate company names (ignoring letter case) are rejected. Search the list by company, contact, phone or account number. Check **Include inactive** to find inactive suppliers; uncheck Inactive in their editor to reactivate them.

Saved active vendors appear in the Vendor suggestions in Items and Receiving. The **+ Vendor** button adds a supplier without leaving either form. Free-text supplier names remain supported for existing imports. Existing names on items and vouchers are converted to basic vendor records during the update; add their missing contact details afterward.

History shows the latest 100 receiving vouchers, with posted totals across all receiving history. From Vendor List, click a voucher number to open it in Receiving. Drafts appear in history but are excluded from posted totals. Renaming a vendor updates linked item vendor names; historical voucher names stay as originally recorded. Inactive hides a vendor from suggestions, but does not block manually entering its name.

Vendor records, payment terms and purchases are not sent to QuickBooks. The existing sales/customer integration is unaffected.


## Reports

Open **Reports** in the left navigation or on Home. Choose Sales, Inventory or Receiving. Select a ready-made report to open its options, then click **Run report**. **End of Day & receipts** opens the store/till closeout report, receipt details and manual reprinting.

Ready-made reports include sales by day, receipt register, customer and till summaries, refunds/exchanges, a void audit, inventory valuation, low stock/reorder, stock by department/vendor, a receiving register, receiving by vendor and open receiving drafts.

For an **ad hoc report**, choose **Create custom report**. Select columns in the desired order, add filters, and choose date period, grouping and sorting. All filters must match. Grouping keeps grouping columns and fields that can be totalled; check Group on another field to add a grouping level (up to five). Monetary filter values are entered in dollars, such as 100.00. Boolean filters use Yes/No. Inventory reports are current snapshots and have no historical date filter.

**Save report** stores the definition on the Store Server for all tills. Relative periods such as This month and Last 30 days are recalculated on each run. Open a saved report to update it, or change its name and choose **Save as new**. Delete removes only the saved definition. Report definitions do not save a frozen copy of results.

**Export Excel**, **Export CSV** and **Print** use the last generated results. Run again after changing options or transactions. Excel includes a Summary sheet; print uses the configured full-page printer (Windows default when blank), Letter landscape. At most 10,000 result rows are displayed/exported/printed, with an explicit notice if limited. Totals always cover every matching record; narrow filters to obtain complete detail. Dates use the Store Server's local time.

Sales reports have **one row per receipt**, preventing multiple items/tenders from duplicating totals. Normal reports filter Completed status and include signed refunds/exchanges; they exclude voids. Net sales are before tax; cash subtracts change. The refunds/exchanges report shows entire receipts, including any positive exchange items. Customer names reflect the current customer record. This first reporting builder is receipt-level; it does not calculate historical item profit or cost of goods sold.

Inventory valuation uses saved average cost, includes negative stock, and flags missing costs rather than inventing a value. Missing-cost items contribute no cost valuation. Low stock requires a configured reorder point. Quantity totals can combine different units of measure; review item detail when comparing mixed products. Receiving uses posted-date (created-date for drafts), counts freight once, and retains original vendor names. Drafts are excluded unless you select them.

## Voiding a sale

Open the receipt through Daily closeout or a Sales report, then choose **Void sale…**. Review the stock quantities, enter a reason and your name, record how the payment was handled, and confirm. The entered operator name is an audit label, not an authenticated manager approval. There is no unvoid/delete operation.

The sale remains on file with original amounts and payments, marked **VOID**. Reprints carry a mandatory VOID banner. Normal sales/tax/payment totals exclude it. Inventory quantities are restored exactly once; equipment from the sale is deactivated from the customer's active units. New sales record stock movements. Older receipts require an explicit check because reversal quantities use current item types.

The POS does **not** refund/void a standalone terminal payment. Cancel/return the actual payment separately and record the result before confirming the POS void.

QuickBooks handling:
- With no export record, a voided sale is excluded from later exports.
- If an export exists, including an uncertain failed export, a correction waits for the next Web Connector run with sending enabled. The original receipt is located and checked for matching identity/customer/amount before changing it. Existing voids are recognized on retries.
- It is marked **Void confirmed** only after a query verifies the same receipt at zero with its VOID marker. Errors, conflicts or missing known transactions stay unresolved and visible. Use **QuickBooks → Voided receipts → Retry correction** after fixing the cause. Sending off or a stopped Web Connector leaves corrections pending.
- Do not edit/delete these exported receipts independently in QuickBooks or switch company files during reconciliation. Conflicts need review, not a blind resend.

Voids are blocked while the connector is syncing. This workflow supports ordinary positive sales. Refunds/exchanges, work-order payments, already-returned originals, equipment with work orders, and tracked manual/old daily QuickBooks entries require their return/work-order or manual reconciliation workflow. They are blocked from automatic voiding to preserve those links.

Use **Reports → Sales → Voided sales audit** for the permanent audit. Its date filter is the original sale date; the void timestamp is separately shown in UTC. QuickBooks shows the latest 500 void corrections; the report supports older records with date filters.

## Item cost comparison

Open an existing item. **Item costs & receiving history** shows last received invoice unit cost, current saved inventory average, lifetime receiving average, and the lifetime average including any allocated freight.

Lifetime average = sum(quantity × unit cost) ÷ sum(quantity) across **all posted receiving lines**. The freight-inclusive version uses each line's recorded landed cost, honoring that voucher's freight setting. Drafts, opening balances and imported stock without receiving vouchers are excluded. Sales do not change the lifetime receiving average. Current inventory average is the running saved average used to value remaining stock, so it can differ from the lifetime average. The preview lists only the latest 20 receiving lines; the summary uses all stored history.

For new receiving vouchers, freight allocation starts off. Freight is still included in the voucher total; turn allocation on explicitly if wanted. Existing vouchers keep their saved preference. Tag selection opens after posting and can be reopened with the top Print tags button; it uses current item prices, with quantities prefilled from the received quantities (rounded to whole tags and editable).


### Parts ordering notice on estimate emails

Needs Estimate and Approved to Fix emails automatically add a highlighted **Parts availability** notice when required inventory parts are short. It lists the affected parts, says they will have to be ordered, and says they **could take a week to arrive**. This is a possible lead time, not a confirmed delivery date.

The notice appears with existing customized templates and with the itemized bill switched off. Preview and send each check current stock, including stock already allocated to that ticket. Repeated lines for one product are combined when checking the total quantity needed. When sufficient stock arrives, the notice is omitted. Labor, miscellaneous charges and parts without tracked inventory do not trigger it. Pickup and declined-repair messages are unaffected.


## Customer estimate approval and follow-up

Configure the separate approval website using the supplied **extras/cpanel-approval/CPANEL-SETUP.md** guide. Online approvals start disabled. In Work Order Settings → Estimate approvals & customer follow-up, generate/save the private key and website URL, test the connection, then enable approvals and save. The settings card has its own Save button. The service can run on the staging site first and later morethanmowers.com.

On a Needs Estimate ticket, add diagnosis and items, then **Send estimate for decision**. Review the preview and confirm sending. A successful send moves it to **Waiting on Customer**, records the exact revision/amount, and starts the follow-up timer. A normal check-in email does not start this timer. Parts remain allocated while waiting; declining restores them. The estimate template has its own configurable subject/body and includes the parts-ordering notice when stock is short.

Customers open a private review link, read the estimate, enter their name and confirm Approve or Decline on the website. An email click alone is not a decision. No payment is taken. The Store Server polls every minute while running, or staff can use **Check customer responses now**. Responses recorded while POS is closed remain on the website until it reconnects. Matching approval moves to Approved to Fix (no second parts deduction); decline moves to Not Fixed. History retains the revision, entered name, timestamp and comments. This is separate from QuickBooks sync and does not read the shop's inbox.

Unanswered estimates are flagged **Needs customer call** after **3 calendar days** by default (configurable 1–90). Use the work-order filter to find them. On the ticket, enter a contact note and choose **Record call & remind again** to set another reminder. Approval/decline stops reminders. The timer only flags tickets; it never makes a decision or cancels a repair. Failed sends do not start it. Manually selecting Waiting on Customer without successfully sending an estimate creates no reminder timer.

If the estimate changes, send a revised estimate for a fresh decision. Stale responses are marked for review instead of authorizing changed repairs. Outstanding older links are cancelled on sync or replaced by a revised estimate. Current stock arriving or a later estimate-fee payment does not invalidate the agreed repair details/total. Repairs with a recorded estimate require a matching approval before checkout. Record a phone decision using the Approved to Fix / Not Fixed stage action on an unchanged pending revision; history labels it as recorded by staff. Cancel an outstanding link from its ticket if it should no longer be used.

Links expire after 30 days. The entered name is not independent identity verification: anyone with a forwarded private link could respond. Keep links, private website configuration and hosting backups private. The staging banner is a reminder, not a simulation switch—use test customer emails and work orders only. Website installation, SMTP delivery, physical Windows screens and live hosting must be checked locally before using this workflow with customers.


### Removed work-order stage

As of v0.3.35, On the Bench is no longer a selectable stage or email template. Existing tickets in that stage move to Approved to Fix automatically, preserving the parts already deducted. The update adds a history note rather than rewriting past events. Older history and last-email records may display **On the Bench (retired)** to retain their original meaning. Other stage colors and templates keep their saved values. No website upload or approval-service reconfiguration is needed for this update.


### Per-ticket fee at check-in

The estimate fee field remains available even if the category's default is zero, so staff can charge a one-off fee when appropriate. A custom amount is saved on the new ticket and used for fee collection and any later eligible fee credit. A changed/waived fee adds a history note showing the configured default and ticket amount. Existing tickets, paid fees and work-order settings are unchanged. This control is for initial check-in, not changing an already-paid fee.


## Customer accounts and reserved inventory (v0.3.37)

In the customer editor, enable **Allow on account** and set payment terms (default 30 days). Select that customer on Sell and use **Charge to account** for a whole positive sale. The receipt says no payment was collected. Returns and split tenders cannot be charged to account.

With QuickBooks sync configured and enabled, account sales create unpaid customer Invoices with item amounts and sales tax. They are excluded from paid Sales Receipts. Open QuickBooks to send or print the invoice to the customer; POS does not email it automatically.

Use **Pay existing account** on Sell or **Account balance / receive payment** in the customer editor. Record cash, check (check number required), or a payment already approved on the standalone card terminal. Payments apply oldest invoice first. They do not create another sale, deduct stock, or charge tax. Daily Closeout includes these receipts in takings and shows account charges separately. Sales reports remain sale-based and do not treat account payments as new sales.

The account window lists invoices, balances, payments and sync errors. QuickBooks settings also shows recent account sync activity. Unsent invoices sync before their payments, which become QuickBooks Receive Payments applied to those invoices. Retrying the same saved request or a lost sync response is checked to avoid duplicates.

Balances cover invoices created by this POS only. The separate imported past-due field and invoices entered directly in QuickBooks are not included. Back-office payments update the displayed balance after a successful connector run. A conflicting payment or changed invoice stops for review: reconcile in QuickBooks before retrying the failed item. Do not collect the same payment again because a connection timed out; use the saved retry.

Overpayments, account payment reversals, credits and account-sale void/refund synchronization are not supported in this release. Cash receipt voids and receipt-linked cash returns are blocked for account invoices. Arrange account adjustments with the bookkeeper and reconcile in QuickBooks; do not assume a POS cash return reduces an account invoice.

Holding a sale now deducts its tracked quantities immediately. Editing it adjusts only the difference; deleting the hold restores its stock. Checkout replaces the hold allocation with the completed sale deduction in one transaction. Work-order parts are deducted when added, even during Needs Estimate or Waiting on Customer. Removing parts or marking Not Fixed restores them; approval and checkout do not deduct them twice.

Update the Store Server first, then all tills. Migration 28 allocates existing open held sales and previously unallocated open work-order parts, so available on-hand can decrease on the first start. Already allocated parts are preserved. Review these open tickets against physical stock after upgrading. No approval-website upload is required.


## Manual printing (v0.3.38)

All printing is initiated by staff. Checking in a work order, adding items, or completing a sale does not print anything. Use **🏷 Label** on a work-order ticket, **Print receipt** / **Reprint last receipt** on Sell, or the relevant Print button elsewhere. Older saved automatic-print settings are ignored. Printer selection, label designs and copy counts still apply to manual print jobs.


## Item column mapping and Item List layout (v0.3.39)

Open **Item List → Import from Excel**, then choose .xlsx, .xls or .csv. The first worksheet is used; row 1 must contain unique headings. On **Match spreadsheet columns to POS fields**, each POS field has a dropdown of your spreadsheet headings and samples from the first three rows. Recognized headings are suggested. Use Auto-match headings or Clear mapping, then set your own choices. The same source can fill several fields (for example, both Item Name and Item Description).

Choose **Do not import this field** to leave it out. Unmapped fields and blank cells keep existing values on updates; new records use defaults and require Item Name and Reg Price. Dollar fields contain dollars, not cents. Format item identifiers and UPCs as Text in Excel to retain leading zeros. Choose whether unmapped source columns with data are kept under Other details or skipped. Mapping choices apply to the file currently open and are not saved as an import profile.

Choose **Preview import**. Review the source → destination list, first five mapped valid rows, and row-by-row create/update/problems results. Nothing is saved in preview. **Change column mapping** returns to the dropdowns; preview again after changes. **Import N items** saves valid rows, while problem rows are skipped and listed. Duplicate Item No. or UPC entries in one file are flagged so one row does not overwrite another.

To fix item names/printed tag text, keep the same Item No. or UPC mapped, map the correct text to Item Name and/or Item Description, and enable Update existing items. Leave On-Hand Qty unmapped to keep current inventory. You do not need to delete items first. If you previously made items inactive, map Active to a spreadsheet column containing Yes to reactivate them. Imports do not print tags; print manually after checking the results.

Right-click an **Item List column heading** (or use **Columns…**) to choose displayed fields. Item Name stays visible. Right-click a particular heading to move that column left/right; Reset to default restores the original layout. Layout/order is saved on that computer separately from Sale columns. Changing displayed columns does not change item data, printed label designs or spreadsheet exports. Use horizontal scrolling when showing many fields.

## Bulk item/customer cleanup (v0.3.39)

Use checkboxes, **Select shown**, **Select entire Item/Customer List…**, or **Clear selection**. Select shown uses the currently displayed rows, up to 500. Select entire list selects every record, including inactive records and records outside the search filter. Selection remains across searches, and its full count is shown. **Delete selected** confirms and processes all selected IDs, not just visible rows; Clear selection starts over. Up to 50,000 IDs may be submitted at once.

Export to Excel and make a verified server backup before deleting. Unlinked test items/customers are erased permanently. Records linked to sales, work orders or open held receipts are made inactive to retain history; items on receiving vouchers are also retained. The completion message separates deleted and inactive counts. Existing sales, QuickBooks transactions, stock allocations and work orders are not erased or reset. Item List includes inactive items; Customer List has Show inactive. This is cleanup, not a complete database reset.


## Backup Settings (v0.3.40)

Open **Settings → Backups** on the Store Server or any paired till. The page controls the Store Server, not a separate backup on the till. Choose every 15 minutes, 30 minutes, hour, 4 hours or 24 hours, and retain 1–365 recent copies. Defaults are **hourly / 12 copies**. Save backup settings applies immediately without restarting. The next scheduled time is calculated from saving, or from completion of an in-progress backup. Every 24 hours means an elapsed interval while running, not a fixed clock time.

A startup backup is still taken whenever the Store Server starts. Closing the server POS stops the schedule; no background Windows service runs while it is closed. Restarting makes a new baseline and restarts the interval. The page shows last verification, last attempt, next run, errors, the actual server path, total size of regular files in the folder and managed/other file counts. The Home overdue indicator uses the saved interval with a 50% grace period (minimum 30 minutes).

**Back Up Now** runs the same verified snapshot process immediately. Concurrent scheduled/manual requests join the in-progress job instead of creating duplicate backups. The server finishes an active snapshot/cleanup before shutdown. If a request times out, refresh the page and check status before retrying. Manual runs use the last saved retention settings, not unsaved form edits.

Scheduled, startup and Back Up Now files use the generated **store-auto-…db** names and share one retention pool. Only after a new snapshot has been successfully written, passed SQLite integrity checking and been published does cleanup remove older generated copies beyond the saved count. This also applies to older scheduled files already in the folder: **the first successful backup after installing v0.3.40 can reduce them to 12**. Saving a smaller retention count alone does not delete files; it takes effect at the next verified backup. A failed snapshot keeps existing copies and the last successful verification time.

**store-before-v…db** snapshots taken before database migrations, partial files, differently named files, subdirectories and symlinks are excluded from automated cleanup. These can keep the folder larger than the recent-copy count suggests. The page reports other files separately; do not delete them blindly. A cleanup permission error is displayed separately: the new backup is still good, and cleanup retries after the next verified snapshot.

The folder remains `%APPDATA%\DiamondPOS\data\backups` on the server PC (the actual path is displayed). Snapshots use SQLite's online backup API, include committed WAL contents, and are converted to a standalone database before verification/publication. Verification does not modify the live database. Copies are local: separately arrange copying completed backups to another drive or off the PC. This page does not set up off-site copying, a tiered daily/weekly archive, automatic restore or a custom backup folder.


## Sale date and time (v0.3.41)

The Sell checkout panel defaults to **actual checkout time**. For an open-house or other sale entered later, tick **Choose sale date and time** and select the business date/time. Past and future dates are accepted. The field uses the till PC's local time and is sent as an unambiguous UTC timestamp; keep Store Server/till Windows time zones set consistently for your shop (America/Chicago for Diamond P).

The selected business date/time appears on receipts, Sale History and daily/ad hoc sales reports, and becomes the QuickBooks transaction date. Business-date sales reports place the receipt on that date. As of v0.3.42, the End of Day money/drawer section separately uses actual entry dates, so cash handled today stays in today's drawer count. The actual server time when it was entered is saved separately. Sale details identifies manually selected dates and shows **Entered**; ad hoc Sales reports also offer **Sale time**, **Entered at**, and **Date selected manually**. Existing sales keep their original dates, with the same timestamp copied to their historical entry field.

A date chosen before **Hold** is saved with the held ticket and recalled with it. Uncheck the date option to use checkout time when completing instead. After completion or putting a ticket on hold, the new sale defaults back to actual checkout time. Unknown checkout/hold response recovery reuses the saved request and chosen date. Completed sale dates are not editable; this does not rewrite existing or previously synced transactions.

Future-dated completed sales and unpaid account invoices are deferred until the selected local calendar day, then become eligible on a connector run. The POS/Store Server and Web Connector must be running for synchronization. A payment allocated to a future invoice waits until the invoice syncs. Existing sync-start-date and reconciliation checks still apply to backdated sales; check the QuickBooks queue if a date is before your configured start.

Completing a future-dated sale still collects/records payment and removes stock **now**. It is not a delayed stock/payment scheduler. Use a held ticket to prepare a sale that is not yet ready to complete; held stock is reserved under the existing hold rules. This feature does not automatically give a 10% discount or determine a vendor's event eligibility. Set the agreed item price using the existing price controls and verify the total before completion.

Update the Store Server first, then tills. A till checks that the server supports selected sale dates before posting one. Migration 29 adds audit timestamps and a held date field; it does not alter the dates of historical receipts. Test ordinary, backdated and future receipts in your QuickBooks test company before relying on event reporting.


## End of Day closeout

Open the existing **End of Day** Home icon, the optional navigation entry, or **Reports → End of Day & receipts**. Select a local calendar date and **All tills — Store Close** or one till. This is a QBPOS-style summary plus drawer count for the data DiamondPOS records, not an exact copy of every QBPOS feature. It is a calendar-day report, not a since-last-close shift reset. Generating/saving does not lock transactions, reset totals, settle a terminal, send data to QuickBooks, back up data or print.

### Two date bases

**Sales by selected business date** uses the date on the receipt. It shows receipt/refund/exchange counts; sales before returns (after discounts/credits); returns before tax; net sales; net tax; total including tax; account charges; tax-exempt net/counts; and known item price reductions given, returned and net. Voids are excluded from these live sales totals. Price reductions compare the saved regular price with the sold item price and reverse known reductions on receipt-linked returns; missing comparison prices/no-receipt returns are identified as unknown. Discount reasons are not tracked. Older inclusive-tax lines may lack complete tax/discount comparisons.

**Money handled on the actual entry/refund date** uses the server entry timestamp (historical fallback: original created time). This handles tickets backdated/future-dated in v0.3.41. It lists received, paid out/reversed and net amounts for cash, checks and standalone-terminal cards, with card-brand detail, account payments and itemized noncash entries. Cash is net of change. Account charges are not cash tenders; account payments are not new revenue. Mixed exchanges show merchandise returned in Sales, while tender totals show only the actual net payment/refund recorded.

Voids create report reversals on the void date and the till entered in the void workflow, using the original receipt's payment methods. Verify the payment-handling note and terminal: reporting assumes the separately confirmed refund/cancellation happened with those methods. It does not move real money. Same-day original payment/reversal nets to zero; cross-day original payments stay on their actual entry day. Void details list receipt, time, till, operator, reason and payment-handling note.

### Count and reconcile

For a single till, enter that drawer's **Opening cash**, **Actual cash counted**, and **Cash to leave**. All tills requires combined amounts across the store; do not enter one drawer's count against store totals. Optional **Other cash paid in/out** records count-only movements not already in the POS ledger; explain them in Notes. Do not duplicate sales, refunds or account payments. These fields do not create a payout ledger, sale or QuickBooks posting. Counts are amount totals, not bill/coin denomination counts.

Expected cash = opening cash + actual-date net cash payments + other cash in − other cash out. Over/short = counted cash − expected cash (positive is over). Cash deposit = counted cash − cash left. Cash left cannot exceed counted. Optionally enter terminal/check net totals to see differences against POS payment totals; these are not automatic bank-settlement values. Enter your name and notes before saving.

### Save, print and export

**Save counted closeout** creates a numbered, fixed snapshot of the displayed report, inputs, reconciliation, name and notes. It detects transaction changes since preview and asks you to refresh/review instead of silently saving stale numbers. An unconfirmed network save retains its original request for **Check / retry original save**, including after restarting the screen; retry does not create another snapshot. The typed name is an audit label, not authenticated manager approval.

Saved snapshots appear by date and till. Open one to view/print/export its original values; **Refresh / live report** returns to current transactions. Later entries, refunds or voids do not rewrite saved snapshots. Create a new one after reviewing late changes. Closeout snapshots do not automatically carry opening float to the next day or prevent multiple closes for a date.

**Print report** sends a full-page report to the configured full-page printer (Windows default if unset). No printing occurs on save. **Export to Excel** includes summary, payment methods, card types, money detail, sales, voids, per-till totals and drawer calculations. Receipt buttons open original receipt details for the existing manual reprint/void workflow. Report print/export without a cash count is a status report marked not counted, not a saved drawer close.

At closing, separately reconcile/settle the standalone card terminal, run QuickBooks Web Connector and verify backup status. Gift cards/store credits, discount reason codes, cashier/shift accounting and integrated card settlement are not implemented and are not fabricated by this report.


## Customer equipment and service history

Open **Customer List**, then open a saved customer. **Customer Equipment** appears in the right-hand column above receipt History. The first line shows the linked unit count; each unit shows its label, serial and work-order count. Expand it for unit type, brand, model, serial, hours, notes and purchase information. A **Receipt #** link opens the original purchase receipt when a recorded Diamond P sale exists. “Purchase not recorded at Diamond P” does not assert where it was bought; repair intake units may have no sale.

This reads existing customer-unit links: units added in work-order check-in and serialized units sold to a customer are included automatically. A unit does not need a completed sale or a completed repair to appear. Inactive units remain visible with an Inactive badge. Existing duplicate unit records are not merged automatically, and viewing equipment does not create a new unit or change inventory.

Each unit lists all associated work orders, including open and Picked Up/closed tickets, with ticket number, stage, check-in timestamp and reported problem. Click a ticket to read its problem, diagnosis, work done, internal notes, parts/charges before tax and history. This service-history view is read-only; open the normal Work Orders screen to edit the ticket, change stage or take payment. Work-order history uses the existing saved unit and customer IDs rather than searching by a possibly repeated serial number.

Use **Refresh equipment** after another till checks in or updates a unit/ticket while this customer window remains open. Reopening the customer loads fresh data. New unsaved customers show a Save-first message. If no units are linked, the page says so; customer spreadsheet contact imports alone do not create equipment records.

This update is the customer equipment/history display. Phone access, intake image upload and photo storage/backup are separate future work and are not available in this release. Update the server before tills so the new equipment endpoint is present.

## Website marketing consent (v0.3.44)

Configure the cPanel consent service through Settings → Email → Website marketing consent, following extras/cpanel-marketing/CPANEL-SETUP.md. Marketing emails include a website confirmation link. Confirming suppresses that address immediately at the website, and the Store Server syncs approximately every minute and before each marketing send. Every matching customer loses OK to email. Website outages pause campaigns; work-order/estimate messages stay separate.

Saved unsubscribes survive customer edits/imports and backups. They cannot be reversed with the checkbox; use the confirmed re-subscription workflow below. If a customer replies asking to unsubscribe, staff must uncheck OK to email and save; this immediately blocks local marketing and queues the website opt-out. Recent unsubscribes, last successful sync and pending opt-out uploads appear in Email settings. Queued recipients whose consent/address/active status changed are skipped.

Export eligible contacts first synchronizes suppression and produces a deduplicated CSV. A website sender must still check the suppression service before each recipient; an older export never overrides unsubscribes. The website campaign dashboard is not included in this update. After restoring POS or website data, use Replay suppression history; separately back up the private cPanel database so old unsubscribe links remain valid. Emails already handed to SMTP cannot be recalled.

## Campaign opens and clicks (v0.3.45)

Marketing → Mailers shows distinct recipients with detected opens/clicks out of successfully sent messages containing tracking. Open a campaign and scroll to Campaign activity for recipient status, observed counts, first/latest timestamps and individual clicked links. Filter the list or export all recipients to Excel. Sync activity now updates from the website; the Store Server also syncs approximately every minute. Replay activity history rereads all campaigns without duplicating recorded events, useful after restoring a backup. Activity errors leave existing results available and show that the feed is stale.

Paste full HTTP/HTTPS URLs in the message to make clickable, trackable links. A link drawn into a flyer image is not clickable. No tracking is added to previews, Send test, SMTP configuration tests, work-order messages or estimates. Test with an actual campaign limited to your own opted-in address. Settings → Email controls tracking for future campaign sends; older sent links can still collect activity. Existing unsubscribe controls remain separate, and an opted-out address stops generating new activity.

An open is an observed image load, not confirmed reading. No open detected does not mean unread. Privacy features, image blocking/caching and automated scanners can affect both opens and clicks. Forwarded copies retain the original recipient's identity; forwards and deletes cannot be detected. Sent means SMTP accepted the message, not confirmation of inbox delivery. Messages sent before tracking was included remain untracked.

Upgrade the cPanel public files using extras/cpanel-marketing/CPANEL-SETUP.md before sending tracked campaigns. Keep the same private configuration/key/database and restore your custom configPath in index.php. Back up the website database separately; POS backups contain only already synchronized activity. After restore, replay both activity and suppression histories using their separate buttons.

### Service-history audiences

In the mailer audience builder, choose Customers with service history. Select any service or mower/handheld/other equipment. Completed means the ticket is Ready for Pick Up or Picked Up; the alternate choice includes in-progress, non-cancelled work orders. Not Fixed tickets are excluded, including picked-up jobs whose previous recorded stage was Not Fixed. Choose a check-in date lookback and optional customer types. Customers only need a linked work order, not a sale or purchase from Diamond P. Marketing permission, active status, duplicate-address handling and unsubscribes still apply. The date range is based on check-in date rather than completion or last edit.

### Delete old campaigns

Use Delete on the mailer list or Delete campaign inside its editor and confirm. This permanently removes the local campaign and its recipient/activity history. Customer records and unsubscribe preferences remain. Stop sending first; if an email is already being handed to SMTP, wait for it to finish before deleting. Existing emailed links stay functional, and old activity does not recreate deleted campaigns. A restore of an earlier POS backup can restore previously deleted campaigns.

## Subscribe again and marketing entry improvements (v0.3.46)

For a saved active customer who requests marketing again, use Request confirmation email next to OK to email. It uses their saved address; save changes first. They can also use the website service's ?action=subscribe page, linked from old unsubscribe pages. Neither a request nor receipt of the email changes permission. The Store Server must be running with working email settings; it checks about once a minute. Settings → Email → Process confirmation requests now runs it immediately and shows recent requests/errors/confirmed permissions.

A valid email link displays a confirmation page. The customer must press Confirm marketing subscription within24 hours after issue. Mere viewing/scanning does not subscribe. After website confirmation, the next POS consent sync restores permission for all matching addresses. Inactive customers stay inactive; no new customer record is created by the public form. Only future/new campaigns use that consent; skipped messages are not resent. A later opt-out invalidates old confirmation requests/links. Limits prevent repeated confirmation emails; check spam/recent requests rather than repeatedly requesting. If the POS had a pending offline opt-out, sync first and request again afterward.

Do not check the box/import Yes to bypass suppression. Confirmed consent is audited in website/POS databases. Back up both systems separately, and use replay options after restores; restored suppression history is distinguished from an intentional new opt-out. Older website/POS consent versions are blocked from syncing to protect fresh confirmations.

Campaign inputs update without rebuilding the full preview on each keystroke. Preview follows after a250ms pause. List/progress refreshes no longer carry full flyer images, and stale audience/load responses cannot replace newer edits. Existing campaigns display Loading until their saved fields are ready. Check the Windows typing behavior after upgrading.

## Campaign map and graphs (v0.3.47)

Open Marketing → Mailers → a sent/stopped campaign, then scroll to Campaign activity → Campaign insights. Use the report-period selector for7/30/90 days or all time. The map can show opens or clicks; drag to pan, use+/− to zoom, or choose World/U.S. mainland. Select a marker (or focus it and press Enter/Space) for reported location counts. The daily trend, Central-Time hourly graph, engagement rings, top locations and full table summarize observed activity. Export charts data saves summary/daily/coarse-location data to Excel.

These are approximate network-request locations, not customer addresses or proof of a person's whereabouts. Privacy services, scanners, VPNs and forwarded copies can change them. No open detected never proves unread. Older/unavailable locations remain unknown; they are excluded from markers but included in totals. Recipient engagement divides distinct period-active recipients by all successfully sent tracked messages for that campaign. The existing recipient activity table remains all time.

The map outline works locally with no external map tiles. To record new city markers, configure your own private geolocation API key and optional lookup on cPanel, following extras/cpanel-marketing/GEOGRAPHY-SETUP.md. Until then, graphs work and map setup/unknown-location messages are shown. Provider outages/quotas do not remove ordinary tracking counts. App records coarse coordinates only; the provider receives the request IP transiently for its lookup. Existing private consent/key/database must be preserved when upgrading all five public files.

## Input focus, printing and closing (v0.3.48)

Confirmations now appear inside the POS. Choose Continue to approve, or Cancel/Escape to cancel. The initial button is Cancel for safety; this replaces old OK/Cancel browser popups and returns focus when finished. A scanner's Enter should not approve a destructive action accidentally.

If clicking still works but typing stops, open Help and choose Restore keyboard focus, then click the desired field. Open diagnostic logs in Help opens application.log for support. Note the time and whether this PC is Store Server or Till. These logs describe timing/lifecycle, not customer or payment contents.

Hidden printing windows do not take keyboard focus and are cleaned up. A printer timeout after about30 seconds does not mean the sale failed or that nothing printed; check the printer and original receipt before retrying. Prints are still manual; no auto-reprint is added.

Closing/Alt+F4 shows Closing Diamond POS while connections/jobs stop, then exits. A stalled asynchronous cleanup has an approximately20-second fallback. Backup verification runs separately from the main loop; closing can discard an unfinished unpublished snapshot while preserving prior verified backups. Finish actual payments/QuickBooks sync before deliberately closing. If checkout was uncertain, use its existing recovery rather than charging again.

The installed app should not leave an invisible print window keeping it alive. In development, npm run dev can leave a separate terminal watcher; stop that watcher with Ctrl+C. The exact intermittent Windows issue still requires on-PC verification. If it recurs after this update, send the diagnostic log.

### Mechanics and On the Bench

In **Work Orders → Work order settings → Mechanics**, enter a name and click **Add mechanic**. **Remove** hides that mechanic from new assignments while keeping their name on existing tickets and in history. Add the same name again to restore them.

Open a ticket and use **Assigned mechanic** to choose a mechanic or **Unassigned**. Assignments are shared across tills, recorded in ticket history, and displayed on the work-order list. Closed tickets retain their assignment.

Move an approved repair to **On the Bench** once all listed parts are available and the mechanic starts work. You can move there from **Approved to Fix** or **Waiting on Parts**. Tickets with listed parts still short must wait until receiving is complete. The stage keeps existing parts reservations without taking stock again. Next move to **Ready for Review**, or back to **Waiting on Parts** if needed. Set its color under **Stage colors**. Changing this stage does not automatically print or email anything.

### Several units brought in together

Keep one work order per unit, then group the tickets for that customer visit. For example, four chainsaws become four tickets marked **1 of 4**, **2 of 4**, **3 of 4**, and **4 of 4**.

From a ticket, use **Add another unit for this visit**. The customer is already selected; choose or add the next unit and enter its problem and estimate fee. The new ticket joins the visit automatically. To group tickets already created, choose an existing ticket under **Customer visit** and click **Link existing ticket**. Only tickets for the same customer can be linked. Linking a ticket from another visit group joins that entire group after confirmation.

The group lists each unit, serial number and repair stage. Click its work-order number to open it. The work-order list, ticket header and manually printed full-page ticket show the current position and group count. Tickets retain separate estimates, approval links, mechanic assignments, stock reservations and payments. Completing or picking up one unit keeps it in the visit count; the other units can continue through their own repair stages.

Use **Remove this ticket from group** to correct a link. This keeps the ticket and its charges. Numbering reflects the current group in work-order creation order and can change when tickets are linked or removed; previously printed pages are not updated automatically. Unrelated visits for the same customer stay separate unless you explicitly link them.

### Default printers and choosing a different printer

Under **Settings → Printing**, save the default **Receipt printer**, **Full-page printer**, and **Label printer** for each computer. Defaults are local to that PC. Keep **Ask which printer every time** checked for sale receipts so you can choose the format and printer before sending them.

Labels, work-order pages, printer test pages and custom reports show a printer prompt before sending the job. The saved printer is selected when it is installed on that PC. Change the selection for this job and click **Print**, or **Cancel** to send nothing. Choosing a different printer does not overwrite your saved defaults. A label batch prompts once and uses the chosen printer for all of its label templates.

If no default has been saved or that printer is missing, choose an installed printer explicitly. Labels do not silently fall back to the Windows default. **Refresh printers** reloads the list after you reconnect or install a printer.

### Cancel an entire sale before checkout

Click **Cancel sale** at the bottom of the Sale screen and confirm. This clears all current items and returns, the customer, selected tax settings and any chosen sale date/time, so you can start again. The last completed receipt remains available to reprint.

If you recalled a held receipt, **Cancel sale** also cancels that saved hold and releases its reserved inventory. The confirmation explicitly says this. The screen clears only after the Store Server confirms cancellation. If the request fails, the current sale remains so you can retry. Retrying a successful cancellation does not return stock twice. If you loaded a work order for payment, cancelling removes it from this checkout while keeping the work order and its reserved parts.

You cannot cancel a checkout or hold while its save result is still being confirmed. Use its **Check / retry original** action first. To reverse a completed sale, use the existing **Void** process from its saved receipt.

### Sales Receipt layout and internal cost columns

**Make a Sale** uses a full-width Sales Receipt grid. Scan or search items across the top. Type a customer name or phone in the customer box and click **Find** (or press Enter) to open the customer search with that text already entered. Use **I want to…** for Find item, Quantity, Remove line, Customer, Work order, Return and Kiosk. Existing F-key shortcuts still work. Quick Picks have been removed; use scanning or Find item.

Select an item row and use the **−1**, **+1**, **Change qty** or **Remove line** buttons below the grid. Totals are at the lower right, followed by **Cash**, **Credit / Debit**, **Check** and **Charge to account** along the bottom. Account payment is available for an eligible customer; refunds retain their existing payment restrictions. **Amount Due** (or **Refund Due**) is shown beside the payment buttons. The footer has Hold/Held receipts, Cancel sale and Reprint last receipt. Gift payments are not offered. Payments keep the existing confirmation flow; there are no placeholder Save buttons.

Open **Sale options · date & time** below the grid to override a sale date; an active override is shown in that heading. Tax selection/exemption, fee credits, change due and the last completed receipt remain visible when applicable.

Right-click a grid heading to show or hide **Cost**, **Last received cost** and **Current average cost**:
- **Cost:** the configured order/purchase cost per unit, as entered on the item (may differ from the latest invoice if receiving did not update order cost).
- **Last received cost:** per-unit invoice cost from the latest posted receiving, excluding allocated freight. Draft vouchers do not count.
- **Current average cost:** the current saved inventory unit average, including freight when it was allocated to cost. This is not the lifetime receiving average.

These optional columns start hidden and are remembered separately on each PC. Existing saved column selections remain intact; **Reset to default** uses Item #, Alt lookup, Item Name, Attribute, Size, Qty, Price, Ext. Price and Tax. Costs are fetched only when a cost column is visible. A dash means no cost/history is set, $0.00 means a genuine zero cost, and Unavailable means cost lookup failed. Fee/credit/non-product rows have no unit cost. These are internal screen columns and do not add costs to customer receipts or printed labels.

### Take payment on account from Make a Sale

Click **Take payment on account** in the Sale footer, or choose it from **I want to…**. You do not need to select a sale customer or add an item first.

The customer list shows only accounts with an outstanding DiamondPOS balance, with each customer's name, phone, open invoice count and amount owed. Search by name, company, phone or customer number. **Refresh** reloads the balances. Customers with existing debt remain visible even if they have since been made inactive or disabled for new account sales.

Click **Take payment** beside the customer. Review their invoices and balance, then record cash, card or check using the existing account-payment form. Partial payments are allowed up to the current balance. Card processing still happens on the separate terminal. Check payments require a check number. The payment follows the existing QuickBooks synchronization and recovery process and is not another sale or inventory deduction.

Any sale you were building, including its customer and items, stays in place. Closing the account window returns you to it. Reopening the list refreshes balances, and customers whose balance is now zero disappear.

The list includes invoices raised by DiamondPOS and balance changes received from QuickBooks through Web Connector. It does not include invoices created only in QuickBooks. Check the balance update time in the account screen if a payment was taken in the back office.

### Receiving parts for waiting work orders

After you post **Receive items**, DiamondPOS checks inventory items from that voucher against tickets currently in **Waiting on Parts**. If matches exist, a notice lists the ticket, customer, equipment, mechanic and matching parts. **Open work order** opens the ticket for review. **Done** dismisses the notice; **Continue to label options** opens the existing manual label choices. Nothing prints automatically.

The notice shows the total received on the voucher and quantity listed on each ticket. If multiple tickets need the same part, the received total is not a separate allocation to every ticket. A ticket can still have a shortage after a partial delivery or when other required parts have not arrived. The availability message checks all parts on that ticket under the existing reservation rules. Review the stock and repair before changing its stage yourself.

Posting does not automatically change work-order stages, assign mechanics or contact customers. The notice appears on the computer posting the receiving. Reopen the posted voucher and click **Review waiting work orders** to refresh current matches; tickets that have left Waiting on Parts will no longer appear.

### Fit the POS to the screen

Open **Settings → Display**. **Auto fit** is the default and adjusts the whole POS to its current window, including the usable space left by Windows display scaling such as 125%. Maximize the app for the most room. Resizing recalculates the scale without changing Windows settings.

Auto fit uses 85–100% app zoom. It preserves the layout while keeping a lower readability limit; smaller windows can still need scrolling. Select a fixed percentage and click **Apply display size** if you prefer larger text or a consistent size. The choice is remembered on this computer only. Receipt, full-page and label print dimensions do not change.

### Credit or Debit only

New card sales, refunds and account payments offer only **Credit** and **Debit** in the Card type selector. Credit is initially selected; change it to Debit when appropriate. Complete the payment/refund on the separate terminal before confirming it in the POS. No terminal reference is required.

Receipts and account history retain the selected type, end-of-day reports break out Credit and Debit, and QuickBooks can map each to a different payment method. Visa/Mastercard and other historical brand data remain unchanged on older transactions and recovered pending requests; those brands are no longer choices for a new payment.

### Alternate lookup on receipts

**Alt lookup (ALU)** is available in the sale grid column menu and is included in the default column order. Existing custom column selections are retained; right-click a heading to add Alt lookup or reset to defaults if needed. Scanning an ALU still finds the item.

Open **Settings → Receipt Layout**, select the **Items** block, and use **Alt lookup (ALU)** to show or hide it under each receipt item. It is enabled by default when updating an older receipt layout. The preview uses sample ALUs. Full-page sale receipts also show an item's ALU when present. New receipts store the ALU used at checkout, so later item edits do not change it on a reprint. Receipt-linked refunds retain that original ALU. Older receipts without a snapshot use the item's current catalog ALU when available.

### New estimate response notice

When the Store Server receives a new website approval or decline, a **New estimate response** notice pulses in the top header. Tills check for notices every 15 seconds; website synchronization still follows its existing schedule. Responses needing staff review are included. The notice remains unread in the server database across restarts.

Click the header notice to see the response list and acknowledge the responses shown. Click **Open work order** beside a response to review its ticket. Acknowledgement is shared across tills; newly arriving responses stay unread until they are also opened. If acknowledging fails, the header remains available. People who prefer reduced motion see a steady highlighted notice instead of animation. The notification does not change the existing approval/decline or stock rules. Only responses received after this update are added to the unread list.


## Sending work-order notices by email or text

In Work Order Settings, enable **Work-order texts — Mobile Text Alerts**, enter the provider API key and the store phone number, and save. An account enabled for custom messages and a verified sender number is needed. Blank API key keeps the saved key. Keys are stored in the server database and backups; do not share them. Contacts sent by number may be added to the provider account: keep service recipients separate from marketing audiences.

On an estimate or Ready for Pickup ticket, open **Send estimate for decision** or **Notify customer**. Check **Email**, **Text**, or both. Text uses the customer's mobile number, falling back to their phone. Verify the displayed number and confirm the customer agreed to receive service texts. Review the previews and send. These notices are manual; changing a stage does not automatically send anything.

Both estimate messages contain the same revision's approval link. Customers approve or decline on that webpage. Replies to email and text are not monitored in DiamondPOS. Messages tell customers to use the link for decisions and call the store for questions. Mobile Text Alerts processes STOP requests; there is no conversation inbox in the POS.

The result banner and ticket history show each channel separately. **Accepted** means the mail server/provider accepted the request, not confirmed delivery or reading. **Failed** means that channel failed. **Unknown** means the service might have accepted it before the connection failed: check the mail service or Mobile Text Alerts before deliberately sending again. Repeating the same request does not automatically send another message. If either channel accepted or may have accepted an estimate, its decision link stays usable and the follow-up timer starts. If every channel definitely failed, the timer does not start.

## Adding an unpaid estimate fee to the repair bill

On an open ticket with an unpaid fee, choose **Add estimate fee to bill** and confirm. This is an additional bill charge, with no credit for an upfront payment. Collecting the fee upfront retains the existing credit toward repair. Edit the estimate-fee line to change its amount, or remove it to waive the fee. If the repair is declined, ring up the ticket to collect only the deferred estimate fee; unused repair lines are excluded. It can be charged to the customer's enabled account using the normal checkout process.

## Finding a customer while making a sale

Type at least two characters in the customer field to see matching active customer names/company names, email/customer-number prefixes or phone prefixes. Use the arrow keys and Enter or click a result to select it. **Find** opens the full customer picker. Escape closes suggestions.


### Saved permission for service texts (v0.3.52)

Open **Customers → Add/Edit customer → Contact Info**. Enter the mobile number (phone is used if mobile is blank), then check **OK to text service updates** only after the customer agrees to estimate and pickup texts. Save. Existing customers start unchecked. This is separate from marketing email permission. Phone-number edits clear the choice so permission can be confirmed for the new number. Provider STOP opt-outs still apply; the POS checkbox does not override them.

Reopen the work order after saving the customer. **Text** is available in the estimate/pickup Notify dialog only when that customer's permission is saved. Email remains available independently. The server checks saved permission before sending. Replies are not monitored.

For the API key, open **Work Orders → Work order settings**. The **Work-order texts — Mobile Text Alerts** section at the top contains Enable, API key, store phone and Save text settings. In v0.3.51 a routing bug could replace the form with Work order not found; update the Store Server and every till to v0.3.52 to fix it.


### Taking payment when approval was handled outside the website

A **Ready for Pickup** ticket can be rung up using its current bill even if an old online estimate is pending, failed, or differs from the current repair. Confirm the current work and total with the customer in person or by phone as appropriate; you do not have to send a new approval email/text just to collect payment. Send a revised estimate if you want a new online decision.

Payment does not record a website approval or change previous approval evidence. Checkout history notes when the online estimate was not approved for the current details. Earlier-stage tickets still need to be moved to Ready for Pickup before repair checkout; closed tickets cannot be charged again. Existing paid estimate credits, deferred estimate fees, account billing and inventory handling continue normally.


### Home backup status

The bottom Home card shows the Store Server's last verified backup, actual next scheduled backup and saved frequency from Backup Settings. It refreshes every 30 seconds. During a backup, the next run is scheduled after that backup finishes. A stopped schedule or unavailable connection is labelled explicitly; historical times are not presented as a fresh server check. The card does not change how often backups run or how many are kept.


### QuickBooks income mapping (v0.3.54)

The QuickBooks connection has one **Income account** row: **POS General**. Select the QuickBooks income account to use for new sales and work-order charges. Vendor/department mapping rows are no longer shown, and old department overrides are ignored for new exports. POS departments and vendor records remain available for local inventory/reporting.

Existing transactions already sent to QuickBooks are not rewritten or deleted. Taxable/non-taxable treatment and the separate tax-rounding reconciliation remain. Update the Store Server first so exports use the new mapping; update tills to see the simplified screen. No chart-of-accounts item or income account is deleted by this update.


### Star TSP100 receipt printing (v0.3.55)

Select the installed Star TSP100 in Settings → Printing. For the standard 80mm roll keep DiamondPOS at 80mm; the Star Windows driver's 72mm × Receipt names its printable area. The app measures receipt content and sends Windows an explicit width/length for each thermal job. Test receipts use this same path.

If a Windows test page works but DiamondPOS feeds/cuts blank, test the updated app using Print test receipt. If it remains blank, report the app version, exact Star Windows printer/driver name and diagnostic log from Help. A successful spool callback only means the job was accepted; visually check text, width, total and cutting. Reprint an existing receipt rather than creating another sale. Label and full-page printing retain their existing settings.


### Receipt measurement error and test status (v0.3.56)

Version 0.3.55 could stop with Script failed to execute before sending a receipt to Windows. Update the computer doing the printing to v0.3.56. The print window now allows the app's measurement code to run in its sandbox.

Settings → Printing shows test progress/errors at the top and beside Print test receipt. Select a printer and click Print when prompted. Waiting or a rendering error does not mean Windows received the job. “Test job accepted by Windows” means the driver accepted it; check the actual paper before confirming printing works. Test controls stay disabled until the job finishes or reports an error.
