export default {
  id: 'distributed-cache',
  title: 'Design a Distributed Cache (Redis / Memcached)',
  subtitle: 'Build the cache itself: consistent hashing to spread keys, eviction, replication, and what happens when a node dies',
  days: 2,
  content: `
## The problem

Design an in-memory key-value cache that spans **many machines**, so applications can store far more hot data than fits on one box and read it in **sub-millisecond** time. Unlike "add a cache in front of my DB" (Phase 2), here **the cache is the system** — you're designing Redis/Memcached itself. The core challenges: **distributing keys across nodes**, **evicting** when memory fills, and **surviving node failures** without losing the whole cache.

## Step 1 — Requirements

**Functional:** \`get(key)\`, \`set(key, value, ttl)\`, \`delete(key)\`. Values are opaque blobs, capped in size.

*De-scope but mention:* rich data types (lists/sets), pub/sub, transactions, persistence to disk.

**Non-functional:** **very low latency** (sub-ms, in-memory) and **high throughput** (100k+ ops/sec/node) — these define the design. **Scalability** (add nodes to grow capacity linearly). **High availability** (a node dying shouldn't take down the cache or cause a stampede). **Eventual consistency is acceptable** — it's a cache; a slightly stale or missing entry just means a DB fallback, not incorrectness.

## Step 2 — Estimation

- Say we need to cache **1 TB** of hot data with each node holding **64 GB** RAM → **~16 nodes** (plus replicas). Sizing the cluster from data volume and per-node RAM is the key back-of-envelope.
- Target **sub-millisecond** reads and, say, **1M ops/sec** aggregate → split across 16 nodes ≈ 60k ops/sec/node, comfortably in-memory territory.
- Because it's in-memory, **capacity = RAM**, and RAM is expensive — **eviction policy matters** (you can't keep everything; keep the hottest).

## Step 3 — API

\`\`\`
get(key)              → value | miss
set(key, value, ttl)  → ok        (ttl optional; entry auto-expires)
delete(key)           → ok
\`\`\`
A client library hashes the key to pick the right node and talks to it directly (or via a proxy). Simple, uniform, no query language.

## Step 4 — Data model & single-node internals

On each node, the store is a **hash table** in RAM: \`key → (value, expiry)\`, giving O(1) average get/set. To support **LRU eviction** efficiently, combine the hash map with a **doubly-linked list** ordering entries by recency: on access, move the entry to the head; when memory is full, evict from the tail (the least-recently-used). This hash-map-+-linked-list combo is the classic O(1) LRU cache — a frequent coding-interview crossover.

TTLs are handled **lazily** (check expiry on read and drop if expired) plus a **background sweeper** that samples and purges expired keys so dead entries don't hog RAM forever.

## Step 5 — High-level design: spreading keys across nodes

\`\`\`
 client ─▶ (hash key) ─▶ pick node ─▶ get/set on that node
                 │
        consistent hashing ring: nodes + virtual nodes
                 │
        each shard: primary + replica(s)
\`\`\`

\`\`\`mermaid
graph LR
  C[Client / proxy] -->|hash key| R{Consistent<br/>hash ring}
  R --> N1[Node A<br/>primary]
  R --> N2[Node B<br/>primary]
  R --> N3[Node C<br/>primary]
  N1 -.replicate.-> N1r[A replica]
  N2 -.replicate.-> N2r[B replica]
  N3 -.replicate.-> N3r[C replica]
\`\`\`

## Step 6 — Deep dive: consistent hashing, replication, and failure

**Why not plain \`hash(key) % N\`?** It distributes keys evenly — until N changes. **Adding or removing one node changes N**, so *almost every key* remaps to a different node, blowing away the entire cache at once (a mass **cache stampede** that hammers the DB). Unacceptable for a system whose whole point is to shield the DB.

**Consistent hashing** fixes this. Place both **nodes and keys on a hash ring** (0…2³²). A key belongs to the **first node clockwise** from its hash. When a node joins or leaves, **only the keys in its arc move** — roughly **1/N of keys remap**, not all of them. Add **virtual nodes** (each physical node appears at many ring positions) to smooth out uneven distribution and let heterogeneous nodes carry proportional load. This is *the* reason consistent hashing exists and the number-one thing to explain here.

**Replication & failure.** Each shard has a **primary + one or more replicas** on different physical machines. Writes go to the primary and propagate to replicas (async for speed — eventual consistency, which is fine for a cache). If a primary dies:
- Reads fail over to a replica; a coordinator/gossip layer **promotes a replica to primary**.
- Because consistent hashing only reassigns the failed node's arc, the rest of the cache stays warm — **no full stampede**.
- Without replicas, a dead node means its slice of keys all miss at once → a **thundering herd** onto the DB for that slice. Replicas (and techniques like request coalescing) prevent that.

**Hot-key problem.** One insanely popular key (a celebrity profile) can overwhelm the single node that owns it. Mitigations: **replicate the hot key to multiple nodes** and read from any, or add a **small client-side/local cache** for ultra-hot keys so most reads never leave the app server.

**Cache stampede on expiry.** When a popular key's TTL expires, thousands of concurrent misses can all try to recompute it. Mitigate with **request coalescing** (only one miss recomputes; others wait) or **probabilistic early expiration** (refresh slightly before TTL). Worth naming as a failure mode you'd guard against.

**Consistency vs the source of truth.** A cache can go stale versus the DB. Handle with **TTLs** (bounded staleness) and/or **write/cache invalidation** on updates. Since the DB is the source of truth, eventual consistency in the cache is an acceptable trade for speed — state this explicitly.

## Step 7 — Wrap-up

A distributed cache is a **sharded in-memory hash table** built for sub-millisecond reads. Each node is a hash-map + doubly-linked-list giving O(1) gets/sets and **LRU eviction** (memory is the hard limit), with lazy + sweeper **TTL** expiry. Keys are spread across nodes with **consistent hashing** (+ virtual nodes) so adding/removing a node remaps only ~1/N of keys instead of nuking the whole cache. Each shard is **replicated** so a node failure fails over to a replica and keeps most of the cache warm rather than stampeding the DB. Accept **eventual consistency** (it's a cache; the DB is source of truth), and guard the known failure modes — **hot keys** (replicate/local-cache) and **stampede on expiry** (request coalescing / early refresh). With more time: cross-region replication, persistence/AOF for warm restarts, and richer data types.

## How this shows up in interviews

- The signature use of **consistent hashing** — interviewers specifically want you to explain **why \`hash % N\` is bad** (mass remap on membership change) and how the ring + virtual nodes fix it. This is the single highest-value concept here.
- Expect **"what happens when a cache node dies?"** → consistent hashing localizes the loss to that node's arc; replicas fail over; only ~1/N of keys are affected, avoiding a full DB stampede.
- Expect the **eviction** follow-up → O(1) LRU via hash-map + doubly-linked list (a coding-round favorite too), plus LFU/TTL alternatives.
- Great place to name **hot keys** and **cache stampede/thundering herd on expiry** with concrete mitigations — signals real operational depth.
`,
  resources: [
    {
      title: 'Consistent Hashing explained',
      url: 'https://www.youtube.com/watch?v=UF9Iqmg94tk',
      type: 'video',
      source: 'ByteByteGo',
    },
    {
      title: 'Design a Distributed Cache',
      url: 'https://www.hellointerview.com/learn/system-design/problem-breakdowns/distributed-cache',
      type: 'article',
      source: 'Hello Interview',
    },
    {
      title: 'Consistent Hashing — a guide with implementation',
      url: 'https://highscalability.com/consistent-hashing-algorithm/',
      type: 'article',
      source: 'High Scalability',
    },
    {
      title: 'Design a Distributed Cache (LRU + sharding)',
      url: 'https://algomaster.io/learn/system-design-interviews/design-distributed-cache',
      type: 'article',
      source: 'AlgoMaster',
    },
  ],
  challenges: [
    {
      type: 'quiz',
      id: 'quiz-1',
      title: 'Distributed cache check',
      questions: [
        {
          q: 'Why is `hash(key) % N` a poor way to distribute cache keys across N nodes, and what replaces it?',
          options: [
            'It is too slow to compute',
            'When N changes (a node is added or removed), almost every key remaps to a different node, wiping the whole cache at once and stampeding the DB. Consistent hashing places nodes and keys on a ring so only ~1/N of keys move when membership changes',
            'It only works for numeric keys',
            'Nothing is wrong with it',
          ],
          answer: 1,
          explanation:
            'The modulo depends on N, so changing N reshuffles nearly all keys — catastrophic for a cache. Consistent hashing (+ virtual nodes for even distribution) limits the churn to the arc owned by the joining/leaving node, ~1/N of keys, keeping the rest of the cache warm.',
        },
        {
          q: 'How do you implement an O(1) LRU eviction cache on a single node?',
          options: [
            'Sort all entries by timestamp on every access',
            'Combine a hash map (key → node) with a doubly-linked list ordered by recency: on access move the node to the head; when full, evict from the tail (least-recently-used). Both get/set and eviction are O(1)',
            'Use a single array and scan for the oldest',
            'Evict a random key',
          ],
          answer: 1,
          explanation:
            'The hash map gives O(1) lookup; the doubly-linked list gives O(1) reordering and tail eviction. Moving an accessed entry to the head and evicting the tail keeps the hottest data. This is also a classic coding-interview problem.',
        },
        {
          q: 'A cache node holding a slice of keys suddenly dies. Why does consistent hashing plus replication prevent a DB meltdown?',
          options: [
            'It doesn\'t — all keys are lost',
            'Consistent hashing localizes the loss to just that node\'s arc (~1/N of keys), and a replica of that shard can be promoted to serve those keys, so most of the cache stays warm and only a small fraction of traffic (if any) falls through to the DB',
            'The DB is never involved',
            'All keys are automatically recomputed instantly',
          ],
          answer: 1,
          explanation:
            'Without consistent hashing, a membership change reshuffles everything; without replicas, the dead node\'s keys all miss at once, stampeding the DB. Together they contain the blast radius: only the failed arc is affected, and its replica keeps serving.',
        },
      ],
    },
    {
      type: 'design',
      id: 'design-1',
      title: 'Design exercise: build the distributed cache',
      prompt: `
Design a distributed in-memory cache (like Redis/Memcached — the cache itself, not "put a cache in front of my DB") end to end using the 7-step framework. Cache ~1 TB of hot data across nodes with ~64 GB RAM each, at sub-millisecond latency and ~1M ops/sec aggregate.

Cover: requirements (why is eventual consistency acceptable?), estimation to size the cluster, the API, the single-node internals (data structure + eviction), and — as your deep dive — how you distribute keys across nodes and survive a node failure. Explain why hash-mod-N is wrong. Then extend: how do you handle a single extremely hot key and a cache stampede when a popular key expires?
`,
      hints: [
        'Size the cluster from total data ÷ per-node RAM; memory is the hard constraint, so eviction matters.',
        'Single node: hash map + doubly-linked list = O(1) LRU. TTLs via lazy check + background sweeper.',
        'Distribution: explain why hash % N reshuffles everything, then consistent hashing + virtual nodes.',
        'Failure: replicas per shard + the fact that consistent hashing localizes loss to one arc.',
        'Hot key → replicate it / local cache; stampede on expiry → request coalescing / early refresh.',
      ],
      modelAnswer: `
**Requirements** — Functional: get/set(ttl)/delete on opaque blobs. Non-functional: sub-ms latency, high throughput (100k+ ops/sec/node), linear scalability by adding nodes, high availability (node death must not stampede the DB), eventual consistency acceptable (it's a cache; DB is source of truth, a miss just falls through).

**Estimation** — 1 TB hot data ÷ 64 GB/node ≈ 16 nodes (+ replicas). ~1M ops/sec ÷ 16 ≈ 60k/node, easily in-memory. Capacity = RAM (expensive) → eviction policy is central.

**API** — get(key), set(key, value, ttl), delete(key). Client hashes key to pick a node (or via proxy).

**Single-node internals** — hash table key → (value, expiry) for O(1) access, combined with a doubly-linked list for O(1) LRU (move-to-head on access, evict tail when full). TTLs: lazy expiry on read + a background sweeper sampling/purging expired keys.

**Distribution (deep dive):** Reject hash % N — changing N remaps nearly all keys, wiping the cache and stampeding the DB. Use consistent hashing: nodes and keys on a 0…2³² ring, key owned by first node clockwise; adding/removing a node moves only its arc (~1/N of keys). Virtual nodes (each physical node at many positions) even out distribution and support heterogeneous capacity.

**Replication & failure:** each shard = primary + replica(s) on separate machines; writes to primary propagate async to replicas (eventual consistency, fine for a cache). On primary death, promote a replica (via gossip/coordinator); consistent hashing confines the impact to that arc, so the rest of the cache stays warm — no full stampede.

**Extension — hot key:** replicate the single hot key across multiple nodes and read from any, and/or add a small client-side/local cache so most reads never leave the app server. Stampede on expiry: request coalescing (only one miss recomputes; others wait for the result) or probabilistic early expiration (refresh just before TTL) so thousands of simultaneous misses don't all hit the DB.

**Consistency:** bound staleness with TTLs and invalidate on writes; accept eventual consistency versus the DB as the trade for speed.

**Trade-offs:** async replication trades a small consistency window for latency; virtual nodes add bookkeeping for smoother balance; local caches add another (small) staleness layer.

**One-line summary:** a consistent-hashing-sharded, replicated ring of in-memory O(1) LRU hash-tables, sized from RAM, delivering sub-ms reads while containing node-failure blast radius to ~1/N of keys and guarding hot-key and expiry-stampede failure modes.
`,
    },
  ],
}
