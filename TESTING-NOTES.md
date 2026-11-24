# v0.3.63 validation

All399 regressions, typecheck and production build passed. Existing kiosk integration and simulated-browser tests cover accept/update, correct customer record, staff/token authorization, privacy, cancelled/conflicting sessions and timeout. UI-only changes add selected-customer buttons/F9 routing and save-and-validate using the existing customer save path; no implementation-mirroring tests added.

Shop checks: clean customer sends immediately; dirty record Save & validate saves and stays open; selected sale customer goes to kiosk and updates without cart changes; F9 selected/no-selection routing; cancellation; checkout/hold recovery guard. Real Windows/tablet visual interaction remains unverified. No real financial transactions, messages or sync performed.
