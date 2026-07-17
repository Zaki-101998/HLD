export default {
  id: 'url-shortener',
  title: 'Design a URL Shortener (TinyURL / bit.ly)',
  subtitle: 'The classic warm-up: key generation, read-heavy scaling, and a clean end-to-end walk of the framework',
  days: 2,
  content: `
## The problem

Design a service that turns a long URL into a short code (\`https://bit.ly/3xY9kP\`) and redirects anyone who visits the short link back to the original. It's the standard opening problem because it's small enough to finish in 40 minutes yet exercises the whole framework and one genuinely interesting sub-problem: **generating short, unique codes at scale.**

## Step 1 — Requirements

**Functional:** (1) shorten a long URL → short code, (2) redirect short code → original URL. *De-scope but mention:* custom aliases, expiration, click analytics, user accounts.

**Non-functional:** **extremely read-heavy** (~100:1 redirects vs creations) — this is the defining fact. Redirects must be **fast (low latency)** and **highly available** (a dead redirect is a dead link everywhere it's posted). Codes must be **unique** and ideally **not sequentially guessable**. Availability > strong consistency (a newly created link being usable a second later is fine).

## Step 2 — Estimation

- Assume **100M new URLs/month** → ~40 writes/sec (× peak ≈ 100/s). Reads at 100:1 → **~4,000 redirects/sec** (peak ~10k/s).
- **Storage:** 100M/month × 12 × 5 years = **6 billion** mappings. Each row ~500 bytes → **~3 TB** over 5 years. Fits on a small sharded cluster; not a single-node problem but not huge.
- **Short code length:** with base62 (a–z, A–Z, 0–9), 62⁷ ≈ **3.5 trillion** combinations — **7 characters** is plenty for 6 billion URLs with room to spare. (62⁶ ≈ 56B, also enough, but 7 gives headroom.)
- **Cache:** the hot 20% of links serve ~80% of redirects → caching a few hundred GB of hot mappings covers most reads.

## Step 3 — API

\`\`\`
POST /api/shorten
  body: { long_url, [custom_alias], [expiry] }
  → 200 { short_url: "https://sho.rt/3xY9kP" }

GET /{short_code}
  → 301/302 redirect to long_url
\`\`\`
Use **301 (permanent)** for cacheable, unchanging links (browsers/CDNs cache them, cutting load) or **302 (temporary)** if you want every click to hit your server (needed for analytics). A classic trade-off to mention.

## Step 4 — Data model

One entity: \`Mapping { short_code (PK), long_url, created_at, [user_id], [expiry] }\`. Access pattern is a **single-key lookup by short_code** — no joins, no range scans. That points squarely at a **key-value / NoSQL store** (DynamoDB, Cassandra) which shards trivially by key. SQL is perfectly fine at this scale too; justify by simplicity if you pick it.

## Step 5 — High-level design

\`\`\`
                       ┌─────────────┐
 Create:  client ─▶ LB ─▶ App server ─▶ Key-Gen Service ─▶ write Mapping ─▶ DB
                                                              │
 Redirect: client ─▶ LB ─▶ App server ─▶ Cache (Redis) ─hit─▶ 301 redirect
                                              └─miss─▶ DB ─▶ populate cache ─▶ redirect
\`\`\`
Stateless app servers behind a load balancer; a Redis cache in front of the KV store; optionally a CDN for the redirect at the edge.

\`\`\`mermaid
sequenceDiagram
  autonumber
  participant Client
  participant App as App server
  participant Cache as Redis
  participant DB as KV store
  Client->>App: GET /{short_code}
  App->>Cache: get(short_code)
  alt cache hit
    Cache-->>App: long_url
  else cache miss
    App->>DB: get(short_code)
    DB-->>App: long_url
    App->>Cache: set(short_code, long_url)
  end
  App-->>Client: 301 redirect
\`\`\`

## Step 6 — Deep dive: generating short codes

This is the heart of the problem. Three approaches, with trade-offs:

**A) Hash the URL (e.g. MD5/SHA), take first 7 base62 chars.**
- ✅ Stateless, deterministic (same URL → same code, natural dedup).
- ❌ **Collisions** — different URLs can map to the same 7 chars; you must check-and-retry (append a salt), adding a read per write. Deterministic dedup is also sometimes *undesirable* (two users shortening the same URL may want distinct analytics).

**B) Auto-increment counter → base62 encode it.**
- A global counter; each new URL gets the next integer, base62-encoded (id 125 → "cb"). **No collisions ever** — uniqueness is guaranteed by the counter.
- ❌ A single counter is a **SPOF/bottleneck**, and sequential codes are **guessable** (crawl all links by counting).
- **Fix — Key Generation Service (KGS):** hand out counter *ranges* to app servers in blocks (server A gets 1–1000, server B gets 1001–2000). Each server allocates from its local block with no coordination — removes the per-request bottleneck. Distributed counters (Redis INCR, ZooKeeper, or a range-allocator table) implement this. Randomize/shuffle within the space if guessability matters.

**C) Pre-generate keys offline.** A KGS pre-computes billions of unique random 7-char codes into a "available keys" table; app servers grab unused ones. ✅ No collisions, no generation latency on the write path, not sequential. ❌ Needs storage for the key pool and careful concurrency (mark-as-used atomically). **This is often the preferred interview answer** — clean and fast.

**Scaling the reads (the actual load):** the redirect path is 100× the writes, so it lives or dies on caching. Redis in front of the DB with LRU eviction handles the hot links; a CDN can cache 301s at the edge so many redirects never reach your origin at all. The KV store shards by short_code, so read throughput scales horizontally.

## Step 7 — Wrap-up

A read-heavy single-key lookup: a KV store sharded by code, fronted by a Redis cache (and optionally a CDN) to absorb the 100:1 read skew. The one real design decision is **code generation** — I'd use a pre-generated key service for guaranteed uniqueness with no write-path collision checks and non-sequential codes, accepting the cost of running and storing that key pool. Trade-offs: 301 vs 302 (caching vs analytics), and eventual consistency is acceptable since a link being usable a moment after creation is fine. With more time: analytics pipeline (async via a queue), custom aliases, and expiry/GC.

## How this shows up in interviews

- The go-to warm-up; interviewers use it to check you can **run the framework cleanly** and reason about **one hard sub-problem** (key generation) rather than hand-wave.
- Expect the follow-up **"how do you generate the codes?"** — have all three approaches and their trade-offs ready; the KGS / pre-generated-keys answer is the strong one.
- Expect **"how do you scale to millions of redirects/sec?"** — caching + CDN + horizontal KV sharding, grounded in the 100:1 ratio.
- A good place to name **301 vs 302** and its analytics implication — a small detail that signals depth.
`,
  resources: [
    {
      title: 'Design a URL Shortener — full walkthrough',
      url: 'https://www.youtube.com/watch?v=fMZMm_0ZhK4',
      type: 'video',
      source: 'ByteByteGo',
    },
    {
      title: 'System Design: TinyURL (design + key generation)',
      url: 'https://www.hellointerview.com/learn/system-design/problem-breakdowns/bitly',
      type: 'article',
      source: 'Hello Interview',
    },
    {
      title: 'Designing a URL shortening service (System Design Primer)',
      url: 'https://github.com/donnemartin/system-design-primer/tree/master/solutions/system_design/pastebin',
      type: 'doc',
      source: 'System Design Primer',
    },
    {
      title: 'Design URL Shortener like TinyURL',
      url: 'https://algomaster.io/learn/system-design-interviews/design-url-shortener',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
  ],
  challenges: [
    {
      type: 'quiz',
      id: 'quiz-1',
      title: 'URL shortener check',
      questions: [
        {
          q: 'What is the single most design-shaping property of a URL shortener?',
          options: [
            'It needs strong ACID transactions',
            'It is extremely read-heavy (~100:1 redirects vs creations), so the design centers on making redirects fast and cheap — caching, CDN, and horizontally sharded key lookups',
            'It is write-heavy',
            'It requires complex joins',
          ],
          answer: 1,
          explanation:
            'The 100:1 read skew drives everything: you optimize the redirect path with heavy caching (Redis + CDN) and a KV store sharded by code. Creations are comparatively rare, so the write path can afford a little more work (e.g. key allocation).',
        },
        {
          q: 'Why is a single global auto-increment counter for code generation problematic, and what fixes it?',
          options: [
            'It produces collisions; hashing fixes it',
            'It is a single point of failure/bottleneck and produces guessable sequential codes; a Key Generation Service that hands out counter RANGES (blocks) to each server removes the bottleneck (and shuffling addresses guessability)',
            'Counters overflow after 100 URLs',
            'Nothing is wrong with it',
          ],
          answer: 1,
          explanation:
            'The counter guarantees uniqueness but centralizes it. Handing out ranges (server A: 1–1000, B: 1001–2000) lets each server allocate locally with no per-request coordination, removing the hotspot. Sequential-guessability is fixed by randomizing within the space or pre-generating random keys.',
        },
        {
          q: 'With base62 encoding, how many characters do you need to comfortably cover ~6 billion URLs?',
          options: [
            '4 characters (62⁴ ≈ 15 million)',
            '7 characters — 62⁷ ≈ 3.5 trillion, far more than 6 billion, with headroom (even 62⁶ ≈ 56 billion would technically suffice)',
            '20 characters',
            '2 characters',
          ],
          answer: 1,
          explanation:
            'base62 uses [a-zA-Z0-9]. 62⁶ ≈ 56B already exceeds 6B, but 7 chars (≈3.5T) gives comfortable headroom and keeps the URL short. Being able to do this quick sizing is exactly the estimation muscle interviewers want.',
        },
        {
          q: 'You return a 301 (permanent) redirect instead of 302 (temporary). What do you gain and lose?',
          options: [
            'Nothing changes',
            'Gain: browsers/CDNs cache the 301, so many redirects never hit your servers (less load, faster). Lose: you can no longer count every click, since cached redirects skip your server — worse analytics',
            '301 is slower than 302',
            '302 guarantees uniqueness',
          ],
          answer: 1,
          explanation:
            'This is a classic trade-off to surface. 301 offloads redirects to caches (great for scale) but blinds your analytics; 302 forces every click through your server (accurate click counts) at the cost of higher load. Choose per requirement.',
        },
      ],
    },
    {
      type: 'design',
      id: 'design-1',
      title: 'Design exercise: the full URL shortener',
      prompt: `
Design a URL shortener (like bit.ly) end to end using the 7-step framework. Handle ~100M new URLs/month with a heavy read skew and low-latency redirects.

Cover: requirements (functional + non-functional), an estimation that drives a decision, the API, the data model and storage choice (with justification), the high-level architecture and request flow for BOTH create and redirect paths, and — as your deep dive — how you generate short codes (compare at least two approaches and pick one with reasons). Finish with trade-offs. Then extend: how would you add per-link click analytics without slowing the redirect?
`,
      hints: [
        'Anchor every choice to the 100:1 read ratio — where does that push you?',
        'For code generation, weigh hashing (collisions) vs counter/KGS vs pre-generated keys.',
        'Analytics on the hot path is bad — what async pattern from Phase 2 keeps redirects fast?',
      ],
      modelAnswer: `
Follow the walkthrough above; a strong answer hits these beats:

**Requirements** — Functional: shorten, redirect (de-scope aliases/expiry/analytics but note them). Non-functional: ~100:1 read-heavy, low-latency + highly-available redirects, unique non-sequential codes, availability over strong consistency.

**Estimation** — ~40 writes/s, ~4k reads/s (peak ~10k); ~6B mappings / ~3 TB over 5 years; 7-char base62 (≈3.5T space). Conclusion drawn: reads dominate → cache + CDN; storage needs modest sharding, not a single node.

**API** — \`POST /shorten\` and \`GET /{code}\` (301 vs 302 discussed).

**Data model & storage** — \`Mapping{short_code PK, long_url, created_at}\`; single-key lookup → KV/NoSQL sharded by code (SQL acceptable at this size).

**High-level** — clients → LB → stateless app servers → Redis cache → KV store; create path goes through a key service; CDN can cache 301 redirects at the edge.

**Deep dive — code generation:** compare (a) hashing → collisions + retry, deterministic dedup; (b) counter → guaranteed-unique but SPOF/guessable, fixed by a **Key Generation Service handing out ranges**; (c) **pre-generated random keys** grabbed atomically from a pool. Pick (c) or the KGS-range approach: guaranteed uniqueness, no write-path collision checks, non-sequential. State the cost (running/storing the key pool).

**Scaling reads:** Redis (LRU) in front of the sharded KV store absorbs the hot 20%; CDN caches 301s so many redirects never reach origin.

**Trade-offs:** 301 (cacheable, less load) vs 302 (accurate analytics); eventual consistency acceptable; KGS adds an operational component but removes collision handling.

**Extension — analytics without slowing redirects:** never write analytics synchronously on the redirect path. On each redirect, **fire an async event to a message queue** (Kafka) — a fire-and-forget publish — and return the redirect immediately. Downstream **stream consumers** aggregate clicks (by link, geo, referrer, time) into an analytics store (a columnar/OLAP DB or pre-aggregated counters). This keeps the hot path a pure cache lookup while still capturing every click. If you used 301s (cached redirects skip your server), you’d instead need client-side beacons or switch hot links to 302 to observe clicks — name that tension.

**One-line summary:** a cache-fronted, code-sharded KV lookup optimized for a 100:1 read skew, whose only real design decision is collision-free non-sequential code generation (pre-generated key pool), with analytics pushed entirely off the redirect path onto an async queue.
`,
    },
  ],
}
