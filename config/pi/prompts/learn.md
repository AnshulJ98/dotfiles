---
description: Teach me a new topic hands-on — hello world first, a diagram per concept, Predict→Run→Investigate→Read→Recreate→Modify→Make rungs with checkers, hints not answers, spaced review
argument-hint: "<topic> [goal or time box]"
---
Teach me this, hands-on: $@

If nothing follows the colon, continue the lab I am working on in this
conversation. Grep memory.md for the topic first. If a lab already exists
under `~/Dev/labs/`, read its root README (progress table and review
questions) and resume from there.

## How I learn

I want to get my hands on something quickly: a hello world in the first ten
minutes, a diagram for every new idea, light exercises, and only then the
advanced concepts. A wall of text before anything runs loses me.

I work best from examples and pictures: show me a complete working example,
then guide me through rebuilding it myself. Give me reading links at the
point I need them, not as a list up front.

## Session shape

1. **Calibrate (one ask_user call, at most 3 questions):** what I already
   know nearby, what I want to be able to do at the end, and machine limits
   (RAM, Docker, API keys). Never ask what you can check yourself.
2. **Map:** one ASCII diagram of the whole ladder (5–7 rungs, simplest
   first). Each rung adds one or two new ideas and builds on the one before.
   At most 150 words before the first runnable thing.
3. **Lab:** `~/Dev/labs/<topic>/` with one folder per rung, `NN-name/`.
   Each rung has:
   - `README.md`: a short "why it matters", one ASCII diagram per new idea,
     then the steps:
     - **Predict:** I read the code and write down my guesses.
     - **Run:** the command to run.
     - **Investigate:** 3–5 questions I answer from the output or UI, not
       from the code.
     - **Read:** 1–3 links, each to one section of the official docs (with
       its anchor) and one line on what to look for. They come after
       Investigate, so I read with questions already in mind. Check that
       every link and anchor resolves. A link that shows the answer to a
       drill goes in `hints.md` instead.
     - **Recreate:** I rebuild the example in a new file with the original
       closed, from a skeleton of numbered comments and a diagram that
       carries the same numbers. Fade it rung by rung: one comment per line
       in rung 00, one per block later, then only the function names.
     - **Modify:** a small change to the given code.
     - **Make:** a small thing I build from an empty file.
   - The smallest runnable code for that idea. Rung 00 is a hello world
     of 15 lines or fewer. Keep dependencies few and pinned, and say in one
     line what each one does: a pile of unexplained packages is the most
     common way beginners get overwhelmed.
   - At least one thing that is broken on purpose, or a hidden fault for me
     to find. Debugging is the skill AI use weakens most, so practise it
     early.
   - A checker (`check.py` or `check.sh`) for every Recreate, Modify and Make step that
     can be checked mechanically. It prints ✓/✗ per item, then PASS or
     "not yet". A drill without a checker says "done when you can explain X
     out loud".
   - `hints.md`: graded hints, from a nudge to nearly the answer. Never a
     full solution. I take them one at a time from the terminal
     (`hint.py <rung> <step> [n]`, which prints one hint and the command
     for the next), because opening the file shows them all at once.
   - A `.pristine/` copy of every file I edit, so I can reset.
   - Root README: the ladder diagram, review questions per rung, and a
     progress table.
   Run every rung and every checker yourself (unsolved, then solved in a
   scratch copy you revert) before handing it over.
4. **Hand over one rung at a time.** Give me the command to start and stop.
   Don't build rung N+1 until I report back on rung N, unless I ask for it.

## While I work

- Ask me to predict before I run anything.
- When I'm stuck, point me at the next hint or ask a guiding question. Write
  code for me only when I ask for it outright, and then ask me to explain it
  back.
- Check my answers against the output and name the exact misconception.
  Don't just say "close".
- When a rung is done, I explain it back in about three sentences without
  notes. Wherever I stumble is a gap: go over that part again before
  moving on.
- When I answer correctly, cut the scaffolding for the next rung: fewer
  hints, bigger Make steps.
- Start each new session with 2–3 review questions from earlier rungs,
  answered from memory, before new material.
- Use the tools and versions that are current today. Check with `docs` or
  the web, and say what you checked.
- Prefer native binaries and local tools. Use Docker or cloud only when a
  rung needs them, and say what they cost in RAM, money, or setup.

## After each rung

Update the lab's progress table. Add one memory bullet for the topic: the
current rung, the misconceptions I showed, and the next step.
