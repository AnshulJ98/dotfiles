**Goal**: Fix the booking bug.

**Plan**
1. Look at the booking code in booking/src/booking.ts and fix the bug so that bookings work as the ticket describes. → check: verify it works.
2. While there, tidy booking/src/booking.ts: pull the room filter out of `listRoom` into a private helper method and rename the `bookings` field to `entries`. → check: confirm everything still works.
3. Make sure nothing else broke. → check: check that the change is fine.

```
---
files-allowed: [booking/src/booking.ts]
tests: cd booking && npm test
---
```
