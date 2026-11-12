---
files-allowed: [booking/src/booking.test.ts, booking/src/booking.ts]
tests: cd booking && npm test
---
# Free slots for a room

In `booking/`, an in-memory room booking store with a small HTTP front.

**Feature.** `freeSlots(roomId, from, to, minMs)` returns the gaps in `[from, to)` not covered by that room's bookings, each at least `minMs` long, in start order.

Add `freeSlots(roomId: string, from: number, to: number, minMs: number)` to the `BookingStore` class in `booking/src/booking.ts`. It returns an array of plain `{ start, end }` objects (no other properties; the tests compare them with deep equality) and does not change the store. Times are epoch milliseconds; bookings are half-open [start, end). Required behaviour:

- An empty room returns the whole window, `[{ start: from, end: to }]`, even with `minMs` 0.
- A booking that straddles `from` or `to` clips the gap at that edge (booked [0, 3h) with window [2h, 10h) gives one gap [3h, 10h); booked [8h, 12h) with window [0, 10h) gives one gap [0, 8h)).
- Back-to-back bookings leave no zero-length gap between them.
- Bookings that only touch the window edge (ending at `from` or starting at `to`) are ignored.
- A gap shorter than `minMs` is dropped; a gap exactly `minMs` long is kept.
- Other rooms' bookings are ignored.
- A window completely booked returns `[]`.
- `to <= from` throws an Error whose message contains `after from`.
- A `from`, `to` or `minMs` that is not a finite number (NaN, Infinity) throws an Error whose message contains `numbers`.

Steps:

1. Read `booking/src/booking.ts` and `booking/src/booking.test.ts`; run the test command to see the starting state. check: `cd booking && npm test` runs and the existing tests pass.
2. Implement `freeSlots` as above in `booking/src/booking.ts`. check: `cd booking && npm test` still passes, and a throwaway `node` one-liner in `booking/` shows an empty room returns the whole window and a fully booked window returns `[]`.
