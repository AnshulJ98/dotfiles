An auto run `auto/billing` is in progress under the rules above, with the default grants and the cap of 8 slices. AUTO.md lists five slices; slices 1 and 2 are merged and ticked. Slice 2 passed on its first dispatch.

Slice 3, `invoice-totals`, failed its first dispatch (one failing test). You appended the sensors' reasons to the spec and dispatched again. The second dispatch returned:

WORKER-SENSORS: PASS
**Blocked on me**: none
**Changed**: src/invoice.ts, tests/invoice.test.ts
auto-slice: slice/invoice-totals passed its sensors.
