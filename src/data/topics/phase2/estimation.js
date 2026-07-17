export default {
  id: 'estimation',
  title: 'Back-of-Envelope Estimation',
  subtitle: 'QPS, storage, bandwidth — the 90-second math that anchors every design',
  days: 2,
  content: `
## Why this matters for system design

Interviewers use estimation to check whether your design decisions are *reasoned* or *recited*. "We'll shard the database" means nothing until you show the write QPS that forces it. The good news: interview estimation is ~5 formulas and aggressive rounding. Precision is NOT the goal — being within 10× with visible reasoning is.

## The toolkit

### Powers of ten — talk in them
\`\`\`
1 thousand = 1e3 (K)     1 million = 1e6 (M)
1 billion  = 1e9 (B/G)   1 trillion = 1e12 (T)
\`\`\`
Storage ladder: KB → MB → GB → TB → PB (×1000 each).

### Magic numbers to memorize
- **1 day ≈ 86,400 s → round to 1e5 s** (2× error at most, worth the speed)
- **30 days ≈ 2.5e6 s; 1 year ≈ 3e7 s**
- 1M requests/day ≈ **12 QPS** (so: X M/day ≈ 12·X QPS)
- Peak ≈ **2–5× average** (say which you're assuming)
- Char = 1 B; UUID/hash ≈ 16–36 B; typical metadata row ≈ **0.5–2 KB**; image ≈ **200 KB–2 MB**; 1 min of 1080p video ≈ **50–100 MB**
- Server ballparks: app server **~1–10k QPS** (I/O-bound API), Postgres box **~5–20k simple QPS**, Redis node **~100k ops/s**, Kafka broker **~100s of MB/s**

### The five standard calculations

**1. QPS:** \`DAU × actions/user/day ÷ 1e5\`, then ×3 for peak.
**2. Storage:** \`items/day × size × retention days\` (then ×2–3 for replication!).
**3. Bandwidth:** \`QPS × payload size\` → convert to Gbps (×8 for bits).
**4. Memory/cache:** hot fraction (often 20%) × dataset, or working set directly.
**5. Servers:** peak QPS ÷ per-server QPS, +30–50% headroom.

## Worked example — "Design Twitter" numbers in 90 seconds

Given: 300M DAU, each posts 0.5 tweets/day, reads 100 tweets/day. Tweet = 300 B text + 20% have a 200 KB image. 5-year retention.

**Write QPS:** 300e6 × 0.5 / 1e5 = 1,500 tweets/s avg → **~5k/s peak**
**Read QPS:** 300e6 × 100 / 1e5 = 300k/s avg → **~1M/s peak** — read:write ≈ 200:1 → *this system is a read-caching problem, not a write problem.* ← the insight the math existed to reveal
**Text storage:** 150e6 tweets/day × 300 B ≈ 45 GB/day → ×365×5 ≈ **80 TB** (×3 replication ≈ 250 TB) — small! Text is never the problem.
**Image storage:** 30e6/day × 200 KB = 6 TB/day → **~11 PB over 5 years** — blob storage + CDN is where the money goes.
**Bandwidth (reads):** 1M/s × 300 B ≈ 300 MB/s text — trivial; images via CDN ≈ (say 10% of reads have images) 100k/s × 200 KB = 20 GB/s = **160 Gbps** → CDN mandatory.

Notice each number ENDED in a design decision. That's the whole point.

## Delivery technique (scoring rubric)

1. **State assumptions out loud, round brutally** ("I'll take a day as 1e5 seconds").
2. **Write units at every step** — unit errors are the #1 embarrassing failure (bits vs bytes: ×8; GB vs Gb).
3. **Sanity-check against a known anchor** ("1M QPS ≈ Google-search scale — plausible for Twitter reads? yes, borderline").
4. **Land on a decision**, not a number: "so reads need a cache tier + CDN; writes fit one sharded cluster."
5. Keep a consistent significant figure: ONE. 1,437,882 → "about 1.5M".

## The three sanity anchors

- Google search ≈ **~100k QPS**; Twitter reads ≈ ~1M QPS at feeds level; a big bank's transactions ≈ **~10k TPS**. If your answer says a todo app needs 5M QPS, re-check.
- One machine can be shockingly capable: 100k Redis ops/s, 1M held connections. Don't fleet-ify what one box can do.
- Whole-internet bandwidth intuition: Netflix peaks at **~100+ Tbps via CDN** — if your design needs Tbps from origin servers, you forgot the CDN.
`,
  resources: [
    {
      title: 'Back-of-the-envelope estimation',
      url: 'https://www.youtube.com/watch?v=UC5xf8FbdJc',
      type: 'video',
      source: 'System Design Interview (YouTube)',
    },
    {
      title: 'The famous "Numbers Everyone Should Know" (Jeff Dean)',
      url: 'https://brenocon.com/dean_perf.html',
      type: 'article',
      source: 'Jeff Dean, Google (via brenocon)',
    },
    {
      title: 'Capacity estimation chapter',
      url: 'https://bytebytego.com/courses/system-design-interview/back-of-the-envelope-estimation',
      type: 'doc',
      source: 'ByteByteGo (Alex Xu)',
    },
    {
      title: 'The difference between throughput and latency',
      url: 'https://aws.amazon.com/compare/the-difference-between-throughput-and-latency/',
      type: 'article',
      source: 'AWS',
    },
    {
      title: 'Latency vs Throughput vs Bandwidth',
      url: 'https://algomaster.io/learn/system-design/latency-vs-throughput',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
  ],
  challenges: [
    {
      type: 'quiz',
      id: 'quiz-1',
      title: 'Estimation reflexes',
      questions: [
        {
          q: '8 million requests per day is roughly what average QPS?',
          options: ['~8 QPS', '~100 QPS', '~1,000 QPS', '~10,000 QPS'],
          answer: 1,
          explanation:
            '8e6 / 1e5 ≈ 80–100 QPS. The "1M/day ≈ 12 QPS" reflex (or day≈1e5 s) turns this into instant mental math.',
        },
        {
          q: 'Your API serves 50k QPS of 20 KB responses. Roughly what egress bandwidth?',
          options: ['~1 Gbps', '~8 Gbps', '~80 Gbps', '~800 Mbps'],
          answer: 1,
          explanation:
            '50e3 × 20e3 B = 1 GB/s → ×8 = 8 Gbps. The ×8 bytes→bits conversion is the most common estimation slip; always write units.',
        },
        {
          q: 'A service stores 10M new 1 KB records/day with 3× replication and 1-year retention. Total storage?',
          options: ['~10 GB', '~1 TB', '~11 TB', '~110 TB'],
          answer: 2,
          explanation:
            '10e6 × 1e3 B = 10 GB/day → ×365 ≈ 3.65 TB → ×3 replication ≈ 11 TB. Forgetting replication (and growth) is the classic storage-estimate miss.',
        },
        {
          q: 'Read QPS = 900k, write QPS = 3k. The design conclusion this ratio screams:',
          options: [
            'Shard the database immediately',
            'It’s a ~300:1 read-heavy system — caching and read replicas are the architecture; writes fit modest hardware',
            'Use stronger consistency',
            'Reads and writes need equal resources',
          ],
          answer: 1,
          explanation:
            'The ratio IS the design driver. 900k reads/s → cache tier + CDN + replicas; 3k writes/s → one solid primary (maybe modest sharding later). Estimation exists to surface exactly this kind of conclusion.',
        },
        {
          q: 'You compute that a photo app needs 40 PB of storage over 5 years. Sanity response?',
          options: [
            'Impossible — redo the math',
            'Plausible for photo/video at scale — this budget belongs in object storage + CDN, not in databases',
            'Store it all in Postgres with partitions',
            'Cut retention to make it fit in RAM',
          ],
          answer: 1,
          explanation:
            'Media dwarfs metadata by 3–4 orders of magnitude (Instagram/YouTube live in PB-land). The reaction that matters: blobs → object storage; only metadata (TBs at most) → databases.',
        },
        {
          q: 'Estimating cache size: 100M items, 2 KB each, and you expect the classic hot-set skew. Reasonable cache budget?',
          options: [
            '200 GB (everything)',
            '~40 GB — cache the ~20% hot set (80/20 rule), stated as an assumption',
            '2 GB regardless of traffic',
            'Caches don’t need sizing',
          ],
          answer: 1,
          explanation:
            'Full set = 200 GB, but caching serves the HOT set: 20% × 200 GB = 40 GB (across a few nodes). Stating "assuming 80/20 skew" converts a guess into an engineering assumption an interviewer can engage with.',
        },
      ],
    },
    {
      type: 'estimation',
      id: 'est-1',
      title: 'Drill: size "Design YouTube" in 4 numbers',
      problem: `
Assume: 2B MAU, 50% watch daily (1B DAU). Average user watches 5 videos/day. Creators upload **500 hours of video per minute**. A processed video averages ~1 GB per hour of content across all stored resolutions (aggressive rounding). Average watch = 10 minutes at ~5 Mbps.

1. Video WATCH requests per second?
2. New storage per day (and per year) from uploads?
3. Peak streaming bandwidth if peak concurrent viewers = DAU × 10% watching simultaneously?
4. What fraction of that bandwidth must the CDN absorb for the origin to survive?
`,
      hints: [
        '1B × 5 / 1e5 s...',
        '500 hr/min × 60 × 24 = hours/day → × 1 GB.',
        '100M concurrent × 5 Mbps → convert to Tbps.',
        'Think: what could origin servers plausibly serve — single-digit percent?',
      ],
      solution: `
**1. Watch starts:** 1e9 × 5 / 1e5 = **50,000 video plays/second** average (≈150k peak). Each play then streams for ~10 min.

**2. Upload storage:** 500 × 60 × 24 = 720,000 hours/day ≈ 7.2e5 × 1 GB = **~720 TB/day** → ×365 ≈ **~260 PB/year** (before replication/older-format cleanup). Conclusion: erasure-coded blob storage, tiered (hot/warm/cold) — never a database.

**3. Streaming bandwidth:** 100M concurrent × 5 Mbps = 5e8 Mbps = **~500 Tbps**. Sanity anchor: Netflix peaks 100+ Tbps — right order of magnitude for YouTube-scale. ✓

**4. CDN fraction:** 500 Tbps from origin is impossible (that's whole-cloud-region scale). CDN must serve **~99%+**; origin handles cache-miss long-tail (a few Tbps) — and even that gets a mid-tier cache layer. The design writes itself from the numbers: CDN-first architecture, popularity-based cache tiering, origin as last resort.
`,
    },
    {
      type: 'estimation',
      id: 'est-2',
      title: 'Drill: WhatsApp-scale message storage',
      problem: `
2B users send an average of 40 messages/day each. A message is ~100 B of text + ~200 B of metadata (ids, timestamps, receipts). Media: 5% of messages carry ~300 KB media. Messages are stored with 3× replication; text kept 5 years, media 1 year (assume media is stored once + CDN-cached, not 3×-replicated).

1. Messages per second (average and 3× peak)?
2. Text+metadata storage per day, and for 5 years with replication?
3. Media storage per year?
4. Which store would you pick for each, and why (one line)?
`,
      hints: [
        '2e9 × 40 = 8e10 msgs/day. Divide by 1e5.',
        'Text: 8e10 × 300 B/day.',
        'Media: 8e10 × 5% × 300 KB/day × 365.',
      ],
      solution: `
**1.** 8e10 / 1e5 = **800k msg/s average → ~2.4M msg/s peak**. (Cross-check anchor: WhatsApp has publicized 100B+ msgs/day — our 80B is the right zone. ✓)

**2. Text:** 8e10 × 300 B = **24 TB/day** → ×365×5 = ~44 PB → ×3 = **~130 PB**. Even "tiny text" at this scale is petabytes — write-optimized, shardable storage (LSM-based wide-column like Cassandra/HBase; keyed by conversation).

**3. Media:** 8e10 × 0.05 × 300 KB = 1.2e15 B/day ≈ **1.2 PB/day** → **~440 PB/year**. Object storage + CDN, dedup identical forwards (same hash = store once — a famous real WhatsApp/Telegram optimization).

**4.** Messages: wide-column store, partition by chat_id, ordered by time — matches the write rate and the "fetch recent by conversation" read pattern. Media: object store with content-hash keys (free dedup) + CDN. Metadata/counters: Redis in front. One sentence each is all an interview needs — the numbers did the arguing.
`,
    },
  ],
}
