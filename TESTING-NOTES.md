# v0.3.66 kiosk validation compatibility

406 regressions: actual frontend API transport mocked against older/newer health response to verify no POST to old server, exact selected customer ID to dedicated verification route, and separate new signup. Real HTTP/SQLite/SSE tests reject legacy open kiosk pages with reload instruction, reject missing target on verify route, acknowledge target ID and load correct saved details through scoped kiosk endpoint. Existing privacy/readonly exemption/conflict/cancel/timeout/signup tests remain. Typecheck/build required before check-in.

Actual shop browser/server versions and Windows/tablet screen were not observed. Update server/tills then reload kiosk/close duplicate tabs; verify customer-page and selected-sale validation show saved details rather than blank form. No live customer edit, message or financial sync performed.
