export default {
  id: 'design-rate-limiter',
  title: 'Design a Distributed Rate Limiter',
  subtitle: 'Protect services at scale — algorithm choice, where it lives, and the distributed-counter problem',
  days: 2,
  content: `
## The problem

Design a rate limiter that caps how many requests a client may make in a window (e.g. "100 requests/minute per API key"). It protects services from abuse, accidental floods, and cost blowups, and enforces fairness across tenants. This problem builds directly on the Phase 2 rate-limiting algorithms — here we make it **distributed** and **production-shaped**, which is where the interesting design questions live.

## Step 1 — Requirements

**Functional:** given an identifier (user ID / API key / IP), allow or reject a request based on a configurable limit; return a clear signal on rejection (**HTTP 429 Too Many Requests**, ideally with a \`Retry-After\` header). Support multiple rules (per-user, per-endpoint, per-IP).

**Non-functional:** **very low latency** — it sits in the hot path of *every* request, so it must add < ~1ms; **highly available** — if the limiter is down, decide fail-open (allow) vs fail-closed (block); **accurate enough** (occasional small over-count is usually acceptable); **scalable** to millions of clients across many servers.

## Step 2 — Estimation

If the API serves **1M requests/sec**, the limiter runs 1M times/sec. It needs a counter per active client; millions of clients × a few bytes each → easily fits in memory (a few GB) → **Redis is the natural home**. The key insight: the limiter's own datastore must handle the *full request rate*, so it must be in-memory and horizontally scalable.

## Step 3 — Where does the rate limiter live?

- **In the API Gateway** (or a dedicated middleware) — the common answer. It's the single front door (Phase 3), so limiting there protects everything behind it and keeps the logic out of every service.
- **As a sidecar / library** in each service for service-specific limits.
- Rarely on the client (untrusted — clients can lie), though client-side limiting is a nice *complement* to reduce load.

## Step 4 — The algorithms (choose per need)

You know these from Phase 2; the interview wants you to pick and justify:

- **Token bucket** — a bucket of N tokens refills at a fixed rate; each request takes one; empty → reject. **Allows bursts** up to bucket size, smooth average. Most popular; used by Stripe, AWS. Great default.
- **Leaky bucket** — requests enter a fixed-size queue drained at a constant rate. **Smooths output** to a steady rate (no bursts), but can add latency; good when downstream needs a steady flow.
- **Fixed window counter** — count requests per fixed clock window (e.g. per minute), reset each window. Simple and memory-cheap, but has a **boundary burst problem**: a client can send N at 0:59 and N at 1:00 → 2N in two seconds.
- **Sliding window log** — store a timestamp per request, count those within the trailing window. **Perfectly accurate**, but memory-heavy (a timestamp per request).
- **Sliding window counter** — a hybrid: weight the current + previous fixed windows by overlap. **Fixes the boundary burst with far less memory** than a log. The pragmatic favorite for accuracy at scale.

**Interview move:** recommend **token bucket** for general API limiting (bursts + simplicity) or **sliding window counter** when smooth accuracy matters, and be able to say *why*.

## Step 5 — High-level design

\`\`\`
 client ─▶ API Gateway ──rate-limit check──▶ [Redis: counter for key]
                │                                    │
           allow ▼ 429 reject                   INCR + TTL
           forward to service
\`\`\`
On each request the gateway derives the client key, runs an atomic check-and-update against Redis, and allows or returns 429. Rules/config live in a store the gateway caches locally.

## Step 6 — Deep dive: making it distributed (the crux)

The hard part: you have **many gateway/limiter nodes**, but the limit is *global* ("100/min per key" across all of them). Options:

**1) Centralized counter in Redis (the standard answer).** All nodes read/write the same Redis. Correct, but two subtleties:
- **Race conditions:** naive \`GET count; if < limit INCR\` has a check-then-act race — two nodes both read 99, both allow, count hits 101. **Fix:** make it atomic — Redis \`INCR\` returns the new value in one op, or use a **Lua script** (atomic on the Redis server) to do the whole token-bucket/sliding-window logic in one round trip. This is the key detail to mention.
- **Latency & load:** every request now hits Redis. Mitigate with a Redis cluster (shard keys across nodes) and pipelining; the limiter key naturally shards by client id.

**2) Local counters + sync (lower latency, approximate).** Each node keeps a local count and periodically reconciles with a central store (or divides the global limit across N nodes: 100/min ÷ 10 nodes = 10 each). Faster (no per-request network hop) but **approximate** — a client hitting one hot node could exceed its share, or the global limit is enforced loosely. Good when a little inaccuracy is fine and latency is paramount.

**3) The trade-off, stated:** perfectly-accurate global limiting requires central coordination (a network hop per request); perfectly-fast local limiting is approximate. Most production systems accept **slight over-limiting** for speed and availability — being off by a few percent rarely matters, and it buys lower latency and survives Redis hiccups.

**Failure handling:** if Redis is unreachable, **fail-open** (allow traffic — availability of the real service usually beats strict limiting) is the common default, but note fail-closed is right when the limiter protects something fragile/expensive (e.g. a payment endpoint). Always a deliberate choice.

**Response details:** return **429** with **\`Retry-After\`** and rate-limit headers (\`X-RateLimit-Remaining\`, \`-Limit\`, \`-Reset\`) so well-behaved clients back off — this reduces retries and is a mark of a polished API.

## Step 7 — Wrap-up

A rate limiter at the API gateway, backed by an in-memory store (Redis) that must absorb the full request rate. The algorithm is a per-requirement choice (token bucket for bursty APIs; sliding window counter for smooth accuracy). The core challenge is **distribution**: a centralized Redis counter updated **atomically** (INCR / Lua script) gives global correctness at the cost of a per-request hop, while local counters give speed at the cost of accuracy — and production usually tolerates slight over-limiting for latency and availability. Decide fail-open vs fail-closed explicitly.

## How this shows up in interviews

- The interviewer will push on **the distributed counter race condition** — you *must* mention atomicity (Redis INCR / Lua script). Missing this is the common failure.
- Expect **"which algorithm and why?"** — have token bucket (bursts) vs sliding window counter (accuracy) contrasted, plus the fixed-window boundary-burst flaw.
- Expect **"what if Redis goes down?"** — fail-open vs fail-closed as a conscious trade-off.
- Bonus signals: 429 + \`Retry-After\` headers, where it lives (gateway), and the accuracy-vs-latency trade-off of local vs centralized counters.
`,
  resources: [
    {
      title: 'Design a Rate Limiter — algorithms & distributed design',
      url: 'https://www.youtube.com/watch?v=FU4WlwfS3G0',
      type: 'video',
      source: 'ByteByteGo',
    },
    {
      title: 'How we built rate limiting at scale (Stripe engineering)',
      url: 'https://stripe.com/blog/rate-limiters',
      type: 'article',
      source: 'Stripe Engineering',
    },
    {
      title: 'System Design: Distributed Rate Limiter',
      url: 'https://www.hellointerview.com/learn/system-design/problem-breakdowns/rate-limiter',
      type: 'article',
      source: 'Hello Interview',
    },
  ],
  challenges: [
    {
      type: 'quiz',
      id: 'quiz-1',
      title: 'Rate limiter check',
      questions: [
        {
          q: 'Two rate-limiter nodes both run "GET count (reads 99); if < 100 then INCR; allow". What goes wrong and how do you fix it?',
          options: [
            'Nothing — this is correct',
            'A check-then-act race: both read 99, both allow, count becomes 101 (over the limit). Fix by making the read-and-increment ATOMIC — Redis INCR returns the new value in one op, or a Lua script runs the whole logic atomically server-side',
            'The counter overflows',
            'Redis is too slow to matter',
          ],
          answer: 1,
          explanation:
            'This race is THE detail interviewers probe. Separate GET then INCR lets concurrent nodes both pass the check. Atomic INCR (or an atomic Lua script implementing token-bucket/sliding-window) closes the window. If you miss this, the design is subtly broken.',
        },
        {
          q: 'Which algorithm allows short bursts up to a cap while limiting the average rate, and is the popular general-purpose default?',
          options: [
            'Fixed window counter',
            'Token bucket — tokens refill at a steady rate and a full bucket permits a burst; simple and burst-friendly (used by Stripe, AWS)',
            'Sliding window log',
            'Leaky bucket',
          ],
          answer: 1,
          explanation:
            'Token bucket permits bursts up to bucket size while enforcing the long-run average via the refill rate. Leaky bucket instead smooths output to a constant rate (no bursts). Token bucket is the common default for APIs.',
        },
        {
          q: 'What is the "boundary burst" flaw of the fixed-window counter, and which algorithm pragmatically fixes it?',
          options: [
            'It uses too much memory; token bucket fixes it',
            'A client can send the full limit at the end of one window and again at the start of the next (2× the limit across the boundary in a short span); the sliding window COUNTER (weighting current+previous windows) fixes it with little memory',
            'It rejects all requests; leaky bucket fixes it',
            'There is no flaw',
          ],
          answer: 1,
          explanation:
            'Fixed windows reset abruptly, so straddling the boundary doubles the effective rate. A sliding window log is accurate but stores a timestamp per request (memory-heavy); the sliding window counter approximates it by weighting the previous window’s count by overlap — accurate enough, cheap.',
        },
        {
          q: 'Your central Redis for rate limiting becomes unreachable. What is the typical default, and when would you choose the opposite?',
          options: [
            'Always fail-closed (block everything)',
            'Fail-open (allow traffic) is the common default — availability of the real service usually beats strict limiting; but fail-closed is right when the limiter guards something fragile or expensive (e.g. a payment or costly compute endpoint)',
            'Crash the gateway',
            'Retry Redis forever, blocking the request',
          ],
          answer: 1,
          explanation:
            'This must be a conscious decision. Failing open keeps your product working when the limiter (a protective side-system) hiccups. Failing closed protects a downstream that would be damaged by a flood. State the trade-off; don’t leave it undefined.',
        },
      ],
    },
    {
      type: 'design',
      id: 'design-1',
      title: 'Design exercise: distributed rate limiter for a public API',
      prompt: `
Design a rate limiter for a public API served by a fleet of gateway nodes behind a load balancer. Rules like "1000 requests/hour per API key" and "50 requests/minute per IP" must be enforced GLOBALLY across all nodes, at ~1M requests/sec total, adding under ~1ms of latency.

Cover: where the limiter runs, which algorithm(s) you choose and why, the data store, and — as your deep dive — how you enforce a GLOBAL limit across many nodes (address the race condition explicitly). Then handle: what happens if the data store goes down, and how you respond to a throttled client. Discuss the accuracy-vs-latency trade-off of your approach.
`,
      hints: [
        'The limiter runs on every request — where does it live and what store can handle 1M ops/s?',
        'The multi-node global-limit problem has a race condition. Name the atomic fix.',
        'Centralized counter = accurate but a network hop each request; local counters = fast but approximate. Pick and justify.',
      ],
      modelAnswer: `
**Where it lives:** in the **API gateway** (single front door), so all backend services are protected and the logic lives in one place. Config/rules stored centrally, cached locally on each gateway node.

**Algorithm:** **token bucket** per key for the general API limit (allows reasonable bursts, simple), or **sliding window counter** if the interviewer wants smoother accuracy and no boundary bursts. Justify by the requirement; contrast with fixed-window’s boundary flaw and sliding-log’s memory cost.

**Data store:** an **in-memory store (Redis), clustered/sharded by key**, because the limiter runs at the full 1M req/s and needs sub-ms lookups. Counters are tiny (a few bytes/key), so millions of clients fit in a few GB.

**Deep dive — global enforcement across nodes:**
- All gateway nodes update a **shared counter in Redis** keyed by (client, window). The naive \`GET; if<limit INCR\` has a **check-then-act race** (two nodes read 99, both allow → 101). **Fix: atomicity** — use Redis \`INCR\` (returns the new count in one atomic op) with a TTL for the window, or a **Lua script** that runs the entire token-bucket/sliding-window decision atomically on the Redis server in a single round trip. This is the make-or-break detail.
- **Latency/load:** every request hits Redis; shard keys across a Redis cluster (the key space partitions naturally by client id) and pipeline. Sub-ms is achievable.
- **Alternative for extreme latency needs:** **local per-node counters** that either divide the global limit by node count or periodically reconcile with Redis — no per-request network hop, but **approximate** (a client on a hot node may exceed its exact share). State the trade-off: centralized = globally accurate but a hop per request; local = fast but approximate. **Most systems accept slight over-limiting for speed/availability** — being off a few percent rarely matters.

**Store failure:** default **fail-open** (allow) so a Redis outage doesn’t take down the API; choose **fail-closed** for endpoints where a flood is dangerous/expensive. Deliberate choice, stated.

**Throttled-client response:** return **HTTP 429** with **\`Retry-After\`** and \`X-RateLimit-Limit/-Remaining/-Reset\` headers so good clients back off (fewer wasteful retries) — a polished touch.

**One-line summary:** a token-bucket (or sliding-window-counter) limiter at the API gateway, backed by a sharded in-memory Redis updated **atomically** (INCR / Lua) for correct global limits, consciously trading a per-request Redis hop for accuracy — with fail-open on outage and 429 + Retry-After for throttled clients; drop to node-local approximate counters only if sub-ms latency forces it.
`,
    },
  ],
}
