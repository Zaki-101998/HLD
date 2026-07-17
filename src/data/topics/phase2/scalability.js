export default {
  id: 'scalability',
  title: 'Scalability Fundamentals',
  subtitle: 'Vertical vs horizontal scaling, statelessness, and reading a system’s growth story',
  days: 2,
  content: `
## Why this matters for system design

"How does this scale?" is the interview. Everything in Phase 2 is a tool for one story: a system that works for 1,000 users must keep working for 100 million. This topic gives you the story's skeleton — you'll spend the rest of the phase filling in organs.

## Vertical vs horizontal scaling

**Vertical (scale UP):** a bigger machine — more cores, more RAM.
- ✅ Zero architecture changes; no distributed-systems problems.
- ❌ Price grows super-linearly; hard ceiling (~few hundred cores); still ONE machine = one failure domain, and upgrades mean downtime.

**Horizontal (scale OUT):** more machines sharing the load.
- ✅ Near-linear cost; no practical ceiling; failures are partial (1 of 50 nodes dying is a Tuesday).
- ❌ You inherit distributed problems: routing, consistency, partial failure, deployment complexity.

> **Nuanced take interviewers reward:** vertical FIRST while you can. A single beefy Postgres box happily serves startups to millions of users. Go horizontal when you must — for the *stateless* tier it's nearly free, so do that early; for the *data* tier it's expensive (sharding), so delay it with replication + caching. "Scale the easy tier out, the hard tier up — until you can't."

## Statelessness — the key that unlocks horizontal scaling

A **stateless** service keeps nothing between requests that lives only on that server. Any server can handle any request → the load balancer can spray traffic freely → scaling = adding servers, deploys = rolling restarts, failures = retry elsewhere. HTTP was *designed* stateless for exactly this (Phase 0).

Where does the state GO? It gets **externalized**:

| In-server state (bad) | Externalized (good) |
|---|---|
| In-memory session ("user logged in") | Signed token (JWT) or session store (Redis) |
| Uploaded files on local disk | Object storage (S3) |
| Local caches of DB rows | Shared cache tier |
| "Step 2 of wizard" in memory | DB row / client-side state |

The app tier becomes disposable ("cattle, not pets"); all the hard state problems concentrate in dedicated stateful systems (DBs, caches, queues) — which is where the rest of Phase 2 lives.

**Sticky sessions** (LB pins each user to one server) let you keep in-memory state, but: server dies → those users' state dies; load skews; deploys hurt. Acceptable for WebSocket connections (unavoidable); a smell for session data.

## The canonical scaling journey

Tell this as a story — it's the backbone of every "design X" answer:

\`\`\`
1) 1 server: app + DB together.               (fine!)
2) Split app and DB onto two machines.
3) Load balancer + N stateless app servers.    ← horizontal app tier
4) DB read replicas; cache tier (Redis).       ← reads scale
5) CDN for static assets; object storage.
6) Async: queues + workers for slow work.
7) DB sharding when writes/data outgrow one primary.  ← the expensive step
8) Multi-region for latency + disaster recovery.
\`\`\`

The same journey as a growing architecture diagram — each arrow is one of the numbered steps above:

\`\`\`mermaid
flowchart TD
  A["1 box: app + DB"] --> B["App and DB split onto two machines"]
  B --> C["Load balancer + N stateless app servers"]
  C --> D["Read replicas + cache tier"]
  D --> E["CDN + object storage for static assets"]
  E --> F["Queues + async workers"]
  F --> G["DB sharding — the expensive step"]
  G --> H["Multi-region for latency + DR"]
\`\`\`

Each numbered step is a topic ahead. Notice writes to the database survive as the LAST bottleneck — hence "the database is always the hard part."

## Load: the numbers that define "scale"

- **QPS/RPS** — requests per second (peak matters, not average; assume peak ≈ 2–5× average).
- **Read:write ratio** — most consumer apps are 10:1 to 1000:1 read-heavy; the ratio dictates whether replicas+caches suffice or sharding looms.
- **P50/P95/P99 latency** — averages lie; tail latency is what users feel. One slow dependency in a fan-out dominates: if a page calls 10 services, P99 of the page ≈ hitting at least one service's P99 almost always.
- **Concurrent users / connections** — sizing gateways (Phase 1's Little's Law).

## Bottleneck thinking

A system scales until its **narrowest component** saturates; scaling anything else changes nothing. The discipline: find the bottleneck (measure!), widen it, find the next. In interviews, after drawing a design, walk it: "at 10× traffic, the first thing to fall over is ___" — proactively naming your bottleneck is a strong senior signal.

## How this shows up in interviews

- Structure your whole answer as the canonical journey, sized to the given scale (don't shard for 100 QPS!).
- Say "the app tier is stateless — sessions in Redis, files in S3 — so it scales by adding instances behind the LB."
- Volunteer the current bottleneck and the next scaling step after your design.
`,
  resources: [
    {
      title: 'Horizontal vs Vertical scaling',
      url: 'https://www.youtube.com/watch?v=dvRFHG2-uYs',
      type: 'video',
      source: 'ByteByteGo (YouTube)',
    },
    {
      title: 'Scalability lecture (the classic Harvard CS75 talk)',
      url: 'https://www.youtube.com/watch?v=-W9F__D3oY4',
      type: 'video',
      source: 'David Malan, Harvard CS75',
    },
    {
      title: 'The System Design Primer — scalability section',
      url: 'https://github.com/donnemartin/system-design-primer#scalability',
      type: 'doc',
      source: 'GitHub (donnemartin)',
    },
    {
      title: 'Scalability',
      url: 'https://algomaster.io/learn/system-design/scalability',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
    {
      title: 'Vertical vs Horizontal Scaling',
      url: 'https://algomaster.io/learn/system-design/vertical-vs-horizontal-scaling',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
    {
      title: 'Stateful vs Stateless Architecture',
      url: 'https://blog.algomaster.io/p/stateful-vs-stateless-architecture',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
    {
      title: 'System Design: Top 15 Tradeoffs',
      url: 'https://blog.algomaster.io/p/system-design-top-15-trade-offs',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
    {
      title: 'System Design was HARD until I Learned these 30 Concepts',
      url: 'https://blog.algomaster.io/p/30-system-design-concepts',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
  ],
  challenges: [
    {
      type: 'quiz',
      id: 'quiz-1',
      title: 'Scalability fundamentals check',
      questions: [
        {
          q: 'Your stateless API tier is at 90% CPU. The cheapest correct fix is…',
          options: [
            'Shard the database',
            'Add more API instances behind the load balancer — stateless tiers scale horizontally almost for free',
            'Rewrite in a faster language',
            'Add sticky sessions',
          ],
          answer: 1,
          explanation:
            'Statelessness means any instance handles any request, so capacity = instance count. This is why you keep the app tier stateless in the first place. (Sharding is for when the DATA tier is the bottleneck.)',
        },
        {
          q: 'Which piece of state prevents horizontal scaling if kept on the app server, and where should it move?',
          options: [
            'The application code — move it to Git',
            'User sessions in server memory — move to Redis or signed tokens (JWT)',
            'Environment variables — move to disk',
            'CPU registers — move to RAM',
          ],
          answer: 1,
          explanation:
            'In-memory sessions pin users to servers (or need sticky sessions, with all their failure modes). Externalize to a session store or self-contained signed tokens and the tier becomes disposable.',
        },
        {
          q: 'A startup with 200 QPS and a 100 GB database asks if they should shard. Best advice?',
          options: [
            'Yes, shard immediately — it’s inevitable',
            'No — a single primary with read replicas and a cache handles this for years; sharding’s complexity isn’t justified at this scale',
            'Yes, but only into two shards',
            'Only if they use NoSQL',
          ],
          answer: 1,
          explanation:
            'One healthy Postgres box handles thousands of QPS and TBs of data. Sharding costs you cross-shard queries, transactions, and rebalancing forever. Right-sizing to the given scale is a core interview skill — over-engineering is a real negative signal.',
        },
        {
          q: 'Your page fans out to 10 internal services, each with P99 = 200 ms (P50 = 20 ms). What’s roughly the chance a page load hits at least one 200 ms+ response?',
          options: ['1%', '5%', '~10%', 'Effectively ~10% of ALL page loads (1 − 0.99¹⁰)'],
          answer: 3,
          explanation:
            '1 − (0.99)^10 ≈ 9.6%. Tail latency compounds under fan-out — with 100 calls it’s ~63%. This is why tail latency (not averages) drives architecture: hedged requests, timeouts, fewer serial hops.',
        },
        {
          q: 'When is vertical scaling the RIGHT answer?',
          options: [
            'Never — horizontal is always better',
            'For the stateful/data tier early on: a bigger DB box buys years without distributed complexity, while the stateless tier scales out',
            'Only for load balancers',
            'When you need fault tolerance',
          ],
          answer: 1,
          explanation:
            'Scaling the data tier horizontally (sharding) is the expensive, complexity-laden step. Buying RAM/cores for the DB postpones it cheaply. Note what vertical scaling never buys you: availability — one box is one failure domain.',
        },
        {
          q: 'Peak-to-average: your analytics show 5M requests/day average. What peak QPS should you design for?',
          options: [
            '~58 QPS (5M / 86,400)',
            '~120–300 QPS — average ≈ 58, and peak traffic is typically 2–5× average',
            '5,000 QPS to be safe',
            'Exactly 58 QPS',
          ],
          answer: 1,
          explanation:
            '5e6/86400 ≈ 58 average, but traffic is bursty (evenings, launches, virality). Sizing to average = falling over at peak; stating the 2–5× peak multiplier is standard estimation hygiene.',
        },
      ],
    },
    {
      type: 'design',
      id: 'design-1',
      title: 'Design exercise: take a monolith from 1k to 1M users',
      prompt: `
A food-delivery startup runs ONE server: a Django app + Postgres + uploaded restaurant photos on local disk + in-memory sessions. It works great at 1k users. They just got featured on national TV.

Walk the canonical scaling journey for them: list the steps IN ORDER, and for each step name what breaks without it. Stop at the right depth for ~1M users (don't gold-plate).
`,
      hints: [
        'What breaks FIRST when the LB adds a second app server? (Two things on that box are unshareable.)',
        'Read:write ratio for a browse-heavy food app is very read-skewed.',
        'Does 1M users justify sharding? Check with rough QPS math.',
      ],
      modelAnswer: `
**Step 0 — measure:** ~1M users, maybe 100k DAU × 20 requests/day ≈ 2M req/day ≈ 25 QPS average, ~100 QPS peak. Modest! This calibrates everything below.

**1. Split DB onto its own machine.** Otherwise app and DB compete for RAM/CPU and you can't scale either independently.

**2. Externalize the unshareable state** — the step people forget:
   - Sessions: in-memory → Redis (or JWTs). Without this, the LB in step 3 logs users out randomly.
   - Photos: local disk → object storage (S3) + serve via CDN. Without this, images 404 on every server but one.

**3. Load balancer + 2–3 stateless app instances.** Now the app tier scales linearly and deploys are zero-downtime. (Also: the LB health-checks out a bad instance — availability, not just capacity.)

**4. Cache + read replicas.** Browsing menus is ~100:1 read-heavy. Cache restaurant/menu pages in Redis (huge hit rate — menus change rarely); add one Postgres read replica for reporting and read spill. The single primary easily absorbs remaining writes at this scale.

**5. Async workers + queue.** Order-confirmation emails, receipt PDFs, notification fan-out move off the request path (a queue + small worker fleet). Keeps p99 flat during spikes.

**Deliberately NOT doing:** sharding (writes are ~a few QPS — years of headroom), multi-region (single country), microservices (team of 8). Saying *why not* is worth as much as the steps themselves.

**Bottleneck after all this:** the Postgres primary's write path — the correct "what breaks at 10×" answer, with sharding named as the eventual (not current) response.
`,
    },
    {
      type: 'estimation',
      id: 'est-1',
      title: 'Estimation drill: from DAU to fleet size',
      problem: `
A social app has **20M DAU**. Each active user makes ~50 API requests/day. Assume peak = 3× average, each request needs ~10 ms of app-server CPU, and one 8-core server yields ~6 cores of usable capacity.

1. Average and peak QPS?
2. CPU-seconds per second needed at peak?
3. App servers needed at peak (with the 6-usable-core assumption)?
4. Add 40% headroom — final fleet size?
`,
      hints: [
        '1 day ≈ 86,400 s; round to 1e5 for speed.',
        'QPS × 0.01 s = cores needed.',
        'Divide by 6 usable cores/server.',
      ],
      solution: `
**1.** 20e6 × 50 = 1e9 req/day ≈ 1e9 / 1e5 = **10,000 QPS average → 30,000 QPS peak** (3×).

**2.** 30,000 × 0.01 s = **300 CPU-seconds/second** = 300 cores' worth of work.

**3.** 300 / 6 usable cores = **50 servers** at peak.

**4.** 50 × 1.4 = **~70 app servers**.

**Sanity notes worth saying aloud:** 10 ms of pure CPU per request is on the heavy side (typical is 1–10 ms; the rest is I/O wait, which doesn't burn cores) — so 70 is conservative. And this sizes only the STATELESS tier; the DB/cache tiers size by data & IOPS, not by this math. Total time to produce this in an interview: ~60 seconds.
`,
    },
  ],
}
