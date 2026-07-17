export default {
  id: 'cap-consistency',
  title: 'CAP Theorem & Consistency Models',
  subtitle: 'Partitions, the real CP/AP decision, quorums, and the consistency spectrum',
  days: 2,
  content: `
## Why this matters for system design

CAP is the most name-dropped theorem in interviews — and the most misquoted. Knowing what it *actually* says (and the more useful consistency spectrum underneath it) lets you answer "how consistent does this need to be?" like an engineer instead of reciting "pick two of three."

## What CAP actually says

In a distributed system, when a **network partition** happens (nodes can't reach each other — and this WILL happen), you must choose per operation:

- **Consistency (C):** every read sees the latest write — which may mean refusing to answer if you can't verify.
- **Availability (A):** every request gets a (possibly stale) answer.

**P is not optional.** Networks partition; the only choice is C-vs-A *during* the partition. "Pick 2 of 3" is misleading — a non-partition-tolerant distributed system isn't a choice, it's a bug.

\`\`\`
Partition happens. A replica can't reach the leader. A read arrives:
  CP: "I can't confirm I'm current → ERROR/wait."   (bank balance)
  AP: "Here's my possibly-stale copy → 200 OK."      (product page)
\`\`\`

\`\`\`mermaid
flowchart LR
  R1["Replica 1"] -.->|"partition — link down"| R2["Replica 2"]
  R1 --> CP["CP: refuse the write, stay correct"]
  R2 --> AP["AP: accept the write, diverge, reconcile later"]
\`\`\`

Also know CAP's limits: it's about a narrow formal property during partitions. Day-to-day, the sharper tool is **PACELC**: *if Partition → A vs C; Else (normal operation) → Latency vs Consistency.* Even with no partition, synchronous consistency costs round trips — the L-vs-C trade is the one you pay every millisecond.

## The consistency spectrum (more useful than CAP)

From strongest to weakest — each step down buys latency/availability:

1. **Linearizable (strong):** the system behaves as if one copy exists; reads always see the latest write. Costs: coordination (consensus/quorums), cross-region round trips. *Needed for:* uniqueness claims (usernames), leader election, balances at the moment of spending.
2. **Sequential / causal:** causally-related events appear in order everywhere (reply never appears before the message it answers). Comments, chat threads.
3. **Read-your-own-writes / monotonic reads:** session guarantees — I see my own updates; I never travel back in time. (You met these in the replication topic.)
4. **Eventual:** replicas converge if writes stop. No ordering promises meanwhile. Likes counts, view counters, DNS, product ratings.

**The interview move:** never label a whole SYSTEM "CP" or "AP" — label each *operation*: "username claim = linearizable; profile view = eventual; my-own-profile-after-edit = read-your-writes."

## Quorums — tunable consistency

Leaderless stores (Dynamo/Cassandra) replicate each key to **N** nodes; you tune per query:
- **W** = replicas that must ack a write; **R** = replicas consulted per read.
- **R + W > N ⇒ read and write sets overlap ⇒ reads see the latest write** (strong-ish consistency).

With N=3: W=2, R=2 → balanced strong reads. W=1, R=1 → fastest, eventual. W=3 → durable writes but any node down blocks writes.

Version conflicts still happen (concurrent writes to different replicas) → resolved via **last-write-wins** (clock-based — can silently drop data!) or vector clocks/app-level merge (Phase 3). Mentioning "R+W>N" with actual numbers is a reliable interview point-scorer.

## Where systems sit (defaults — most are tunable)

| System | Default posture |
|---|---|
| Postgres/MySQL primary | CP-ish (single-node truth; replicas add eventual reads) |
| ZooKeeper/etcd (consensus) | CP — refuse service without quorum |
| Cassandra/Dynamo | AP by default, tunable to quorum consistency |
| Redis (single node) | consistent but not partition-tolerant (it's one node!) |
| DNS, CDNs | AP, gloriously eventual |
| Spanner/CockroachDB | CP with high availability via global consensus (+TrueTime) — "effectively CA" marketing, still CP under partition |

## How to talk about it in interviews

For each data flow, answer three questions out loud:
1. **What breaks if a read is stale?** (money moves twice? or a like-count is off by 3?)
2. **What breaks if we refuse to serve?** (checkout fails = lost revenue; feed fails = shrug)
3. **Pick the weakest consistency that doesn't break anything** — weakest ⇒ fastest & most available.

Canonical lines:
- "Inventory decrement is linearizable via atomic conditional update on the owning shard; product-page stock badge is eventually consistent with a 30 s TTL."
- "Cross-region: async replication, so region failover has RPO of seconds — acknowledged writes could be lost; if that's unacceptable we pay synchronous cross-region latency on writes."

## How this shows up in interviews

- Every design: one sentence per critical path naming its consistency level and why.
- "Why not strong consistency everywhere?" → PACELC: you'd pay coordination latency on every operation, and cross-region UX dies.
- Quorum math when NoSQL comes up: N/R/W with numbers.
`,
  resources: [
    {
      title: 'CAP theorem explained simply',
      url: 'https://www.youtube.com/watch?v=BHqjEjzAicA',
      type: 'video',
      source: 'ByteByteGo (YouTube)',
    },
    {
      title: 'CAP Twelve Years Later (by CAP’s author — corrects the myths)',
      url: 'https://www.infoq.com/articles/cap-twelve-years-later-how-the-rules-have-changed/',
      type: 'article',
      source: 'Eric Brewer, InfoQ',
    },
    {
      title: 'Please stop calling databases CP or AP',
      url: 'https://martin.kleppmann.com/2015/05/11/please-stop-calling-databases-cp-or-ap.html',
      type: 'article',
      source: 'Martin Kleppmann',
    },
    {
      title: 'CAP Theorem',
      url: 'https://algomaster.io/learn/system-design/cap-theorem',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
    {
      title: 'Strong vs Eventual Consistency',
      url: 'https://blog.algomaster.io/p/strong-vs-eventual-consistency',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
    {
      title: 'Active-Active Application Architectures',
      url: 'https://www.mongodb.com/developer/products/mongodb/active-active-application-architectures/',
      type: 'article',
      source: 'MongoDB',
    },
  ],
  challenges: [
    {
      type: 'quiz',
      id: 'quiz-1',
      title: 'Consistency reasoning check',
      questions: [
        {
          q: 'During a network partition, a CP system’s minority side receives a read. What does it do?',
          options: [
            'Serve its local (possibly stale) copy',
            'Refuse/timeout — it cannot verify it has the latest data, and consistency wins over availability',
            'Forward to the client’s browser cache',
            'Serve and mark the response "maybe stale"',
          ],
          answer: 1,
          explanation:
            'CP = correctness over uptime during partitions: no answer beats a possibly-wrong answer. This is etcd/ZooKeeper behavior — a minority partition goes read-only or fully unavailable.',
        },
        {
          q: 'Cassandra cluster, N=3. You want reads that always see the latest acknowledged write, while tolerating one node down. Pick R and W.',
          options: [
            'W=1, R=1 — fastest',
            'W=2, R=2 — R+W=4 > N=3, overlap guaranteed, and any single node can be down',
            'W=3, R=1 — durable writes',
            'W=1, R=3 — thorough reads',
          ],
          answer: 1,
          explanation:
            'R+W>N forces the read set to intersect the write set → at least one replica in every read has the newest value. W=3 blocks writes when a node is down; W=1,R=3 gives overlap too but writes lose durability. QUORUM/QUORUM (2/2) is the classic balanced answer.',
        },
        {
          q: 'Which pairing of operation → consistency level is WRONG?',
          options: [
            'Username registration → linearizable',
            'Like counter → eventual',
            'Chat: reply must appear after the message it quotes → causal',
            'Bank balance check during a withdrawal → eventual',
          ],
          answer: 3,
          explanation:
            'Spending decisions on stale balances = double-spending. The withdrawal path needs linearizable read-check-decrement (atomic conditional update / serializable txn). The other three are textbook-correct matches.',
        },
        {
          q: 'PACELC adds what insight beyond CAP?',
          options: [
            'Partitions never actually happen',
            'Even WITHOUT partitions, you constantly trade consistency against LATENCY — synchronous coordination costs round trips on every operation',
            'Availability is always preferable',
            'Consistency is free inside one datacenter',
          ],
          answer: 1,
          explanation:
            'CAP only speaks to partition behavior (rare). The everyday cost of strong consistency is coordination latency — why cross-region synchronous writes hurt UX daily, partition or not. (Else → Latency vs Consistency.)',
        },
        {
          q: 'An e-commerce site during a partition between regions: which is the defensible posture?',
          options: [
            'Whole site CP: error pages everywhere until healed',
            'Whole site AP: accept orders in both regions with no inventory checks',
            'Split by operation: browsing/cart stay available on stale data (AP); checkout’s inventory claim stays consistent on the owning region (CP), possibly degrading for some users',
            'Turn off one region permanently',
          ],
          answer: 2,
          explanation:
            'Per-operation consistency is THE answer pattern: reads lie harmlessly; the money/inventory mutation must not. Some checkouts degrade during the partition — a scoped, explainable cost.',
        },
        {
          q: 'Two replicas accepted concurrent writes to the same key during a partition (AP store). "Last-write-wins" resolution silently…',
          options: [
            'Merges both values',
            'Drops one of the writes based on timestamps (which may themselves be skewed) — data loss that nobody notices',
            'Rejects both writes',
            'Creates two keys',
          ],
          answer: 1,
          explanation:
            'LWW picks a "winner" by clock; the loser vanishes. Fine for a cache; dangerous for a cart (famous Dynamo example: merged carts resurrect deleted items rather than lose additions). Vector clocks / app merges are the alternative — Phase 3.',
        },
      ],
    },
    {
      type: 'lab',
      id: 'lab-1',
      title: 'Simulate quorums and partitions',
      intro: 'A 60-line quorum simulator: watch R+W>N give correct reads, and R+W≤N serve stale data.',
      steps: [
        {
          instruction: 'Run the quorum simulator: N=3 replicas, write with W acks, read from R replicas, taking the highest version.',
          command: `python3 -c "
import random
random.seed(7)
class Replica:
    def __init__(s): s.ver, s.val = 0, None
def write(reps, W, ver, val):
    acked = random.sample(reps, W)      # only W replicas get it (async lag elsewhere)
    for r in acked: r.ver, r.val = ver, val
def read(reps, R):
    picked = random.sample(reps, R)
    best = max(picked, key=lambda r: r.ver)
    return best.ver, best.val
for W, R in [(1,1),(2,2),(1,3),(3,1)]:
    stale = 0
    for trial in range(2000):
        reps=[Replica() for _ in range(3)]
        for v in range(1,4): write(reps, W, v, f'value{v}')
        ver,_ = read(reps, R)
        if ver != 3: stale += 1
    ok = 'GUARANTEED fresh' if R+W>3 else 'stale possible'
    print(f'W={W} R={R} (R+W={R+W}): stale reads {stale/20:.1f}%  <- {ok}')"`,
          expected: 'W1R1: ~30%+ stale. W2R2, W1R3, W3R1: 0% — every R+W>N combo reads fresh, exactly as the math promises.',
        },
        {
          instruction: 'Now simulate a PARTITION: one replica is unreachable. See which (W,R) configs keep working.',
          command: `python3 -c "
print('N=3, one node partitioned away -> 2 reachable')
for W,R in [(1,1),(2,2),(3,1),(2,3)]:
    w_ok = W <= 2; r_ok = R <= 2
    print(f'W={W} R={R}: writes {\"OK\" if w_ok else \"BLOCKED\"}, reads {\"OK\" if r_ok else \"BLOCKED\"}'
          + ('   <- consistent AND available with 1 node down' if w_ok and r_ok and W+R>3 else ''))"`,
          expected: 'W=2,R=2 stays consistent AND available with one node down; W=3 blocks writes; R=3 blocks reads. Quorum sizing = availability math.',
        },
        {
          instruction: 'See real-world eventual consistency again, knowingly this time: ask two DNS resolvers for a busy domain.',
          command: 'dig @8.8.8.8 www.amazon.com +short | head -2; echo ---; dig @1.1.1.1 www.amazon.com +short | head -2',
          expected: 'Potentially different answers — two replicas of a global AP system, converging on their own schedules. You now have the vocabulary for what you saw in Phase 0.',
        },
      ],
    },
    {
      type: 'design',
      id: 'design-1',
      title: 'Design exercise: consistency menu for a ride-hailing app',
      prompt: `
For each operation below, assign a consistency level (linearizable / causal / read-your-writes / eventual), name the mechanism that provides it, and say what breaks with a weaker choice:

1. Matching: assign exactly ONE driver to a ride request
2. Rider sees the driver's car moving on the map
3. Rider updates payment card, then immediately books a ride
4. Driver's weekly earnings dashboard
5. Surge-pricing multiplier shown across a city zone
`,
      hints: [
        'Which one is a uniqueness claim in disguise?',
        'GPS dots: what is the cost of a 2-second-stale position?',
        'Card update then charge: whose writes must whom read?',
      ],
      modelAnswer: `
1. **Matching → linearizable.** One driver, one ride: it's a uniqueness claim. Mechanism: atomic conditional update on the driver's record (\`WHERE status='AVAILABLE'\`) on its owning shard, or a short lease via a consensus-backed store. Weaker ⇒ two riders get the same car — product-breaking.
2. **Map dots → eventual (aggressively).** Positions update every 2–4 s and are superseded constantly; staleness of seconds is invisible. Mechanism: last-write-wins into Redis, fan out via pub/sub. Paying coordination here would melt the system for zero user value.
3. **Card update → booking → read-your-own-writes.** The booking charge MUST see the new card. Mechanism: route this user's payment-profile reads to the leader (or require replica catch-up on the session token) for a short window. Weaker ⇒ charging a removed card — support nightmare, though not global inconsistency: session guarantee is enough, full linearizability is overkill.
4. **Earnings dashboard → eventual (minutes).** Computed from an async analytics pipeline; label "as of 12:45". Weaker-is-fine is the point — but pair with a strongly-consistent payout statement at settlement time.
5. **Surge multiplier → eventual with bounded staleness (~10–30 s), but capture-at-booking.** The zone price is computed centrally and broadcast; all users converging within seconds is fine. The subtle correctness rule: the multiplier is FROZEN into the ride quote at booking (linearizable write of the quote), so display staleness never changes what a rider owes.

**The pattern to narrate:** exactly one operation (matching) needed real coordination; one needed a session guarantee; the rest run happily eventual — which is WHY the system can be fast and available. Strong-everywhere isn't rigor, it's failure to prioritize.
`,
    },
  ],
}
