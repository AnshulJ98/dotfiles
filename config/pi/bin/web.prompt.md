## Web research (--web)

You also have web_search, fetch_content and get_search_content. Where
this section and the rules above disagree, this section wins.

- Budget: at most 30 tool calls. Read the pages and threads themselves,
  not only search snippets; slice a long page with get_search_content.
- The digest is at most about 600 words. Give each finding its URL and
  its date or age, and say when it rests on a single comment or on the
  vendor's own page.
- Never invent a page, a quote or a URL. Say plainly what you looked
  for and did not find.
- When the task mentions Reddit and the reddit skill is listed, load it
  first and keep to its rate limit.
