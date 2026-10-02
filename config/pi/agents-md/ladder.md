
# Before Writing Code

Read the task and trace the real flow first. Then take the first option
that holds:

1. Skip it: the need is speculative.
2. Reuse what this codebase already has.
3. Use the standard library or the platform: `<input type="date">` over
   a date-picker library, CSS over JS, a database constraint over
   application code.
4. Use a dependency that is already installed. Never add one for what a
   few lines cover.
5. Write the least code that works.
