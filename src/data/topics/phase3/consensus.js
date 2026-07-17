export default {
  id: 'consensus',
  title: 'Consensus & Leader Election',
  subtitle: 'Raft intuition, quorums, split-brain, and what ZooKeeper/etcd actually do for you',
  days: 3,
  content: `
## Why this matters for system design

Somewhere under every serious distributed system, a small set of nodes must AGREE on something: who's the leader, what the config is, whether a lock is held. Get agreement wrong and you get **split-brain** — two primaries both accepting writes — the most feared failure in databases. You won't implement Raft in an interview, but you must know what problems need consensus, roughly how it works, and its costs.

## The problem: agreement over an unreliable network

Nodes crash. Networks partition. Messages delay arbitrarily. Yet the cluster must present ONE truth: a single leader, one committed order of operations. The subtle killer: **you cannot distinguish a crashed node from a slow/partitioned one** — so naive "the leader stopped responding, I'll take over" logic creates two leaders the moment a partition heals.

### Split-brain, concretely

Primary DB in partition A; replicas in partition B stop hearing from it; B promotes a new primary. Partition heals: **two primaries**, both having accepted writes. Divergent data, manual reconciliation, lost updates — an outage-review classic.

## The core idea: majority quorums

All consensus protocols rest on one arithmetic fact: **two majorities of the same cluster must overlap.**

- Cluster of 5 → majority = 3 → two disjoint groups of 3 can't exist.
- Decisions (leader election, committed writes) require a **majority vote** → at most ONE side of any partition can decide → split-brain is arithmetically impossible.
- Corollary: a cluster of 2N+1 tolerates **N failures** (5 nodes → 2 failures). The minority side becomes **unavailable** (refuses writes) — this is the CP choice from the CAP topic, now with the mechanism visible.
- Why odd numbers: 4 nodes has majority 3 and tolerates 1 failure — same as 3 nodes, more hardware. Clusters are 3, 5, or 7.

## Raft in five minutes (the intuition interviewers want)

Raft = leader-based replicated log. Three pieces:

**1. Leader election.** Nodes are followers; leaders send heartbeats. Follower times out hearing nothing → becomes candidate, increments the **term** (a logical epoch counter), requests votes. Majority of votes → leader. One vote per node per term + randomized timeouts (so candidates rarely tie) → at most one leader per term.

**2. Log replication.** Clients write to the leader; the leader appends to its log, replicates to followers; entry is **committed once a majority acknowledge** → then applied and acked to the client. A committed entry survives any minority of failures — the majority that has it overlaps every future election majority, so any electable node has it.

**3. Safety via terms.** A stale ex-leader (was partitioned, still thinks it leads) has an old term; any node that saw a newer term rejects it → the zombie leader steps down. Elections only elect candidates whose logs are at least as up-to-date as the majority — committed entries can never be lost by a new leader.

A write commits once a majority of followers have it, so the cluster keeps making progress even with a follower down:

\`\`\`mermaid
sequenceDiagram
  autonumber
  participant C as Client
  participant L as Leader
  participant F1 as Follower 1
  participant F2 as Follower 2 (down)
  C->>L: write
  L->>F1: AppendEntries
  L->>F2: AppendEntries
  F1-->>L: ack
  Note over L: majority (leader + F1) reached — commit
  L-->>C: success
\`\`\`

**Cost:** every write pays a round trip to a majority (the PACELC latency price of strong consistency), and the leader is a throughput bottleneck — which is why consensus guards **small critical state**, not your bulk data path.

(Paxos = the older, famously-hard-to-explain equivalent; Raft was explicitly designed as the understandable one. Saying that sentence is all the Paxos you need.)

## When you don't need consensus: gossip

Not every "who's alive?" question needs a majority vote. **Gossip (epidemic) protocols** solve membership and failure detection without any coordinator at all: each node periodically picks a few random peers and exchanges what it currently believes about the cluster's state. Information spreads exponentially — O(log N) rounds to reach every node — the same shape as a rumor spreading through a group of people, which is exactly the metaphor the name comes from.

- **No leader, no quorum, no blocking.** Any node can be down and gossip keeps flowing through the rest; there's nothing to fail over.
- **Used for:** cluster membership and failure detection (Cassandra and Dynamo-style rings gossip who's up), and tools like Serf/Consul use it for LAN membership.
- **The trade-off that matters:** gossip gives **eventual, probabilistic** convergence — "everyone will agree soon, with high probability" — not the immediate, guaranteed agreement Raft gives you. That's fine for "is node 7 still alive?" (worst case you route around it for a few extra seconds), but it is the wrong tool for "who holds the lock" or "who's the leader" — those need the real thing above.

The sharding topic's mention of Cassandra's "coordinator-free gossip" routing is this same mechanism: nodes learn the ring topology from each other instead of consulting a central registry.

## What you actually use consensus FOR

You almost never build Raft; you use a **coordination service** that embeds it — ZooKeeper (Kafka's old brain), **etcd** (Kubernetes' brain), Consul. They store small, critical, strongly-consistent state:

1. **Leader election as a service:** "smallest ephemeral node wins" / lease-based election — your app's workers use it to pick a singleton (e.g. THE scheduler).
2. **Distributed locks & leases:** locks with TTLs (leases) so a crashed holder's lock self-releases. Caveat to name: a paused holder (GC pause!) may act after its lease expired → **fencing tokens** (monotonically increasing lock generation numbers checked by the resource) close the hole.
3. **Config & service discovery:** small hot metadata (shard maps! — the sharding topic's routing table) with watches/notifications.
4. **Membership:** who's in the cluster, heartbeat-tracked.

**Database failover, done right:** replicas + a consensus-backed coordinator that (a) elects the new primary via majority, (b) **fences** the old one (revokes its ability to accept writes — e.g. via fencing token/STONITH), (c) updates the routing config atomically. Say "fencing" and you sound like you've operated databases.

## How this shows up in interviews

- "What if the primary dies?" → automatic failover via consensus-based election + fencing, ~seconds of write unavailability (CP window), zero split-brain.
- "How does the cluster know the shard map?" → etcd/ZooKeeper-class store with watches.
- "Distributed lock?" → lease + fencing token, via the coordination service — plus the honest note that many "needs a lock" problems are better solved with atomic conditional updates (concurrency topic) or single-owner partitioning (sharding).
- Never put consensus on the hot data path; it guards metadata and elections.
`,
  resources: [
    {
      title: 'The Raft visualization — watch elections and replication happen',
      url: 'https://thesecretlivesofdata.com/raft/',
      type: 'interactive',
      source: 'The Secret Lives of Data (do this one!)',
    },
    {
      title: 'Raft paper — In Search of an Understandable Consensus Algorithm',
      url: 'https://raft.github.io/raft.pdf',
      type: 'doc',
      source: 'Ongaro & Ousterhout, Stanford',
    },
    {
      title: 'How to do distributed locking (fencing tokens)',
      url: 'https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html',
      type: 'article',
      source: 'Martin Kleppmann',
    },
    {
      title: 'Gossip Protocol Explained',
      url: 'http://highscalability.com/blog/2023/7/16/gossip-protocol-explained.html',
      type: 'article',
      source: 'High Scalability',
    },
    {
      title: 'Paxos: The Part-Time Parliament',
      url: 'https://lamport.azurewebsites.net/pubs/lamport-paxos.pdf',
      type: 'doc',
      source: 'Leslie Lamport',
    },
    {
      title: 'ZooKeeper: Wait-free coordination for Internet-scale systems',
      url: 'https://www.usenix.org/legacy/event/usenix10/tech/full_papers/Hunt.pdf',
      type: 'doc',
      source: 'Yahoo!, USENIX 2010',
    },
  ],
  challenges: [
    {
      type: 'quiz',
      id: 'quiz-1',
      title: 'Consensus check',
      questions: [
        {
          q: 'Why does requiring a MAJORITY for decisions make split-brain impossible?',
          options: [
            'Majorities are faster to assemble',
            'Two disjoint majorities of one cluster cannot exist — any two majorities share at least one node, so only one side of a partition can ever decide',
            'The network prevents partitions when clusters are odd-sized',
            'Leaders refuse to split',
          ],
          answer: 1,
          explanation:
            'Pigeonhole arithmetic: ⌈(n+1)/2⌉ × 2 > n. The overlap node would have to vote twice / hold two conflicting commits — forbidden. All of Raft/Paxos stands on this one fact.',
        },
        {
          q: 'A 5-node etcd cluster is split 3|2 by a partition. What happens?',
          options: [
            'Both sides continue serving reads and writes',
            'The 3-side elects/retains a leader and serves; the 2-side cannot reach majority and refuses writes (goes unavailable) — the CP choice in action',
            'Both sides go down until the partition heals',
            'The 2-side serves reads and writes but flags them',
          ],
          answer: 1,
          explanation:
            'Majority side lives; minority side parks. Total availability is sacrificed for the guarantee that at most one truth exists. When the partition heals, the minority catches up from the leader’s log.',
        },
        {
          q: 'An old leader was partitioned away mid-write, and the cluster elected a new leader. The old one comes back and tries to replicate an entry. What stops it corrupting the log?',
          options: [
            'Followers accept both leaders’ entries',
            'Terms: the ex-leader carries a stale term number; nodes that saw the newer term reject its messages and it steps down to follower',
            'The network blocks old leaders',
            'A human operator must intervene',
          ],
          answer: 1,
          explanation:
            'The monotonically increasing term is a logical epoch: any message from an older epoch is dead on arrival. This is the same idea as fencing tokens — staleness made detectable by a counter.',
        },
        {
          q: 'Your worker holds a distributed lock (30 s lease), suffers a 45-second GC pause, then resumes and writes to the shared resource. The lease expired and another worker holds the lock. What prevents corruption?',
          options: [
            'Nothing — this is why locks with TTLs are unusable',
            'Fencing tokens: each lock grant carries an increasing number; the RESOURCE rejects writes bearing an older token than the highest it has seen',
            'GC pauses cannot exceed lease times',
            'The second worker waits for the first',
          ],
          answer: 1,
          explanation:
            'The paused client cannot know it’s stale — so the RESOURCE must check. Token 33 arrives after token 34 has been seen → rejected. Kleppmann’s canonical critique of naive Redis locks; naming it is a strong senior signal.',
        },
        {
          q: 'Why do consensus-backed stores (etcd/ZooKeeper) hold only SMALL data (config, locks, membership) rather than your application data?',
          options: [
            'They lack disk space',
            'Every write costs a majority round trip and flows through one leader — strong consistency’s latency/throughput price is fine for metadata, ruinous for bulk data',
            'Their APIs only accept small values',
            'Licensing restrictions',
          ],
          answer: 1,
          explanation:
            'Consensus = coordination on every write. You buy split-brain-immunity for the 1% of state that needs it (shard maps, leader records) and keep the 99% on replication/partitioning designed for throughput.',
        },
        {
          q: 'A 3-node cluster and a 4-node cluster both tolerate exactly 1 node failure. Why prefer 3 (or go to 5)?',
          options: [
            'Four-node clusters are illegal in Raft',
            'Majority of 4 is 3, so 4 nodes still only tolerates 1 failure — the 4th node adds cost and vote traffic but no fault tolerance; odd sizes maximize failures-tolerated per node',
            'Even numbers cause more elections',
            'Five nodes are needed for backups',
          ],
          answer: 1,
          explanation:
            '2N+1 tolerates N. 3→1, 4→1, 5→2. Even-sized clusters are pure waste (and marginally worse: more nodes to reach majority across). Hence the 3/5/7 convention.',
        },
      ],
    },
    {
      type: 'lab',
      id: 'lab-1',
      title: 'Watch Raft elect and replicate',
      intro:
        'The best Raft intuition comes from SEEING it. Then simulate quorum arithmetic yourself.',
      steps: [
        {
          instruction: 'Do the full interactive Raft walkthrough (10 min) — elections, replication, partitions.',
          command: 'open https://thesecretlivesofdata.com/raft/',
          expected: 'You watch a partition create a stale leader, and terms neutralize it on heal. This visualization is the whole topic in pictures.',
        },
        {
          instruction: 'Play with the live Raft playground: pause nodes, drop messages, force elections.',
          command: 'open https://raft.github.io/',
          expected: 'Kill the leader → watch randomized timeouts race → new term, new leader. Kill a MINORITY → nothing breaks. Kill a MAJORITY → writes stop (CP!).',
        },
        {
          instruction: 'Verify quorum-overlap arithmetic with brute force: can two disjoint majorities ever exist?',
          command: `python3 -c "
from itertools import combinations
for n in (3,4,5,7):
    maj = n//2 + 1
    nodes = set(range(n))
    disjoint = any(not set(a) & set(b)
        for a in combinations(nodes, maj)
        for b in combinations(nodes - set(a), maj) if len(nodes - set(a)) >= maj)
    print(f'n={n}, majority={maj}: disjoint majorities possible? {disjoint} | tolerates {n - maj} failures... wait: {(n-1)//2}')"`,
          expected: 'False for every n — two majorities always intersect. And note n=4 tolerates 1, same as n=3: the odd-size rule, proven.',
        },
        {
          instruction: 'Simulate election safety: 5 nodes, one vote each per term, randomized timeouts — count split votes over 1000 elections.',
          command: `python3 -c "
import random
random.seed(2)
split = 0
for _ in range(1000):
    timeouts = [random.uniform(150, 300) for _ in range(5)]
    first = min(timeouts)
    # candidates whose timers fire within one network delay (10ms) of the first compete
    candidates = [t for t in timeouts if t - first < 10]
    if len(candidates) > 1: split += 1
print(f'contested elections: {split/10:.1f}% — retried with new randomized timeouts, converging fast')"`,
          expected: 'A small % of contested elections — which Raft simply retries with fresh random timeouts. Randomization as a coordination-avoidance trick.',
        },
      ],
    },
    {
      type: 'design',
      id: 'design-1',
      title: 'Design exercise: automatic failover for a payments database',
      prompt: `
Your payments Postgres has 1 primary + 2 replicas across three availability zones. Today, failover is a human paging ritual taking 20 minutes. Design automatic failover that: never allows split-brain, loses no acknowledged transactions, and completes in under 30 seconds. Walk through the failure of the primary AZ step by step.
`,
      hints: [
        'Who decides the primary is dead — and why must that decision take a majority?',
        '"No acknowledged transaction lost" constrains the replication mode (sql topic).',
        'The old primary might not BE dead. What two mechanisms stop it accepting writes?',
      ],
      modelAnswer: `
**Architecture:** a 3-node consensus cluster (etcd or Patroni-style, one member per AZ) holds: current-primary record + a lease the primary must renew every ~5 s. Replication is **semi-synchronous**: commit requires ack from ≥1 replica — so every acknowledged transaction exists on at least one surviving node (RPO = 0, the "no lost acks" requirement; stated cost: +1 intra-region RTT per commit).

**Primary-AZ failure, step by step:**
1. **t=0:** AZ-1 dies. Primary's lease renewals stop.
2. **t≈5–10 s:** lease expires in the consensus store. Crucially, "primary is dead" is decided by the MAJORITY (the 2 surviving consensus members) — no single watcher can trigger failover, so a one-node network blip can't cause a coup.
3. **Candidate selection:** among surviving replicas, pick the one with the highest replayed WAL position (it provably has every semi-sync-acked commit — quorum overlap logic).
4. **Fencing BEFORE promotion (the split-brain killer, two layers):**
   (a) consensus store increments the cluster generation (fencing token); the connection router/pgbouncer only honors the highest generation;
   (b) if AZ-1 is merely partitioned, its primary can't renew its lease and demotes ITSELF on expiry (leases = self-fencing); storage-level or network-level fencing (revoke its credentials/close its VIP) as belt-and-suspenders.
5. **t≈15–25 s:** promote the chosen replica, write \`primary = node-2, generation = 34\` atomically, routers flip. Writes resume.
6. **Heal:** old primary returns, sees generation 34 > its 33 → rejoins as a replica, rewinding any unreplicated (never-acknowledged) tail.

**The window:** ~10–25 s of write unavailability — the CP trade stated honestly ("during failover, payments queue or fail-fast with retries; reads continue from replicas"). Clients retry with idempotency keys, so the pause is invisible in outcomes.

**What you name-dropped, legitimately:** quorum-decided failure detection, semi-sync RPO=0, lease self-fencing, fencing tokens/generations, WAL-position-based candidate choice. That's the complete operational answer to "what if the primary dies?"
`,
    },
  ],
}
