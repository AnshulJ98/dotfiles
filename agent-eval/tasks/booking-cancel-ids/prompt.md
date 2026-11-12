---
files-allowed: [booking/src/booking.ts, booking/src/http.ts]
tests: cd booking && npm test
---
# Cancel removes one booking; DELETE rejects non-canonical ids

In `booking/`, an in-memory room booking store with a small HTTP front. Two defects around cancelling:

**1. `cancel` removes more than one booking.** `BookingStore.cancel(id)` must remove only the booking with that id and return `true`; every other booking, including ones made after it, stays. With three bookings in room "a" ([0, 1h), [1h, 2h), [2h, 3h)), cancelling the first leaves the other two in `listRoom("a")`, in start order, with their ids. An unknown id still returns `false` and changes nothing.

**2. `DELETE /bookings/:id` accepts ids that are not canonical.** Only an id written as a canonical positive decimal integer (no sign, no leading zero, no fraction, no exponent, no hex, nothing after it) may cancel a booking. For a booking with id `N`, each of these requests must answer 404 and leave the booking in place (`GET /rooms/a/bookings` still lists it): `/bookings/0x<N in hex>`, `/bookings/N.0`, the digits of N followed by `e0`, `/bookings/0N` (a leading zero), and `/bookings/N/extra` (an extra path segment). The canonical `/bookings/N` still answers 204 the first time and 404 afterwards, with the body `{ "error": "not found" }` for 404s, as it does today.

Steps:

1. Read `booking/src/booking.ts`, `booking/src/http.ts` and the existing tests; run the test command to see the starting state. check: `cd booking && npm test` runs and the existing tests pass.
2. Fix the store so only the cancelled booking is removed. check: `cd booking && npm test` passes, and a throwaway `node` one-liner in `booking/` that books three slots and cancels the first shows two remaining.
3. Fix the HTTP route so only canonical ids are accepted as described. check: `cd booking && npm test` passes, and requests for `/bookings/01` and `/bookings/1/extra` against a running `createServer(...)` answer 404 while the booking still lists.
