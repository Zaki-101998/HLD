export default {
  id: 'caching',
  title: 'Caching Strategies',
  subtitle: 'Cache-aside to write-behind, eviction, invalidation, stampedes, and Redis in practice',
  days: 3,
  content: `
## Why this matters for system design

You already know WHY caches work (memory hierarchy + locality, Phase 1). This topic is the engineering: where to put caches, how to keep them honest, and the failure modes that page people at 3am. "We'll add a cache" without discussing invalidation is a junior answer; the follow-ups here are where senior candidates separate.

> "There are only two hard things in Computer Science: cache invalidation and naming things." — Phil Karlton

## The cache map — where caches live

\`\`\`
Browser cache → CDN edge → LB/gateway cache → app-local memory
     → distributed cache (Redis) → DB buffer pool → OS page cache
\`\`\`

Every layer trades freshness for speed. In interviews you'll mostly design the **distributed cache tier** (Redis/Memcached) and the **CDN** (next topic); mention the others in one breath to show the map.

**App-local (in-process) cache**: fastest possible (no network), but N servers = N copies = N inconsistencies, and it dies on deploy. Great for truly-static config or as an L1 in front of Redis (with short TTLs).

## Caching patterns — the exam question

### Cache-aside (lazy loading) — the default
App code owns the logic:
\`\`\`
value = cache.get(key)
if miss: value = db.read(); cache.set(key, value, TTL)
\`\`\`
✅ Only requested data cached; cache failure = degraded not broken.
❌ First request eats a miss (cold start); write staleness must be handled (below).

A miss populates the cache so every later reader is fast until the TTL expires:

\`\`\`mermaid
sequenceDiagram
  autonumber
  participant App
  participant Cache
  participant DB
  App->>Cache: get(key)
  Cache-->>App: miss
  App->>DB: read(key)
  DB-->>App: value
  App->>Cache: set(key, value, TTL)
  Note over App,Cache: second request — cache hit
  App->>Cache: get(key)
  Cache-->>App: value
\`\`\`

### Read-through
Same shape, but the *cache library/tier* fetches from DB on miss (app sees one API). Operationally identical to cache-aside in interviews.

### Write-through
Writes go to cache AND DB synchronously. ✅ Cache always fresh for written keys. ❌ Write latency ↑; caches lots of never-read data. Pair with read-through.

### Write-behind (write-back)
Write to cache, ack immediately, flush to DB async (batched).
✅ Blazing writes, absorbs bursts, batches DB load. ❌ **Data loss window** if cache dies before flush; complexity. Use for tolerable-loss, high-rate counters (views, likes) — not money.

### Write-around
Write to DB only; cache fills on read. For write-heavy data rarely re-read soon.

**Interview shorthand:** cache-aside for reads + invalidate-on-write is the 90% answer; write-behind for firehose counters; write-through when stale reads are unacceptable but reads must be fast.

## Invalidation — keeping the cache honest

On a write, the cached copy is now a lie. Options:

1. **TTL only:** every entry expires (say, 60 s). Simple, bounded staleness, self-healing. *Always set a TTL even with explicit invalidation* — it's your safety net.
2. **Invalidate on write:** \`db.write()\` then \`cache.delete(key)\`. Next read repopulates. **Delete, don't update**, the cache — updating risks a race where an older value overwrites a newer one (two concurrent writers can interleave set operations out of order).
3. **Event-driven:** DB change streams (CDC) → invalidation messages → subscribers (used at scale; e.g. Facebook's memcache invalidation pipeline).

Staleness budget is a product decision: a tweet count can lie for 60 s; an account balance cannot. Say the budget out loud in interviews.

## Eviction — when the cache is full

- **LRU** (least recently used) — the default; matches temporal locality.
- **LFU** (least frequently used) — better when popularity is stable (a scan of one-time reads can flush an LRU cache; LFU resists). Redis offers approximated LRU/LFU.
- **TTL-based** — expiry does the cleaning.

Related sizing note: eviction rate is a metric — a healthy cache evicts cold junk; a cache evicting HOT data is undersized (hit rate falls, origin load climbs).

## The three classic cache disasters (know all three!)

### 1. Cache stampede (thundering herd)
A hot key expires → 10,000 concurrent requests all miss → all 10,000 hit the DB → DB dies → site dies.
**Fixes:** per-key **mutex/single-flight** (one request recomputes, rest wait); **stale-while-revalidate** (serve expired value while one worker refreshes); **jittered TTLs** (don't let 1M keys expire at the same second); background refresh for known-hot keys.

### 2. Cache penetration
Requests for keys that DON'T EXIST (bad IDs, attacks) always miss and always hit the DB.
**Fixes:** cache the negative result ("id → NOT_FOUND", short TTL); or a **Bloom filter** of valid IDs in front (Phase 3 covers Bloom filters — remember this use).

### 3. Cache avalanche
The whole cache tier restarts/dies → EVERYTHING misses at once → origin collapses under full load it hasn't seen in months.
**Fixes:** cache HA (replicas, cluster mode); warm-up scripts before taking traffic; request coalescing + rate limits at origin as a backstop; jittered TTLs (again).

## Redis vs Memcached (one-liner each)

- **Memcached:** pure multi-threaded LRU cache — simple, fast, no persistence, no structures.
- **Redis:** data structures (lists, sets, sorted sets, hashes, streams), optional persistence, replication, cluster mode, pub/sub, Lua/atomic ops — the default choice; you'll use sorted sets for leaderboards/rate limiters and its atomic INCR for counters throughout Phase 4.

## Metrics that matter

**Hit rate** (the headline — 95%+ typical for good caches), **p99 latency**, **eviction rate**, **memory fragmentation**, origin QPS (the thing the cache exists to protect). Recall from Phase 1: hit rate 99→90% ≈ 10× origin load — small hit-rate changes are big events.

## How this shows up in interviews

- Default sentence: "cache-aside Redis with a 5-min TTL + delete-on-write; jittered TTLs and single-flight to prevent stampedes."
- Counters/feeds: write-behind or Redis-native INCR with periodic DB flush.
- Every cache you draw: name its **invalidation** and its **failure behavior** unprompted. That's the senior move.
`,
  resources: [
    {
      title: 'Top caching strategies',
      url: 'https://www.youtube.com/watch?v=dGAgxozNWFE',
      type: 'video',
      source: 'ByteByteGo (YouTube)',
    },
    {
      title: 'Caching at scale (stampedes, invalidation)',
      url: 'https://www.youtube.com/watch?v=n6xOMIzXeCE',
      type: 'video',
      source: 'Gaurav Sen (YouTube)',
    },
    {
      title: 'Scaling Memcache at Facebook (the classic paper, readable!)',
      url: 'https://www.usenix.org/system/files/conference/nsdi13/nsdi13-final170_update.pdf',
      type: 'doc',
      source: 'Facebook / NSDI 2013',
    },
    {
      title: '7 Cache Eviction Strategies',
      url: 'https://blog.algomaster.io/p/7-cache-eviction-strategies',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
    {
      title: 'Distributed Caching',
      url: 'https://blog.algomaster.io/p/distributed-caching',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
    {
      title: 'Read-Through vs Write-Through Cache',
      url: 'https://blog.algomaster.io/p/59cae60d-9717-4e20-a59e-759e370db4e5',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
    {
      title: 'Design a Distributed Cache',
      url: 'https://www.youtube.com/watch?v=iuqZvajTOyA',
      type: 'video',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
  ],
  challenges: [
    {
      type: 'quiz',
      id: 'quiz-1',
      title: 'Caching strategy check',
      questions: [
        {
          q: 'A celebrity’s profile (cached, 1-hour TTL) expires at peak traffic. 50k concurrent requests miss simultaneously and flatten the database. This is a…',
          options: [
            'Cache avalanche',
            'Cache stampede (thundering herd) — fixed with per-key single-flight locking and/or stale-while-revalidate',
            'Cache penetration',
            'Eviction storm',
          ],
          answer: 1,
          explanation:
            'One hot key expiring under concurrency = stampede. Single-flight lets exactly ONE request rebuild the value while others wait or get the stale copy. Avalanche = whole cache lost; penetration = nonexistent keys.',
        },
        {
          q: 'After updating a product’s price in the DB, should the app UPDATE the cache entry or DELETE it?',
          options: [
            'Update — saves the next reader a miss',
            'Delete — concurrent updates can write cache entries out of order, permanently caching a stale price; delete-then-repopulate-on-read avoids the race',
            'Neither, TTL handles everything',
            'Both simultaneously',
          ],
          answer: 1,
          explanation:
            'Two writers finishing out of order can leave the OLDER value in cache until TTL (set A→set B in DB, but B→A ordering in cache). Deletion is race-immune: worst case is one extra miss. Keep a TTL as the safety net regardless.',
        },
        {
          q: 'Attackers request millions of random non-existent user IDs. Every request misses cache and hits the DB. Best defenses?',
          options: [
            'Longer TTLs on real users',
            'Cache negative results with short TTLs and/or a Bloom filter of valid IDs in front — this is cache penetration',
            'More database replicas',
            'Bigger cache memory',
          ],
          answer: 1,
          explanation:
            'Nonexistent keys never populate a normal cache, so every probe reaches the DB. Negative caching absorbs repeats; a Bloom filter rejects invalid IDs before ANY lookup (no false negatives, small false-positive rate is fine here).',
        },
        {
          q: 'A view-counter takes 30k increments/sec. Writing each to Postgres kills it. The cache pattern to reach for:',
          options: [
            'Write-through',
            'Write-behind: increment in Redis (atomic INCR), flush aggregated counts to the DB every few seconds — accepting a small loss window on cache failure',
            'Cache-aside',
            'Write-around',
          ],
          answer: 1,
          explanation:
            'Batching 30k/sec into one DB write per few seconds is a 100,000× load reduction. The trade-off — possible loss of a few seconds of counts — is explicitly acceptable for view counters and explicitly NOT for money. Naming that boundary is the interview point.',
        },
        {
          q: 'Your cache tier restarted at 2pm; at 2:01 the database fell over from full traffic. Which precaution addresses THIS scenario?',
          options: [
            'Negative caching',
            'Cache avalanche defenses: HA/replicated cache so it doesn’t fully vanish, warm-up before serving, and origin-side rate limiting/coalescing as a backstop',
            'LFU eviction',
            'Shorter TTLs',
          ],
          answer: 1,
          explanation:
            'The origin had quietly been protected from 95% of its traffic. Avalanche planning assumes the cache WILL vanish someday: replicate it, pre-warm it, and cap what the origin will accept.',
        },
        {
          q: 'When does LFU beat LRU eviction?',
          options: [
            'Never; LRU is strictly better',
            'When a one-time bulk scan of cold items would flush stable-popularity hot items out of an LRU — LFU keeps the frequently-used set resident',
            'When memory is unlimited',
            'When all items are equally popular',
          ],
          answer: 1,
          explanation:
            'LRU tracks recency, so a batch job reading 1M cold rows once evicts your hot set. LFU (or LRU with admission control) resists scan pollution. Redis supports both approximated.',
        },
        {
          q: 'Which statement about TTLs is best practice?',
          options: [
            'Explicit invalidation makes TTLs unnecessary',
            'Set a TTL on essentially everything (with jitter) — it bounds staleness when invalidation bugs happen and prevents synchronized mass expiry',
            'TTLs should all be exactly 60 seconds',
            'Infinite TTLs maximize hit rate and are therefore ideal',
          ],
          answer: 1,
          explanation:
            'Invalidation paths WILL have bugs; TTL is the self-healing bound on how long a lie can live. Jitter (e.g. 300s ± 30s) prevents avalanche-by-synchronized-expiry. Infinite TTL + missed invalidation = permanent staleness.',
        },
      ],
    },
    {
      type: 'lab',
      id: 'lab-1',
      title: 'Run Redis and cause a stampede',
      intro:
        'Install Redis locally (brew install redis) — 5 minutes, and you’ll use it for many later topics too.',
      steps: [
        {
          instruction: 'Install and start Redis, then verify.',
          command: 'brew install redis 2>/dev/null | tail -1; redis-server --daemonize yes && redis-cli ping',
          expected: 'PONG',
        },
        {
          instruction: 'Basics: set a key with a TTL and watch it die.',
          command: 'redis-cli set product:42 \'{"name":"widget","price":99}\' EX 10 && redis-cli ttl product:42 && sleep 11 && redis-cli get product:42',
          expected: 'OK, a countdown TTL, then (nil) — expiry in action.',
        },
        {
          instruction: 'Feel the speed: benchmark GETs on your laptop.',
          command: 'redis-benchmark -t get -n 100000 -q',
          expected: 'Often 100k+ requests/sec on a laptop — now the "Redis node ≈ 100k ops/s" estimate is YOUR number.',
        },
        {
          instruction: 'Atomic increments — the write-behind counter primitive.',
          command: 'redis-cli set views 0 && for i in $(seq 1 100); do redis-cli incr views > /dev/null; done; redis-cli get views',
          expected: '100 — INCR is atomic server-side; no read-modify-write race (contrast with the Phase 1 concurrency lab!).',
        },
        {
          instruction: 'Simulate a stampede: 200 parallel "requests" checking one expired key and all deciding to rebuild.',
          command: `redis-cli del hot; for i in $(seq 1 200); do (val=$(redis-cli get hot); if [ -z "$val" ]; then redis-cli incr db_hits > /dev/null; redis-cli set hot rebuilt EX 30 > /dev/null; fi) & done; wait; echo "DB was hit $(redis-cli get db_hits) times for ONE key"`,
          expected: 'db_hits well above 1 (often 20–200) — every concurrent miss "queried the database". In production this number is 50,000.',
        },
        {
          instruction: 'Fix it with single-flight: only the request that wins an atomic lock rebuilds.',
          command: `redis-cli del hot db_hits lock; for i in $(seq 1 200); do (val=$(redis-cli get hot); if [ -z "$val" ]; then if [ "$(redis-cli set lock 1 NX EX 5)" = "OK" ]; then redis-cli incr db_hits > /dev/null; redis-cli set hot rebuilt EX 30 > /dev/null; fi; fi) & done; wait; echo "DB was hit $(redis-cli get db_hits) time(s)"`,
          expected: 'db_hits = 1 (occasionally 2). SET NX (set-if-not-exists) is the mutex; you just implemented stampede protection for real.',
        },
        {
          instruction: 'Clean up (or keep Redis for later topics — recommended).',
          command: 'redis-cli flushall',
          expected: 'OK. To fully stop later: redis-cli shutdown nosave',
        },
      ],
    },
    {
      type: 'design',
      id: 'design-1',
      title: 'Design exercise: caching layer for a product catalog',
      prompt: `
An e-commerce catalog: 50M products, 200k read QPS peak (product pages), 50 writes/sec (price/stock updates from merchants). Stock must never oversell; price staleness beyond ~1 minute causes support tickets. Product pages include: product details, price, stock badge ("in stock/low/out").

Design the caching architecture: what's cached where, with which pattern, which TTLs, invalidation flow, and stampede/penetration protections. Note where you explicitly REFUSE to trust the cache.
`,
      hints: [
        'Not all fields have the same staleness budget — can you split the cached object?',
        'The checkout path vs the browse path have different truth requirements.',
        '50M × ~2KB — does the whole catalog fit in a cache cluster?',
      ],
      modelAnswer: `
**Split by staleness budget — the key insight:**
- **Product details** (title, images, description): changes rarely. Cache-aside in Redis, TTL 24 h + delete-on-write. Also CDN-cache the rendered page fragments.
- **Price:** budget ≈ 1 min. Cache-aside, TTL 60 s + event-driven delete on merchant update (writes are only 50/s — trivially cheap to invalidate precisely).
- **Stock badge:** display-only approximation, TTL 30 s is fine — BUT checkout **never reads stock from cache**: the order path does an atomic conditional decrement in the DB (\`UPDATE … SET stock=stock-1 WHERE id=? AND stock>0\`, from the concurrency topic). The cache may lie on the badge; the transaction path cannot oversell. *This is the "refuse to trust the cache" line.*

**Sizing:** 50M × ~2 KB ≈ 100 GB → fits a modest Redis cluster (e.g. 3–5 × 32 GB with replicas) — cache the WHOLE catalog, hit rate ~99%+ since misses only follow invalidations/evictions.

**Stampede & penetration:**
- Jittered TTLs (60s ± 10s on price; 24h ± 2h on details).
- Single-flight per key (SET NX lock or library equivalent) + stale-while-revalidate for hot products during sales.
- Negative-cache invalid product IDs (TTL 5 min) + optional Bloom filter of live product IDs at the API gateway.

**Invalidation flow:** merchant update → DB write commits → CDC/outbox event → consumer deletes Redis keys + purges CDN fragment. Delete, not update (race safety); TTL remains the safety net for missed events.

**Failure behavior:** Redis cluster loss → origin rate limiter caps DB at its known ceiling, serve degraded pages (details from DB, badge hidden) — availability with graceful degradation rather than collapse.
`,
    },
  ],
}
