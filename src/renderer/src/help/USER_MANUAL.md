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

## The Home screen
Home is where every area of the app starts. Click **Home** at the top of any screen to come back.
- The buttons on the left open the most-used screens. **Today** shows the number of sales and the takings so far.
- The tiles on the right are grouped like the store: Point of Sale, Purchasing, Inventory and Operations.
- Tiles marked "coming soon" (for example Held Receipts, End of Day and Purchase Orders) are not built yet.
- Press **F1** on any screen, or click **? Help** at the top, to open this manual.

## Making a sale
Open **Make a Sale**.
1. **Scan** the barcode, or start typing an item number or description: matching items pop up as you type. Click one, or use **↑ ↓** and **Enter** to add it. Typing a full item number and pressing Enter adds it straight away.
2. Tap a **Quick Pick** button for items that are often sold (if any are set up).
3. Click a line to select it, then use **+1 / −1**, **Change qty** or **Remove line**. The red **✕** at the left of each line removes that item.
4. Add a **customer** if needed (F5), see below.
5. Take payment with **Cash (F7)**, **Card (F8)** or **Check**.

**Cash:** type the amount received (or tap Exact / $10 / $20…). The change is shown.
**Card:** enter the total on the card terminal. When it says APPROVED, type the terminal's reference number and click **Card approved – complete sale**.
**Check:** check the amount and signature, type the **check number** (required) and click **Check received – complete sale**. No change is given from a check.

After the sale, click **Print receipt** or **Reprint last receipt** (or set the till to print automatically, see **Printing**). Sales with a serial-numbered unit and work order payments can print on a full Letter page on the laser printer instead of the receipt printer.

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

