export default {
  id: 'nosql',
  title: 'NoSQL: Choosing the Right Store',
  subtitle: 'Key-value, document, wide-column, graph — LSM trees, and the real decision framework',
  days: 3,
  content: `
## Why this matters for system design

"SQL or NoSQL?" is asked in almost every interview — and the expected answer is never a religion, it's a **framework**: access patterns + scale + consistency needs → store. This topic gives you that framework plus enough internals (LSM trees) to justify it.

## Why NoSQL exists

Relational DBs optimize for: rich ad-hoc queries, joins, strong transactions — on ONE node. At web scale three pressures broke that:

1. **Write volume** beyond one machine (sharding SQL is manual and painful — next topic).
2. **Flexible/evolving data** where rigid schemas hurt.
3. **Availability over consistency** for global systems (CAP, coming soon).

NoSQL stores each pick a different trade: give up joins/transactions/schema to get horizontal scale, availability, or model fit.

## The four families

### 1. Key-value (Redis, DynamoDB, Memcached)
A giant distributed hash map: \`get(key) / put(key, value)\`. Values are opaque blobs.
- ⚡ Predictable single-digit-ms at any scale; trivially partitionable by key.
- 🚫 No queries beyond the key. "Find sessions by user-region" = redesign your keys.
- **Use:** sessions, carts, feature flags, counters, caching, anything id-addressed.

### 2. Document (MongoDB, DynamoDB-ish, CouchDB)
Values are structured (JSON) — queryable and indexable by inner fields; schema-flexible per document.
- ⚡ Natural fit for "an entity and its nested stuff" (order + line items in ONE document = no join).
- 🚫 Cross-document joins/transactions are limited; data duplication is the norm (denormalization).
- **Use:** product catalogs (variable attributes!), user profiles, CMS content.

### 3. Wide-column (Cassandra, HBase, ScyllaDB)
Rows grouped into **partitions** by partition key, sorted *within* partition by clustering key. Writes are absurdly fast (LSM, below); reads are fast **only along designed paths**.
- ⚡ Linear write scaling to millions/s; tunable consistency; multi-DC replication built in.
- 🚫 You must know queries at design time ("query-first modeling"); no ad-hoc queries/joins.
- **Use:** time-series, messages by conversation, feeds, sensor/event firehoses.
- Canonical model: \`PRIMARY KEY ((chat_id), sent_at)\` → "recent messages of a chat" is one sequential partition read.

### 4. Graph (Neo4j, Neptune)
Nodes + edges as first-class; traversals ("friends-of-friends who like X") in ms where SQL would need explosive self-joins.
- **Use:** social graphs, recommendations, fraud rings. Niche in interviews — one sentence when the *query is the graph*.

## The internals that justify it: LSM trees vs B-trees

B-trees (SQL default) update pages **in place** → random I/O on writes.

**LSM (log-structured merge) trees** — Cassandra/RocksDB/LevelDB:
1. Write goes to an in-memory sorted buffer (**memtable**) + append-only WAL. Ack. (Sequential I/O only — Phase 1's fast path!)
2. Full memtables flush to disk as immutable sorted files (**SSTables**).
3. Background **compaction** merges SSTables, discarding overwritten/deleted values.

Result: **spectacular write throughput**; reads may check several SSTables (mitigated by per-file **Bloom filters** — "definitely not here" in RAM, another Phase 3 preview). The trade in one line: *LSM = writes cheap, reads pay; B-tree = reads cheap, writes pay.*

## Denormalization — the mindset shift

Relational modeling: normalize, then join at read time.
NoSQL modeling: **store data in the shape you'll read it**, duplicating as needed. The feed example: instead of joining posts×follows at read time, write each post into every follower's feed partition at write time (fan-out on write — a Phase 4 star). Storage is cheap; cross-partition reads are not.

Cost: updates must touch every copy (app-managed consistency) — acceptable when copies are append-mostly or staleness-tolerant.

## The decision framework (say THIS in interviews)

1. **What are the queries?** Ad-hoc/relational/joins → SQL. A handful of known paths at huge scale → wide-column/KV. Entity-blob by id → document/KV.
2. **What scale of writes?** <10k/s: Postgres is fine, stop showing off. ≫10k/s sustained or multi-region writes: LSM family.
3. **Consistency needs?** Transactions across entities → SQL (or carefully scoped). "Eventually is fine" → NoSQL comfort zone.
4. **Default:** Postgres until proven otherwise; polyglot for real systems (SQL for orders + Redis for sessions + Cassandra for events + ES for search) — each store doing what it's for.

## How this shows up in interviews

- Messages/feeds/time-series at scale → wide-column, partition by owner, clustered by time. Sessions/carts → KV. Catalog → document. Money/inventory → SQL.
- Justify with access patterns and write QPS from YOUR estimation — never with "NoSQL scales better".
- Bonus points: mention LSM vs B-tree when defending a write-heavy choice, and denormalization when defending duplicate data.
`,
  resources: [
    {
      title: 'SQL vs NoSQL — which to choose?',
      url: 'https://www.youtube.com/watch?v=t0GlGbtMTio',
      type: 'video',
      source: 'ByteByteGo (YouTube)',
    },
    {
      title: 'Designing Data-Intensive Applications — Ch. 2 (Data Models) & 3 (Storage: LSM/B-trees)',
      url: 'https://dataintensive.net/',
      type: 'doc',
      source: 'Martin Kleppmann',
    },
    {
      title: 'The Dynamo paper (readable and hugely influential)',
      url: 'https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf',
      type: 'doc',
      source: 'Amazon, SOSP 2007',
    },
    {
      title: '15 Types of Databases',
      url: 'https://blog.algomaster.io/p/15-types-of-databases',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
    {
      title: 'The Log-Structured Merge-Tree (LSM-Tree)',
      url: 'https://www.cs.umb.edu/~poneil/lsmtree.pdf',
      type: 'doc',
      source: "O'Neil et al.",
    },
    {
      title: 'Design a Distributed Key-Value Store',
      url: 'https://www.youtube.com/watch?v=rnZmdmlR-2M',
      type: 'video',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
  ],
  challenges: [
    {
      type: 'quiz',
      id: 'quiz-1',
      title: 'Store selection check',
      questions: [
        {
          q: 'A chat app stores messages and reads "the latest 50 messages of chat X" at 2M writes/sec globally. Best-fit store and model?',
          options: [
            'Postgres with an index on chat_id',
            'Wide-column (Cassandra-style): PRIMARY KEY ((chat_id), sent_at DESC) — partition per chat, time-ordered within, LSM absorbing the write rate',
            'A graph database of messages',
            'One Redis list per chat as the source of truth',
          ],
          answer: 1,
          explanation:
            'The read is a single-partition sequential scan; writes are appends into LSM — both are the store’s native strengths. 2M writes/s is beyond sensible single-primary SQL. (Redis as truth loses data on memory pressure; fine as cache only.)',
        },
        {
          q: 'Why are LSM-tree stores so fast at writes?',
          options: [
            'They skip writing to disk',
            'Writes hit an in-memory memtable + sequential WAL append; sorted files are flushed/merged in the background — no random in-place page updates',
            'They compress every write',
            'They acknowledge before receiving the data',
          ],
          answer: 1,
          explanation:
            'Everything on the write path is memory or sequential I/O (the fast lane from Phase 1). The deferred cost lands on reads (check multiple SSTables — mitigated by Bloom filters) and background compaction.',
        },
        {
          q: 'Your product catalog has wildly different attributes per category (laptops have RAM; shoes have sizes). Which model fits naturally?',
          options: [
            'One SQL table with 400 nullable columns',
            'Document store: each product is a JSON document with category-appropriate fields, indexed on the common ones',
            'Key-value with opaque blobs',
            'A graph of attributes',
          ],
          answer: 1,
          explanation:
            'Heterogeneous, entity-shaped, read-by-id-and-filtered data is the document sweet spot. (The serious SQL alternative is a JSONB column in Postgres — mentioning that hybrid is a plus, not a dodge.)',
        },
        {
          q: 'In Cassandra data modeling, you design tables starting from…',
          options: [
            'The entity-relationship diagram, normalized',
            'The queries: one table per read path, with partition key = what you look up by, duplicating data across tables as needed',
            'The largest table first',
            'Alphabetical column order',
          ],
          answer: 1,
          explanation:
            '"Query-first" modeling: since there are no joins and cross-partition scans are painful, every read path gets a purpose-shaped table maintained at write time. Denormalization is the design, not a hack.',
        },
        {
          q: 'A startup with 3k QPS total and classic relational data (users, orders, invoices) asks which NoSQL to adopt. Correct answer:',
          options: [
            'Cassandra for scale',
            'Postgres — the data is relational, the scale is trivial for SQL, and they’d be trading away transactions and ad-hoc queries for nothing',
            'MongoDB because schemas slow teams down',
            'DynamoDB because Amazon uses it',
          ],
          answer: 1,
          explanation:
            'The framework: access patterns are relational, write volume is ~nothing, transactions matter (invoices!). Choosing boring correctly is a STRONG interview signal — over-engineering is a real failure mode.',
        },
        {
          q: 'What is the read-side price of LSM storage, and what mitigates it?',
          options: [
            'Reads lock the memtable; mitigated by sharding',
            'A key might live in any of several SSTables, so reads may touch multiple files; per-SSTable Bloom filters skip files that definitely lack the key',
            'Reads must scan the WAL; mitigated by caching',
            'There is no read-side price',
          ],
          answer: 1,
          explanation:
            'Immutable SSTables accumulate versions until compaction merges them. Bloom filters ("definitely not / maybe") keep most lookups to the right file(s) — the same structure you’ll reuse for cache penetration and crawlers.',
        },
        {
          q: '"Friends-of-friends who work at company X and live near me" — at what point does a graph DB beat SQL?',
          options: [
            'Never; SQL joins handle everything',
            'When multi-hop traversals dominate: each SQL self-join multiplies cost, while graph stores walk edges in ~constant time per hop',
            'When you have more than 1M users',
            'Graph DBs are always faster',
          ],
          answer: 1,
          explanation:
            'Depth-3 traversals in SQL = joining the friendships table to itself repeatedly (combinatorial). Graph engines store adjacency directly. If the QUERY is a traversal, say graph; otherwise don’t bring it up.',
        },
      ],
    },
    {
      type: 'lab',
      id: 'lab-1',
      title: 'Model data query-first with Redis structures',
      intro:
        'Use the Redis you installed (caching topic) as a mini NoSQL playground: KV, document-ish hashes, and a Cassandra-style timeline.',
      steps: [
        {
          instruction: 'Key-value session store: write, read, expire.',
          command: "redis-cli set 'session:abc123' '{\"user\":42,\"role\":\"admin\"}' EX 3600 && redis-cli get 'session:abc123'",
          expected: 'The JSON back. Session lookups by opaque key: the KV sweet spot.',
        },
        {
          instruction: 'Document-ish: a product as a hash with per-field access.',
          command: "redis-cli hset 'product:9' name 'Mechanical Keyboard' price 4500 stock 12 category 'accessories' && redis-cli hget 'product:9' price && redis-cli hgetall 'product:9'",
          expected: 'Read ONE field or the whole entity — structured value beats opaque blob when fields matter.',
        },
        {
          instruction: 'Wide-column-style timeline: messages of a chat, sorted by timestamp, using a sorted set (score = time).',
          command: "redis-cli zadd 'chat:77:messages' 1700000001 'hey' 1700000002 'how goes?' 1700000003 'shipping the design doc' && redis-cli zrevrange 'chat:77:messages' 0 1 WITHSCORES",
          expected: 'The 2 newest messages, no scan — "recent N of partition X" is a designed read path, like a Cassandra clustering key.',
        },
        {
          instruction: 'Feel the denormalization trade: build a user’s feed as its own structure at write time.',
          command: "redis-cli zadd 'feed:user42' 1700000003 'post:901' 1700000004 'post:902' && redis-cli zrevrange 'feed:user42' 0 9",
          expected: 'Reading a feed = one sorted-set read, because writes did the joining. Fan-out-on-write in miniature — remember this in Phase 4’s news feed design.',
        },
        {
          instruction: 'Try the query you did NOT design for: "all chats where user42 posted". Notice there is no way except scanning every chat key.',
          command: "redis-cli --scan --pattern 'chat:*' | head",
          expected: 'You’d have to walk every partition — THE NoSQL limitation. If that query matters, you build another table/index shaped for it at write time.',
        },
      ],
    },
    {
      type: 'design',
      id: 'design-1',
      title: 'Design exercise: polyglot storage for a food-delivery app',
      prompt: `
Pick a store (SQL / KV / document / wide-column / graph / search) for EACH dataset below, with a one-line justification tied to access pattern + scale. Then name the ONE dataset where getting it wrong is most expensive and why.

1. Orders & payments (300/s peak, strict correctness, refunds/joins/reports)
2. Restaurant catalog & menus (heterogeneous items, 10k reads/s, rare writes)
3. Live driver GPS pings (500k writes/s, queries: latest position + last 30 min trail per driver)
4. User sessions & carts (2M concurrent, sub-ms reads by session id)
5. "Restaurants near me" geo-search + text search ("biryani")
`,
      hints: [
        'Each dataset maps cleanly onto one family from this topic.',
        'For #3: partition by what? clustered by what?',
        'The expensive-to-get-wrong one involves money.',
      ],
      modelAnswer: `
1. **Orders/payments → SQL (Postgres).** Transactions, joins for refunds/reports, 300/s is trivial for one primary + replicas. Money = ACID; nothing else is defensible.
2. **Catalog/menus → document store (or Postgres JSONB).** Heterogeneous nested menus read as whole entities; cache-aside Redis on top for the 10k reads/s (writes are rare → invalidation is cheap).
3. **GPS pings → wide-column (Cassandra/Scylla).** \`PRIMARY KEY ((driver_id), ping_time DESC)\` — 500k/s appends land in LSM memtables; both queries are single-partition reads. TTL old pings (built into Cassandra) for the 30-min trail. Latest-position ALSO written to Redis (\`driver:{id} → lat,lng\`) for the hot path.
4. **Sessions/carts → KV (Redis/Dynamo).** By-id opaque access, sub-ms, TTL sessions natively; 2M concurrent × ~KB = a few GB — small for a KV cluster.
5. **Geo + text search → search engine (Elasticsearch/OpenSearch)** fed by CDC from the catalog: geo-queries + inverted-index text search are ITS native strengths (blob/search topic finishes this story).

**Most expensive to get wrong: #1 orders/payments.** Every other dataset tolerates staleness or loss (a dropped GPS ping is nothing); double-charging or losing an order is a business-ending class of bug — and retrofitting transactions onto a store without them is far harder than scaling any of the others. Anchor correctness-critical data in SQL and scale the tolerant datasets on purpose-fit stores.
`,
    },
  ],
}
