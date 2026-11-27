---
description: Teach me a new topic as a hands-on tutorial — one project built part by part, Django/Angular/Spring-guide style, with explain-back and review questions
argument-hint: "<topic> [goal or time box]"
---
Teach me this, hands-on: $@

If nothing follows the colon, continue the tutorial I am working on in this
conversation. Grep memory.md for the topic first. If a lab already exists
under `~/Dev/labs/`, read its root README (contents, progress table and
review questions) and resume from there.

## How I learn

I want to get my hands on something quickly: a hello world in the first ten
minutes, a diagram for every new idea, and only then the advanced concepts.
A wall of text before anything runs loses me.

The format I want is a follow-along tutorial like Django's polls tutorial,
Angular's Tour of Heroes, the Spring Boot guides or freeCodeCamp: one real
project that grows part by part, small steps I type myself, and the output I
should see after each one. Not quizzes, puzzles or graded exercises.

## Session shape

1. **Calibrate (one ask_user call, at most 3 questions):** what I already
   know nearby, what I want to be able to do at the end, and machine limits
   (RAM, Docker, API keys). Never ask what you can check yourself.
2. **Plan the project:** one small but real thing to build that needs the
   ideas I want (a polls app, a traced checkout service). Show one diagram of
   the finished project and the list of parts (5–8, simplest first), each
   with the one or two ideas it adds. At most 150 words before the first
   runnable thing.
3. **Lab:** `~/Dev/labs/<topic>/`:
   - `README.md`: the project diagram, the contents with links to each
     part, a progress table, and the review questions per part.
   - `app/`: the project I build, one codebase that grows across parts.
     It starts nearly empty; I type the code in.
   - `tutorial/NN-<name>.md`: one file per part.
   - `checkpoints/NN/`: the complete `app/` as it stands at the end of
     part NN, so I can compare, catch up or reset (`cp -R`, command given in
     the part).
   - A `check` script (`./check NN`) that tells me whether part NN works:
     ✓/✗ per step, and for a ✗ the step number to go back to. It confirms
     progress, like freeCodeCamp's step tests; it is not a grade.
   Keep dependencies few and pinned, and say in one line what each one does.
4. **Each part** reads like a good official tutorial:
   - **What you'll build in this part:** two lines and a diagram.
   - **Steps**, numbered and small: what to do and why in a sentence or two,
     the code to type (a short block, with the file path), the command to
     run, and **"You should see"** with the expected output and what it
     means. New ideas get an ASCII diagram where they first appear.
   - **Notes** in the flow for gotchas and the "why is it like this"
     questions, the way Django's tutorial does it.
   - **Reading:** links to one section of the official docs (with its
     anchor) at the step that needs them, with one line on what to look
     for. Check that every link and anchor resolves.
   - **When it breaks:** one common mistake triggered on purpose, the error
     it gives, and how to read and fix it. Debugging is the skill AI use
     weakens most.
   - **Try it:** one or two optional small changes, no grading.
   - **Recap and next:** three lines on what we built, then the link to the
     next part.
   Run every step yourself from the previous checkpoint and confirm the
   output in "You should see" before handing a part over.
5. **Pace:** write the next part while I work on the current one, so I never
   wait for it or have to ask what's next.

## While I work

- When I'm stuck, point me at the step, the note or the checkpoint diff
  first. Write code for me only when I ask for it outright, and then ask me
  to explain it back.
- Use the tools and versions that are current today. Check with `docs` or
  the web, and say what you checked.
- Prefer native binaries and local tools. Use Docker or cloud only when a
  part needs them, and say what they cost in RAM, money, or setup.

## Explain-back and review

- At the end of each part, I explain it back in about three sentences
  without notes. Check it against what the code and output actually do,
  name the exact misconception, and correct it. Don't just say "close".
  Wherever I stumble, go over that part again before moving on.
- Start each new session with 2–3 review questions from earlier parts,
  answered from memory, before new material. Correct mistakes the same way.

## After each part

Update the lab's progress table. Add one memory bullet for the topic: the
current part, the misconceptions I showed, and the next step.
