---
name: adr-patterns
description: Architecture Decision Record templates and process. Use when making architectural decisions, choosing frameworks, or documenting technical choices. Covers ADR template, lifecycle, directory structure, and examples.
---

# Architecture Decision Records (ADRs)

## Template

```markdown
# ADR-{NNN}: {Short Title}

**Date:** YYYY-MM-DD
**Status:** Proposed | Accepted | Deprecated | Superseded by ADR-{NNN}

## Context

What is the issue? What forces are in play? Why does this decision need to be made now?

## Decision

What was decided. Active voice: "We will use X because Y."

## Consequences

### Positive
- ...

### Negative
- ...

### Neutral
- ...
```

## Lifecycle

```
Proposed → Accepted → (Deprecated | Superseded)
                ↑
           Rejected (document even rejected decisions — they prevent re-litigating)
```

## Directory Structure

```
docs/decisions/
  ADR-001-use-postgresql.md
  ADR-002-reject-mongodb.md     ← document rejections too
  ADR-003-adopt-openapi.md
```

## Rules

- One decision per ADR. No multi-decision ADRs.
- Write rejected alternatives. The "why not X" is as valuable as "why Y".
- Date every ADR. Decisions have context that changes over time.
- Never delete ADRs. Deprecate or supersede them.
- Keep titles short and searchable: "use-X" or "reject-X" naming.

## Trigger Checklist

Write an ADR when:
- Choosing a database, framework, or infrastructure pattern
- Deciding on API design (REST vs GraphQL vs gRPC)
- Adopting a new tool for the team
- Making a build/deploy architecture decision
- Choosing between two approaches with real tradeoffs
