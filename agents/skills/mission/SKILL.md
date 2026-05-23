---
name: mission
description: Skill for Planning tasks into well defined epics. Goal->Options->Plan and Plan->stories after user signoff. Also helps with implementation after planning when user invokes.
---

# Mission Planning

## Phase 1: Goal Clarification

Before any planning, nail down:
1. **What are we building?** (one sentence)
2. **Who uses it?** (user/system)
3. **What does success look like?** (measurable outcome)
4. **What's explicitly out of scope?**

## Phase 2: Goal → Options → Plan

### Structure

```
GOAL: [One sentence mission statement]

CONSTRAINTS:
- Hard: [non-negotiable]
- Soft: [preferred]

OPTIONS:
A. [Approach 1] — pros/cons
B. [Approach 2] — pros/cons
C. [Approach 3] — pros/cons

RECOMMENDATION: Option [X] because [2-3 reasons]
```

Present this to the user. Wait for signoff before proceeding.

## Phase 3: Plan → Stories

After user approves the approach:

```
EPIC: [Name]
Goal: [1 sentence]

Stories:
1. [ ] As a [user], I can [action] so that [value]
   Acceptance: [testable criteria]
   
2. [ ] ...
```

Keep stories small enough to complete in one session.

## Phase 4: Implementation

After user approves stories:
- Work story by story
- Update acceptance criteria as you go
- Flag blockers immediately — don't work around them silently

## Artifact Files

- `PLAN.md` — approved approach
- `STORIES.md` — story breakdown with acceptance criteria
- `PROGRESS.md` — live status (TODO / IN PROGRESS / DONE)
