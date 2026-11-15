# DiamondPOS v0.3.35 — Remove On the Bench

Source update overlay over v0.3.34 / main aaf5aa0d74222e2a19260f4f564400cea0b1e987. No dependency or approval website files changed.

## Apply on your development PC

Close the development app. Extract this ZIP, then copy the CONTENTS of DiamondPOS-update-v0.3.35 into your existing project folder, replacing matching files. Keep the rest of your project, local data and configuration.

```powershell
npm run typecheck
npm test
npm run build
npm run dev
```

Typecheck, build and all 126 regression checks passed. Windows visual verification is still a local check.

## What changes

- On the Bench disappears from the work-order stage choices, progress strip, stage colors and email-template settings.
- Approved to Fix -> Waiting on Parts or Ready for Review.
- Waiting on Parts -> Approved to Fix or Ready for Review.
- Ready for Review -> Ready for Pick Up or back to Approved to Fix for rework.
- Migration 27 moves existing On the Bench tickets to Approved to Fix, adds an explanatory history note and leaves already-deducted inventory unchanged.
- Original history and last-email records stay intact and may display On the Bench (retired). Other saved colors/templates stay unchanged.
- Customer estimate approvals continue using the existing website; do not upload anything to cPanel for this update.

Check a migrated ticket if one existed, then try the new next-stage buttons and confirm inventory is not deducted again. Update the Store Server first, then ALL tills so everyone sees the same stage list. The server backs up an existing database before applying the migration.

## Commit and release after your local check

Review git status and git diff first. Include other local edits intentionally.

```powershell
git add .
git commit -m "Remove On the Bench work order stage"
git push origin main
git tag v0.3.35
git push origin v0.3.35
```

Use the tag only if unused. Pushing main alone does not publish the POS update; the version tag starts the Windows release workflow. No Git commit, push or tag was made here.
