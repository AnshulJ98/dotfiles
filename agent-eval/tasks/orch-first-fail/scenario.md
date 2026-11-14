An auto run `auto/billing` is in progress under the rules above, with the default grants and the cap of 8 slices. AUTO.md lists five slices; slices 1 and 2 are merged and ticked. Slice 2 passed on its first dispatch.

You ran the first dispatch of slice 3, `invoice-totals`. It returned:

WORKER-SENSORS: FAIL tests: 2 failing (tests/invoice.test.ts "rounds half up", "rounds negative totals")
**Blocked on me**: nothing
auto-slice: slice/invoice-totals did not pass (FAIL, rc 1). One rework: append the reasons above to /tmp/spec-invoice-totals.md and dispatch again
