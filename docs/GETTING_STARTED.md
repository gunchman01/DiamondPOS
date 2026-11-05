# Getting Started with DiamondPOS

This guide assumes you have never used Electron, React or TypeScript. It explains how the pieces fit together, how to run the app, how to make changes, and how releases and rollbacks work.

---

## 1. The big picture

```
            ┌───────────── Store network (LAN) ─────────────┐
            │                                                │
 Till 1 ────┤                                                │
 Till 2 ────┼──HTTP──►  Store Server PC (same app, "Server" mode)
 Till 3 ────┤             • Express API on port 4580         │
            │             • SQLite database (store.db)       │
            └────────────────────────────────────────────────┘

 Card terminal (standalone): staff key in the amount, then record the reference in the POS

 GitHub ── Actions builds installer ──► GitHub Releases ◄── each PC's "Updates" screen
```

- **Every computer runs the same installed app.** On first launch you choose its role.
- **Store Server:** one PC per store. It holds the database and runs a small web API. It can also be used as a till.
- **Till:** connects to the server's IP address using a pairing code.
- Prices and totals are always calculated **on the server**, so every till charges the same price.

---

## 2. What each technology does

| Technology | Plain-English role | Where in the project |
|---|---|---|
| **Node.js** | Runs JavaScript outside a browser. Needed to build and run everything. | — |
| **TypeScript** | JavaScript with types. The editor catches mistakes (like passing text where a number is expected) before you run anything. | every `.ts` / `.tsx` file |
| **Electron** | Wraps a web page into a Windows desktop app and gives it access to the computer (files, printers). | `src/main`, `src/preload` |
| **React** | Builds the screens from small reusable pieces called *components*. When data (*state*) changes, the screen updates automatically. | `src/renderer` |
| **Vite / electron-vite** | Bundles the code and reloads the app instantly while you edit. | `electron.vite.config.ts` |
| **Express** | A small web server framework. Defines the API URLs the tills call, like `POST /api/sales`. | `src/main/server/index.ts` |
| **SQLite** (better-sqlite3) | A database stored in one file. No separate database software to install. | `src/main/server/db.ts` |
| **electron-builder** | Turns the app into a Windows installer (`.exe`) and uploads it to GitHub. | `electron-builder.yml` |
| **electron-updater** | Downloads and installs a chosen version from GitHub Releases. | `src/main/updater.ts` |
| **GitHub Actions** | GitHub's build robot. Builds the installer when you push a version tag. | `.github/workflows` |

### Electron's three parts (the most important idea)

1. **Main process** (`src/main`): Node.js with full access to the PC. It creates the window, reads config, runs the store server and installs updates.
2. **Renderer** (`src/renderer`): the React UI shown in the window. For security it has **no** direct access to the PC.
3. **Preload** (`src/preload`): a small bridge. It exposes a fixed list of safe functions to the UI as `window.pos.*` (for example `window.pos.printReceipt(html)`).

The UI talks to the **store server** over plain HTTP (`src/renderer/src/api.ts`). It talks to **its own computer** (printing, updates, config) through `window.pos`.

---

## 3. One-time setup on your development PC

1. **Node.js 22 LTS**: https://nodejs.org (use the default install options).
2. **Git**: https://git-scm.com
3. **VS Code**: https://code.visualstudio.com (recommended editor, with great TypeScript support).
4. *(Only if `npm install` fails with "gyp" errors)* **Visual Studio Build Tools** with the "Desktop development with C++" workload. The SQLite driver normally downloads a ready-made build, so you usually won't need this.

Then, in a terminal inside the project folder:

```bash
npm install     # downloads all libraries into node_modules/ (takes a few minutes the first time)
npm run dev     # opens the app with live reload
```

Choose **"This is the Store Server"** on first launch. Six sample products are pre-loaded, so you can try a sale straight away.

