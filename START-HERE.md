# DiamondPOS v0.3.34 — Online estimate approvals and customer follow-up

This source overlay targets main v0.3.32 / 0b8eef0e0cb383149fce02cc591fa241e9974d41. It also includes v0.3.33's estimate-parts shortage notice, so it can be applied over your v0.3.32 or v0.3.33 working project.

## Downloads and destinations

- **DiamondPOS-update-v0.3.34.zip**: source files for your development PC. Do not upload this ZIP to the website.
- **DiamondPOS-cPanel-public-v0.3.34.zip**: public website files only. Upload/extract in the STAGING domain's document root; it creates a pos-approval folder.
- **DiamondPOS-cPanel-SETUP-v0.3.34.md**: full cPanel/private configuration/POS connection instructions. Also included here as extras/cpanel-approval/CPANEL-SETUP.md.

Nothing was uploaded to staging, committed/pushed/tagged in Git, or emailed to a real customer during this work. You will install the staging package in cPanel.

## Apply the POS source update

1. Close the development app and extract the source ZIP.
2. Copy the CONTENTS of DiamondPOS-update-v0.3.34 into your existing project, replacing matching files. Keep other files, local data and configuration.
3. In your project terminal:

```powershell
npm run typecheck
npm test
npm run build
npm run dev
```

No npm dependencies changed. Typecheck/build and all **122 POS regression checks** passed. The separate PHP service passed **12 real PHP/HTTP checks** with a temporary private database. Physical Windows UI, actual cPanel and live SMTP delivery still require local testing.

Migration 26 backs up your existing store before adding estimate revision/audit records. Update the Store Server first, then ALL tills. Online approvals start disabled; existing tickets/emails are not retroactively enrolled.

## Configure staging in cPanel

Follow **extras/cpanel-approval/CPANEL-SETUP.md**. It explains how to upload the public-only ZIP, create a PRIVATE configuration/database folder outside the website's document root, set the private path in index.php, and paste a generated key into both sides.

Target URL: https://oho.staging.tulsapickem.com/pos-approval/

Use test customers/emails/tickets only. Keep the staging banner on. The banner is not a simulation gate: recorded responses update the connected POS. Do not share actual API keys, configurations or customer links here or in Git.

## Staff workflow

1. Work Orders → Work order settings → Estimate approvals & customer follow-up. Configure and test the website connection, then enable online approvals and save in that card.
2. Keep customer-call flags enabled. Default **3 calendar days**; choose 1–90.
3. On Needs Estimate, add diagnosis/parts/labor and choose **Send estimate for decision**. Review the preview and confirm sending. After a successful send the ticket moves to **Waiting on Customer** and the timer starts. Parts stay in stock while waiting.
4. The customer reviews the exact estimate revision on the website, enters their name, selects Approve/Decline and confirms. Clicking an email link alone makes no decision. No payment is taken.
5. The Store Server checks about once a minute while open. It can collect responses made while POS was closed. Matching approval moves to Approved to Fix and deducts parts once; decline moves to Not Fixed. Both stop call reminders. Settings also has **Check customer responses now**.
6. Unanswered estimates get a **Needs customer call** badge and list filter. Enter a contact note on the ticket and **Record call & remind again** to set the next reminder.
7. Send a revised estimate when repair details/totals change. Stale decisions require review instead of authorizing the changed repair; checkout against a changed old approval is blocked. Current stock arrivals and later estimate-fee payments do not invalidate the agreed repair total.
8. Staff can record a phone decision through Approved to Fix / Not Fixed on an unchanged pending estimate. History labels it as staff recorded. Cancel an outstanding link from its ticket when needed.

The private link controls access; the entered name is not independently verified identity. Anyone receiving a forwarded link could respond. Links expire after 30 days; changing a recorded decision requires contacting the shop. Call flags never automatically approve, decline or cancel a repair.

A failed/uncertain email does not create a live follow-up timer or permit automatic approval from that attempt. Prepared interrupted attempts can be cancelled or replaced by a new estimate. Current connection failures remain visible in settings; use test tickets before relying on the integration.

## Publish the POS update after local checks

Review git status and git diff first. Include other local edits intentionally.

```powershell
git add .
git commit -m "Add online estimate approvals and customer follow-up reminders"
git push origin main
git tag v0.3.34
git push origin v0.3.34
```

Use v0.3.34 only if unused. This package includes v0.3.33 changes, so v0.3.33 does not need a separate tag first. The version tag starts the Windows installer workflow; pushing main alone does not publish an update. Update the Store Server before tills.

Optional developer PHP test: with PHP CLI, PDO SQLite and sessions installed, run `node scripts/test-approval-site.cjs`. PHP is not needed on the Windows POS; it runs on the website hosting.
