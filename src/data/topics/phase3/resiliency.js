export default {
  id: 'resiliency',
  title: 'Resiliency Patterns',
  subtitle: 'Circuit breakers, retries with backoff, bulkheads, backpressure, and graceful degradation',
  days: 3,
  content: `
## Why this matters for system design

In a distributed system, **failure is the steady state, not the exception.** With hundreds of services and thousands of machines, something is always slow, restarting, or dead. The interview question "what happens when a dependency goes down?" separates people who've built for scale from those who haven't. Resiliency patterns are the vocabulary of good answers: they turn "the whole site is down" into "one feature is degraded."

The single most important idea: **a slow dependency is more dangerous than a dead one.** A dead service fails fast and you move on. A slow one holds your threads/connections hostage, they pile up, and the slowness propagates upward until your service falls over too. This is a **cascading failure**, and most of these patterns exist to stop it.

## Timeouts — the non-negotiable baseline

Every network call must have a timeout. No exceptions. A call without a timeout will, on a bad day, block forever, consuming a thread and a connection that never come back.

- Set timeouts based on the **p99 latency** of the dependency, not the average — plus a small margin.
- Budget timeouts **down the call chain**: if your API has a 1s SLA and calls A then B, you cannot give each a 1s timeout. Allocate (e.g. 400ms + 400ms) leaving margin.
- A too-generous timeout is nearly as bad as none — the whole point is to *fail fast* and free resources.

## Retries — necessary, and dangerous

Transient failures (a blip, a brief GC pause, a rebalancing partition) succeed on retry. But naive retries are a classic outage amplifier.

**The rules:**
1. **Only retry idempotent operations** (see the idempotency topic) or operations protected by an idempotency key. Retrying a non-idempotent \`charge card\` can double-charge.
2. **Exponential backoff:** wait 100ms, 200ms, 400ms, 800ms… — don't hammer a struggling service.
3. **Jitter is mandatory.** Without randomness, all clients that failed at the same instant retry at the *same* future instant — a synchronized **thundering herd** that knocks the recovering service back down. Add randomness: \`sleep = random(0, base * 2^attempt)\`.
4. **Cap the attempts** (e.g. 3) and the total time.
5. **Retry budgets:** limit retries to e.g. 10% of total requests. When a dependency is broadly failing, retries just double or triple the load on something already drowning — exactly the wrong time.

\`\`\`
No jitter:   clients retry at  t+1s, t+1s, t+1s  →  spike knocks service over again
With jitter: clients retry at  t+0.3s, t+1.4s, t+0.9s  →  load spread, service recovers
\`\`\`

## Circuit breakers — stop knocking on a dead door

A circuit breaker wraps a dependency and tracks its failure rate. Like an electrical breaker, it "trips" to protect the system.

**Three states:**
- **Closed** (normal): requests flow through. Count failures.
- **Open** (tripped): once failures exceed a threshold, *immediately fail all calls* for a cooldown period — without even trying the network. This gives the dependency room to recover and frees your threads instantly instead of waiting for timeouts.
- **Half-open** (testing): after cooldown, let a *few* trial requests through. Succeed → close (recovered). Fail → open again.

\`\`\`
CLOSED ──failures exceed threshold──▶ OPEN
  ▲                                    │
  │ trials succeed          cooldown elapsed
  │                                    ▼
  └──────────── HALF-OPEN ◀────────────┘
         trials fail → back to OPEN
\`\`\`

\`\`\`mermaid
flowchart LR
  Closed["CLOSED — requests flow, count failures"] -->|"failures ≥ threshold"| Open["OPEN — fail fast, no network call"]
  Open -->|"cooldown elapsed"| Half["HALF-OPEN — a few trial requests"]
  Half -->|"trial succeeds"| Closed
  Half -->|"trial fails"| Open
\`\`\`

The key win: when a dependency is down, you *stop waiting on timeouts entirely*. Fail in microseconds, serve a fallback, keep your own service healthy.

## Bulkheads — isolate so one leak doesn't sink the ship

Named after a ship's watertight compartments: a breach in one doesn't flood the others. In software, you **partition resources** (thread pools, connection pools) per dependency or per tenant.

- If calls to a flaky Recommendations service share one thread pool with everything else, a slow Recommendations can consume *all* threads → your entire service stalls, including healthy paths.
- Give Recommendations its own bounded pool of, say, 20 threads. When it's slow, those 20 threads exhaust — and *only* recommendations degrade. Checkout still works.
- Same idea for isolating a noisy "power user" tenant from starving everyone else.

## Backpressure — say "no" instead of falling over

When work arrives faster than you can process it, you have two choices: buffer it (unbounded queues → OOM crash → total outage) or **push back**. Backpressure is the discipline of signaling "slow down" upstream.

- **Bounded queues:** when full, reject new work fast (HTTP 429/503) rather than accepting unbounded backlog.
- **Load shedding:** under overload, deliberately drop the *least important* work (e.g. drop analytics events, keep checkout) so the system stays up for what matters.
- In streaming systems (Kafka consumers, reactive frameworks), backpressure flows through the pipeline: a slow consumer signals producers to slow down.
- The mantra: **a fast rejection is a feature.** 503 in 5ms lets the client retry elsewhere; a request accepted into a doomed queue helps no one.

## Graceful degradation — partial function beats total failure

When a dependency fails, serve a **degraded but useful** response instead of an error page.

- Recommendations down → show a generic "popular items" list, or hide the widget entirely. The user still shops.
- Personalization service down → serve the non-personalized page from cache.
- Serve **stale cache** rather than nothing ("stale-while-revalidate").
- This is a **product decision as much as an engineering one** — decide in advance which features are essential vs. droppable. In interviews, saying "the feed's ranking service is a soft dependency; if it's down we fall back to reverse-chronological" shows real maturity.

## Disaster recovery — when the whole region goes

Everything above assumes one dependency fails while the rest of the world is fine. **Disaster recovery** is the plan for when it isn't — a whole AZ, region, or data center goes dark. Two numbers frame every DR conversation:

- **RTO (Recovery Time Objective):** how long you're allowed to be down before you're back up.
- **RPO (Recovery Point Objective):** how much recently-acknowledged data you're allowed to lose (the gap between the last replicated write and the disaster).

Four standard postures, in increasing cost and decreasing RTO/RPO:

1. **Backup & restore:** periodic backups, restored onto fresh infrastructure after a disaster. Cheapest; RTO/RPO measured in hours.
2. **Pilot light:** a minimal, always-on copy of the core (usually just the database, replicating continuously) with the rest of the stack defined as infrastructure-as-code but not running. Spin the app tier up on demand. RTO in tens of minutes.
3. **Warm standby:** a scaled-down but live copy of the full stack running in the second region, ready to take traffic at scale within minutes once resized.
4. **Active-active:** both regions serve production traffic all the time; failover is just routing more traffic to the survivor. Lowest RTO/RPO, highest cost and complexity — you're paying the CAP/consistency tax (cap-consistency topic) on every write, all the time, not just during an incident.

The one rule that turns this from theory into practice: **an untested backup or standby is not a backup or standby.** Run periodic failover drills (Netflix's Chaos Monkey philosophy, applied at the region level) — the first time you exercise a DR plan should never be during an actual disaster.

## How this shows up in interviews

- **"What happens when [dependency] goes down?"** — the canonical follow-up on any design. Walk through: timeout → circuit breaker opens → serve fallback/degrade → alert fires. Name the pattern for each.
- **"How do you prevent a cascading failure?"** — timeouts + circuit breakers + bulkheads + backpressure, explained as a system.
- **"Your retries made an outage worse — why?"** — thundering herd / no jitter / no retry budget amplifying load on a struggling service.
- Always distinguish a **hard dependency** (can't function without it — e.g. the auth service) from a **soft dependency** (can degrade — e.g. recommendations). Great designs minimize hard dependencies.
- Mention **chaos engineering** (Netflix's Chaos Monkey) as how teams *verify* resiliency: deliberately kill instances in production to prove the system survives.
`,
  resources: [
    {
      title: 'Making retries safe with idempotent APIs + exponential backoff & jitter',
      url: 'https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/',
      type: 'article',
      source: 'Amazon Builders’ Library (Marc Brooker) — the definitive read',
    },
    {
      title: 'CircuitBreaker + Bulkhead patterns explained',
      url: 'https://martinfowler.com/bliki/CircuitBreaker.html',
      type: 'article',
      source: 'Martin Fowler',
    },
    {
      title: 'Avoiding fallback in distributed systems / cascading failures',
      url: 'https://aws.amazon.com/builders-library/avoiding-fallback-in-distributed-systems/',
      type: 'article',
      source: 'Amazon Builders’ Library',
    },
    {
      title: 'Backpressure explained — the resisted flow of data',
      url: 'https://medium.com/@jayphelps/backpressure-explained-the-flow-of-data-through-software-2350b3e77ce7',
      type: 'article',
      source: 'Jay Phelps',
    },
    {
      title: 'Single Point of Failure (SPOF)',
      url: 'https://algomaster.io/learn/system-design/single-point-of-failure-spof',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
    {
      title: 'Availability',
      url: 'https://algomaster.io/learn/system-design/availability',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
    {
      title: 'What is Fault Tolerance?',
      url: 'https://www.cockroachlabs.com/blog/what-is-fault-tolerance/',
      type: 'article',
      source: 'Cockroach Labs',
    },
    {
      title: 'What is Disaster Recovery?',
      url: 'https://cloud.google.com/learn/what-is-disaster-recovery',
      type: 'article',
      source: 'Google Cloud',
    },
  ],
  challenges: [
    {
      type: 'quiz',
      id: 'quiz-1',
      title: 'Resiliency patterns check',
      questions: [
        {
          q: 'Why is a SLOW dependency often more dangerous than a completely DEAD one?',
          options: [
            'Slow dependencies use more CPU',
            'A dead dependency fails fast and frees resources; a slow one holds threads/connections hostage until they pile up and your own service exhausts them — a cascading failure',
            'They are equally dangerous',
            'Slow dependencies corrupt data',
          ],
          answer: 1,
          explanation:
            'This is the central intuition of the whole topic. Death is clean — you get an immediate error and move on. Slowness silently ties up your finite threads/connections; the backlog grows and the slowness climbs the call stack until you fall over too. Timeouts and circuit breakers exist to convert "slow" into "fast failure."',
        },
        {
          q: 'A retry storm made an outage worse. The most likely missing ingredient was…',
          options: [
            'More retries',
            'Jitter (and a retry budget) — without randomness, all failed clients retry at the same instant, creating a synchronized thundering herd that re-crushes the recovering service',
            'A bigger timeout',
            'A faster database',
          ],
          answer: 1,
          explanation:
            'Exponential backoff alone still synchronizes clients that failed together. Jitter spreads retries across time; a retry budget caps total retry load so you don’t multiply traffic against something already drowning.',
        },
        {
          q: 'A circuit breaker is in the OPEN state. What happens to a new request?',
          options: [
            'It’s sent to the dependency and the result is cached',
            'It fails immediately (or returns a fallback) WITHOUT attempting the network call, freeing your resources and giving the dependency room to recover',
            'It waits in a queue until the breaker closes',
            'It retries three times then fails',
          ],
          answer: 1,
          explanation:
            'Open = stop knocking. You fail in microseconds instead of waiting on timeouts, which is exactly what keeps your own service healthy while the dependency recovers. After a cooldown it goes half-open to test with a few trial requests.',
        },
        {
          q: 'The Recommendations service (flaky) and Checkout share one thread pool. Recommendations gets slow. What does the BULKHEAD pattern prevent?',
          options: [
            'It prevents Recommendations from ever being slow',
            'It gives Recommendations its own bounded thread pool, so when it stalls only recommendations degrade — Checkout keeps working instead of the whole service freezing',
            'It retries Recommendations faster',
            'It caches recommendation results',
          ],
          answer: 1,
          explanation:
            'Without isolation, slow Recommendations calls consume every shared thread and stall healthy paths too. Bulkheads (separate pools per dependency/tenant) contain the damage to one compartment — like watertight sections of a ship.',
        },
        {
          q: 'Your service is receiving requests faster than it can process them. The resilient response is…',
          options: [
            'Buffer everything in an unbounded in-memory queue',
            'Apply backpressure: use bounded queues and reject excess fast (429/503) or shed low-priority load, so the system stays up for essential work instead of OOM-crashing',
            'Spin up threads without limit',
            'Silently drop random requests with no status code',
          ],
          answer: 1,
          explanation:
            'Unbounded buffering just delays a total crash (OOM). A fast rejection is a feature — it lets clients back off/retry elsewhere and keeps the system alive. Load shedding drops the least-important work first.',
        },
        {
          q: 'In a design, you call a dependency a "soft dependency." What does that imply?',
          options: [
            'It uses a slow protocol',
            'The system can still function in a degraded-but-useful way if it fails (e.g. recommendations → generic popular items), unlike a hard dependency the system cannot work without',
            'It’s written in a scripting language',
            'It’s optional to deploy',
          ],
          answer: 1,
          explanation:
            'Classifying dependencies as hard vs soft, and designing graceful degradation for the soft ones, is a hallmark of a mature answer. "Ranking is a soft dependency; if it’s down we fall back to reverse-chronological" is exactly the kind of statement interviewers want to hear.',
        },
      ],
    },
    {
      type: 'lab',
      id: 'lab-1',
      title: 'Build a circuit breaker and see backoff+jitter in action',
      intro: 'Simulate a failing dependency and watch each pattern change the outcome — all in local Python, no services needed.',
      steps: [
        {
          instruction: 'See why NO jitter creates a thundering herd: 100 clients fail together and retry at the same instant.',
          command: `python3 -c "
import random
base = 0.1
# no jitter: everyone computes the same backoff for attempt 1
no_jitter = [base * 2**1 for _ in range(100)]
# full jitter: random(0, base * 2^attempt)
jitter = [random.uniform(0, base * 2**1) for _ in range(100)]
def spread(times, label):
    buckets = {}
    for t in times:
        b = round(t, 1)
        buckets[b] = buckets.get(b, 0) + 1
    print(label, dict(sorted(buckets.items())))
spread(no_jitter, 'no jitter  ->')
spread(jitter,    'with jitter->')"`,
          expected: 'No jitter: all 100 land in ONE time bucket (a spike). With jitter: spread across many buckets — the recovering service sees smooth load, not a wall.',
        },
        {
          instruction: 'Implement a circuit breaker and drive it through closed → open → half-open → closed.',
          command: `python3 -c "
import time
class CircuitBreaker:
    def __init__(s, threshold=3, cooldown=2):
        s.threshold, s.cooldown = threshold, cooldown
        s.failures, s.state, s.opened_at = 0, 'CLOSED', 0
    def call(s, fn):
        if s.state == 'OPEN':
            if time.time() - s.opened_at >= s.cooldown:
                s.state = 'HALF_OPEN'; print('  cooldown elapsed -> HALF_OPEN')
            else:
                return 'FAST-FAIL (open, no network call)'
        try:
            r = fn()
            if s.state == 'HALF_OPEN': s.state='CLOSED'; s.failures=0; print('  trial ok -> CLOSED')
            return r
        except Exception as e:
            s.failures += 1
            if s.failures >= s.threshold and s.state=='CLOSED':
                s.state='OPEN'; s.opened_at=time.time(); print('  threshold hit -> OPEN')
            elif s.state=='HALF_OPEN':
                s.state='OPEN'; s.opened_at=time.time(); print('  trial failed -> OPEN')
            return f'ERROR: {e}'
cb = CircuitBreaker()
dead = lambda: (_ for _ in ()).throw(Exception('dependency down'))
alive = lambda: 'OK'
for i in range(4): print(i, cb.call(dead))       # trips open after 3
print('during OPEN:', cb.call(dead))             # fast-fail, no call
time.sleep(2.1)
print('after cooldown:', cb.call(alive))         # half-open trial succeeds -> closed
print('final state:', cb.state)"`,
          expected: 'Failures 1-3 hit the network, the 3rd trips OPEN. During OPEN you see FAST-FAIL with no call. After cooldown it goes HALF_OPEN, the trial succeeds, and it returns to CLOSED.',
        },
        {
          instruction: 'Demonstrate a bounded queue applying backpressure (rejecting excess) vs an unbounded one growing without limit.',
          command: `python3 -c "
from collections import deque
CAP = 5
bounded = deque(maxlen=None)  # we enforce manually to report rejections
q, rejected = [], 0
for req in range(12):        # 12 arrive, we can only hold 5
    if len(q) < CAP:
        q.append(req)
    else:
        rejected += 1
        print(f'req {req}: 503 fast-reject (queue full) <- backpressure')
print(f'accepted={len(q)} rejected={rejected}')
print('unbounded alternative would hold all 12+ and keep growing -> eventual OOM crash = TOTAL outage')"`,
          expected: '5 accepted, 7 fast-rejected with 503s. The lesson: bounded + reject beats unbounded + crash. A fast rejection keeps the system alive.',
        },
      ],
    },
    {
      type: 'design',
      id: 'design-1',
      title: 'Design exercise: make a checkout flow resilient',
      prompt: `
An e-commerce checkout endpoint, on each request, calls four downstream services:
1. **Inventory** (is the item in stock?) — must be correct.
2. **Payments** (charge the card) — must not double-charge.
3. **Recommendations** ("customers also bought") — shown on the confirmation page.
4. **Email/notification** (send receipt).

One evening, Recommendations gets very slow (p99 climbs to 8 seconds) and Payments has intermittent transient errors. Checkout latency explodes and the whole endpoint starts timing out for everyone.

Diagnose what's happening and redesign the endpoint so a slow/failing dependency can't take down checkout. Specify concretely which resiliency pattern you apply to each of the four calls and why. Classify each as a hard or soft dependency.
`,
      hints: [
        'Why does slow Recommendations affect checkout at all? Think shared threads and missing timeouts.',
        'Payments has transient errors AND must not double-charge — what two patterns combine here?',
        'Which of these four does the purchase actually NEED to succeed? Handle the others differently.',
      ],
      modelAnswer: `
**Diagnosis:** Recommendations is a *soft* dependency being treated as a *hard, inline, synchronous* one with (apparently) no timeout and a shared thread pool. Its 8s p99 ties up request threads; the backlog grows and every checkout — even ones that don’t care about recommendations — stalls and times out. This is a textbook cascading failure caused by coupling a non-essential slow call into the critical path.

**Redesign, per dependency:**

**Inventory — HARD dependency.** Purchase can’t proceed without it. Apply a **tight timeout** (say 300ms, based on its p99) and a **circuit breaker**. If the breaker is open / it times out, *fail the checkout fast* with a clear "try again" — better than hanging. No fallback that would let us sell nonexistent stock. Optionally a very short retry (1x, with jitter) for a transient blip since the read is idempotent.

**Payments — HARD, and the dangerous one.** Combine two patterns: (a) **idempotency key** per checkout attempt so a retry can’t double-charge, and (b) **retry with exponential backoff + jitter**, capped at ~2 attempts, wrapped in a **circuit breaker**. Because the call is now idempotent, retrying transient errors is safe — this directly fixes the "intermittent Payments errors." Timeout budgeted so retries still fit the overall SLA.

**Recommendations — SOFT dependency; the root cause.** Two moves: **bulkhead** it into its own small thread pool so it can *never* starve checkout threads again, and give it an aggressive **timeout (~150ms) + circuit breaker**. On timeout/open, **degrade gracefully**: render a generic "popular items" list (or omit the widget). Even better, **move it off the critical path** — the confirmation page can lazy-load recommendations via a separate async request after the order is confirmed. The purchase must never wait on it.

**Email/receipt — SOFT, and should be ASYNCHRONOUS.** Don’t call it inline at all. On successful order, **publish an event to a queue** (outbox pattern) and let a worker send the receipt with its own retries. Checkout returns success the instant the order is durably recorded; a slow mail provider can’t affect checkout latency, and the queue gives us at-least-once delivery.

**System-level additions:**
- **Timeout budget** across the whole endpoint (e.g. 1s SLA) so the sum of downstream timeouts + retries fits, and we always fail fast rather than hang.
- **Backpressure / load shedding** at the front: bounded concurrency, return 503 under overload so we protect the healthy majority.
- **Retry budget** capping retries to ~10% of traffic so a broad Payments outage can’t be amplified by our own retries.

**One-line summary:** the fix is to stop treating a soft, slow dependency (recommendations) as an inline hard one — isolate it with a bulkhead + timeout + degradation, make the truly-hard calls (inventory, payments) fail-fast via timeouts + circuit breakers with safe idempotent retries for payments, and push the receipt fully async through a queue. Now no single downstream can take checkout down.
`,
    },
  ],
}