> Your dev config and database are saved in `%APPDATA%\DiamondPOS\`. Delete that folder to start fresh.

### Testing several tills on one network

Run `npm run dist` to build an installer into `dist/`. Install it on a second PC and choose **Till**. Then enter the server's IP address and pairing code, both shown on the server's **Settings** screen. When Windows asks about network access on the server PC, allow **Private networks**.

---

## 4. Tour of the code

```
src/
  shared/
    types.ts         ← data shapes (Product, Sale, ...). Start here.
    constants.ts     ← server port, GitHub repo name, minimum till version
    version.ts       ← compares "1.2.0" vs "1.10.0" correctly
  main/
    index.ts         ← app start-up, window, IPC handlers, receipt printing
    config.ts        ← per-PC settings (role, server address, pairing code)
    updater.ts       ← list releases + install any version (update/rollback)
    server/
      index.ts       ← the API: products, sales, reports, settings
      db.ts          ← opens SQLite, runs migrations, backs up first
      migrations.ts  ← database schema changes, one numbered step at a time
  preload/index.ts   ← the window.pos bridge
  renderer/src/
    App.tsx          ← top bar, tabs, connection status
    api.ts           ← functions that call the store server
    receipt.ts       ← receipt layout (80mm)
    screens/         ← Setup, Sell, Products, Reports, Settings, Updates
