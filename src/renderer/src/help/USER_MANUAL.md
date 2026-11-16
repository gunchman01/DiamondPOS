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

**Card payments/refunds:** after the standalone terminal approves the payment, optionally choose the card brand (Visa, Mastercard, Discover, American Express, Other, or Unknown). No terminal reference is requested for new card checkouts. Check numbers remain required for checks. Historical references are retained. Receipts/history show the selected brand; daily Card totals still combine all brands. No card-reader or payment-gateway integration is included.


**Serialized equipment:** select a customer for every sale containing a serial number. Items marked Use Serial # must have a serial at checkout, and every serialized unit must be on its own line. The Store Server independently checks these rules. Receiving remains quantity-only; serials are captured at sale time.

Duplicate matching is store-wide, case-insensitive for ordinary serial letters, and ignores leading/trailing spaces. Duplicate serials within one checkout or an existing completed, unreturned sale are blocked. Use a receipt-linked return before reselling a returned unit. A no-receipt return records its serial but cannot release an unidentified original sale's serial/ownership link. Historical sales are not rewritten. If an older held receipt is missing its required serial, remove/rescan that item to capture the serial before payment.


**Quantity directly on the receipt:** each item row has a Qty box with − and + buttons. Click the box and type a whole quantity. Enter, Tab or clicking away saves; Escape restores the previous value. Totals update after saving. Zero removes the line; a negative sale quantity opens Return details. Invalid quantities are shown beside the box without changing the saved quantity.

Serialized equipment stays at one unit per line. Return rows show negative quantities: − increases the number coming back and + reduces it toward zero. Receipt-linked returns cannot exceed the units still available, including other return lines already on this checkout. Editing a return retains its reason, stock choice, original price and tax. To sell an item instead of returning it, remove the return and scan it again. Work order/credit/fee quantities are not edited from this grid.

F3 / Change qty and its + Sale / − Return sign buttons are still available.


Open **Make a Sale**.
1. **Scan** the barcode, or start typing an item number or description: matching items pop up as you type. Click one, or use **↑ ↓** and **Enter** to add it. Typing a full item number and pressing Enter adds it straight away.
2. Tap a **Quick Pick** button for items that are often sold (if any are set up).
3. Click a line to select it, then use **+1 / −1**, **Change qty** or **Remove line**. The red **✕** at the left of each line removes that item.
   - **Change a price:** click the price on the line, type the new price and press **Enter** (Esc cancels). It's for this sale only; the item's regular price doesn't change. A changed price shows in red with the regular price crossed out under it, and the receipt keeps the regular price for reports. Type the regular price again to undo it. A held receipt keeps the changed price.
4. Add a **customer** if needed (F5), see below.
5. Take payment with **Cash (F7)**, **Card (F8)** or **Check**.

**Cash:** type the amount received (or tap Exact / $10 / $20…). The change is shown.
**Card:** enter the total on the card terminal. When it says APPROVED, optionally choose the card brand and click **Card approved – complete sale**.
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

