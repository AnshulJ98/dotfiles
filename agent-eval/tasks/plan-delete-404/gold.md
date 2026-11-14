**Goal**: Unknown DELETE ids return 404, known ids still return 204.
mechanism: The DELETE handler ignores cancel's boolean result and unconditionally sends 204. Branch on that result instead.

**Findings**
- booking/src/http.ts:27-29 calls store.cancel(Number(id)) but discards its result.
- booking/src/booking.ts:32-36 returns false for a missing id, true for a found one; Number("abc") is NaN and matches no booking.
- booking/src/http.ts:34 already supplies the not-found JSON shape.
- booking/src/booking.test.ts:46-58 shows the ephemeral-server/fetch pattern.

**Plan**
1. In booking/src/booking.test.ts add an HTTP DELETE regression using createServer(new BookingStore()).listen(0), closing in finally. POST room "a", start 0, end H; delete its returned id and assert 204; delete again and assert 404 with {error:"not found"}. Also assert DELETE /bookings/999 and /bookings/abc return 404. → check: `cd booking && npm test` fails because the repeat DELETE returns 204.
2. In booking/src/http.ts return send(res,204) only when store.cancel(Number(id)) is true; otherwise return send(res,404,{error:"not found"}). Keep routing, POST and store behavior unchanged. → check: `cd booking && npm test` passes including known, missing and non-numeric DELETE cases.

```
---
files-allowed: [booking/src/booking.test.ts, booking/src/http.ts]
tests: cd booking && npm test
---
```