**Choosing the columns:** right-click the column headings on the receipt (Item #, Description, Qty…) to pick which columns show: UPC, ALU, Department, Manufacturer, Vendor, Size, Attribute, Unit, Serial #, On Hand, Tax, Cost, Reg Price and more. Right-click a heading to move that column left or right. **Reset to default** puts it back. Each till remembers its own choice. Description, Qty and Ext. Price are always shown.

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
- If the customer has a current **Farm Tax ID**, the sale is tax exempt automatically. Untick **Tax exempt sale** to charge tax this time.
- If their Farm Tax ID has **expired**, the sale screen warns you and tax is charged. Click **Update Tax ID** to enter the details from their new card.
- Receipts for tax-exempt sales print the Farm Tax ID.

## Returns, refunds and exchanges
Click **↩ Return** on the Sale screen.
1. Find the original sale:
   - type or **scan** the **receipt number** (receipts can print a barcode, see Receipt Layout), or
   - click **Find by customer** and pick the receipt from their list, or
   - click **No receipt** (see below).
2. Tick each item coming back. Enter how many, choose a **reason**, and choose **Back to stock** or **Damaged – don't restock**.
3. Click **Add to sale as return**. The items show in red as negative lines.
4. For an **exchange**, now scan the new items. Only the difference is paid or refunded.
5. If the customer is owed money the total box says **Refund due**:
   - **Refund cash**: give the amount back from the drawer.
   - **Refund card**: do a refund on the card terminal for that amount, then enter the terminal's reference.
   - The screen suggests the same way the original sale was paid.

**Good to know**
- Refunds are always the price the customer actually paid on that receipt, even if the price has changed since.
- You can't return more than was bought on a receipt. Items already returned are greyed out.
- Work order charges (labor, parts used, estimate fees) can't be returned here.
- A returned serial-numbered unit is removed from the customer's units.
- **No receipt**: pick the item. It's refunded at today's price and the sale is marked as a no-receipt return.
- The receipt prints **REFUND** or **EXCHANGE**, the original receipt number and a line for the customer's signature.

## Work orders (repairs)
Open **Work Orders**. The coloured buttons at the top filter by stage; the search box finds a customer, phone, serial number, brand, model or WO number.

**Checking in a unit**
1. Click **+ New work order** and pick the customer.
2. Pick their unit, or click **+ Add a unit** (type, brand, model, serial; hours for mowers are optional).
3. Type what's wrong with it.
4. If an estimate fee applies, click **Check in & collect $X at till** to take it now, or check in and collect it later.

**Stages**
- **Needs Estimate**: add parts, labor and other charges. Parts are not taken from stock yet; parts not in stock show in red.
- **Approved to Fix**: parts are taken out of stock.
- **NOT FIXED**: the customer declined. Any parts go back into stock.
- **Waiting on Parts**, **On the Bench**: work in progress.
- **Ready for Review**: for a manager to check the ticket. No email is sent at this stage.
- **Ready for Customer Pick Up**: the customer can collect it and pay.
- **Picked up / Closed**: the ticket is finished and locked.

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
- The item window holds price, cost, department, on-hand quantity, vendor, taxable, and more.
- Tick **Quick Pick** to show the item as a button on the Sale screen.
- Tick **Use Serial #** for items that have a serial number (mowers, saws, blowers…).
- Untick **Active** to hide an item from sales without deleting it.

**Price tags (Zebra label printer)**
- Click **🏷 Print tags** on the Item List, or **🏷 Tags** in an item's window.
- Scan or search items to add them, and set how many tags of each (click the On hand number for one tag per item in stock). **+ Items marked "Print Tags"** adds every item with Print Tags ticked.
- Click **Print**. The printer and label size are set in **Settings → Printing**.

**Excel import and export**
- **Export to Excel** saves every item to a spreadsheet.
- **Import from Excel** adds or updates items from a spreadsheet (columns like Item Name, Item No., UPC, Department, Reg Price, On-Hand Qty). You see a preview with any problems before anything is saved.

## Customer list
Open **Customer List** to search, add and edit customers.
- **Contact Info**: name, company, phone, email, address and "OK to e-mail" (needed for marketing mailers).
- **Customer Settings**: customer type, tax exempt with **Farm Tax ID**, expiry date and "card copied", discount, notes.
- **History** and **Statistics** show what they've bought. Click a sale in History to open that receipt, see every item and payment, and reprint it.

## Customer kiosk (iPad)
The iPad on the counter shows the store logo until a till sends it the sign-up form.

**Setting it up** (Settings → **Customer Kiosk (iPad)**)
1. On the iPad, open Safari and go to the kiosk address shown in Settings.
2. The iPad shows a 6-digit code. Type it in Settings, choose which till it belongs to, and click **Pair**.
3. Optional: **Add to Home Screen** and turn on **Guided Access** so customers can't leave the page.
4. Upload the store logo in the same place.

**Using it:** press **F9** on the Sale screen. The customer fills in name, address, city, state, zip, phone and email (business name is optional). If they tick **tax exempt**, they enter their Farm Tax ID and expiry and are asked to hand their card to the cashier to copy.

## Sales history and reports
Open **Sales History** or **Reports** and pick a date.
- Totals across all tills: number of sales, takings (after refunds), tax, **cash** (after change), **card**, tax-exempt sales and **returns**.
- Every sale is listed with its till and customer. Refunds and exchanges are marked. Click a sale to open the full receipt, or **Reprint** for a printed copy.
> Compare "Card (terminal)" with the settlement total printed by the card terminal at the end of the day.

## QuickBooks
Diamond POS sends **one Sales Receipt per day per payment type** (cash and card) to QuickBooks Desktop, split by department. Items and prices stay in Diamond POS; QuickBooks doesn't track inventory.

Setting up (done once, on the **QuickBooks** screen):
1. **Connect the QuickBooks Web Connector**: download the connector file and add it in QuickBooks' Web Connector with the password shown.
2. **Where sales go**: choose the income account for each department, the sales tax item and the deposit account for cash and card.
3. **Preview a day** to check the numbers before anything is sent.
4. **Sent to QuickBooks** lists each day. A **Problem** can be fixed and then **Retry**'d.
> If refunds were more than sales for a payment type on one day, that day shows **Enter by hand**: enter it in QuickBooks yourself as a refund, then click **Entered by hand**.

## Marketing mailers
Open **Marketing** to email a flyer to a group of customers.
1. First time: fill in the **email account used to send mailers** (SMTP settings from your email provider).
2. Click **+ New mailer**: give it a subject and message, and upload the flyer image (for example a Canva download).
3. **Who gets it**: for example "bought a Chainsaw" or "bought a Mower from Exmark", within the last so many months. You can add several rules.
4. **Preview**, then **Send**. Only customers with an email address and **OK to e-mail** ticked receive it.

## Settings
Open **Settings** and click the area you want to change. Click **← Settings** to go back to the menu.
- **Store** (shared by all tills): store name, sales tax rate, store address (printed on full-page receipts, work orders and marketing emails), where feedback is emailed, and the receipt footer.
- **This Computer**: the till name. On the Store Server it also shows the address and **pairing code** that tills need to connect.
- **Printing**: which printers this computer uses (see below).
- **Label Designer**: build price tags and part labels (see below).
- **Receipt Layout**: choose what prints on receipts (see below).
- **Email**: the email account used for marketing mailers, work order emails and feedback.
- **Customer Kiosk**: pair iPads and upload the store logo.

## Printing
Each computer has its own printers, so set this up on every till (**Settings → Printing**). Install the printers in Windows first.
- **Receipt printer**: choose the printer and paper width (80 mm or 58 mm). Tick **Print the receipt automatically** to print as soon as a sale is completed.
- **Full-page printer (laser)**: prints on Letter paper. Choose what prints here instead of the receipt printer:
  - sales with a **serial-numbered unit** (mowers, saws, blowers…), with the customer's details, serial numbers and a signature line
  - **work order** receipts (estimate fee, repair pick-up)
  - Work order tickets (🖨 Print on a ticket) always print here.
- **Label printer (Zebra)**: choose the printer, then which label design to use for items **with a price** (price tag) and for items with **no price** (parts, bin labels). Design the labels under **Label Designer**.
- Use the **Print test** buttons to check each printer before saving, then click **Save printing settings**.
> For a Zebra printer, install the ZDesigner driver and set the same label size in the driver's printing preferences.

## Label Designer
**Settings → Label Designer** builds the tags printed on the Zebra printer. Every till uses the same designs.
- The list on the left has your labels. **Price tag** and **Part / bin label (no price)** come ready-made. Click **+ New** or **Copy** to make more, and set the name and label size.
- To add something, pick it in the toolbar (Item name, Price, Item details, Item #, UPC, Department, Manufacturer, Vendor, Size, Store name, Your own text…) and click **+ Add field**. Click **+ Barcode** for a barcode or **+ Line** for a line.
- **Drag** an element to move it. Drag the **red corner square** to make it bigger or smaller. Arrow keys nudge it, **Delete** removes it, and holding **Shift** gives finer steps.
- On the right, change the font size, bold, alignment, or the exact position in inches. For a barcode, choose UPC, Item # or ALU.
- Type an item # or UPC and click **Preview** to see a real item on the label. **Print test label** prints one.
- Click **Save labels**.
> Which design prints is set per till in **Settings → Printing**: one for items with a price, one for items without. When printing tags you can also pick a design for that print.

## Receipt Layout
**Settings → Receipt Layout** chooses what prints on receipts, for every till.
- Tick or untick blocks: store logo, store name, address, receipt #/date/till, customer, items, totals, tax exempt, payments, receipt barcode, signature line, footer, dashed lines and your own text (e.g. return policy or hours).
- **Drag** blocks (or use ▲ ▼) to change the order. **+ Add a block** adds another, for example a second line of your own text.
- Click a block to set its **text size**, **bold** and **alignment** (logo and barcode: width). For items you can show the Item #, "2 @ $12.99" and serial numbers.
- The preview on the right shows a sale, a serial-numbered sale or a refund, on 80 mm or 58 mm paper.
- Click **Save receipt layout**.
> Turn on **Receipt barcode** to print a barcode of the receipt number: scanning it on the **Return** screen finds the sale straight away.

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

## Troubleshooting
- **"Server offline"**: the till can't reach the Store Server. Check the server PC is on, Diamond POS is open on it, and both are on the store network.
- **An item won't scan**: check the barcode is on the item (Item List → UPC), or press F2 to search for it.
- **"Farm Tax ID has EXPIRED"**: ask for the customer's new card and click **Update Tax ID**.
- **Mailers aren't sending**: check the email account settings on the Marketing screen. The mailer shows the last error.
- **QuickBooks shows a Problem**: read the message, fix the account mapping, then click **Retry**.
- **Something broke after an update**: open Updates and **Revert** to the previous version.
