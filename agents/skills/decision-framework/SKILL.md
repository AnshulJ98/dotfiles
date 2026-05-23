---
name: decision-framework
description: Structured Goal→Options→Plan analysis for technical decisions. Use when evaluating technical choices, comparing implementations, or choosing between architectural approaches. Requires minimum 3 alternatives with pros/cons tables and clear recommendation.
---

# Decision Framework

## Structure: Goal → Options → Plan

### 1. Goal Statement

One sentence. What outcome are we optimizing for?

> "Choose a state management library for a Next.js 15 app with 10 developers and real-time requirements."

### 2. Constraints

List hard constraints (non-negotiable) vs soft constraints (preferences):

| Type | Constraint |
|------|-----------|
| Hard | Must work with React Server Components |
| Hard | No vendor lock-in |
| Soft | Prefer minimal bundle size |
| Soft | Team familiar with Redux patterns |

### 3. Options (minimum 3)

For each option:

```
## Option A: Zustand

**Pros:**
- Minimal boilerplate
- Works with RSC (client-side only)
- 3KB bundle size

**Cons:**
- No dev tools as mature as Redux
- Less familiar to Redux teams

**Risk:** Low

---
## Option B: Redux Toolkit
...

## Option C: Jotai
...
```

### 4. Comparison Table

| Criterion | Weight | Option A | Option B | Option C |
|-----------|--------|----------|----------|----------|
| RSC compat | 30% | ✓ | ✓ | ✓ |
| Bundle size | 20% | ✓✓ | ✗ | ✓✓ |
| DX | 25% | ✓✓ | ✓ | ✓ |
| Team familiarity | 25% | ✗ | ✓✓ | ✗ |

### 5. Recommendation

Direct statement: "Use Option A (Zustand) because [top 2-3 reasons]."

### 6. Rejected Alternatives

Document why you didn't choose the others — prevents re-litigating.

## Anti-Patterns

- Analysis paralysis — time-box to 30 minutes
- Fake objectivity — if you already know the answer, defend it explicitly
- Missing rejection rationale — always document why you said no
- Only 2 options — binary choices hide better alternatives
