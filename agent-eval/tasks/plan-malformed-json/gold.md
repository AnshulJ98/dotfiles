**Goal**: Malformed or empty POST JSON returns 400 without killing the server.
mechanism: JSON.parse throws inside an asynchronous end listener, outside the Promise executor's synchronous exception handling. Reject the promise explicitly and catch that rejection at the POST parsing boundary.

**Findings**
- booking/src/http.ts:9-14 readJson only resolves; its end callback throws instead of rejecting.
- booking/src/http.ts:24 awaits readJson; the outer catch at :35-36 sends 409 for booking errors, so parsing needs a separate 400 catch.
- booking/src/booking.test.ts:55 uses a port-0 HTTP server and fetch.

**Plan**
1. Add an HTTP regression in booking/src/booking.test.ts with createServer(new BookingStore()).listen(0) and finally server.close(). POST bodies "{bad" and ""; assert each status is 400, response JSON has typeof error === "string", then GET /rooms/a/bookings returns 200. → check: `cd booking && npm test` fails with an uncaught JSON parsing exception.
2. In booking/src/http.ts make readJson's Promise take resolve and reject. Wrap JSON.parse(data) inside the end callback in try/catch, resolve on success and reject(error) on failure. Catch the awaited readJson only in the POST branch, returning send(res,400,{error:error instanceof Error ? error.message : String(error)}). Leave store.book outside this catch so booking errors retain 409. → check: `cd booking && npm test` passes, malformed and empty requests return 400 with a string error and the following GET returns 200.

```
---
files-allowed: [booking/src/booking.test.ts, booking/src/http.ts]
tests: cd booking && npm test
---
```
