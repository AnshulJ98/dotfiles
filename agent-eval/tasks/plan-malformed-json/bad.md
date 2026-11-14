**Goal**: Keep serving after invalid POST JSON.
mechanism: JSON.parse throws from the asynchronous end listener rather than rejecting readJson's promise.

**Findings**
- booking/src/http.ts:13 parses inside an event callback.
- booking/src/http.ts:35-36 handles booking errors as 409; parse failures need a separate 400 response.

**Plan**
1. In booking/src/http.ts add reject to the readJson Promise and catch JSON.parse exceptions inside the end listener, rejecting them. Catch readJson rejection in the POST branch and send 400 with a string error; leave store.book and its 409 behavior alone. → check: `cd booking && npm test` passes existing tests.
2. Add a test in booking/src/booking.test.ts: POST "{bad" and an empty body, assert 400 and a JSON string error for each, then GET /rooms/a/bookings returns 200; close the server in finally. → check: `cd booking && npm test` passes including both new POST assertions.

```
---
files-allowed: [booking/src/booking.test.ts, booking/src/http.ts]
tests: cd booking && npm test
---
```
