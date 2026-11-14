**Goal**: Return free gaps for a room.
mechanism: Sweep the sorted room bookings from a cursor at from, emitting uncovered positive intervals at least minMs long.

**Findings**
- booking/src/booking.ts:34-35 provides listRoom in start order.
- booking/src/booking.ts:4 uses half-open intervals.

**Plan**
1. Add Slot and freeSlots to booking/src/booking.ts. Validate finite numeric inputs and to > from with messages containing "numbers" and "after from". Skip bookings outside the window, advance the cursor past each booking, and collect qualifying gaps including the final suffix. → check: verify it works.
2. Review the result without changing other methods or files. → check: make sure the gaps look reasonable.

```
---
files-allowed: [booking/src/booking.test.ts, booking/src/booking.ts]
tests: cd booking && npm test
---
```
