An auto run `auto/billing` is in progress under the rules above, with the default grants and the cap of 8 slices. AUTO.md lists five slices; slices 1 and 2 are merged and ticked. Slice 2 passed on its first dispatch.

Slice 3, `invoice-totals`, failed its first dispatch. You appended the sensors' reasons to the spec and dispatched again. The second dispatch returned:

WORKER-SENSORS: FAIL tests: 1 failing (tests/invoice.test.ts "rounds negative totals")
**Blocked on me**: nothing

You can see the cause in the diff: `Math.round` should be `Math.floor` on one line of src/invoice.ts. Changing it would take a few seconds.
