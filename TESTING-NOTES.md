# v0.3.59 customer receipt address

367 regressions/typecheck/build pass. New tests cover actual checkout address snapshot, lost-reply retry/reprint preservation after customer edit, field/block escaping, optional serial-only mode, ordinary/walk-in defaults, one-time old-layout upgrade and saved disable/removal, full-page snapshot and NULL legacy fallback.

Shop test after server-first/all-till update:
- Ordinary and serialized customer purchases print billing address by default.
- Walk-in/no-address receipts omit it.
- Receipt Designer Customer address supports middle/header/footer, movement/style/disable and save. Optional serialized-only setting defaults off.
- New receipt reprint after editing customer address retains original sale address; old receipt uses current address (no historical snapshot exists).
- Full-page receipt and accepted Windows-dialog thermal path preserve content. No physical/Windows visual test performed here.
