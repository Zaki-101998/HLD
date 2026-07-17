export default {
  id: 'twitter',
  title: 'Design Twitter (Timeline & Search)',
  subtitle: 'Combine feed fan-out with real-time search — inverted indexes, trending, and the hybrid timeline',
  days: 2,
  content: `
## The problem

Design Twitter/X: users post short tweets, follow others, see a **home timeline** of tweets from people they follow, and can **search** tweets by keyword and see **trending** topics. The timeline half reuses the news-feed fan-out you just learned; the new, distinguishing piece is **search over a firehose of tweets** — an **inverted index** at scale — plus trending. So this problem tests whether you can *compose* two subsystems.

## Step 1 — Requirements

**Functional:** post a tweet (280 chars, optional media); follow users; **home timeline** (tweets from followees, reverse-chron/ranked); **search tweets** by keyword; **trending topics**. *De-scope:* DMs, ads, notifications (mention).

**Non-functional:** **read-heavy** timelines (~100:1) needing low latency; **search must be near-real-time** (a tweet is findable within seconds — Twitter is a "what's happening now" product); high availability; huge scale (500M+ users, hundreds of millions of tweets/day).

## Step 2 — Estimation

- ~**200M DAU**, ~**400M tweets/day** (~5k writes/sec, peak much higher during events); timeline reads dominate at ~100:1. Search adds its own read load.
- **Tweet storage:** 400M/day × ~300 bytes ≈ 120 GB/day of text (media separate) → sharded store. The **search index** must ingest 5k+ tweets/sec continuously — near-real-time indexing is the hard requirement.

## Step 3 — API

\`\`\`
POST /tweet         { user_id, text, [media] }
GET  /timeline?user_id=&cursor=
POST /follow        { follower, followee }
GET  /search?q=&cursor=
GET  /trending?location=
\`\`\`

## Step 4 — Data model

- \`Tweet { tweet_id (snowflake: time-sortable), author_id, text, created_at, media_ref }\` in a sharded store; media in object storage + CDN.
- \`Follow\` graph; \`Timeline { user_id → [tweet_ids] }\` precomputed cache (Redis).
- **Search index:** an **inverted index** (term → list of tweet_ids), served by a search cluster (Elasticsearch).

## Step 5 & 6 — Architecture and deep dives

### Part A — Home timeline (reuse the fan-out hybrid)
Exactly the news-feed problem: **hybrid fan-out** — fan-out on write into followers' precomputed timelines for normal users, **pull-and-merge at read time for celebrities** (Twitter is the *origin* of the celebrity problem — accounts with 100M+ followers). Fan out only to active users; store tweet_ids; hydrate + rank at read. (See the News Feed topic for the full treatment.) **Snowflake IDs** (timestamp-prefixed) make tweets globally sortable by time across shards.

### Part B — Search (the new, distinguishing deep dive)
Search over hundreds of millions of tweets needs an **inverted index** (Phase 2 blob/search topic): for each **term**, a **posting list** of the tweet_ids containing it. Query "world cup" → intersect the posting lists for "world" and "cup" → rank → return.

- **Near-real-time indexing:** when a tweet is posted, it's published to an **indexing pipeline** (via a queue/stream). **Indexer workers** tokenize the text (lowercase, remove stop words, stem) and update the inverted index so the tweet is searchable within seconds. This async pipeline decouples posting from indexing.
- **Distributed index:** the index is far too big for one machine — **shard it**. Two schemes:
  - **Partition by document (tweet_id):** each shard indexes a subset of tweets; a query **scatter-gathers** across all shards and merges. Scales writes evenly; queries hit every shard.
  - **Partition by term:** each shard owns certain terms' posting lists; a query only hits shards for its query terms, but hot terms create hotspots. Document-partitioning (scatter-gather) is the common, simpler choice.
- **Ranking:** relevance (TF-IDF/BM25) blended with **recency** and **engagement** — recency matters a lot on Twitter. A ranking layer reorders results.
- **Replication + caching:** replicate index shards for availability and read throughput; cache hot queries.

### Part C — Trending topics
Trending = "terms/hashtags with an unusually high rate of mentions *right now*." A **streaming aggregation**:
- Tweets flow through a stream processor (Kafka + Flink/Spark Streaming). **Count term frequencies over a sliding time window**, compare to a baseline, and surface terms that spike. **Count-Min Sketch** (Phase 3 probabilistic structures) approximates counts over the firehose in bounded memory — a great callback. Results cached and refreshed every few minutes, often per-region.

\`\`\`
Tweet posted ─▶ store + ID  ─▶ [timeline fan-out workers]  ─▶ followers' Redis timelines
                           └─▶ [stream] ─▶ search indexer ─▶ inverted index (Elasticsearch)
                                        └─▶ trending aggregator (windowed counts / CMS) ─▶ trending cache
Search query ─▶ search cluster (scatter-gather posting lists) ─▶ rank (relevance+recency) ─▶ results
Timeline read ─▶ precomputed timeline ⊕ celebrity pull ─▶ rank ─▶ hydrate ─▶ page
\`\`\`

## Step 7 — Wrap-up

Twitter = **timeline (feed fan-out) + search (inverted index) + trending (stream aggregation)**, composed. The timeline reuses the **hybrid fan-out** (push for normal users, pull-and-merge for celebrities — Twitter *is* the celebrity problem), with time-sortable **snowflake IDs**. Search is an **inverted index**, kept **near-real-time** by an async indexing pipeline off a stream, **sharded by document with scatter-gather** queries and ranked by relevance+recency. Trending is a **windowed streaming count** (Count-Min Sketch for the firehose). Trade-offs: eventual consistency (tweets appear in timelines/search within seconds), the storage/compute cost of precomputed timelines *and* a full search index, and scatter-gather query fan-out. The interview signal is **composing two hard subsystems** and knowing where each Phase 2–3 tool fits.

## How this shows up in interviews

- Interviewers expect you to **reuse the fan-out hybrid** for the timeline quickly (don't re-derive it slowly) and spend fresh depth on **search: the inverted index, near-real-time indexing, and sharding/scatter-gather.**
- Expect **"how do you make new tweets searchable immediately?"** — async indexing pipeline off a stream; indexer workers update the inverted index within seconds.
- Expect **"how do you shard the search index?"** — by document (scatter-gather) vs by term (hotspots); pick document-partitioning and justify.
- Bonus: **trending via windowed counts + Count-Min Sketch**, snowflake IDs for time-ordering, relevance+recency ranking. Naming the probabilistic-structure callback is a strong signal.
`,
  resources: [
    {
      title: 'Design Twitter — timeline + search at scale',
      url: 'https://www.youtube.com/watch?v=wYk0xPP_P_8',
      type: 'video',
      source: 'ByteByteGo',
    },
    {
      title: 'Design the Twitter/X search & timeline',
      url: 'https://www.hellointerview.com/learn/system-design/problem-breakdowns/tweet-search',
      type: 'article',
      source: 'Hello Interview',
    },
    {
      title: 'How inverted indexes power search',
      url: 'https://www.elastic.co/blog/found-elasticsearch-from-the-bottom-up',
      type: 'article',
      source: 'Elastic',
    },
  ],
  challenges: [
    {
      type: 'quiz',
      id: 'quiz-1',
      title: 'Twitter design check',
      questions: [
        {
          q: 'What core data structure powers keyword search over hundreds of millions of tweets?',
          options: [
            'A B-tree on the tweet text',
            'An inverted index: term → posting list of tweet_ids containing it. A query intersects/merges the posting lists for its terms, then ranks',
            'A hash map of tweet_id → text',
            'A graph database',
          ],
          answer: 1,
          explanation:
            'The inverted index (Phase 2) maps each term to the documents containing it, so "world cup" intersects the "world" and "cup" posting lists. This is the workhorse of full-text search (Elasticsearch/Lucene), and the distinguishing piece of the Twitter problem beyond the timeline.',
        },
        {
          q: 'How do you make a newly posted tweet searchable within seconds?',
          options: [
            'Rebuild the entire index nightly',
            'Publish new tweets to an async indexing pipeline (a queue/stream); indexer workers tokenize and update the inverted index continuously, decoupling posting from indexing so the tweet is findable in near-real-time',
            'Search the primary tweet database directly with LIKE',
            'It’s impossible to search recent tweets',
          ],
          answer: 1,
          explanation:
            'Twitter is a real-time product, so search must be near-real-time. An async pipeline off a stream lets indexer workers add tweets to the inverted index within seconds without slowing the write path — decoupling posting from indexing.',
        },
        {
          q: 'You shard the search index "by document" (each shard indexes a subset of tweets). How is a query served, and what’s the trade-off vs sharding "by term"?',
          options: [
            'Only one shard is queried; no trade-off',
            'A query scatter-gathers across ALL shards and merges results — even write distribution and simplicity, at the cost of every query hitting every shard; term-partitioning hits fewer shards but suffers hot-term hotspots',
            'The query goes to a random shard',
            'Document sharding makes search impossible',
          ],
          answer: 1,
          explanation:
            'Document-partitioning spreads writes evenly and is simpler, but each query must scatter-gather across all shards. Term-partitioning routes a query only to shards owning its terms, but popular terms overload their shard. Scatter-gather (document) is the common, robust default.',
        },
        {
          q: 'How would you compute trending topics over the tweet firehose efficiently?',
          options: [
            'Exactly count every term in a relational database on each request',
            'Stream tweets through a windowed aggregator that counts term/hashtag frequencies over a sliding time window and surfaces spikes vs baseline — using Count-Min Sketch to approximate counts in bounded memory; cache and refresh every few minutes',
            'Ask users to report trends',
            'Sort the entire tweet table by keyword hourly',
          ],
          answer: 1,
          explanation:
            'Trending is a real-time streaming aggregation: count term rates in sliding windows and detect spikes. Exact counts over the firehose are memory-prohibitive, so Count-Min Sketch (Phase 3) approximates them cheaply — a strong callback to probabilistic structures.',
        },
      ],
    },
    {
      type: 'design',
      id: 'design-1',
      title: 'Design exercise: Twitter with timeline and search',
      prompt: `
Design Twitter: users post short tweets, follow others, see a home timeline of followees’ tweets, search tweets by keyword, and see trending topics. Scale to 200M+ DAU and hundreds of millions of tweets/day, with search that’s near-real-time.

Move quickly through the timeline (reuse the feed fan-out you know), then spend most of your depth on the SEARCH subsystem: the index structure, how new tweets become searchable fast, how you shard the index and serve queries, and ranking. Also design trending topics. Note where you reuse earlier patterns and the trade-offs.
`,
      hints: [
        'Timeline = the hybrid fan-out from the News Feed topic — state it briefly, don’t re-derive slowly.',
        'Search = inverted index + async near-real-time indexing + sharding (scatter-gather).',
        'Trending = windowed streaming counts; Count-Min Sketch keeps it cheap.',
      ],
      modelAnswer: `
**Requirements** — Functional: post tweet, follow, home timeline, keyword search, trending (de-scope DMs/ads). Non-functional: read-heavy timelines (~100:1, low latency), **near-real-time search**, high availability, 200M+ DAU / hundreds of millions of tweets/day.

**Estimation** — ~400M tweets/day (~5k writes/s, event peaks higher); timeline reads ~100:1; the search index must ingest 5k+/s continuously → near-real-time indexing is the hard constraint.

**API** — \`POST /tweet\`, \`GET /timeline\`, \`POST /follow\`, \`GET /search?q=\`, \`GET /trending\`.

**Data model** — \`Tweet{tweet_id (snowflake, time-sortable), author_id, text, created_at, media_ref}\` sharded; media in object storage/CDN; \`Follow\` graph; \`Timeline{user→[tweet_ids]}\` in Redis; **inverted index** for search.

**Timeline (reused, brief)** — **hybrid fan-out**: push into followers’ precomputed Redis timelines for normal users; **pull-and-merge celebrity tweets at read time** (Twitter is the origin of the celebrity problem); fan out to active users only; snowflake IDs give cross-shard time ordering; rank + hydrate at read.

**Search (main deep dive)** —
- **Inverted index**: term → posting list of tweet_ids; query intersects term lists → rank.
- **Near-real-time indexing**: new tweets flow through a **stream/queue** to **indexer workers** that tokenize (lowercase, stop-word removal, stemming) and update the index within seconds — decoupled from posting.
- **Sharding**: partition **by document** (each shard indexes a subset), queries **scatter-gather** across shards and merge — even writes, simple; alternative term-partitioning avoids querying all shards but causes hot-term hotspots. Replicate shards for availability/throughput; cache hot queries.
- **Ranking**: relevance (BM25) blended with **recency** and engagement.

**Trending** — stream tweets through a **windowed aggregator** (Kafka + Flink): count term/hashtag frequencies over a sliding window, surface spikes vs baseline; use **Count-Min Sketch** to approximate counts over the firehose in bounded memory; cache per region, refresh every few minutes.

**Reuse & trade-offs** — timeline reuses fan-out; search reuses inverted index (Phase 2) + async pipeline; trending reuses CMS (Phase 3). Eventual consistency (tweets appear in timeline/search within seconds); cost of maintaining both precomputed timelines and a full search index; scatter-gather query fan-out.

**One-line summary:** compose three subsystems — a hybrid-fan-out timeline with snowflake IDs, a document-sharded inverted index kept near-real-time by an async indexing pipeline and served via scatter-gather with relevance+recency ranking, and trending via windowed streaming counts (Count-Min Sketch) — accepting eventual consistency and dual-index cost for real-time reach.
`,
    },
  ],
}
