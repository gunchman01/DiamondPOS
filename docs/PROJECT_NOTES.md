# DiamondPOS: Project Notes

> **For Claude / anyone picking this up:** read this file first. It records how the project is set up, what's done, and what's next. Keep it updated at the end of each work session.

_Last updated: 5 November 2026 (register-style Sale screen)_

---

## What this is

DiamondPOS is a Windows point of sale app for one store location with several tills.

- **One installer** for every PC. On first launch you choose **Store Server** (one PC per store, which can also be a till) or **Till**.
- The **store server** runs inside the app: an Express API on **port 4580** plus a **SQLite** database. Tills connect over the LAN using the server's IP address and an 8-character **pairing code**.
- **Card payments** happen on a **standalone third-party terminal**. The POS records the amount and the terminal's reference number; there's no integration.
- Prices **include GST** (15% by default). Tax is worked out on the server.
- **Update and rollback:** GitHub Actions builds the installer when a version tag is pushed and publishes it to GitHub Releases. The in-app **Updates** screen can install any release, newer or older.
- Design decision: the server must always be reachable. There's no offline mode for tills (can be added later).

**Stack:** Electron 33 + React 18 + TypeScript, built with electron-vite. Installers come from electron-builder (NSIS), updates from electron-updater, the API from Express, and the database is better-sqlite3.

---

## Developer environment (Greg's PC)

