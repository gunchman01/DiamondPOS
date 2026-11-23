# v0.3.55 — thermal receipt rendering/page-size update

Await actual receipt rendering, explicitly size each thermal spool page to 58/80mm width and measured length, remove invalid CSS mixed width/auto size, reject empty/oversize content before printing. Test/actual receipts share the path. Labels/full pages keep their existing sizing.

356 regression checks, typecheck and build pass. Hardware outcome remains unverified. Windows test page on shop Star TSP100 works; DiamondPOS was feeding/cutting blank. Correct Windows size is 72mm x Receipt for standard 80mm roll. No Windows driver or physical settings changed here. ZIP for Greg to commit, no remote writes/tag/deployment. See START-HERE.md.
