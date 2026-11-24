# v0.3.68 combined verification

423 regression checks passed. Scanner tests: reported049234/025752 samples, preserved original UPC/sku/ALU, exact-match priority, numeric UPC/ALU tolerance, letters/internal zeros/all-zero protection, inactive items, ambiguous matches, HTTP pairing and typed409 propagation. Only404 triggers broad scan fallback; new typing clears stale suggestions.

Worksheet tests load real saved work order and verify customer/unit/WO/problem, escaped text,5blank ruled note lines/8parts rows, no diagnosis/work-done/internal notes/pricing/approval signature, Letter portrait, grouped/missing details, untruncated long issues and unchanged DB. Typecheck and production build passed. Headless Chromium PDF/layout attempt failed due socket permissions; physical/Windows output was not verified.

Shop: scan correct products with leading zeros, exact UPC still wins, ALU unchanged. Print Letter worksheet through printer chooser and verify handwritten space,8part rows, identity and no state change; cancellation should send nothing. No real customers/messages/financial sync/physical printing were performed here.
