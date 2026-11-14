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