```

### How a sale flows through the code

1. The cashier scans a barcode. The scanner types the digits and presses Enter. `Sell.tsx` calls `api.lookupProduct(code)`.
2. The server (`GET /api/products/lookup/:code`) finds the product and returns it. The UI adds it to the cart, which is React *state*.
3. The cashier presses **Card (terminal)**, keys the amount into the terminal, then confirms in the POS.
4. `api.createSale(...)` sends `POST /api/sales` with product IDs and quantities only.
5. The server (`createSale` in `server/index.ts`) looks up the real prices, works out the total and GST, checks the payment covers it, and saves everything in one database *transaction* (all or nothing).
6. **Print receipt** builds HTML (`receipt.ts`) and calls `window.pos.printReceipt`. The main process prints it silently to the Windows default printer.

---

## 5. Making a change: worked example

**Goal:** add a "Category" to products.

1. **Database:** add a new migration at the end of `migrations.ts`. Never edit an existing one.
   ```ts
   { version: 3, name: 'product category', up: `ALTER TABLE products ADD COLUMN category TEXT;` }
   ```
2. **Types:** add `category: string | null` to `Product` in `shared/types.ts`. TypeScript will now highlight every place that needs updating.
3. **Server:** update `toProduct`, `validateProduct` and the INSERT/UPDATE statements in `server/index.ts`.
4. **UI:** add an input to the form in `screens/Products.tsx`.
5. Run `npm run typecheck`, then `npm run dev`, and test it.
6. Commit and push to a branch, and open a pull request. The CI workflow checks that it builds.

### Database rules that keep rollback safe

When you install an older version, the **app** goes back but the **database** keeps any new tables or columns. That's fine as long as you follow these rules:

- ✅ Add tables, columns (nullable or with a default) and indexes.
- ❌ Don't rename or drop columns or tables in the same release that stops using them.
- Remove old columns only **several releases later**. When you do, raise `MIN_CLIENT_VERSION` in `constants.ts` so old tills are told to update.
- Before running migrations, the server automatically saves a copy of the database to `%APPDATA%\DiamondPOS\data\backups\`.

---

## 6. Git workflow and releasing

**First time:**

1. Create a repository on GitHub (e.g. `DiamondPOS`).
2. Set the owner and repo name in **both** `electron-builder.yml` (the `publish:` section) and `src/shared/constants.ts`.
3. Run `npm install` once and commit the `package-lock.json` it creates. The GitHub workflows need it, because it pins exact library versions so every build is identical.
   ```bash
   git add package-lock.json && git commit -m "Add lockfile"
   ```
4. Push the code:
   ```bash
   git remote add origin git@github.com:gunchman01/DiamondPOS.git
   git push -u origin main
   ```

**Day to day:**

```bash
git checkout -b add-categories      # work on a branch
# ...edit, test...
git commit -am "Add product categories"
git push -u origin add-categories   # open a Pull Request on GitHub, merge when CI is green
```

**Releasing:**

```bash
git checkout main && git pull
git tag v0.2.0-beta.1 && git push origin v0.2.0-beta.1   # beta: test on one till first
git tag v0.2.0        && git push origin v0.2.0          # stable: available to everyone
```

GitHub Actions builds the installer, sets the app version from the tag and publishes the release. Write release notes on the GitHub Release page; they appear on the in-app Updates screen.

Use [semantic versioning](https://semver.org): `MAJOR.MINOR.PATCH`. Bump PATCH for fixes, MINOR for new features and MAJOR for big breaking changes.

### Private repository?

The in-app updater downloads releases without logging in, so the **release files must be public**. Two common options:

- **Keep the code private, publish releases to a separate public repo** (e.g. `DiamondPOS-releases`). Point `publish.repo` and `GITHUB_REPO` at it, and give the workflow a Personal Access Token secret (`GH_TOKEN: ${{ secrets.RELEASES_TOKEN }}`) with access to that repo.
- Or make the whole repo public, if that's acceptable.

---

## 7. Updating and rolling back in a store

On each PC, open the **Updates** tab:

- **Update to vX.Y.Z** installs the newest release on that PC's channel.
- **Revert to vX.Y.Z** installs the previous release.
- Each release in the list also has its own **Install / Revert to this** button.
- **Channel:** set one test till to **Beta** to try pre-releases before they go to everyone.

**Order matters:**

- Updating: **server PC first**, then the tills. The server applies any database changes, and old tills keep working meanwhile.
- Reverting: tills first, then the server if needed.

Settings and data live in `%APPDATA%\DiamondPOS\` and are not touched by installs, updates or rollbacks.

---

## 8. Before going live: checklist

- [ ] **Code-signing certificate** (Windows). Without one, SmartScreen warns on install and update. Add `CSC_LINK` and `CSC_KEY_PASSWORD` secrets (see `release.yml`).
- [ ] **Fixed IP for the server PC** (a DHCP reservation in the router).
- [ ] **Nightly backups** of `%APPDATA%\DiamondPOS\data\store.db` to another machine or the cloud.
- [ ] **Staff logins / PINs** and an audit log of who did what.
- [ ] **Refunds and voids** (there's a `status` column on `sales` ready for this).
- [ ] **Receipt printer:** set it as the Windows default printer on each till, or add ESC/POS support for faster printing and cash-drawer kick.
- [ ] **Card reconciliation:** compare the Reports screen's card total with the terminal's end-of-day settlement.
- [ ] Set the GST rate and store name under **Settings**.
- [ ] An app icon: put `icon.ico` (256×256) in a `build/` folder.

---

## 9. Troubleshooting

| Problem | Fix |
|---|---|
| Till says "Cannot reach the store server" | Is the server PC on, with the app open? Same network? Allow port 4580 through Windows Firewall on the server (Private network). |
| "Invalid pairing code" | Re-enter the code exactly as shown on the server's Settings screen. |
| `npm install` fails building `better-sqlite3` | Install VS Build Tools (see section 3), delete `node_modules`, then run `npm install` again. |
| Updates tab says repository not found | Check `GITHUB_OWNER` / `GITHUB_REPO`, and that releases are public (section 6). |
| Update installs but nothing changes | Make sure you pushed a **new** tag. The version comes from the tag. |
| Receipt doesn't print | Set the receipt printer as the Windows default and print a test page from Windows first. |

### Useful learning resources

- React tutorial: https://react.dev/learn
- TypeScript in 5 minutes: https://www.typescriptlang.org/docs/handbook/typescript-in-5-minutes.html
- Electron process model: https://www.electronjs.org/docs/latest/tutorial/process-model
- electron-vite: https://electron-vite.org
