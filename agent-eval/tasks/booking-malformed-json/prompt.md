---
files-allowed: [booking/src/booking.test.ts, booking/src/http.ts]
tests: cd booking && npm test
---
# A body that isn't JSON kills the server

In `booking/`, an in-memory room booking store with a small HTTP front (`createServer(store)` in `booking/src/http.ts`).

**Bug.** `POST /bookings` with a body that isn't JSON kills the server. Reproduce it first, find the cause, then fix it; no `[DEBUG-` line may be left behind.

Required behaviour for `POST /bookings`:

- A body that is not valid JSON (for example `{bad`) answers status 400 with a JSON body `{ "error": <string> }`, where the error is a string (the tests only check its type).
- An empty body answers 400 the same way.
- The server keeps running afterwards: a following `GET /rooms/a/bookings` answers 200.
- Valid bodies still answer 201 with the created booking, and a valid body that the store rejects keeps the status it has today.

Steps:

1. Read `booking/src/http.ts` and the existing tests; build a red loop by sending `{bad` and an empty body to a server started with `createServer(new BookingStore()).listen(0)` and watching the process. check: the request with a bad body reproduces the crash or a dropped connection before any change.
2. Fix `booking/src/http.ts` so both bodies answer 400 and the server stays up. check: `cd booking && npm test` passes, and the same two requests now answer 400 followed by a 200 on `GET /rooms/a/bookings`.
