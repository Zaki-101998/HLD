export default {
  id: 'typeahead',
  title: 'Design Typeahead / Autocomplete',
  subtitle: 'Search suggestions in <100ms: the trie, precomputed top-k, and read-optimized delivery',
  days: 2,
  content: `
## The problem

Design the search suggestion box: as a user types "sys", instantly show the top completions ("system design", "system of a down", "systems"). Google/Amazon/YouTube search boxes. The defining constraint is **latency** — suggestions must appear within a few tens of milliseconds *per keystroke*, at enormous read volume. This problem is a masterclass in **precomputation and read-optimization**: you do heavy work offline so each keystroke is a trivial lookup.

## Step 1 — Requirements

**Functional:** given a prefix, return the **top-k** (say 5–10) most relevant completions, **ranked by popularity** (query frequency). Suggestions update as new queries trend. *De-scope initially:* personalization, spell-correction/fuzzy match (mention as extensions).

**Non-functional:** **extremely low latency** (< ~100ms, ideally < 50ms — it fires on every keystroke); **massive read volume** (every keystroke of every searcher — far more than actual searches); **freshness** (new trending queries should appear, but with minutes-to-hours lag being acceptable — not real-time). Availability > perfect accuracy.

## Step 2 — Estimation

- If there are ~5B searches/day and users type ~4 chars each triggering a suggestion request, that's ~**20B+ suggestion lookups/day** (~250k/sec, peak higher) — **read volume dwarfs everything else.** This screams **precompute + cache**: the lookup per keystroke must be near-free.
- The corpus of distinct queries is large but bounded; the **top completions per prefix** is what we serve, and that's small.

## Step 3 — API

\`\`\`
GET /suggest?prefix=sys&limit=10  → ["system design", "systems", "sysadmin", ...]
\`\`\`
Often served from an edge/CDN-close service; debounced client-side (don't fire on *every* keystroke — wait ~100–300ms of no typing).

## Step 4 — The core data structure: the trie (prefix tree)

A **trie** stores strings by shared prefix: each node is a character, each path from root spells a prefix, and a marked node ends a word. To autocomplete "sys", walk root→s→y→s, then all descendant words are candidates.

- Naively, at query time you'd traverse the subtree under "sys" and gather + sort all completions by frequency — **too slow** for a hot prefix with millions of descendants, on every keystroke.
- **Key optimization — precompute top-k at each node.** Store, *at each trie node*, the **cached list of the top-k completions for that prefix** (and their frequencies). Then answering "sys" is just: walk to the "sys" node, **return its precomputed top-k list** — an O(prefix length) lookup, no subtree traversal, no sorting. This precomputation is the whole trick.

## Step 5 & 6 — Architecture and deep dives

\`\`\`
 Offline (batch, every few hrs):
   query logs ─▶ aggregate frequencies ─▶ BUILD trie with top-k cached per node
                                          └─▶ serialize/shard trie ─▶ push to serving nodes

 Online (per keystroke):
   client (debounced) ─▶ CDN/edge ─▶ Suggest service (in-memory trie / cache) ─▶ top-k list
\`\`\`

### Deep dive 1 — Precompute offline, serve online (the central idea)
Split into two paths:
- **Data collection + build (offline/batch):** query logs stream in; a **batch job** (MapReduce/Spark) aggregates query frequencies over a window, then **builds the trie with the top-k precomputed at every node**. Runs every few hours (freshness need is loose). The heavy lifting happens here, away from the request path.
- **Serving (online):** the built trie is loaded **in memory** on serving nodes (it's read-only between rebuilds). Each request is a fast in-memory prefix lookup returning the cached top-k. Because the trie is immutable between builds, it's trivially **cacheable and replicable** — no invalidation problem.

### Deep dive 2 — Read-optimization stack
- **In-memory** trie (RAM lookup, no disk).
- **Cache/CDN** the results for the hottest prefixes at the edge — most requests are short common prefixes ("a", "ho", "wea") and can be served without even reaching the service.
- **Debounce** on the client to cut request volume.
- **Replicate** the read-only trie across many serving nodes for horizontal read scaling; **shard** the trie by prefix range (nodes for "a–f", "g–m"…) if it's too big for one machine, routing requests by first letters.

### Deep dive 3 — Freshness & updates
- Rebuild the trie periodically (hours) from recent logs → trending queries appear with acceptable lag. For faster trends, a **secondary real-time layer** can overlay very recent hot queries on top of the batch trie (a lambda-architecture flavor) — mention as an extension.
- **Weighting recency:** decay old query counts so yesterday's spike doesn't dominate forever.

### Deep dive 4 — Ranking & extensions
- Rank completions by **frequency**, optionally blended with recency, CTR, and (extension) **personalization** (user history/location) and **spell-correction / fuzzy matching** (edit-distance to handle typos — a harder add-on, often via a separate fuzzy index).

## Step 7 — Wrap-up

Typeahead is a **precomputation and read-optimization problem** driven by extreme per-keystroke read volume and a <100ms latency budget. The core structure is a **trie with the top-k completions cached at every node**, so a lookup is O(prefix length) with no traversal or sorting on the hot path. The trie is **built offline in batch** from aggregated query logs (heavy work off the request path), then served **in memory**, **replicated/sharded**, and **cached at the edge** with **client debouncing** to absorb the read flood. Freshness is loose (rebuild every few hours; optional real-time overlay for trends). Trade-offs: staleness (new queries lag by the rebuild interval) and rebuild cost, traded for blazing-fast, cache-friendly reads; immutability between builds removes cache-invalidation entirely.

## How this shows up in interviews

- The interviewer wants the **trie**, and specifically the insight to **precompute and cache top-k at each node** rather than traverse+sort on every keystroke — that's the difference between a passing and a naive answer.
- Expect the framing "**do the heavy work offline, make the online lookup trivial**" — batch-built trie served in memory. This precompute-vs-serve split is the reusable lesson.
- Expect **"how do you handle the read volume / keep latency low?"** — in-memory + edge cache + debounce + replication; short common prefixes served from cache.
- Bonus: freshness via periodic rebuilds (+ real-time overlay), recency weighting, and extensions (personalization, fuzzy match).
`,
  resources: [
    {
      title: 'Design a Search Autocomplete / Typeahead',
      url: 'https://www.youtube.com/watch?v=us0qySiUsGU',
      type: 'video',
      source: 'ByteByteGo',
    },
    {
      title: 'System Design: Typeahead suggestions (trie + top-k)',
      url: 'https://www.hellointerview.com/learn/system-design/problem-breakdowns/ad-click-aggregator',
      type: 'article',
      source: 'Hello Interview (precompute/serve patterns)',
    },
    {
      title: 'How autocomplete works — tries and prefix search',
      url: 'https://www.youtube.com/watch?v=MCYVQjbEsXA',
      type: 'video',
      source: 'Tech Dummies / system design (trie explainer)',
    },
  ],
  challenges: [
    {
      type: 'quiz',
      id: 'quiz-1',
      title: 'Typeahead check',
      questions: [
        {
          q: 'Why is walking the trie subtree under a prefix and sorting all completions by frequency at query time too slow?',
          options: [
            'Tries can’t be traversed',
            'A hot prefix can have millions of descendant completions; traversing and sorting them on EVERY keystroke blows the <100ms budget. The fix is to precompute and cache the top-k completions AT each node, making a lookup O(prefix length)',
            'Sorting is impossible in memory',
            'It uses too much disk',
          ],
          answer: 1,
          explanation:
            'The whole trick is precomputation: store each node’s top-k completions so answering a prefix is just "walk to the node, return its cached list" — no subtree traversal, no per-request sorting. That’s what meets the latency budget under massive read volume.',
        },
        {
          q: 'How is the trie (with cached top-k) kept up to date with new/trending queries?',
          options: [
            'Updated synchronously on every search in real time',
            'Rebuilt periodically (every few hours) by an OFFLINE batch job that aggregates query-log frequencies and recomputes the top-k per node; freshness lag of minutes-to-hours is acceptable (optional real-time overlay for fast trends)',
            'It never changes',
            'Users submit suggestions manually',
          ],
          answer: 1,
          explanation:
            'Do the heavy work offline: a batch job builds the trie from recent logs on a schedule. Real-time per-query updates would be expensive and unnecessary since suggestion freshness can lag a bit. A small real-time layer can overlay very recent hot queries if needed.',
        },
        {
          q: 'Why is the batch-built trie especially easy to cache and replicate?',
          options: [
            'Because it’s small',
            'It’s READ-ONLY between rebuilds (immutable), so there’s no cache-invalidation problem — you can freely replicate it across serving nodes and cache results at the edge/CDN',
            'Because it’s stored in SQL',
            'Because tries compress perfectly',
          ],
          answer: 1,
          explanation:
            'Immutability between builds removes the hardest caching problem (invalidation). The serving trie can be loaded in memory on many replicas and hot-prefix results cached at the edge, giving horizontal read scaling for the keystroke flood.',
        },
        {
          q: 'Which techniques most reduce the raw request volume and latency for autocomplete?',
          options: [
            'Querying the primary database on each keystroke',
            'Client-side debouncing (wait for a typing pause), serving an in-memory trie, and caching hot short prefixes at the edge/CDN so common requests never reach the service',
            'Using strong consistency and 2PC',
            'Disabling suggestions for popular prefixes',
          ],
          answer: 1,
          explanation:
            'Debouncing cuts requests per user; in-memory lookups avoid disk; edge caching of the very common short prefixes ("a", "ho", "wea") offloads most traffic. Together they make the extreme per-keystroke read volume manageable at low latency.',
        },
      ],
    },
    {
      type: 'design',
      id: 'design-1',
      title: 'Design exercise: search autocomplete',
      prompt: `
Design a search autocomplete service: as a user types a prefix, return the top ~10 most popular completions in under 100ms, at the scale of a major search engine (tens of billions of suggestion lookups per day). Suggestions should reflect query popularity and update as trends change (a few hours of lag is fine).

Cover the framework, focusing depth on: (1) the data structure and the key optimization that meets the latency budget, (2) how the structure is built and kept fresh, (3) how you serve the enormous read volume at low latency, and (4) ranking. Note the trade-offs, and mention how you’d extend to personalization or typo tolerance.
`,
      hints: [
        'A trie alone isn’t enough — what do you cache AT each node to avoid traversal+sort?',
        'Heavy work offline, trivial lookup online — describe both paths.',
        'Read volume is the challenge: in-memory + edge cache + debounce + replication.',
      ],
      modelAnswer: `
**Requirements** — Functional: top-k completions for a prefix, ranked by popularity, updating with trends (de-scope personalization/fuzzy initially). Non-functional: <100ms per keystroke, enormous read volume, freshness lag of hours OK, availability over perfect accuracy.

**Estimation** — tens of billions of suggestion lookups/day (~250k+/s) — read volume dominates → **precompute + cache; each lookup must be near-free**.

**API** — \`GET /suggest?prefix=&limit=\`, debounced client-side, served near the edge.

**Data structure + key optimization** — a **trie** keyed by prefix, with the **top-k completions cached at every node**. A query walks to the prefix node and returns its cached list — O(prefix length), no subtree traversal or per-request sort. That precomputation is what meets the budget.

**Build + freshness** — an **offline batch job** (Spark/MapReduce) aggregates query-log frequencies over a window and **rebuilds the trie with per-node top-k every few hours**; serialized and pushed to serving nodes. Optional **real-time overlay** for very recent trending queries; **recency-decay** old counts.

**Serving the read volume** — load the **read-only trie in memory** on serving nodes; **replicate** widely for read scaling; **shard by prefix range** if too large; **cache hot short prefixes at the edge/CDN** (most traffic) so common requests never hit the service; **debounce** on the client. Immutability between builds means no cache-invalidation.

**Ranking** — by frequency, blended with recency/CTR; extensions: **personalization** (user history/location) and **fuzzy/spell-correction** (edit-distance index) for typos.

**Trade-offs** — staleness up to the rebuild interval and rebuild compute cost, traded for blazing, cache-friendly reads; immutability removes invalidation; approximate/global (not personalized) by default.

**One-line summary:** a trie with top-k cached at each node turns every keystroke into an O(prefix) in-memory lookup; build it offline in batch from query logs, serve it read-only across replicas with edge caching and client debouncing to absorb billions of daily lookups, and accept a few hours of staleness for speed — extending to personalization and fuzzy matching as needed.
`,
    },
  ],
}
