# v0.3.53 work-order checkout checks

349 regression checks pass, including real local sale API calls for cash/account payment, changed/pending/failed online estimates, correct current totals, idempotent replay, preserved approval state, closed-ticket rejection and late-response review. Typecheck and production build are checked before packaging. No real payments, QB exports or messages sent.

Apply the server first; updating only a till cannot remove a server-side checkout block. Ready for Pickup is still required for ordinary repair checkout. No schema change (42).

- Test the affected ticket: review current charges/fee credit and ring up using cash/card/check or enabled account as appropriate. Confirm current total, receipt and closed status.
- Pending/failed/changed old estimates must not require sending a message before payment; history must retain the actual online state.
- Repeated checkout must not double-charge or re-deduct inventory. Already closed and earlier-stage repairs remain blocked.
- Test paid estimate credits and the existing declined-repair deferred-fee-only checkout.
- Verify normal QuickBooks sync on your test company, and actual Windows/printer behavior at the store.


Home backup status: select Every 4 hours or Every 24 hours in Backup Settings, then compare frequency/last verified/next run on Home (refresh up to 30s). Back Up Now must update the last verified time only on success, preserve it on failure, and show in-progress/next-schedule appropriately. No constant 15-minute fallback or false overdue warning for long intervals; unavailable data is labelled as historical. Endpoint tests compare operations data with the real manager state. No physical Store Server backup/restore performed here.
