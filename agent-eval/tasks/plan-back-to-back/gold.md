**Goal**: Adjacent bookings in one room are accepted; real overlaps are still rejected.
mechanism: `BookingStore.book` throws "is booked" when `start <= b.end && end >= b.start`. The inclusive comparisons treat a booking that only touches another at an endpoint as an overlap. Intervals are half-open, so change both to strict: `start < b.end && end > b.start`.

**Findings**
- booking/src/booking.ts:18 is the only overlap test; it is the faulty comparison.
- booking/src/booking.ts:4 documents a booking as half-open, [start, end), so touching endpoints do not overlap.
- booking/src/booking.test.ts:16 covers a partial overlap only; nothing covers touching bookings, an exact duplicate or a contained one.
- `cd booking && npm test` runs `node --test 'src/*.test.ts'`; it needs no setup.

**Plan**
1. Add a test in booking/src/booking.test.ts: book [1h, 2h), [2h, 3h) and [0, 1h) in room "a" and expect `listRoom("a").length` to be 3; expect the same [1h, 2h) again and a contained [1.5h, 1.75h) to throw /is booked/. → check: `cd booking && npm test` fails on this test with "is booked" thrown by the second booking.
2. In booking/src/booking.ts:18 change the condition to `start < b.end && end > b.start`. → check: `cd booking && npm test` passes, including "rejects an overlapping booking in the same room".

```
---
files-allowed: [booking/src/booking.ts, booking/src/booking.test.ts]
tests: cd booking && npm test
---
```
