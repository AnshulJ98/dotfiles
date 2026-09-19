---
description: Stress-test a plan via a written question file the user fills in — waves sized by the decision tree, blanks accept the recommendation
argument-hint: "[plan | feature | design to grill]"
---
Interrogate every load-bearing decision in this until it is settled: $@

You do not implement anything. No code until I explicitly say go.

## 1. Research first

Any question the codebase can answer, answer it — read, grep, run things.
Writing a question costs you one turn; six greps cost six, and you will be
tempted to ask instead of look. Do not. Every question's Context line either
cites `file:line` or states outright that the codebase does not settle it.

## 2. Sort the candidate questions

Every question lands in exactly one class:

- **Independent** — neither its existence nor its option set changes under
  any answer to another question. Goes in this wave.
- **Guarded** — it applies only under one branch, but overturning the parent
  deletes it rather than replacing it with a different question set. Goes in
  this wave, carrying an explicit `Applies if` line.
- **Deferred** — overturning the parent brings 3 or more questions of its
  own. Only this class forces another wave.

Wave size is an output of the sort, not a setting. A plan with no deferred
questions ships as a single large wave. Never claim zero deferred on a plan
that visibly forks.

Cap a wave at 15 questions. Past that, cut the ones whose recommendation you
would confidently make anyway and list them under Assumed defaults.

## 3. Write the file

Path `.grill/<topic>.md`. If the repo does not already ignore `.grill/`, add
it to `.git/info/exclude`. Then stop the turn.

```markdown
# Grill: <topic> — wave <n>

Leave an answer blank to accept the recommendation. Save, then tell me to
re-read. Questions marked "I need this from you" have no default and will
stop the wave if left blank.

**Wave <n>: <N> questions (<a> independent, <b> guarded). Deferred: <c>.**

## Q1. <question>
**Context:** why this is load-bearing, citing `file:line`, or why the code
does not settle it.
**Recommendation:** <pick> — <why, one line>
**Alternatives:** <B> (costs: …) | <C> (costs: …)
**Answer:**

## Q7. <question>
**Applies if:** Q3 = <branch> (my recommendation). Skip it if you pick
<other branch>.
**Context:** …
**Recommendation:** …
**Answer:**

## Q9. <question>
**Context:** …
**Recommendation:** none — I need this from you. <what makes a default
unsafe: irreversible, destructive, or a fact only you hold.>
**Answer:**

---
**Assumed defaults (not asked):** <decision> = <value>. …
**Deferred to wave <n+1>:** <topic> (needs Q3), <topic> (needs Q5).
```

## 4. On re-read

Re-read the file from disk; never answer from your memory of what you wrote.
Never regenerate or rewrite the file — the answers in it are the user's, and
a rewrite eats them. Wave `n+1` appends a new section to the same file.

- A blank answer on a normal question means the recommendation is accepted.
- A blank answer on a `none — I need this from you` question halts the wave.
  Report which ones and stop.
- A guarded question whose premise the user overturned is discarded, even if
  they filled it in.
- Answers are prose, not letters. "B, but only on the admin path" is a
  different decision from "B". Restate each one in your own words so I can
  catch a misreading.

When every branch is resolved, output a tight spec: goal, every decision with
its chosen answer as you understood it, assumed defaults, open risks. Then
wait for my approval.
