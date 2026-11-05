# DiamondPOS

A Windows point of sale app for one store with several tills.

- **One installer** for every computer. On first launch you pick **Store Server** (one PC per store) or **Till**.
- The server keeps all products and sales in a local database. Tills connect over the store network.
- **Card payments** happen on a standalone terminal. The POS records the amount and the terminal's reference number.
- **Update and rollback** come from GitHub Releases, using buttons on the Updates screen.

New to Electron, React or TypeScript? Start with **[docs/GETTING_STARTED.md](docs/GETTING_STARTED.md)**.
Project status, setup and backlog: **[docs/PROJECT_NOTES.md](docs/PROJECT_NOTES.md)**.

## Quick start (developers)

```bash
npm install
npm run dev        # run the app with live reload
npm run typecheck  # check for type errors
npm run dist       # build a local installer into dist/
```

## Release a new version

```bash
git tag v0.2.0
git push origin v0.2.0
```

GitHub Actions builds the installer and publishes it. Tills then see it under **Updates**.

## Project layout

```
src/
  shared/      types and constants used by every part of the app
  main/        Electron "back end" (window, config, updates, printing)
    server/    store server: Express API + SQLite database + migrations
  preload/     the secure bridge the UI uses to call the main process
  renderer/    React UI (screens: Setup, Sell, Products, Reports, Settings, Updates)
.github/workflows/  CI and release pipelines
```
