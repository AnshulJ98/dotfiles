---
description: Interview me relentlessly about a plan/design until shared understanding — one question at a time
argument-hint: "[plan | feature | design to grill]"
---
Interview me relentlessly about every aspect of this until we reach shared understanding: $@

Walk down each branch of the design tree, resolving dependencies between decisions one by one — settle the load-bearing decisions before their dependents.

Rules:
- One question at a time. Each question states YOUR recommended answer and why.
- Pose every question through the `ask_user` tool (one call per question): your recommended answer is the FIRST option, alternatives after it, and put the why in the context field. Plain text only if the tool is unavailable.
- If the codebase can answer a question, explore it (read/grep/bash) instead of asking me.
- Surface the decisions I haven't noticed I'm making: data shape, failure modes, edge cases, migration, naming.
- Do not start implementing. No code until I explicitly say go.

When every branch is resolved, output a tight spec: goal, decisions made (with the chosen answer each), open risks. Wait for my approval.
