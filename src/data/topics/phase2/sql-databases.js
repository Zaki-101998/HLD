export default {
  id: 'sql-databases',
  title: 'SQL Databases: Indexes, Transactions & Replication',
  subtitle: 'B-trees, ACID, isolation levels, and scaling reads with replicas',
  days: 3,
  content: `
## Why this matters for system design

"The database is the hard part" — everything else in your diagram is stateless and replaceable. Interviewers reliably drill into: why your query is fast (indexes), what happens when two writes collide (transactions), and how you scale reads (replication) — plus the lag gotchas replication introduces.

## Indexes — why queries are fast

Without an index, \`WHERE email = ?\` scans every row: O(n), disk-bound, catastrophic at scale. An **index** is a separate structure that maps column values → row locations.

### B-trees (the default index)

A **B-tree** is a wide, shallow, sorted tree: each node holds hundreds of keys, so a billion rows are ~3–4 levels deep. Lookup = 3–4 page reads (mostly cached in RAM) → milliseconds regardless of table size.

Because it's **sorted**, a B-tree serves: exact matches, **ranges** (\`created_at > ?\`), prefix matches (\`LIKE 'abc%'\`), and **ORDER BY** without sorting. (Hash indexes do only exact-match — rarely what you want.)

### The costs (there's no free lunch)

- **Writes:** every INSERT/UPDATE must also update every index → a table with 8 indexes does ~9 writes per row change. Over-indexing kills write throughput.
- **Storage:** each index is a copy of part of your data.

### Index design rules you'll actually use

- **Composite indexes** follow the *leftmost-prefix* rule: index \`(user_id, created_at)\` serves \`WHERE user_id=?\`, and \`WHERE user_id=? AND created_at>?\` — but NOT \`WHERE created_at>?\` alone. Design indexes from your **query patterns**, not your columns.
- **Covering index:** if the index contains every column the query needs, the table is never touched at all — the fastest reads have this shape.
- **Selectivity matters:** indexing a boolean (\`is_active\`) barely helps; indexing near-unique columns (email) helps enormously.
- In interviews, when you draw a table, name its indexes: "posts indexed on (author_id, created_at) for the profile-feed query."

## Transactions & ACID

A **transaction** groups statements into all-or-nothing units. ACID:

- **Atomicity:** all or nothing (crash mid-transfer → no half-transfer). Implemented via the **write-ahead log (WAL)** — changes are logged sequentially before being applied (Phase 1's sequential-I/O lesson, live).
- **Consistency:** constraints hold before and after.
- **Isolation:** concurrent transactions don't trample each other (below).
- **Durability:** committed = survives crash (WAL flushed to disk).

### Isolation levels — the concurrency dial

Perfect isolation (serializable) is expensive, so databases offer levels:

| Level | Anomaly allowed | Notes |
|---|---|---|
| Read uncommitted | dirty reads | rarely used |
| **Read committed** | non-repeatable reads | Postgres default |
| Repeatable read / snapshot | phantoms (mostly prevented in PG) | MySQL InnoDB default |
| **Serializable** | none | as-if-sequential; costs throughput/aborts |

The interview trap: **read committed does NOT prevent lost updates** — two transactions can still read-then-overwrite (your Phase 1 race!). Fixes remain: atomic \`UPDATE … SET x = x - 1 WHERE …\`, \`SELECT FOR UPDATE\`, or optimistic version columns. Isolation levels are subtle; concrete locking/atomic patterns are what you should reach for in designs.

## Replication — scaling reads & surviving failures

**Leader-follower (primary-replica):** all writes → leader; followers replay the leader's WAL and serve reads.

Buys you: **read scaling** (add replicas), **HA** (promote a replica on leader death), **isolation of workloads** (analytics on a replica).

\`\`\`mermaid
flowchart TD
  App["App writes"] --> P["Primary"]
  P -->|"async replication — lag"| R1["Replica 1"]
  P -->|"async replication — lag"| R2["Replica 2"]
  R1 --> Reads1["App reads"]
  R2 --> Reads2["App reads"]
\`\`\`

### Sync vs async replication

- **Async (default):** leader commits without waiting → fast, but replicas **lag** (ms → seconds under load), and a leader crash can lose the last moments of writes (RPO > 0).
- **Sync:** leader waits for replica ack → no loss, but every write pays a network round trip and stalls if the replica is down. Middle ground: **semi-sync** (wait for 1 of N).

### Replication lag — the classic interview follow-up

User updates their profile (write → leader), page reloads and reads a stale replica → *their own change is missing*. Fixes:

1. **Read-your-own-writes:** route a user's reads to the leader for ~N seconds after they write (or pin by session).
2. **Sticky/monotonic reads:** a session always reads the same replica (no time-travel between replicas).
3. Accept it where harmless (like counts), never where harmful (balances).

You MUST volunteer replication lag when you draw replicas — it's the difference between knowing the picture and knowing the system.

**Failover** gotchas worth one sentence: promotion takes seconds-to-minutes; split-brain (two leaders) is prevented by consensus/fencing — full story in Phase 3.

**Multi-leader & leaderless** exist (multi-region writes, Cassandra-style quorums) — deferred to the NoSQL and consensus topics.

## Connection pooling (tiny but tested)

Postgres connections are processes (~MBs each); 10k app connections would crush it. Poolers (pgbouncer/RDS Proxy) multiplex app connections onto ~dozens of DB connections. From Phase 1 you know both why connections are expensive AND why pools are semaphores.

## How this shows up in interviews

- Schema + "indexed on (a, b) for query X" in your data-model section.
- Any money/inventory flow: transaction + atomic conditional update, name the isolation caveat.
- Read-heavy scaling: replicas + cache; then VOLUNTEER lag + read-your-own-writes.
- HA: "async replication, semi-sync if we can't lose acknowledged writes; auto-failover with fencing."
`,
  resources: [
    {
      title: 'How do indexes make databases fast? (B-trees)',
      url: 'https://www.youtube.com/watch?v=3G293is403I',
      type: 'video',
      source: 'Hussein Nasser (YouTube)',
    },
    {
      title: 'Designing Data-Intensive Applications — Ch. 5 (Replication) & 7 (Transactions)',
      url: 'https://dataintensive.net/',
      type: 'doc',
      source: 'Martin Kleppmann (the book for this course)',
    },
    {
      title: 'Use The Index, Luke — SQL indexing explained properly',
      url: 'https://use-the-index-luke.com/',
      type: 'article',
      source: 'Markus Winand',
    },
    {
      title: 'ACID Transactions',
      url: 'https://algomaster.io/learn/system-design/acid-transactions',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
    {
      title: 'What is Data Replication?',
      url: 'https://redis.com/blog/what-is-data-replication/',
      type: 'article',
      source: 'Redis',
    },
    {
      title: 'How to Scale a Database',
      url: 'https://blog.algomaster.io/p/system-design-how-to-scale-a-database',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
  ],
  challenges: [
    {
      type: 'quiz',
      id: 'quiz-1',
      title: 'SQL internals check',
      questions: [
        {
          q: 'A query on a 500M-row table returns in 5 ms. What makes this possible?',
          options: [
            'The table fits in CPU cache',
            'A B-tree index: wide, shallow, sorted — a 500M-row lookup is ~4 page reads, mostly served from RAM',
            'SQL is compiled to machine code',
            'The database reads rows in parallel',
          ],
          answer: 1,
          explanation:
            'B-tree depth grows logarithmically with huge fanout (hundreds of keys/node), so lookups touch a handful of pages regardless of table size. Without the index: a scan of 500M rows.',
        },
        {
          q: 'You have an index on (user_id, created_at). Which query CANNOT use it effectively?',
          options: [
            'WHERE user_id = 5',
            'WHERE user_id = 5 AND created_at > now() - interval \'7 days\'',
            'WHERE created_at > now() - interval \'7 days\' (no user_id)',
            'WHERE user_id = 5 ORDER BY created_at DESC LIMIT 20',
          ],
          answer: 2,
          explanation:
            'Leftmost-prefix rule: the composite index is sorted by user_id FIRST; without pinning user_id, matching created_at values are scattered everywhere. Design indexes from query patterns. (Option D is the classic feed query the index is FOR.)',
        },
        {
          q: 'Adding an 8th index to a hot write table primarily costs you…',
          options: [
            'Read latency',
            'Write throughput — every row change must update every index (and consume more WAL/IO)',
            'Nothing; indexes are free after creation',
            'Connection pool slots',
          ],
          answer: 1,
          explanation:
            'Each write fans out to all indexes. Read-heavy tables tolerate many indexes; write-hot tables want few, carefully chosen ones. "Index everything" is a junior tell.',
        },
        {
          q: 'Under the default READ COMMITTED isolation, two transactions both read balance=100, both subtract 30, both write 70. Prevented?',
          options: [
            'Yes — ACID guarantees it',
            'No — this lost update is allowed at read committed; you need an atomic UPDATE balance = balance - 30, SELECT FOR UPDATE, or optimistic versioning',
            'No, but serializable also would not help',
            'Yes, the WAL detects it',
          ],
          answer: 1,
          explanation:
            'Isolation levels below serializable permit read-modify-write races across transactions. This is THE most common transactional misconception — and the same lost-update from Phase 1, now in SQL clothing.',
        },
        {
          q: 'With async replication, the leader crashes right after acking a write. What may happen?',
          options: [
            'Nothing; async is safe',
            'The write may not have reached any replica: promoting one loses it — acknowledged-but-lost data (nonzero RPO)',
            'The database refuses to fail over',
            'All replicas also crash',
          ],
          answer: 1,
          explanation:
            'Async = ack before replication. The window is small but real. If acknowledged loss is unacceptable (payments), use semi-sync (wait for ≥1 replica) and say the latency price aloud.',
        },
        {
          q: 'A user saves a new address, the next page loads it from a replica, and the address is missing. Best targeted fix?',
          options: [
            'Make all replication synchronous',
            'Read-your-own-writes routing: send this user’s reads to the leader (or a caught-up replica) for a short window after their write',
            'Remove all replicas',
            'Cache the address in the browser',
          ],
          answer: 1,
          explanation:
            'The anomaly only affects the WRITER seeing their own fresh data. Session-scoped leader reads fix exactly that, without paying sync replication costs for all traffic. Volunteering this pattern when you draw replicas is a senior marker.',
        },
        {
          q: 'Why do Postgres deployments put pgbouncer between the app fleet and the database?',
          options: [
            'To encrypt queries',
            'Postgres connections are heavyweight processes; a pooler multiplexes thousands of app connections onto tens of real ones',
            'To cache query results',
            'To rewrite slow SQL',
          ],
          answer: 1,
          explanation:
            'Each PG connection costs MBs and scheduler overhead (Phase 1!). 50 app pods × 100 conns each would be 5,000 backends. The pooler is a semaphore: bounded real connections, queued excess.',
        },
      ],
    },
    {
      type: 'lab',
      id: 'lab-1',
      title: 'Watch an index change everything (SQLite, zero install)',
      intro: 'sqlite3 ships with macOS. You will create a million-row table and watch EXPLAIN + timings flip when an index appears.',
      steps: [
        {
          instruction: 'Create a 1M-row users table (takes a few seconds).',
          command: `sqlite3 /tmp/lab.db "
CREATE TABLE users(id INTEGER PRIMARY KEY, email TEXT, country TEXT, created_at INTEGER);
WITH RECURSIVE seq(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM seq WHERE i<1000000)
INSERT INTO users SELECT i, 'user'||i||'@mail.com', CASE i%5 WHEN 0 THEN 'IN' WHEN 1 THEN 'US' WHEN 2 THEN 'DE' WHEN 3 THEN 'BR' ELSE 'JP' END, 1700000000+i FROM seq;
SELECT count(*) FROM users;"`,
          expected: '1000000',
        },
        {
          instruction: 'Query WITHOUT an index — check the plan and the time.',
          command: `sqlite3 /tmp/lab.db "EXPLAIN QUERY PLAN SELECT * FROM users WHERE email='user742919@mail.com';" && time sqlite3 /tmp/lab.db "SELECT id FROM users WHERE email='user742919@mail.com';"`,
          expected: 'Plan says SCAN users (full table scan). Time: noticeable (tens of ms+).',
        },
        {
          instruction: 'Create the index and rerun the SAME query.',
          command: `sqlite3 /tmp/lab.db "CREATE INDEX idx_email ON users(email);" && sqlite3 /tmp/lab.db "EXPLAIN QUERY PLAN SELECT * FROM users WHERE email='user742919@mail.com';" && time sqlite3 /tmp/lab.db "SELECT id FROM users WHERE email='user742919@mail.com';"`,
          expected: 'Plan flips to SEARCH … USING INDEX idx_email. Time collapses to ~1ms. That delta is the entire indexing story.',
        },
        {
          instruction: 'Prove the leftmost-prefix rule with a composite index.',
          command: `sqlite3 /tmp/lab.db "CREATE INDEX idx_cc ON users(country, created_at);
EXPLAIN QUERY PLAN SELECT * FROM users WHERE country='IN' AND created_at>1700500000;
EXPLAIN QUERY PLAN SELECT * FROM users WHERE created_at>1700500000;"`,
          expected: 'First query: SEARCH USING INDEX idx_cc. Second (no country): SCAN — created_at alone can’t use the composite index.',
        },
        {
          instruction: 'Feel the write cost of indexes: time 10k inserts now (2 indexes) vs after dropping them.',
          command: `time sqlite3 /tmp/lab.db "WITH RECURSIVE s(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM s WHERE i<10000) INSERT INTO users SELECT 2000000+i,'x'||i,'US',0 FROM s;"
sqlite3 /tmp/lab.db "DROP INDEX idx_email; DROP INDEX idx_cc;"
time sqlite3 /tmp/lab.db "WITH RECURSIVE s(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM s WHERE i<10000) INSERT INTO users SELECT 3000000+i,'y'||i,'US',0 FROM s;"`,
          expected: 'Inserts are measurably faster with no indexes — each index is extra write work on every row.',
        },
        {
          instruction: 'Try an atomic conditional update — the overselling fix, for real.',
          command: `sqlite3 /tmp/lab.db "CREATE TABLE stock(item TEXT PRIMARY KEY, qty INT); INSERT INTO stock VALUES('widget',1);
UPDATE stock SET qty=qty-1 WHERE item='widget' AND qty>0; SELECT changes();
UPDATE stock SET qty=qty-1 WHERE item='widget' AND qty>0; SELECT changes();"`,
          expected: 'First returns changes()=1 (sale succeeded), second returns 0 (sold out, refused). The DB serialized correctness for you.',
        },
        {
          instruction: 'Clean up.',
          command: 'rm /tmp/lab.db',
          expected: 'Done.',
        },
      ],
    },
    {
      type: 'design',
      id: 'design-1',
      title: 'Design exercise: schema + indexes + replication for a blogging platform',
      prompt: `
Medium-like platform: 10M writers, 200M readers. Core queries:
- Q1: article page by slug (100k QPS peak)
- Q2: author's articles, newest first (10k QPS)
- Q3: reader's "claps" on an article (increment; 5k writes/s at peak on hot articles)
- Q4: full article list for editorial dashboard, filter by status + date

Design: tables + the exact indexes for Q1/Q2/Q4, how you'd handle Q3's hot counters, and the replication topology (including how you deal with lag for authors previewing their just-published article).
`,
      hints: [
        'One index per query shape; composite order matters.',
        'Q3 at 5k/s on ONE hot row — remember the concurrency topic.',
        'Author previews their own write = which replica anomaly?',
      ],
      modelAnswer: `
**Tables (simplified):** \`articles(id PK, slug, author_id, status, title, body, clap_count, published_at)\`, \`claps(article_id, user_id, count, PK(article_id, user_id))\`.

**Indexes by query:**
- Q1: UNIQUE index on \`articles(slug)\` — exact-match, near-unique = perfectly selective. (Plus cache-aside Redis at 100k QPS; DB sees only misses/invalidations.)
- Q2: composite \`articles(author_id, published_at DESC)\` — leftmost pins the author, sort order rides the index; the profile query is index-only in the right DB with INCLUDE(title).
- Q4: composite \`articles(status, published_at)\` — editorial filters by status then date-ranges. Low-selectivity status alone would be useless; paired with the date it's a tight range scan.

**Q3 hot claps (5k writes/s, skewed to a few viral articles):**
- Don't hammer \`UPDATE articles SET clap_count=clap_count+1\` on one row (row-lock serialization — Phase 1 hotspot).
- Write-behind: \`INCR article:{id}:claps\` in Redis, flush aggregated deltas to the DB every 5–10 s. Display reads Redis; the DB value is the durable, slightly-behind truth. Loss window of seconds on cache failure = acceptable for claps (say this trade!).
- Per-user dedup via the \`claps\` table (idempotent upsert, capped at 50).

**Replication:** 1 leader + 3+ async read replicas (article pages and profiles are replica reads; writes and editorial dashboard read the leader). Semi-sync optional — losing a clap or draft-save on failover is survivable; state the RPO choice.

**Lag handling for authors:** publish → author redirected to their article. Route reads to the LEADER for the publishing user for ~10 s (session flag) → read-your-own-writes; everyone else can see the article seconds late harmlessly. Cache invalidation on publish (delete slug key) so the article page cache repopulates fresh.
`,
    },
  ],
}
