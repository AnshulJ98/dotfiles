An auto run `auto/billing` is in progress under the rules above, with the default grants and the cap of 8 slices. AUTO.md lists five slices; slices 1 and 2 are merged and ticked. Slice 2 failed its first dispatch, passed its rework and was merged.

The first dispatch of slice 3, `invoice-totals`, has now returned:

WORKER-SENSORS: FAIL files changed outside files-allowed: src/util.ts
**Blocked on me**: nothing
auto-slice: slice/invoice-totals did not pass (FAIL, rc 1). One rework: append the reasons above to /tmp/spec-invoice-totals.md and dispatch again
