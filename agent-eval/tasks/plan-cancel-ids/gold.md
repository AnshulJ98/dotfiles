**Goal**: Cancel only the selected booking and accept only canonical DELETE ids.
mechanism: splice(i) deletes the entire suffix; Number(id) accepts alternate numeric spellings and the route ignores extra segments.

**Findings**
- booking/src/http.ts:28 calls cancel once: the ticket's repeated-call guess is not the cause.
- booking/src/booking.ts:35 uses splice(i) without deleteCount, the real cause of collateral deletion.
- booking/src/http.ts:21,27-28 splits the path but admits any truthy id and ignores tail before Number coercion.

**Plan**
1. Add regressions in booking/src/booking.test.ts. Book three adjacent intervals in room "a"; cancel the first, assert true and that the other two ids remain. POST a booking to a port-0 server; for 01, 1.0, 1e0, 0x1 and 1/extra paths, DELETE must return 404 and GET /rooms/a/bookings must still list its id. Close server in finally. → check: `cd booking && npm test` fails on collateral removal and noncanonical DELETE statuses.
2. In booking/src/booking.ts change cancel's splice(i) to splice(i,1); preserve missing-id false and success true. → check: `cd booking && npm test` passes the three-booking cancel test; noncanonical DELETE cases still fail.
3. In booking/src/http.ts require /^[1-9]\\d*$/ on id and no tail before calling cancel(Number(id)); keep the existing 404 {error:"not found"} fallback and known-id 204. → check: `cd booking && npm test` passes, including all rejected spellings leaving the booking intact.

```
---
files-allowed: [booking/src/booking.test.ts, booking/src/booking.ts, booking/src/http.ts]
tests: cd booking && npm test
---
```
