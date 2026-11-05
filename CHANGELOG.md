# What's new in DiamondPOS

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
