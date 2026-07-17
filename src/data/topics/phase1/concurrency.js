export default {
  id: 'concurrency',
  title: 'Concurrency: Races, Locks & Deadlocks',
  subtitle: 'Why shared state is dangerous and the tools that tame it — from mutexes to optimistic locking',
  days: 3,
  content: `
## Why this matters for system design

Every concurrency bug you can create with two threads, you can create with two *servers* — just worse. "Two users buy the last ticket at the same time" is the same bug as a two-thread race condition, and interviewers probe it constantly (ticket booking, inventory, wallet balances). Master it at thread scale first; the distributed versions in Phase 3 will feel familiar.

## The race condition

\`counter += 1\` looks atomic but is three machine steps: **read** counter, **add** 1, **write** back. Two threads interleaving:

\`\`\`
Thread A: read counter (100)
Thread B: read counter (100)
Thread A: write 101
Thread B: write 101   ← one increment LOST
\`\`\`

A **race condition** = correctness depends on uncontrollable timing. The window is nanoseconds, so it passes tests and fails in production under load. The distributed twin: two app servers both read \`stock = 1\` from the DB, both decrement, both write 0 — and you sold two of the last item.

The same interleaving, drawn as a timeline — both threads read before either writes, so one increment vanishes:

\`\`\`mermaid
sequenceDiagram
  autonumber
  participant A as Thread A
  participant M as Shared counter
  participant B as Thread B
  M->>A: read (100)
  M->>B: read (100)
  A->>M: write 101
  B->>M: write 101
  Note over M: expected 102 — one update lost
\`\`\`

## Mutual exclusion — locks

A **mutex** guarantees only one thread at a time runs the **critical section**:

\`\`\`
lock.acquire()      # others block here
stock = read()
if stock > 0: write(stock - 1)
lock.release()
\`\`\`

Correctness restored — at a price:

- **Contention**: the critical section is serialized; heavily-contended locks flatten your multi-core throughput (Amdahl's law in action).
- **Granularity**: one big lock (coarse) = simple but slow; many small locks (fine) = fast but risky. Real systems shard locks (e.g. one lock per hash bucket — exactly how concurrent hash maps work, and a preview of *sharding*).
- **Read/write locks**: many concurrent readers OR one writer — great when reads dominate (usual for web workloads).

## Deadlock — the deadly embrace

\`\`\`
Thread A: lock(X) … waits for lock(Y)
Thread B: lock(Y) … waits for lock(X)     → both wait forever
\`\`\`

Four conditions must ALL hold (Coffman): mutual exclusion, hold-and-wait, no preemption, circular wait. Break any one and deadlock is impossible. The practical fix: **acquire locks in a globally consistent order** (always X before Y). Second-best: acquire with **timeouts** and back off.

The database version: transaction 1 updates row A then row B; transaction 2 updates B then A → the DB detects the cycle and kills one ("deadlock victim"). Fix is identical: touch rows in a consistent order.

## Beyond locks

- **Atomic operations (CAS)**: CPUs offer compare-and-swap — "set X to new value only if it still equals what I read". Lock-free counters and queues build on this. Remember CAS: it returns as *optimistic concurrency* everywhere.
- **Optimistic concurrency control**: don't lock; read a **version number**, do your work, then write "…WHERE version = 7" (and bump it). If another writer got there first, 0 rows update → retry. Brilliant when conflicts are rare (most web apps); wasteful when hot.
- **Pessimistic locking**: \`SELECT … FOR UPDATE\` — lock the row up front. Right when conflicts are LIKELY (flash-sale inventory, seat booking).
- **Semaphores**: a counter allowing N concurrent holders — i.e., a **rate/concurrency limiter** (DB connection pools are semaphores).
- **Message passing**: avoid shared state entirely — one owner per piece of state, everyone else sends messages (Go channels, actor model). "Don't communicate by sharing memory; share memory by communicating." Redis being single-threaded is this idea: all operations serialize through one owner, so no locks needed.

## Idempotency — the retry-safety property

An operation is **idempotent** if doing it twice equals doing it once (\`SET balance=100\` yes; \`ADD 10\` no). Concurrency + retries means *everything gets delivered twice eventually*. Designing idempotent operations (idempotency keys on payments!) is the single most practical concurrency skill for distributed systems — full topic in Phase 3.

## How this shows up in interviews

- "Two users book the last seat" → say the phrase **"atomic conditional update"**: \`UPDATE seats SET user=? WHERE id=? AND user IS NULL\` — the DB serializes it; check affected rows. Or \`SELECT FOR UPDATE\` for multi-step flows.
- "Design a counter (likes/views) at scale" → contention on one hot row; shard the counter, or batch increments through a queue.
- Any payment/ordering design → idempotency keys, optimistic version checks.
`,
  resources: [
    {
      title: 'Concurrency chapter (locks, condition variables) — OSTEP',
      url: 'https://pages.cs.wisc.edu/~remzi/OSTEP/threads-locks.pdf',
      type: 'doc',
      source: 'Operating Systems: Three Easy Pieces (free)',
    },
    {
      title: 'Optimistic vs Pessimistic locking',
      url: 'https://www.youtube.com/watch?v=D3XhDu--uoI',
      type: 'video',
      source: 'Hussein Nasser (YouTube)',
    },
    {
      title: 'Race conditions and how to spot them',
      url: 'https://deadlockempire.github.io/',
      type: 'interactive',
      source: 'The Deadlock Empire (game — highly recommended)',
    },
    {
      title: 'Concurrency vs Parallelism',
      url: 'https://blog.algomaster.io/p/concurrency-vs-parallelism',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
  ],
  challenges: [
    {
      type: 'quiz',
      id: 'quiz-1',
      title: 'Concurrency check',
      questions: [
        {
          q: 'Two app servers each read `stock = 1`, both decide to sell, both write `stock = 0`. Which single change fixes overselling?',
          options: [
            'Add more app servers',
            'An atomic conditional update: UPDATE items SET stock = stock - 1 WHERE id = ? AND stock > 0 — then check rows affected',
            'Read the stock twice before writing',
            'Cache the stock value in Redis',
          ],
          answer: 1,
          explanation:
            'The database executes the read-check-write as one atomic statement under its own row lock. Reading twice just narrows the race window; caching makes it worse. This exact answer wins ticket/inventory interview questions.',
        },
        {
          q: 'Transactions keep dying with "deadlock detected" when order-service updates users→orders and billing-service updates orders→users. The standard fix?',
          options: [
            'Retry forever',
            'Make every service acquire/update rows in the same global order (e.g. always users before orders)',
            'Use bigger transactions',
            'Remove foreign keys',
          ],
          answer: 1,
          explanation:
            'Deadlock needs a circular wait; a consistent global acquisition order makes cycles impossible. Same rule for mutexes in code and rows in a DB.',
        },
        {
          q: 'Optimistic locking is the better choice when…',
          options: [
            'Conflicts are frequent (flash sale on one item)',
            'Conflicts are rare — occasional retry costs less than locking every read',
            'You never retry',
            'The database has no version column',
          ],
          answer: 1,
          explanation:
            'Optimistic = no lock held, verify version at write, retry on conflict. Cheap when contention is low (most CRUD apps). Under heavy contention on one row, retries stampede — pessimistic SELECT FOR UPDATE (or a queue) wins there.',
        },
        {
          q: 'Why is `counter += 1` unsafe across threads even though it is one line of code?',
          options: [
            'Because Python is slow',
            'It compiles to read→modify→write; two threads can interleave between the read and write, losing updates',
            'Integers are immutable',
            'It is actually safe',
          ],
          answer: 1,
          explanation:
            'Atomicity is defined at the machine level, not the source-code level. Lost-update races come from exactly this interleaving — same story with two servers doing read-then-write against a DB.',
        },
        {
          q: 'A DB connection pool capped at 50 connections is conceptually a…',
          options: ['Mutex', 'Semaphore (N concurrent holders)', 'Spinlock', 'Deadlock'],
          answer: 1,
          explanation:
            'A semaphore admits up to N holders; request 51 waits for a release. Connection pools, rate limiters, and bulkheads are all semaphores wearing different hats.',
        },
        {
          q: 'Your payment API times out; the client retries; the customer is charged twice. The cure is…',
          options: [
            'Never retry payments',
            'Idempotency keys: client sends a unique key per logical payment; server stores the result and returns it for any duplicate key',
            'Longer timeouts',
            'Two-phase commit with the card network',
          ],
          answer: 1,
          explanation:
            'Timeouts are ambiguous (did it happen?), so retries are inevitable — the operation must be safe to repeat. Store key → result; replays return the SAME result without re-charging. Stripe’s API works exactly this way.',
        },
        {
          q: 'A "likes" counter row for a viral post becomes a write hotspot (10k updates/sec on one row). Best relief?',
          options: [
            'A bigger database server',
            'Shard the counter into N sub-counters (sum on read) or buffer increments through a queue and batch-apply',
            'SELECT FOR UPDATE on every like',
            'Turn off likes',
          ],
          answer: 1,
          explanation:
            'One row = one lock = serialized writes, no matter the hardware. Split the contention (sharded counters) or amortize it (batching). Pessimistic locking makes hotspots WORSE.',
        },
      ],
    },
    {
      type: 'lab',
      id: 'lab-1',
      title: 'Create (and fix) a real race condition',
      intro: 'You will lose real updates on your own machine, then fix it. Uses Python 3 (preinstalled).',
      steps: [
        {
          instruction: 'Run a genuine lost-update race: two processes increment a shared file counter 500 times each WITHOUT locking.',
          command: `cd /tmp && echo 0 > counter.txt && python3 -c "
import multiprocessing as mp
def bump(_):
    for _ in range(500):
        n = int(open('/tmp/counter.txt').read())
        open('/tmp/counter.txt','w').write(str(n+1))
with mp.Pool(2) as p: p.map(bump, [0,1])
print('expected 1000, got:', open('/tmp/counter.txt').read())
"`,
          expected: 'A number well below 1000 — every missing count is a lost update from read/write interleaving. Run it again: different result each time (timing-dependent = race).',
        },
        {
          instruction: 'Fix it with a lock and re-run.',
          command: `cd /tmp && echo 0 > counter.txt && python3 -c "
import multiprocessing as mp
lock = mp.Lock()
def bump(_):
    for _ in range(500):
        with lock:
            n = int(open('/tmp/counter.txt').read())
            open('/tmp/counter.txt','w').write(str(n+1))
with mp.Pool(2) as p: p.map(bump, [0,1])
print('expected 1000, got:', open('/tmp/counter.txt').read())
"`,
          expected: 'Exactly 1000, every time. Note it also runs SLOWER — you just felt lock contention.',
        },
        {
          instruction: 'Play at least 2 levels of The Deadlock Empire (browser game where you ARE the scheduler breaking concurrent code).',
          command: 'open https://deadlockempire.github.io/',
          expected: 'You’ll manually interleave threads to trigger races/deadlocks — the best intuition builder there is.',
        },
        {
          instruction: 'Clean up.',
          command: 'rm -f /tmp/counter.txt',
          expected: 'Done.',
        },
      ],
    },
    {
      type: 'design',
      id: 'design-1',
      title: 'Mini-design: seat booking without double-selling',
      prompt: `
Design the write path for a movie-ticket seat map: 200 seats per show, spikes of thousands of users clicking seats simultaneously on hit releases.

1. How do you prevent two users from booking the same seat?
2. Users expect a seat to be "held" for 5 minutes during payment — how?
3. What happens when payment times out ambiguously?
`,
      hints: [
        'Compare atomic conditional update vs SELECT FOR UPDATE vs optimistic version for step 1 — pick per the contention profile.',
        'A hold is state with an expiry. Where does the expiry live?',
        'Ambiguous timeout = the idempotency discussion.',
      ],
      modelAnswer: `
**1. Seat claim = one atomic conditional update.**
\`UPDATE seats SET status='HELD', hold_user=?, hold_expires=now()+'5 min' WHERE seat_id=? AND show_id=? AND (status='FREE' OR hold_expires < now())\` — exactly one concurrent user gets \`rows_affected=1\`; everyone else gets 0 and sees "seat taken". No app-level locking, no race. (SELECT FOR UPDATE also works but holds locks across app round trips; the single-statement version is tighter under spike load.)

**2. Holds with expiry.**
The hold IS a row state with \`hold_expires\`. Expiry is enforced lazily by the claim query above (\`OR hold_expires < now()\`) — no background job strictly required, though a sweeper that flips stale HELD→FREE keeps the seat map UI honest. Show countdown client-side; server time is the truth.

**3. Ambiguous payment timeout.**
Payment request carries an **idempotency key** (bookingId). If the client times out and retries, the payment provider/our service returns the stored outcome for that key instead of charging again. Booking finalization is a state machine: \`HELD → CONFIRMED\` only via \`UPDATE … WHERE status='HELD' AND hold_user=?\`; if the hold expired before payment settled, issue an automatic refund/void (compensating action) — never a double-sold seat.

**Under extreme spikes (interview bonus):** hot shows can put seat-claims through a per-show queue (serialize claims in Redis/Kafka) to protect the DB, and serve the seat MAP from a cache that's allowed to be seconds stale — reads can lie, the claim path never lies.
`,
    },
  ],
}
