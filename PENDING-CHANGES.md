# v0.3.54 — POS General income mapping

One QuickBooks income row replaces vendor/department rows. Paid-sale, account-invoice and legacy daily summary generation use POS General/defaultIncomeAccount; old saved department overrides are retained but ignored. POS catalog departments and historical QB records stay unchanged. Tax-rounding reconciliation remains.

Source overlay against v0.3.53 main fa5137d4955d56b6739f05ef21f895e0a8d99b87. Greg applies and commits the ZIP. No schema changes or actual QB calls, GitHub writes/tags or deployment. See START-HERE.md for Git commands and TESTING-NOTES.md for checks.
