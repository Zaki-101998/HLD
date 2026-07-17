export default {
  id: 'sharding',
  title: 'Sharding & Consistent Hashing',
  subtitle: 'Partitioning data across machines, hotspots, resharding, and the hash ring',
  days: 3,
  content: `
## Why this matters for system design

Sharding is the answer to "what happens when one database machine isn't enough?" — the final boss of the scaling journey. Interviewers push here because it's where the real trade-offs live: shard-key choice, hotspots, cross-shard queries, and resharding pain. Consistent hashing is *the* named algorithm most often asked about directly.

## Replication vs partitioning (don't mix them up)

- **Replication** = same data on many machines → scales READS, provides HA.
- **Partitioning (sharding)** = different data on different machines → scales WRITES and total data size.
Real systems do both: e.g. 8 shards × 3 replicas each.

## Choosing a shard key — the decision that haunts you

The **shard key** determines which node owns each row. Judge any candidate key by three tests:

1. **Even distribution** — do data AND traffic spread uniformly?
2. **Query isolation** — do your common queries hit ONE shard?
3. **Stability** — will it still work at 10× scale?

Examples:
- \`user_id\` for user-owned data: ✅ even (hash it), ✅ "my data" queries are single-shard. The default.
- \`country\`: ❌ wildly uneven (one shard = USA), but sometimes required for data-residency.
- \`created_date\` for time-series: ❌ ALL writes hit today's shard (a rolling hotspot) — but great query isolation for time ranges. (Purpose-built time-series DBs mix approaches.)
- \`celebrity_id\` in a social app: ⚠️ even by count, uneven by *traffic* — one hot key can overwhelm its shard (the "Justin Bieber problem"). Mitigate: cache the hot entity, or split the hot key (append a random suffix and fan-in on read).

## Range vs hash partitioning

- **Range** (A–F → shard 1 …): preserves order → range scans are single-shard; risk: skew + sequential-insert hotspots. Used by HBase, Spanner-style stores.
- **Hash** (hash(key) mod N → shard): destroys order, spreads uniformly; range queries hit ALL shards. Used by most OLTP sharding.
- Wide-column composite: hash by partition key, range *within* partition — the best of both, per-partition.

## Consistent hashing — the algorithm to know cold

Naive \`hash(key) mod N\` has a fatal flaw: change N (add/remove a node) and **nearly every key remaps** → total cache flush / mass data movement.

**Consistent hashing:** place nodes AND keys on a circle (hash space 0→2³²). Each key belongs to the first node clockwise from it.

\`\`\`
        node A
      ↗        ↘
  key k1        node B      k1 → A,  k2 → C
      ↖        ↙
        node C ← key k2
\`\`\`

Each key walks clockwise to the first node it meets — adding or removing a node only reshuffles the one arc next to it:

\`\`\`mermaid
flowchart LR
  N1["Node 1"] --> N2["Node 2"]
  N2 --> N3["Node 3"]
  N3 --> N4["Node 4"]
  N4 --> N1
  K["key — hash lands here"] -.->|"walk clockwise"| N2
\`\`\`

- Add a node → only the keys in ONE arc move (≈ 1/N of data). Remove a node → its arc slides to the next node. **K/N keys move instead of ~all.**
- **Virtual nodes:** map each physical node to 100–1000 points on the ring → smooths load imbalance and lets heterogeneous nodes take proportional arcs.
- Used by: Dynamo/Cassandra (data placement), Memcached clients (cache routing), CDNs and LBs (cache-locality routing — you saw it in the LB topic).

The interview one-liner: *"consistent hashing bounds re-mapping to K/N keys on membership change; virtual nodes fix arc-size variance."*

## What sharding breaks (volunteer these!)

1. **Cross-shard queries:** "top 10 posts across all users" = scatter-gather to every shard + merge. Slow, tail-latency-bound (slowest shard). Design so hot queries are single-shard; precompute global views (analytics pipeline / search index) for the rest.
2. **Cross-shard transactions:** two users on different shards transferring money — no single-node ACID. Options: 2PC (slow, fragile) or sagas (Phase 3). Best: choose shard keys so money movements are usually within one shard (e.g. shard by account, wallet-to-wallet via escrow patterns).
3. **Unique constraints & auto-increment:** global uniqueness needs coordination → use UUIDs/Snowflake IDs (time-ordered, node-stamped — Phase 4 topic).
4. **Joins:** gone across shards → denormalize or duplicate reference data to every shard.
5. **Resharding:** growing 8 → 16 shards means moving data while serving traffic. Plan from day one: **logical shards** (e.g. 4096 virtual buckets mapped to physical nodes — moving a bucket is easy) or consistent hashing. "How would you reshard?" is a favorite senior follow-up.

## Routing — who knows where data lives?

- **Client-side** (library computes shard from key — Memcached style),
- **Router/proxy tier** (Vitess, MongoDB's mongos),
- **Coordinator-free gossip** (Cassandra: any node routes to the right owner).
A **shard map/config service** (often ZooKeeper/etcd-backed) is the source of truth in the first two.

## How this shows up in interviews

- Say the three shard-key tests, pick the key, name the hotspot risk and mitigation.
- URL shortener / KV store / chat: hash-shard by short-code / key / chat_id.
- The follow-ups to pre-empt: "what about the celebrity?", "how do you add a shard?", "what about cross-shard transactions?" — this topic just armed you for all three.
`,
  resources: [
    {
      title: 'Consistent Hashing explained',
      url: 'https://www.youtube.com/watch?v=UF9Iqmg94tk',
      type: 'video',
      source: 'ByteByteGo (YouTube)',
    },
    {
      title: 'Database sharding deep dive',
      url: 'https://www.youtube.com/watch?v=5faMjKuB9bc',
      type: 'video',
      source: 'Gaurav Sen (YouTube)',
    },
    {
      title: 'DDIA Ch. 6 — Partitioning',
      url: 'https://dataintensive.net/',
      type: 'doc',
      source: 'Martin Kleppmann',
    },
    {
      title: 'Consistent Hashing',
      url: 'https://algomaster.io/learn/system-design/consistent-hashing',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
    {
      title: 'Database Sharding',
      url: 'https://algomaster.io/learn/system-design/sharding',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
  ],
  challenges: [
    {
      type: 'quiz',
      id: 'quiz-1',
      title: 'Sharding check',
      questions: [
        {
          q: 'A cache cluster uses hash(key) mod 10 across 10 nodes. You add an 11th node. What fraction of keys change owner?',
          options: [
            '~1/11 — only the new node’s share',
            '~91% — almost every key remaps, effectively flushing the entire cache',
            'None — mod handles it',
            '50%',
          ],
          answer: 1,
          explanation:
            'mod 11 ≠ mod 10 for most hashes: ~10/11 of keys move. The cache cluster goes ~cold → origin stampede. Consistent hashing exists precisely to make this ~1/11 instead.',
        },
        {
          q: 'With consistent hashing, why add "virtual nodes"?',
          options: [
            'To encrypt the ring',
            'Few physical nodes = wildly uneven arc sizes; hundreds of vnodes per machine average out load (and let bigger machines take more arcs)',
            'To reduce hash collisions',
            'To make lookups O(1)',
          ],
          answer: 1,
          explanation:
            'Random points on a circle are clumpy; more points per node = statistical smoothing. Vnodes also make removing a node spread its load across MANY successors instead of dumping it all on one.',
        },
        {
          q: 'You shard a social network’s posts by post_id (hash). The profile page ("all posts by user X") now performs terribly. Why?',
          options: [
            'Hashing is slow',
            'One user’s posts scatter across every shard — the hot query became scatter-gather; sharding by user_id would keep it single-shard',
            'post_id is not unique enough',
            'Profiles should never be sharded',
          ],
          answer: 1,
          explanation:
            'Test #2 (query isolation) failed: the shard key must match the dominant read path. Shard by user_id → profile reads are single-shard; global feeds get precomputed separately.',
        },
        {
          q: 'Sharded by user_id, a celebrity with 80M followers makes their shard glow red under read load. Standard mitigations?',
          options: [
            'Ban celebrities',
            'Cache hot entities aggressively (their data is identical for all readers) and/or split the hot key across sub-shards with fan-in on read',
            'Move them to a bigger shard forever',
            'Reshard everything weekly',
          ],
          answer: 1,
          explanation:
            'Hot keys are a TRAFFIC skew, not a data skew — caching absorbs identical reads (celebrity profile = one cache entry serving millions). Key-splitting (bieber_1..bieber_8) is the write-side equivalent. This exact question appears constantly.',
        },
        {
          q: 'Auto-increment primary keys break under sharding because…',
          options: [
            'Numbers get too large',
            'Each shard would independently mint the same IDs; global uniqueness needs UUIDs or coordinated schemes like Snowflake (timestamp + node id + sequence)',
            'NoSQL forbids integers',
            'They don’t break',
          ],
          answer: 1,
          explanation:
            'A per-shard counter isn’t globally unique, and a central counter is a bottleneck/SPOF. Snowflake-style IDs are decentralized, unique, AND time-ordered — which is why they star in Phase 4 designs.',
        },
        {
          q: 'The team plans 8 physical shards. Why should the shard map be built as 4096 LOGICAL buckets → 8 nodes instead of hash mod 8?',
          options: [
            'It sounds more impressive',
            'Resharding becomes bucket reassignment: moving bucket #1207 from node 3 to new node 9 is a bounded copy, no rehash of the world; mod 8 → mod 16 moves half the data at once',
            '4096 is a lucky number',
            'It avoids needing a hash function',
          ],
          answer: 1,
          explanation:
            'Pre-splitting into many stable logical partitions (like Redis Cluster’s 16384 slots) turns scaling into incremental bucket moves with a tiny routing-table update. Answering "how do you reshard?" with this is a senior-level win.',
        },
        {
          q: '"Total revenue today across all users" on a 64-shard database. Realistic approach?',
          options: [
            'A cross-shard JOIN',
            'Don’t serve it from the OLTP shards at query time: stream changes (CDC) into an analytics store / maintain a running aggregate, and accept scatter-gather only for rare admin queries',
            'Lock all shards and sum',
            'It is impossible',
          ],
          answer: 1,
          explanation:
            'Scatter-gather (fan out, merge, tail-latency of the slowest shard) is workable but never for hot paths. Global aggregates/analytics belong in precomputed views fed by change streams — say this proactively.',
        },
      ],
    },
    {
      type: 'lab',
      id: 'lab-1',
      title: 'Build consistent hashing and watch it win',
      intro:
        'You’ll implement (run) a real hash ring in ~40 lines and measure key movement vs naive mod-N. Just paste and run.',
      steps: [
        {
          instruction: 'Measure the naive mod-N disaster: how many of 100k keys move when 10 nodes become 11?',
          command: `python3 -c "
import hashlib
def h(s): return int(hashlib.md5(s.encode()).hexdigest(), 16)
keys = [f'key{i}' for i in range(100000)]
moved = sum(1 for k in keys if h(k) % 10 != h(k) % 11)
print(f'mod-N: {moved/1000:.1f}% of keys moved when adding 1 node')"`,
          expected: '~90% moved — the cluster-wide cache flush in one number.',
        },
        {
          instruction: 'Now a consistent-hash ring with 100 vnodes per node — same experiment.',
          command: `python3 -c "
import hashlib, bisect
def h(s): return int(hashlib.md5(s.encode()).hexdigest(), 16)
def ring(nodes, vnodes=100):
    r = sorted((h(f'{n}#{v}'), n) for n in nodes for v in range(vnodes))
    return r, [x[0] for x in r]
def owner(r, hs, key):
    i = bisect.bisect(hs, h(key)) % len(r)
    return r[i][1]
keys = [f'key{i}' for i in range(100000)]
r10, h10 = ring([f'node{i}' for i in range(10)])
r11, h11 = ring([f'node{i}' for i in range(11)])
moved = sum(1 for k in keys if owner(r10,h10,k) != owner(r11,h11,k))
print(f'consistent hashing: {moved/1000:.1f}% of keys moved (theory: ~{100/11:.1f}%)')"`,
          expected: '~9% moved ≈ 1/11 — the K/N guarantee, demonstrated by your own code.',
        },
        {
          instruction: 'Check load balance across nodes WITH vnodes (the reason they exist).',
          command: `python3 -c "
import hashlib, bisect, collections
def h(s): return int(hashlib.md5(s.encode()).hexdigest(), 16)
for vn in (1, 100):
    r = sorted((h(f'node{n}#{v}'), f'node{n}') for n in range(10) for v in range(vn))
    hs=[x[0] for x in r]; c=collections.Counter()
    for i in range(100000):
        c[r[bisect.bisect(hs, h(f'key{i}')) % len(r)][1]] += 1
    lo, hi = min(c.values()), max(c.values())
    print(f'{vn:>3} vnodes/node: min={lo} max={hi} (max/min = {hi/lo:.2f}x)')"`,
          expected: '1 vnode: heavy imbalance (often 3–6× between nodes). 100 vnodes: near-even. Virtual nodes = statistical smoothing, proven.',
        },
        {
          instruction: 'Simulate a hot key: hash 100k requests where 30% target one celebrity key, and see one node melt.',
          command: `python3 -c "
import hashlib, collections, random
def h(s): return int(hashlib.md5(s.encode()).hexdigest(), 16)
random.seed(1); c = collections.Counter()
for i in range(100000):
    key = 'celebrity42' if random.random() < 0.3 else f'user{random.randint(1,10**6)}'
    c[f'shard{h(key) % 10}'] += 1
for s in sorted(c): print(s, c[s])"`,
          expected: 'One shard with ~37k requests vs ~7k for the rest. Even distribution of KEYS ≠ even distribution of TRAFFIC — the Bieber problem, quantified.',
        },
      ],
    },
    {
      type: 'design',
      id: 'design-1',
      title: 'Design exercise: shard a payments ledger',
      prompt: `
A wallet app: 200M users, 20k transfers/sec peak. Every transfer debits one wallet and credits another; per-user statement queries ("my last 50 transactions") dominate reads. The ledger has outgrown one primary.

1. Pick the shard key (apply the three tests aloud).
2. A transfer touches TWO wallets, possibly on different shards — handle it.
3. How do you reshard from 16 → 32 nodes with zero downtime?
`,
      hints: [
        'Whose queries must be single-shard? The statement read gives it away.',
        'Cross-shard money movement: think "record intent first" — or make the common case single-shard.',
        'Logical buckets + double-writes/backfill, or consistent hashing with data streaming.',
      ],
      modelAnswer: `
**1. Shard key: \`wallet_id\` (≈ user_id), hashed into 4096 logical buckets → physical nodes.**
- Even: hash spreads 200M wallets uniformly; no single wallet should be an outlier (flag corporate/merchant wallets as the hot-key risk — cache their balance reads, and consider sub-ledgers for mega-merchants).
- Query isolation: "my last 50 transactions" = single shard, indexed \`(wallet_id, created_at DESC)\`. ✅
- Stability: buckets pre-split for growth. ✅

**2. Two-wallet transfers.** Each wallet's ledger entries live on its own shard, so a transfer is a distributed write. Pattern: **saga with a transfer-intent record** —
1) append \`transfers(id, from, to, amount, state=PENDING)\` (this table sharded by transfer_id),
2) debit source wallet (single-shard txn; atomic conditional \`balance >= amount\`),
3) credit destination wallet (single-shard txn),
4) mark COMPLETED; a recovery worker resumes/compensates any transfer stuck in PENDING (idempotent steps keyed by transfer_id).
No 2PC; every step is a local ACID transaction; failures leave auditable intent, never lost money. (Full saga treatment in Phase 3 — here you're pre-empting it.)

**3. Resharding 16 → 32.** Because routing is bucket-based:
- New nodes join; the plan reassigns ~half the buckets.
- Per bucket: (a) bulk-copy historical rows while tracking a replication cursor, (b) tail changes (CDC) until caught up, (c) brief dual-write / pause-writes-on-bucket (sub-second) to flip the routing entry, (d) verify counts/checksums, then drop the old copy.
- One bucket at a time → blast radius is 1/4096 of traffic; rollback = flip the map entry back. Zero global downtime, and the "how do you reshard" follow-up is fully answered.
`,
    },
  ],
}
