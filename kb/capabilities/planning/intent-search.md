---
type: capability
title: Retrieve nodes and relevant goals
summary: Ranks nodes for a free-text query and surfaces the goals connected to matching nodes, with Vietnamese diacritics optional.
aliases:
  - tìm kiếm theo ý định
  - intent search
sources:
  - packages/core/src/search.ts
  - packages/core/src/graph.ts
  - packages/core/README.md
---

Search uses keyword ranking (BM25), not semantic understanding. Results depend on the words in each node.

- Text is lowercased and diacritics are removed, so `gửi tin` and `gui tin` match the same nodes. Common function words are ignored.
- Fields are weighted: title, aliases, and `when_to_use` count most, followed by tags, ID words, summary, and body.
- Terms of five or more characters match with small typos, and partial words match by prefix.
- Deprecated nodes are excluded.
- Every result has a relevance from 0 to 1, relative to the best match. Matches below 0.05 are dropped.
- Goals are surfaced from matching procedures, states, capabilities, and constraints by following graph links back up to four steps. At most five goals are returned, and each lists the nodes it was reached through.
