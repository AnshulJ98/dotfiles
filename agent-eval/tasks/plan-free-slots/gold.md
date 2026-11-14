**Goal**: Return the room's free half-open gaps.
mechanism: Sweep sorted room bookings with a cursor starting at from; emit only positive gaps meeting minMs, then the remaining suffix.

**Findings**
- booking/src/booking.ts:34-35 already filters and sorts in listRoom; freeSlots is missing.
- booking/src/booking.ts:4 defines half-open intervals; :14-15 establishes finite-number and ordering validation.
- booking/src/booking.test.ts:8 uses H = 3_600_000 and checks room isolation and order.
- For negative minMs, accept all positive gaps, as for zero: a negative minimum imposes no duration restriction. Zero never creates empty gaps.

**Plan**
1. In booking/src/booking.test.ts add freeSlots cases with minMs=0 unless specified: empty room in [0,10) gives [{start:0,end:10}]; bookings [1,2), [2,3) in window [0,4) give [0,1), [3,4); straddling either boundary clips gaps; edge-touching bookings and other rooms have no effect. Check fully covered returns [], short gaps are dropped and exact-minimum gaps retained; NaN/Infinity in from/to/minMs throws /numbers/; to <= from throws /after from/. → check: `cd booking && npm test` fails because freeSlots is missing.
2. In booking/src/booking.ts export Slot {start:number;end:number} and add freeSlots(roomId:string,from:number,to:number,minMs:number):Slot[]. Validate finite numbers then to > from. Iterate listRoom(roomId), skip b.end <= cursor or b.start >= to; emit [cursor,b.start) only when b.start > cursor and length >= minMs; advance cursor = Math.max(cursor,b.end). Emit [cursor,to) only when to > cursor and length >= minMs. → check: `cd booking && npm test` passes.

```
---
files-allowed: [booking/src/booking.test.ts, booking/src/booking.ts]
tests: cd booking && npm test
---
```
