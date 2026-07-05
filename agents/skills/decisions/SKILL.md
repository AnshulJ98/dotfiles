---
name: decisions
description: Record architectural choices as ADRs and analyze technical decisions with Goal-Options-Plan. Use when choosing tools, frameworks, or infrastructure, or comparing implementation approaches.
---

# Decisions

Two modes: **analyze** a live choice (Goal-Options-Plan), then **record** the outcome (ADR). Analysis feeds the ADR's Context and Alternatives.

## Analyze: Goal → Options → Plan

Use when comparing approaches with real tradeoffs. Minimum three options — binary choices hide better alternatives.

1. **Goal** — one sentence. The outcome being optimized.
2. **Constraints** — split hard (non-negotiable) from soft (preference).
3. **Options** — three or more, each with pros/cons and a risk level.
4. **Comparison** — weighted criteria table (below).
5. **Recommendation** — one direct statement plus the top 2-3 reasons.
6. **Rejected** — why each other option lost.

### Example: cache/queue store for a job-processing backend

Goal: pick a store for ephemeral job state + rate-limit counters, ~50k ops/sec, single region.

| Constraint | Type |
|---|---|
| Sub-ms reads | Hard |
| Atomic counters / TTLs | Hard |
| Self-hostable, no per-op billing | Soft |
| Team already runs it | Soft |

| Criterion | Weight | Redis | Memcached | Postgres (unlogged) |
|---|---|---|---|---|
| Latency | 30% | high | high | med |
| Data structures (counters, sorted sets) | 25% | high | none | med |
| Ops familiarity | 20% | high | med | high |
| Persistence option | 15% | med | none | high |
| Memory efficiency | 10% | med | high | low |
| Risk | — | low | low | med |

Recommendation: Redis — native atomic counters and TTLs cover both workloads in one store; team runs it already.
Rejected: Memcached (no counters/sorted sets, forces app-side logic); Postgres (latency and lock contention at 50k ops/sec, wrong tool for ephemeral state).

## Record: ADR

One decision per file. Never delete an ADR — deprecate or supersede. Record rejected decisions too; they stop the choice being re-litigated.

Path: `docs/adr/NNNN-use-x.md` (zero-padded, `use-x` / `reject-x` naming).

Status lifecycle: `Proposed → Accepted → (Deprecated | Superseded by NNNN)`. `Rejected` is also terminal and worth recording.

### Template

```markdown
# ADR-NNNN: {Short Title}

Date: YYYY-MM-DD
Status: Proposed | Accepted | Rejected | Deprecated | Superseded by ADR-NNNN

## Context
The forces in play and why this must be decided now.

## Decision
What was decided, active voice: "We will use X because Y."

## Consequences
Positive, negative, and neutral results of the decision.

## Alternatives
What else was considered and why it lost. (The Rejected section from the analysis.)
```

## When to write an ADR

Database, framework, or infra pattern; API style (REST/GraphQL/gRPC); adopting a team-wide tool; build/deploy architecture; any choice with tradeoffs future-you will question.
