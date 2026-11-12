---
files-allowed: [booking/src/booking.ts, booking/src/booking.test.ts]
tests: cd booking && npm test
---
# DELETE of an unknown booking must be 404

In `booking/`, an in-memory room booking store with a small HTTP front.

**Bug.** `DELETE /bookings/:id` returns 204 for unknown ids; it must return 404.

Required behaviour of `DELETE /bookings/:id` over HTTP:

- A known id: the first DELETE answers 204 with no body.
- The same id again, an id that never existed (`/bookings/999`) and an id that is not a number (`/bookings/abc`) all answer 404 with the JSON body `{ "error": "not found" }`.

Steps:

1. Read the booking code and the existing tests, and run the test command to see the starting state. check: `cd booking && npm test` runs and the existing tests pass.
2. Make `DELETE /bookings/:id` answer as described. check: `cd booking && npm test` passes, and a request sequence against a server from `createServer(new BookingStore())` shows 204 for a known id, then 404 with `{"error":"not found"}` for the same id again.
