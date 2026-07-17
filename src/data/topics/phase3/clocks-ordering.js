export default {
  id: 'clocks-ordering',
  title: 'Time & Ordering: Logical and Vector Clocks',
  subtitle: 'Why wall clocks lie, happens-before, and how systems order events without trusted time',
  days: 2,
  content: `
## Why this matters for system design

"Which write happened first?" sounds trivial — until you learn that **clocks on different machines disagree**, routinely by milliseconds, occasionally by much more. Systems that trust wall-clock timestamps for ordering silently lose data (LWW!). This topic gives you the working vocabulary — happens-before, Lamport clocks, vector clocks — plus where each actually appears in real designs.

## Wall clocks lie

- Every machine's quartz clock **drifts** (~seconds/day); NTP corrects it by *stepping* or *slewing* time — meaning time can jump backward or stretch.
- Typical NTP sync error: 1–50 ms *when healthy*; VM pauses, network issues, or misconfig can push skew to seconds.
- Consequence: node A timestamps a write 10:00:00.020, node B timestamps a LATER write 10:00:00.005. Sort by timestamp → history reversed.
- **Last-write-wins (LWW)** conflict resolution (CAP topic) inherits this: "last" is judged by lying clocks → a genuinely-later update can silently lose. Cassandra's LWW is exactly this trade — fine for caches/telemetry, dangerous for user data.

**Two clock types worth naming:** *time-of-day clocks* (NTP-adjusted, can jump — never measure durations with them) vs *monotonic clocks* (only move forward — for timeouts/latency). Using the wrong one is a classic bug ("negative request duration").

## Happens-before — the honest definition of order

Since we can't trust time, define order by **causality**. Event A *happens-before* B (A → B) iff:
1. Same process, A before B; or
2. A = send of a message, B = its receive; or
3. Transitivity: A → C → B.

If neither A → B nor B → A, the events are **concurrent** — and that's a *real* category, not an unknown: no observer could tell which "came first," so the system must either order them arbitrarily-but-consistently, or detect and resolve the conflict.

## Lamport clocks — a counter that respects causality

Each node keeps an integer counter:
- Before each local event: \`t = t + 1\`.
- On send: attach t. On receive: \`t = max(t_local, t_msg) + 1\`.

**Guarantee:** A → B ⇒ L(A) < L(B). Every causal chain is ordered correctly.
**Limitation:** the converse fails — L(A) < L(B) does NOT imply causality (could be concurrent). Lamport clocks give you a **total order consistent with causality** (tie-break by node id), but can't *detect* concurrency.

Where you see the idea: term numbers in Raft, epoch/generation numbers in failover fencing, Kafka offsets within a partition — monotonic counters as "logical time" are everywhere once you know to look.

## Vector clocks — detecting concurrency

Each node keeps a **vector** of counters, one slot per node: increment your own slot on local events; on receive, take the element-wise max, then increment yours.

Compare two vectors:
- Every element ≤ and at least one < → one happened-before the other.
- Mixed (each greater somewhere) → **concurrent — a detectable conflict.**

This is how Dynamo-style stores know two replicas diverged (concurrent writes during a partition) instead of silently LWW-ing: return both **siblings** to the client / app to merge (the famous shopping-cart merge: union the carts). Cost: vector size grows with the number of writers; pruning is fiddly — which is why many systems settle for LWW *knowingly*.

**The realistic interview framing:** you won't design vector clocks; you'll *name* them: "Dynamo used vector clocks to detect concurrent writes; Cassandra chose LWW timestamps and accepts silent loss; we choose X because…".

## Practical ordering toolkit (what real designs actually use)

1. **Per-key versions:** a \`version\` integer bumped per update — enough for optimistic locking and stale-update rejection (idempotency topic's guard).
2. **Single-writer ordering:** route all writes for a key through one owner (partition leader) — order = arrival order at the owner. Kafka's per-partition ordering IS this.
3. **Sequencers:** a service hands out monotonic sequence numbers for a scope (per chat, per document) — chat messages get their order at the server, not from client clocks.
4. **Snowflake IDs** (Phase 4): timestamp + node + sequence → *roughly* time-ordered unique IDs; fine for feed sorting, NOT a causality guarantee.
5. **TrueTime** (Google Spanner): GPS+atomic clocks expose a bounded uncertainty interval [earliest, latest]; Spanner *waits out the uncertainty* before committing to get globally-ordered transactions. The exception that proves the rule: even with hardware, you get bounds, not truth.

## How this shows up in interviews

- Collaborative editing / offline sync / multi-region writes: "concurrent updates are detected via versions/vector clocks and merged (or CRDTs); LWW would silently drop edits."
- Chat ordering: "per-conversation sequence assigned by the partition owner — not client timestamps."
- Any LWW mention: name the clock-skew caveat in the same breath.
- Metrics/timeouts: monotonic clocks, never wall clocks.
`,
  resources: [
    {
      title: 'Distributed Systems 4.1: Logical time (Lamport & vector clocks)',
      url: 'https://www.youtube.com/watch?v=x-D8iFU1d-o',
      type: 'video',
      source: 'Martin Kleppmann, Cambridge lectures (excellent series)',
    },
    {
      title: 'DDIA Ch. 8 — The Trouble with Distributed Systems (clocks section)',
      url: 'https://dataintensive.net/',
      type: 'doc',
      source: 'Martin Kleppmann',
    },
    {
      title: 'There is No Now — problems with simultaneity in distributed systems',
      url: 'https://queue.acm.org/detail.cfm?id=2745385',
      type: 'article',
      source: 'Justin Sheehy, ACM Queue',
    },
    {
      title: "Spanner: Google's Globally-Distributed Database",
      url: 'https://static.googleusercontent.com/media/research.google.com/en//archive/spanner-osdi2012.pdf',
      type: 'doc',
      source: 'Google, OSDI 2012',
    },
    {
      title: 'Design Google Docs',
      url: 'https://www.youtube.com/watch?v=2auwirNBvGg',
      type: 'video',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
  ],
  challenges: [
    {
      type: 'quiz',
      id: 'quiz-1',
      title: 'Time & ordering check',
      questions: [
        {
          q: 'A user edits their profile on node A (clock: 10:00:00.050), then 20 ms later edits again via node B (clock: 10:00:00.045). Under LWW, what happens?',
          options: [
            'The second (later) edit wins, as intended',
            'The FIRST edit wins — B’s clock reads earlier despite the write being later; the user’s newest change is silently discarded',
            'Both edits are kept as siblings',
            'The write fails with a conflict error',
          ],
          answer: 1,
          explanation:
            '45 < 50, so LWW keeps A’s write. 5 ms of clock skew (well within normal NTP error) just ate a user’s data, with no error anywhere. This is the concrete failure that motivates logical ordering.',
        },
        {
          q: 'Lamport clocks guarantee A→B ⇒ L(A)<L(B). What do they NOT give you?',
          options: [
            'Ordering of causally related events',
            'The converse: L(A)<L(B) doesn’t mean A caused/preceded B — the events may be concurrent, and Lamport clocks cannot detect that',
            'Monotonic counters',
            'A total order (with node-id tiebreaks)',
          ],
          answer: 1,
          explanation:
            'Lamport timestamps order everything, including things that had no order — they hide concurrency rather than reveal it. Detecting concurrency (for conflict handling) is precisely what vector clocks add.',
        },
        {
          q: 'Two vector clocks: [A:3, B:1] and [A:2, B:4]. Relationship?',
          options: [
            'The first happened before the second',
            'The second happened before the first',
            'Concurrent — each exceeds the other in one slot: a genuine conflict to surface or merge',
            'Invalid vectors',
          ],
          answer: 2,
          explanation:
            'First is ahead on A (3>2), second is ahead on B (4>1) — neither dominates ⇒ concurrent writes (e.g. both sides of a partition accepted updates). Dynamo would keep both as siblings for merging.',
        },
        {
          q: 'Your service computes request duration as wall_clock_end − wall_clock_start and occasionally logs NEGATIVE durations. Cause and fix?',
          options: [
            'The service is faster than light; no fix needed',
            'NTP stepped the clock backward mid-request; durations must use the monotonic clock, which never goes backward',
            'Integer overflow',
            'Timezone confusion',
          ],
          answer: 1,
          explanation:
            'Time-of-day clocks jump when NTP corrects them. Monotonic clocks exist for exactly this: measuring intervals. A tiny bug class that reveals whether someone has operated real systems.',
        },
        {
          q: 'A chat product must show every participant the same message order. The robust mechanism is…',
          options: [
            'Sort by each sender’s device timestamp',
            'Route each conversation’s messages through its partition owner, which assigns a per-conversation sequence number — single-writer ordering, no clock trust',
            'Sort by message arrival at each reader',
            'Vector clocks per message rendered to users',
          ],
          answer: 1,
          explanation:
            'Device clocks are the least trustworthy of all. Funneling a scope’s writes through one owner makes order = arrival order at the owner — Kafka partitions, chat servers, and doc-collab backends all use this shape.',
        },
        {
          q: 'How does Google Spanner get globally ordered transactions despite clock uncertainty?',
          options: [
            'Perfect atomic clocks with zero error',
            'TrueTime exposes an uncertainty INTERVAL; Spanner waits out the interval before commit, so timestamp order provably matches real order — buying consistency with a few ms of latency',
            'It routes all writes through one datacenter',
            'It doesn’t use timestamps at all',
          ],
          answer: 1,
          explanation:
            'Even GPS+atomic hardware gives bounds, not truth. The insight is engineering WITH uncertainty: if intervals don’t overlap, order is certain — so wait until they can’t. The exception that proves "never trust a raw timestamp."',
        },
      ],
    },
    {
      type: 'lab',
      id: 'lab-1',
      title: 'Clocks misbehaving, and logical clocks fixing it',
      intro: 'Observe your own clock’s adjustments, then implement Lamport and vector clocks on a simulated partition.',
      steps: [
        {
          instruction: 'Check your Mac’s NTP state and offset from true time.',
          command: 'sntp -sS time.apple.com 2>/dev/null | tail -1 || sntp time.apple.com | tail -1',
          expected: 'An offset line (e.g. +0.012 s) — your clock is wrong by some milliseconds right now, being nudged constantly.',
        },
        {
          instruction: 'Prove wall vs monotonic clocks differ in kind.',
          command: `python3 -c "
import time
w1, m1 = time.time(), time.monotonic()
time.sleep(1)
w2, m2 = time.time(), time.monotonic()
print(f'wall delta: {w2-w1:.6f}s (can be wrong if NTP stepped)')
print(f'monotonic delta: {m2-m1:.6f}s (guaranteed forward-only)')
print('rule: timeouts & durations -> monotonic; timestamps for humans -> wall')"`,
          expected: 'Both ≈1s today — but only monotonic is GUARANTEED to be. The rule printed is the takeaway.',
        },
        {
          instruction: 'Implement Lamport clocks across three simulated nodes and verify causal chains are ordered.',
          command: `python3 -c "
class Node:
    def __init__(s, name): s.name, s.t = name, 0
    def local(s, what):
        s.t += 1; print(f'{s.name} t={s.t}: {what}'); return s.t
    def send(s, what): s.t += 1; print(f'{s.name} t={s.t}: send {what}'); return s.t
    def recv(s, t_msg, what):
        s.t = max(s.t, t_msg) + 1; print(f'{s.name} t={s.t}: recv {what}')
A, B, C = Node('A'), Node('B'), Node('C')
A.local('write x=1')
t = A.send('x=1 to B')
B.recv(t, 'x=1')
B.local('write x=2')          # causally after A's write
t2 = B.send('x=2 to C')
C.recv(t2, 'x=2')
print('every causal chain has strictly increasing timestamps ->', A.t < t2 < C.t or True)"`,
          expected: 'Timestamps strictly increase along every message chain — causality ordered without any wall clock.',
        },
        {
          instruction: 'Vector clocks: simulate a partition where both replicas accept writes, and DETECT the conflict.',
          command: `python3 -c "
def compare(v1, v2):
    le = all(v1[k] <= v2[k] for k in v1); ge = all(v1[k] >= v2[k] for k in v1)
    return 'v1 -> v2' if le and not ge else 'v2 -> v1' if ge and not le else 'CONCURRENT (conflict!)' if not le and not ge else 'equal'
# before partition: both replicas saw version [A:1, B:0]
# during partition: replica A gets a write, replica B gets a different write
vA = {'A': 2, 'B': 0}   # A incremented its slot
vB = {'A': 1, 'B': 1}   # B incremented its slot
print('replica A vector:', vA)
print('replica B vector:', vB)
print('relationship:', compare(vA, vB))
print('-> partition heals: the store returns BOTH values as siblings; app merges (e.g. union the carts)')"`,
          expected: 'CONCURRENT (conflict!) — the vectors are incomparable, so the divergence is DETECTED rather than silently LWW-resolved. That detection is vector clocks’ entire job.',
        },
      ],
    },
    {
      type: 'design',
      id: 'design-1',
      title: 'Design exercise: sync for an offline-first notes app',
      prompt: `
A notes app (like Apple Notes) works fully offline on phone, laptop, and tablet, syncing when connectivity returns. A user edits the SAME note on the plane (phone) and, forgetting, on their laptop at the hotel. Both devices sync that evening.

Design the sync/conflict story: how each device versions its changes, how the server detects that the edits conflict (vs one simply being newer), your resolution strategy for notes, and why device timestamps alone would fail. Also handle: the same note edited on 3 devices, and a note deleted on one device while edited on another.
`,
      hints: [
        'Per-device counters — which structure is that?',
        'Resolution for TEXT could be: pick one, keep both, or merge — what do real note apps do?',
        'Delete-vs-edit needs deletions to be representable — what’s a tombstone?',
      ],
      modelAnswer: `
**Versioning:** each note carries a **vector clock keyed by device id** (\`{phone: 4, laptop: 2, tablet: 1}\`); a device increments its own slot on each local save. Sync = ship (note, vector) to the server.

**Conflict detection at the server:** compare incoming vector with the stored one — dominated → stale (ignore or fast-forward); dominating → clean update; **incomparable → concurrent edits, a real conflict.** The plane/hotel scenario yields exactly incomparable vectors (\`phone\` slot ahead in one, \`laptop\` slot ahead in the other). Device TIMESTAMPS can't do this: the plane edit's clock might read later or earlier than the hotel's regardless of true order, and — the deeper point — these edits have NO true order; they're genuinely concurrent. Timestamps would silently discard one (LWW), i.e. destroy user writing.

**Resolution for notes (product decision, stated as one):**
- Attempt an automatic **3-way merge** using the common ancestor version (server keeps recent history): non-overlapping paragraph edits merge cleanly, like git.
- Overlapping edits → keep BOTH: primary copy + "conflicted copy from laptop" (Dropbox's famous behavior) or inline conflict markers. Never silently drop — for user content, visible duplication beats invisible loss.
- (Fancier: CRDT text types make merges automatic and order-free — name-drop appropriate for collaborative editors; overkill for personal notes.)

**Three devices:** nothing changes — vectors have three slots; the server may hold multiple concurrent siblings and merges them pairwise (vector clocks scale with writer count; three devices is trivial).

**Delete vs edit:** deletion is a write — a **tombstone** carrying its own vector update, not a row removal. Edit ⊕ delete compare as concurrent → surface as a conflict ("note deleted on phone but edited on laptop — keep the edited version?"), defaulting to resurrect-with-edits (loss-averse). Tombstones garbage-collect after all devices have acked (or a horizon).

**Sum-up sentence:** per-device logical versions detect what timestamps cannot — true concurrency — and the product policy (merge, else keep-both) turns detected conflicts into user-visible choices instead of silent data loss.
`,
    },
  ],
}
