---
name: skill-creator
description: Guide for creating effective skills. This skill should be used when users want to create a new skill (or update an existing skill) that extends Claude's capabilities with specialized knowledge, workflows, or tool integrations.
license: Complete terms in LICENSE.txt
---

# Skill Creator

## Skill Structure

```
~/.agents/skills/{name}/
  SKILL.md          ← required: frontmatter + content
  references/       ← optional: supplementary docs loaded on demand
    patterns.md
    examples.md
```

## SKILL.md Template

```markdown
---
name: skill-name
description: One sentence. When to use it, what it covers. This is the trigger description agents use to decide when to load the skill.
tags:
  - optional-tag    ← add tags for categorization
---

# Skill Title

## When to Use
Specific triggers that activate this skill.

## Core Content
The actual knowledge, patterns, templates, or guidance.

## Rules
Non-negotiable constraints this skill enforces.
```

## Effective Description Guidelines

The `description` field is critical — it's what agents match against to know when to load this skill.

- Start with "Use when..." or the activation context
- List specific trigger phrases or scenarios
- Name the concrete things this skill covers
- Keep it under 3 sentences

**Good:**
```yaml
description: Code review checklist for PRs. Use when reviewing code changes or auditing quality. Covers security, performance, TypeScript, React/Next.js, testing, and API design.
```

**Bad:**
```yaml
description: Helps with code quality stuff.
```

## Content Guidelines

- Lead with the most important pattern/rule
- Include concrete examples with actual code
- Keep references/ for supplementary content that's only needed sometimes
- No padding — every sentence must add value
- Format for LLM consumption: headers, bullets, code blocks over prose

## After Creating

1. Test it: invoke `skill(name="your-skill")` in a session
2. Verify the description triggers correctly for your intended use cases
3. Add to `~/.copilot/instructions/skills.instructions.md` index
