# v0.3.64 layout verification

Typecheck and production build. Root cause traced to global .history-row display:grid on table tr. Distinct sales-history-row plus explicit table-row/nowrap/fixed columns removes the conflict. Secondary block lines removed. No financial/server changes; existing399-check suite last passed v0.3.63 and was not repeated for CSS/list presentation only.

Shop visual confirmation: each transaction is one aligned row, all nine columns visible or horizontally scrollable, long names truncate, void/on-account rows do not grow extra lines, and click/Enter opens full details. Actual Windows rendering not tested here.