| Item | Setting |
|---|---|
| Project folder | `C:\dev\DiamondPOS` (previously `C:\dev\store-pos`) |
| Node.js | **v22 LTS**. Node 26 does NOT work: better-sqlite3 has no prebuilt binary for it, and building needs Python and VS Build Tools. |
| npm | Run from **PowerShell** (`npm run dev`). If it says "scripts disabled", use `npm.cmd` or `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`. |
| Git | Run from **MobaXterm** using an **SSH key** (`~/.ssh/id_ed25519`, added to GitHub). In MobaXterm the project is at `/drives/c/dev/DiamondPOS`. |
| GitHub | Account `gunchman01`, repo **`gunchman01/DiamondPOS`** (**public**, so the in-app updater can read releases) |
| Git remote | `git@github.com:gunchman01/DiamondPOS.git` |
| App data | `%APPDATA%\DiamondPOS\` holds `pos-config.json` plus `data\store.db` and `data\backups\`. The dev app and installed app share this folder, so only run one at a time. |

### Everyday commands

```bash
npm run dev         # PowerShell: run with live reload
npm run typecheck   # PowerShell: check types
git add -A && git commit -m "..." && git push        # MobaXterm
git tag vX.Y.Z && git push origin vX.Y.Z             # MobaXterm: publish a release
git tag vX.Y.Z-beta.1 && git push origin vX.Y.Z-beta.1   # beta (pre-release)
```

---

## Key files

| File | Purpose |
|---|---|
| `src/shared/types.ts` | All data shapes (Product, Sale, config, ...) |
| `src/shared/constants.ts` | Server port, `MIN_CLIENT_VERSION`, GitHub owner/repo for updates |
| `src/main/index.ts` | Electron start-up, window, IPC, receipt printing |
| `src/main/updater.ts` | List releases and install any version (update/rollback) |
| `src/main/server/index.ts` | API routes: products, sales, reports, settings |
| `src/main/server/migrations.ts` | DB schema changes. **Add only**; never edit released migrations. |
| `src/renderer/src/screens/*` | UI: Setup, Sell, Products, Reports, Settings, Updates |
| `electron-builder.yml` | Installer settings and GitHub publish target |
| `.github/workflows/release.yml` | Builds and publishes on a `v*` tag |
| `docs/GETTING_STARTED.md` | Beginner guide to the whole stack |

---

## Progress log

### 4–5 Nov 2026: setup and first releases
- [x] Scaffolded the app (server/till modes, Sell, Products, Reports, Settings, Updates screens)
- [x] Fixed environment issues: PowerShell execution policy, Node 26 → Node 22, GitHub auth via SSH in MobaXterm
- [x] Made the repo public (needed for the updater)
- [x] Released **v0.1.1** as "Store POS" (repo `gunchman01/store-pos`). Downloaded, installed and working.
- [x] Disabled the Update/Revert buttons in dev mode (they only work in the installed app)
- [x] **Renamed project to DiamondPOS** (app name, installer name, app ID, repo, docs)

### Rename follow-up
- [x] Rename the GitHub repo `store-pos` → `DiamondPOS`
- [x] `git remote set-url origin git@github.com:gunchman01/DiamondPOS.git`
- [x] Rename the local folder `C:\dev\store-pos` → `C:\dev\DiamondPOS`
- [x] Delete the old v0.1.x releases and tags (so "Revert" can't install the old Store POS app)
- [x] Uninstall the old "Store POS" app
- [x] Release **v0.2.0** as the first DiamondPOS version. Installed and working.
- [ ] Test update and rollback: release v0.2.1, update to it, then revert to v0.2.0

### 5 Nov 2026: register-style main screen (released as **v0.2.1**)
- [x] **Red theme** across the app (tokens in `styles.css`: `--red`, `--red-dark`, `--red-darker`, `--red-tint`)
- [x] Red header bar with tabs (Sale, Items, Reports, Settings, Updates), connection status, till name and clock
- [x] **Sale screen rebuilt** as a classic register layout (`screens/Sell.tsx`), inspired by desktop POS register screens (our own design, no third-party branding):
  - **Receipt grid**: # / Item # / Description / Qty / Price / Ext. Price, with selectable lines and −1, +1, Change qty, Remove
  - **All Items panel**: every active item, searchable by name, item # or barcode; click to add, Enter adds the top match
  - **Totals panel**: items, subtotal, GST included, big TOTAL, and Cash / Card buttons. After a sale it shows the change due and a Print receipt button.
  - **Function keys**: F2 Find item, F3 Quantity, F4 Remove line (or Delete), F6 Clear sale, F7 Cash, F8 Card, Esc clears the search. F10/F11 are avoided because Windows and Electron use them.
  - Scan bar: a barcode or exact item # adds directly; partial text filters All Items
- [x] "Products" renamed to "Items" in the UI
- Verified: TypeScript checks pass; visual preview at 1280×800 with mock data

### 5 Nov 2026: Quick Picks (uncommitted → release as v0.2.2)
- [x] **DB migration 3**: `products.quick_pick` (0/1, default 0). Additive, so rollback is safe.
  - `PUT /api/products/:id` uses `COALESCE`, so an older till that doesn't send `quickPick` won't clear it
  - `GET /api/products?quickPick=1` returns only Quick Pick items
- [x] **Items page**: "Quick Pick" checkbox in the edit dialog, a ✓ column, and a "Quick Picks only" filter
- [x] **Sale screen**: the All Items list was removed (the full list lives on the Items page) and replaced by a **Quick Picks** panel of big buttons
  - **No Quick Picks set** → the Quick Picks panel is hidden, the receipt goes **full width**, and the **totals move to the bottom right** (with Cash/Card side by side). A tip explains how to add Quick Picks.
- [x] **F2 Find Item dialog**: searches ALL items (↑/↓ to choose, Enter or click to add). Typing a partial name in the scan box opens it pre-filled.
- Verified: TypeScript checks pass; server test of migration v2→v3 (with automatic backup), quick pick filter and old-till compatibility; previews of both layouts and the Find dialog
- Release note: **update the Store Server PC first** (it runs migration 3), then the tills

---

## Next up (backlog, in rough priority order)

0. Test Quick Picks with `npm run dev`, then release v0.2.2 and update from the Updates tab (also test Revert)
   - Ideas: Quick Pick order/colours, item categories with category tabs on the Quick Picks panel, customer field on the sale, discounts, hold/recall sale
1. Staff PINs and an audit log (who rang up each sale)
2. Refunds and voids (the `sales.status` column already exists)
3. Receipt printer (ESC/POS) and cash drawer kick
4. Automatic daily database backups
5. Windows code-signing certificate (removes the SmartScreen warning)
6. App icon (`build/icon.ico`, 256×256)
7. Later: offline mode for tills, multi-store / cloud reporting

---

## Rules to remember

- **DB migrations only add things.** Drop or rename columns only several releases later, and raise `MIN_CLIENT_VERSION` when you do. This is what keeps rollback safe.
- **Update the server PC first**, then the tills. When reverting, do the tills first.
- Prices and totals are always calculated **on the server**, never trusted from the till.
- Keep `package-lock.json` committed (CI uses `npm ci`).
- Version comes from the **git tag** (the workflow sets it). No need to edit `package.json` by hand.
