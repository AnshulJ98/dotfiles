---
files-allowed: [booking/src/booking.test.ts, booking/src/booking.ts]
tests: cd booking && npm test
---
# Back-to-back bookings are rejected

In `booking/`, an in-memory room booking store with a small HTTP front.

**Bug.** Back-to-back bookings in one room are rejected: 10:00–11:00 then 11:00–12:00 throws "is booked". Adjacent bookings must be allowed; real overlaps still rejected.

Times are epoch milliseconds and a booking covers the half-open interval [start, end), as the `Booking` interface in `booking/src/booking.ts` says. `BookingStore.book(roomId, start, end)` must behave as follows, for one room:

- A booking that starts exactly where another ends, or ends exactly where another starts, is accepted. After booking [1h, 2h), then [2h, 3h), then [0, 1h), `listRoom` returns all three.
- Booking exactly the same interval again throws an Error whose message contains `is booked`.
- A booking contained inside an existing one (for example [1.5h, 1.75h) inside [1h, 2h)) throws an Error whose message contains `is booked`.
- Partial overlaps, the "end before start" check, and bookings in other rooms keep working as they do today.

Steps:

1. Read `booking/src/booking.ts` and the existing tests in `booking/src/booking.test.ts`, and run the test command to see the starting state. check: `cd booking && npm test` runs and the existing tests pass.
2. Change `booking/src/booking.ts` so the behaviour above holds. check: `cd booking && npm test` passes, and a throwaway `node` one-liner importing `./src/booking.ts` from `booking/` shows [1h, 2h) followed by [2h, 3h) is accepted while a repeat of [1h, 2h) throws `is booked`.
