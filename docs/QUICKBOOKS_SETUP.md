# Connecting DiamondPOS to QuickBooks Desktop

DiamondPOS sends **one Sales Receipt per day for each payment type** (cash, card) to QuickBooks Enterprise, using Intuit's free **QuickBooks Web Connector**. Items, prices and stock stay in DiamondPOS; QuickBooks only gets the daily totals.

## What appears in QuickBooks

For each closed day (today is sent tomorrow):

| Field | Value |
|---|---|
| Customer | `DiamondPOS Daily Sales` (created automatically) |
| Sales Receipt No. | `POS261105C` (cash) / `POS261105D` (card): year-month-day + C/D |
| Date | the day of the sales |
| Deposit to / Payment method | as chosen on the QuickBooks screen (e.g. Undeposited Funds / Cash) |
| Lines | one **taxable** and one **non-taxable** line per department, using items called `POS <Department>` (created automatically with the income account you chose) |
| Sales tax | added by QuickBooks from your sales tax item. Any cents difference from the tax actually collected goes on a `POS Tax Rounding` line, so the total always equals the money taken. |
| Memo | e.g. `DiamondPOS card sales 2026-11-05: 41 receipt(s) #880-#921, 2 tax exempt` |

- **Tax-exempt sales** and **non-taxable items** go on the non-taxable lines, so QuickBooks' Sales Tax Liability report is correct.
- **Nothing is sent twice.** Before adding a receipt, DiamondPOS checks whether that Sales Receipt No. already exists in QuickBooks.
- Days before the **start date** are never sent.

## One-time setup

### 1. Which PC has QuickBooks?

- **QuickBooks is on the store server PC:** nothing extra to install.
- **QuickBooks is on another PC (e.g. back office):** install DiamondPOS on that PC as a **Till**. In **Home → Sync w/ QuickBooks**, tick **"Run the QuickBooks bridge on this computer"**. Keep DiamondPOS running on that PC (it can be minimised).
  - The Web Connector only allows connections to `localhost`, so the bridge relays them to the store server.

### 2. Download the connector file

In DiamondPOS go to **Home → Sync w/ QuickBooks** and click the matching **Connector file** button. It saves `DiamondPOS.qwc`.

### 3. Add it to the Web Connector (on the QuickBooks PC)

1. Open QuickBooks Enterprise and the company file, **signed in as Admin**, in single-user mode for this one-time step.
2. **File → Update Web Services** opens the Web Connector. Click **Add an application** and choose `DiamondPOS.qwc`.
3. QuickBooks asks for permission. Choose **"Yes, always; allow access even if QuickBooks is not running"**, continue and **Done**.
4. In the Web Connector, type the **password** shown on the DiamondPOS QuickBooks screen into the Password box and save it.
5. Tick **Auto-Run** (every 30 minutes), then click **Update Selected** to run it now.

The DiamondPOS QuickBooks screen should now say **Connected to <your company>**.

### 4. Map the accounts (DiamondPOS QuickBooks screen)

1. **Start sending from:** usually today, so old sales aren't posted.
2. **Sales tax item:** your QuickBooks sales tax item. Its rate should match the tax rate in DiamondPOS Settings.
3. **Taxable / non-taxable codes:** normally `Tax` and `Non`.
4. **Default income account**, plus an income account for any department that should post separately.
5. **Payments:** the deposit account (usually *Undeposited Funds*) and payment method for cash and card.
6. Click **Save mapping**, then tick **Send daily sales to QuickBooks**.

Use **Preview a day** to see exactly what will be posted before switching it on.

## Day to day

- Nothing to do. Make sure the QuickBooks PC (and the bridge, if used) is on overnight or in the morning.
- **Problems** show in red under *Sent to QuickBooks* with QuickBooks' own message (e.g. an account that was renamed). Fix the mapping and click **Retry**.
- Added a new department or account in QuickBooks? Click **Re-read lists from QuickBooks**. Lists also refresh daily.
- Changing a department's income account later affects new `POS <Department>` items only. For an existing item, change its account in QuickBooks (Lists → Item List).

## Troubleshooting

| Message | Fix |
|---|---|
| Web Connector: "authentication failed" | The password was changed. Download the connector file again, or re-enter the password. |
| "Could not open QuickBooks" (connectionError) | QuickBooks isn't installed on that PC, the company file moved, or permission wasn't set to "even if QuickBooks is not running". |
| "invalid reference to QuickBooks Account/Item…" | The name in the mapping doesn't exist in QuickBooks (renamed or inactive). Re-read lists, re-select, Save, Retry. |
| Bridge PC: "store server could not be reached" | That PC lost the network, or the store server PC is off. |
