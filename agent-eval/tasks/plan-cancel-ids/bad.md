**Goal**: Stop collateral cancellations and reject noncanonical ids.
mechanism: The DELETE handler calls cancel twice, so a repeated call removes other bookings.

**Findings**
- booking/src/http.ts:27-29 is the DELETE branch to change.
- booking/src/booking.test.ts:38 has a single-booking cancel test.

**Plan**
1. Add tests in booking/src/booking.test.ts for cancelling the first of three adjacent bookings while retaining the other two; also DELETE 01, 1.0, 1e0, 0x1 and 1/extra, expecting 404 with the booking still listed by GET. → check: `cd booking && npm test` fails on remaining ids and DELETE statuses.
2. Stop the handler in booking/src/http.ts from calling cancel twice; ensure only one cancellation per request. Leave booking/src/booking.ts unchanged. → check: `cd booking && npm test` passes the collateral cancellation regression.
3. Require a positive decimal id without leading zeroes and no extra path segment before cancellation in booking/src/http.ts. → check: `cd booking && npm test` passes all rejected-id cases and known-id DELETE still returns 204.

```
---
files-allowed: [booking/src/booking.test.ts, booking/src/booking.ts, booking/src/http.ts]
tests: cd booking && npm test
---
```