**Choosing the columns:** right-click the column headings on the receipt (Item #, Description, Qty…) to pick which columns show: UPC, ALU, Department, Manufacturer, Vendor, Size, Attribute, Unit, Serial #, On Hand, Tax, Cost, Reg Price and more. Right-click a heading to move that column left or right. **Reset to default** puts it back. Each till remembers its own choice. Description, Qty, Price and Ext. Price are always shown.

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

You can also click **↩ Return** on the Sale screen to start from a receipt or customer search.
1. Find the original sale:
   - type or **scan** the **receipt number** (receipts can print a barcode, see Receipt Layout), or
   - click **Find by customer** and pick the receipt from their list, or
   - click **No receipt** (see below).
2. Tick each item coming back. Enter how many, choose a **reason**, and choose **Back to stock** or **Damaged – don't restock**.
3. Click **Add to sale as return**. The items show in red as negative lines.
4. For an **exchange**, now scan the new items. Only the difference is paid or refunded.
5. If the customer is owed money the total box says **Refund due**:
   - **Refund cash**: give the amount back from the drawer.
   - **Refund card**: do a refund on the card terminal for that amount, then optionally choose the card brand and confirm.
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

**Ringing up a repair:** when the ticket is Ready for Pick Up, click **💳 Ring up at till**. On the Sale screen you can also click **🔧 Work order** and choose the ticket. The ticket lines are locked on the sale, the fee credit is shown, and the box says **Balance due**. Extra items can be scanned onto the same sale.

## Items
Open **Item List**.
- Search by name, item #, UPC or department. Click an item to edit it; click **+ Add item** to add one.
- The item window holds price, cost, MSRP, Custom Prices 1-4, department, on-hand quantity, vendor, taxable, and more.
- Tick **Quick Pick** to show the item as a button on the Sale screen.
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
Open **Sales History** or **Reports**, choose **Daily closeout & receipts**, and pick a date.
- Totals across all tills: number of sales, takings (after refunds), tax, **cash** (after change), **card**, tax-exempt sales and **returns**.
- Every sale is listed with its till and customer. Refunds and exchanges are marked. Click a sale to open the full receipt, or **Reprint** for a printed copy.
> Compare "Card (terminal)" with the settlement total printed by the card terminal at the end of the day.

## QuickBooks

**Card-brand mappings:** in Where sales go in QuickBooks, use Optional card-brand payment methods to select existing QuickBooks methods for Visa, Mastercard and other brands. Create missing methods in QuickBooks and refresh lists first. Blank mappings fall back to the general Card payment method. All brands retain the configured Card deposit account. The recorded brand also appears in the sale memo even when its mapping is blank; Unknown is never guessed from historical card references. Previously synced sales are not resent or rewritten.

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

Open **Reports** in the left navigation or on Home. Choose Sales, Inventory or Receiving. Select a ready-made report to open its options, then click **Run report**. **Daily closeout & receipts** keeps the existing date-based totals, receipt viewing and reprinting.

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

Use checkboxes, **Select shown**, **Select entire Item/Customer List…**, or **Clear selection**. Select shown uses the currently displayed rows, up to 500. Select entire list selects every record, including inactive records and records outside the search/Quick Pick filter. Selection remains across searches, and its full count is shown. **Delete selected** confirms and processes all selected IDs, not just visible rows; Clear selection starts over. Up to 50,000 IDs may be submitted at once.

Export to Excel and make a verified server backup before deleting. Unlinked test items/customers are erased permanently. Records linked to sales, work orders or open held receipts are made inactive to retain history; items on receiving vouchers are also retained. The completion message separates deleted and inactive counts. Existing sales, QuickBooks transactions, stock allocations and work orders are not erased or reset. Item List includes inactive items; Customer List has Show inactive. This is cleanup, not a complete database reset.


## Backup Settings (v0.3.40)

Open **Settings → Backups** on the Store Server or any paired till. The page controls the Store Server, not a separate backup on the till. Choose every 15 minutes, 30 minutes, hour, 4 hours or 24 hours, and retain 1–365 recent copies. Defaults are **hourly / 12 copies**. Save backup settings applies immediately without restarting. The next scheduled time is calculated from saving, or from completion of an in-progress backup. Every 24 hours means an elapsed interval while running, not a fixed clock time.

A startup backup is still taken whenever the Store Server starts. Closing the server POS stops the schedule; no background Windows service runs while it is closed. Restarting makes a new baseline and restarts the interval. The page shows last verification, last attempt, next run, errors, the actual server path, total size of regular files in the folder and managed/other file counts. The Home overdue indicator uses the saved interval with a 50% grace period (minimum 30 minutes).

**Back Up Now** runs the same verified snapshot process immediately. Concurrent scheduled/manual requests join the in-progress job instead of creating duplicate backups. The server finishes an active snapshot/cleanup before shutdown. If a request times out, refresh the page and check status before retrying. Manual runs use the last saved retention settings, not unsaved form edits.

Scheduled, startup and Back Up Now files use the generated **store-auto-…db** names and share one retention pool. Only after a new snapshot has been successfully written, passed SQLite integrity checking and been published does cleanup remove older generated copies beyond the saved count. This also applies to older scheduled files already in the folder: **the first successful backup after installing v0.3.40 can reduce them to 12**. Saving a smaller retention count alone does not delete files; it takes effect at the next verified backup. A failed snapshot keeps existing copies and the last successful verification time.

**store-before-v…db** snapshots taken before database migrations, partial files, differently named files, subdirectories and symlinks are excluded from automated cleanup. These can keep the folder larger than the recent-copy count suggests. The page reports other files separately; do not delete them blindly. A cleanup permission error is displayed separately: the new backup is still good, and cleanup retries after the next verified snapshot.

The folder remains `%APPDATA%\DiamondPOS\data\backups` on the server PC (the actual path is displayed). Snapshots use SQLite's online backup API, include committed WAL contents, and are converted to a standalone database before verification/publication. Verification does not modify the live database. Copies are local: separately arrange copying completed backups to another drive or off the PC. This page does not set up off-site copying, a tiered daily/weekly archive, automatic restore or a custom backup folder.
