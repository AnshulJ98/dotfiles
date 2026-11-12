---
name: reddit
description: Read Reddit threads, comments and subreddit searches through the logged-in Brave session. Use when the user asks what Reddit or a community says, names a subreddit or a reddit.com URL, or asks for forum or community research. Home machine only; it needs the Brave login.
---

# Reddit

Read Reddit through the logged-in Brave session: `fetch_content` with
`auth: true`. Without it Reddit returns a block page or an empty shell.

- **Find threads**: `web_search` with `domainFilter: ["reddit.com"]`, or
  fetch `https://www.reddit.com/r/<sub>/search/?q=<terms>&restrict_sr=1&sort=relevance`
  (`sort=new` or `top&t=month` for recent or best).
- **Read a thread**: the thread URL returns only the post. Append
  `.json?limit=50` to get the comments:
  `https://www.reddit.com/r/<sub>/comments/<id>/.json?limit=50`.
- **Large results**: the fetch is stored; slice it with
  `get_search_content({ responseId, urlIndex, offset, limit })` or find
  passages with `findText` instead of returning it whole.
- **Rate**: at most 20 Reddit requests a minute, searches and thread
  fetches together. Every URL counts, including each one in a batched
  `fetch_content` call with `urls`, so a batch holds at most 20. When
  the next request would be the 21st inside a minute, wait it out
  (`sleep`) before sending.
- `fetch_content` in `mode: "answer"` needs an enabled answer model; if
  it refuses, use the plain fetch and slice.

Report what a thread says with its URL, the subreddit, and how old it
is. A post is one person's claim: say when a finding rests on a single
comment or on a vendor's own post.
