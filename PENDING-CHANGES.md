# v0.3.53 — ready-for-pickup checkout fix

Home backup card displays saved frequency/actual next run/verified time instead of hard-coded 15 minutes. The lightweight operations endpoint reports the live scheduler state.

Remove the online-estimate gate from payment for Ready for Pickup work orders. Charge the current bill, preserve approval history and add a checkout-history note when the online estimate is not current/approved. Earlier-stage and closed repair checkout guards remain. No automatic notifications or customer approval changes.

349 regression checks pass; see project notes for typecheck/build. No schema migration or website update; update the Store Server first. No GitHub writes, release tags, live payments/messages or deployment were performed. Greg applies the ZIP and commits/releases using START-HERE.md.
