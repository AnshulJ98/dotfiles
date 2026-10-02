---
name: decisions
description: Record architectural choices as ADRs and analyze technical decisions with Goal-Options-Plan. Use when the user asks which of two or more named tools, libraries, databases, queues, or frameworks to pick, says "X vs Y", asks whether to adopt or migrate to something, or weighs implementation approaches against each other. Load it before answering, alongside any version or currency check, not instead of one.
---

# Decisions

Two modes: **analyze** a live choice (Goal-Options-Plan), then **record** the outcome (ADR). Analysis feeds the ADR's Context and Alternatives.

## Analyze: Goal → Options → Plan

Use when comparing approaches with real tradeoffs; an obvious pick gets one paragraph, not this template. Consider at least three options, counting "keep the current setup" when it is viable: binary choices hide better alternatives. An option that fails a hard constraint gets one line saying which, then leaves the table.

1. **Goal** — one sentence. The outcome being optimized.
2. **Constraints** — split hard (non-negotiable) from soft (preference).
3. **Options** — three or more, each with pros/cons and a risk level.
4. **Comparison** — criteria table, scored 1-5 and weighted (below).
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
| Latency | 30% | 5 | 5 | 3 |
| Data structures (sorted sets for sliding windows) | 25% | 5 | 1 | 3 |
| Ops familiarity | 20% | 5 | 3 | 5 |
| Persistence option | 15% | 3 | 1 | 5 |
| Memory efficiency | 10% | 3 | 5 | 1 |
| **Weighted score** | | **4.5** | **3.0** | **3.5** |
| Risk | — | low | low | med |

Recommendation: Redis — atomic counters, TTLs, and sorted sets cover both workloads in one store; team runs it already.
Rejected: Memcached (has `incr`/`decr` and TTLs, but no sorted sets, so sliding-window rate limits move into app code, and nothing survives a restart); Postgres (latency and lock contention at 50k ops/sec, wrong tool for ephemeral state).

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
