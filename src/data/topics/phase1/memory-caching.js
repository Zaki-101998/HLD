export default {
  id: 'memory-caching',
  title: 'Memory, Virtual Memory & the Cache Hierarchy',
  subtitle: 'Latency numbers every engineer must know — and why caching works at all',
  days: 3,
  content: `
## Why this matters for system design

System design is largely the art of **placing data at the right distance from the CPU**. The reason a Redis cache in front of Postgres helps, the reason SSDs changed databases, the reason "keep the working set in RAM" is gospel — it's all one idea: storage gets ~10–100× slower at each step away from the processor. Internalize the numbers here and half of Phase 2 becomes obvious.

## The memory hierarchy

\`\`\`
CPU registers      <1 ns      ~KBs        (per core)
L1/L2/L3 cache     1–10 ns    KBs–MBs     (on chip)
RAM                ~100 ns    GBs
SSD (NVMe)         ~100 µs    TBs         ← 1,000× slower than RAM
Spinning disk      ~10 ms     TBs         ← 100× slower than SSD
Same-DC network    ~0.5 ms    -           (round trip)
Cross-region net   50–150 ms  -           (round trip)
\`\`\`

Same hierarchy, drawn as distance from the CPU — each hop down is roughly an order of magnitude slower:

\`\`\`mermaid
flowchart TD
  R["Registers — less than 1 ns"] --> L["L1 / L2 / L3 cache — 1–10 ns"]
  L --> M["RAM — ~100 ns"]
  M --> S["SSD (NVMe) — ~100 µs"]
  S --> D["Spinning disk — ~10 ms"]
  M -.->|"same-DC network hop"| N1["~0.5 ms round trip"]
  M -.->|"cross-region network hop"| N2["50–150 ms round trip"]
\`\`\`

### The latency numbers table (the famous one)

| Operation | Time | Human-scaled (1 ns = 1 s) |
|---|---|---|
| L1 cache hit | 0.5 ns | half a second |
| RAM read | 100 ns | ~2 minutes |
| Read 1 MB from RAM | 250 µs | ~3 days |
| SSD random read | 100 µs* | ~1 day |
| Read 1 MB from SSD | 1 ms | ~12 days |
| Disk seek | 10 ms | ~4 months |
| Same-DC round trip | 0.5 ms | ~6 days |
| Cross-Atlantic round trip | 100+ ms | ~3 years |

\\*modern NVMe is ~20–100 µs. The exact values drift yearly; **the ratios are what you memorize.**

Three design conclusions fall straight out:

1. **RAM beats disk by ~1000×** → hence in-memory caches (Redis), and databases that keep hot data + indexes in RAM.
2. **A network hop inside a DC (~0.5 ms) is CHEAPER than a local disk seek (10 ms)** → fetching from a remote memory cache beats reading your own spinning disk. This single ratio justifies the entire cache-tier industry.
3. **Sequential beats random** → disks (even SSDs) stream far faster than they seek. This is why Kafka and write-ahead logs are *append-only*: they turn random writes into sequential ones.

## Virtual memory & paging

Each process sees a private, contiguous **virtual address space**; the OS + MMU map virtual pages (4 KB) to physical RAM frames. Benefits: isolation (processes can't read each other), simplicity, and RAM overcommit.

When RAM runs out, the OS **evicts pages to disk (swap)**. If the working set exceeds RAM, the machine **thrashes** — every memory access becomes a disk access (1000× slowdown) and the system effectively dies while looking "up".

> **Production rule you'll cite:** for latency-critical systems (databases, caches), swapping is catastrophic — teams disable swap or alert on ANY swap activity. "The database got slow" is often "the working set no longer fits in RAM".

**The page cache**: the OS uses all "free" RAM to cache file/disk contents. Re-reading a recently read file costs RAM speed, not disk speed. Kafka's legendary throughput is mostly *the OS page cache* doing sequential reads/writes — Kafka barely caches anything itself.

## Locality — why caching works at all

- **Temporal locality**: recently used data will likely be used again (your profile, a hot tweet).
- **Spatial locality**: data near recently used data is next (the following page of results, adjacent array items).

Every cache — CPU L1, page cache, Redis, CDN — is a bet on locality. That bet has a name from real workloads: **the 80/20 rule** (a small hot set serves most requests). When locality is absent (pure random access over a huge set), caches are useless — an important thing to *say* when an interviewer proposes caching something uncacheable.

Two metrics decide everything: **hit rate** and hot-set size. Effective latency = hit_rate × fast + (1 − hit_rate) × slow. A 99% → 95% hit-rate drop can quintuple your average latency at the origin — cache hit rate is a top-tier production metric.

## Working set — the sizing question

The **working set** is the data actually touched in a time window. The eternal sizing question: *does it fit in RAM?*

- 100M users × 2 KB profile = 200 GB → doesn't fit one machine's RAM comfortably → shard across a cache cluster, or cache only the hot 10% (20 GB) if traffic is skewed.
- You'll do this arithmetic in nearly every estimation drill from here on.

## How this shows up in interviews

- Justify a cache tier with the RAM-vs-disk ratio and expected hit rate, not vibes.
- "Why is Kafka fast?" → sequential I/O + page cache.
- "Why did p99 explode at month 6?" → working set outgrew RAM (DB started hitting disk).
- Estimation: back-of-envelope always includes "does the hot set fit in memory?"
`,
  resources: [
    {
      title: 'Latency numbers every programmer should know (interactive, by year)',
      url: 'https://colin-scott.github.io/personal_website/research/interactive_latency.html',
      type: 'interactive',
      source: 'Colin Scott',
    },
    {
      title: 'Virtual memory chapter — OSTEP',
      url: 'https://pages.cs.wisc.edu/~remzi/OSTEP/vm-intro.pdf',
      type: 'doc',
      source: 'Operating Systems: Three Easy Pieces (free)',
    },
    {
      title: 'Why is Kafka so fast? (page cache + sequential I/O)',
      url: 'https://www.youtube.com/watch?v=UNUz1-msbOM',
      type: 'video',
      source: 'ByteByteGo (YouTube)',
    },
  ],
  challenges: [
    {
      type: 'quiz',
      id: 'quiz-1',
      title: 'Memory hierarchy check',
      questions: [
        {
          q: 'Fetching a value from a Redis server in the same datacenter vs reading it from your local spinning disk — which is faster and why?',
          options: [
            'Local disk — no network involved',
            'Redis — a same-DC round trip (~0.5 ms) beats a disk seek (~10 ms) by ~20×',
            'They are about the same',
            'Redis, but only because of compression',
          ],
          answer: 1,
          explanation:
            'Remote RAM beats local spinning disk decisively. This counterintuitive ratio is the entire justification for network cache tiers. (Against a local NVMe SSD it’s closer — which is also worth knowing.)',
        },
        {
          q: 'Your database was fast for a year, then p99 latency exploded 10× with no code changes. The classic memory-hierarchy explanation:',
          options: [
            'The CPU wore out',
            'The working set (hot data + indexes) outgrew RAM, so reads started hitting disk',
            'TLS certificates expired',
            'Too many database indexes',
          ],
          answer: 1,
          explanation:
            'While hot data fits in RAM, reads cost ~100 ns–µs; the day it spills, reads cost ~ms. Growth quietly crosses this cliff — the fix is more RAM, sharding, or caching the hot set.',
        },
        {
          q: 'Why are write-ahead logs and Kafka topics append-only?',
          options: [
            'Appending is easier to code',
            'Sequential disk I/O is orders of magnitude faster than random I/O, so turning random writes into appends converts disk weakness into strength',
            'It saves disk space',
            'Deletion is illegal in Kafka',
          ],
          answer: 1,
          explanation:
            'Disks (and even SSDs) stream sequentially far faster than they seek randomly. Log-structured designs (WAL, Kafka, LSM-trees) exploit this — a theme that returns in the database topics.',
        },
        {
          q: 'A cache with a 99% hit rate (1 ms hits, 100 ms misses) drops to 90% hit rate. Average latency goes from ~2 ms to…',
          options: ['~3 ms', '~5 ms', '~11 ms', '~90 ms'],
          answer: 2,
          explanation:
            '0.9×1 + 0.1×100 ≈ 10.9 ms — a 9-point hit-rate drop caused a ~5× average slowdown (and 10× the load on the origin). This is why hit rate is a paged-alert metric.',
        },
        {
          q: 'What is "thrashing"?',
          options: [
            'CPU overheating',
            'The working set exceeds RAM so the OS constantly swaps pages to/from disk, making memory accesses run at disk speed',
            'Too many context switches',
            'A full disk',
          ],
          answer: 1,
          explanation:
            'Each page fault costs a disk access (~1000× RAM). The machine looks alive but does almost no useful work. For latency-critical servers, any swapping is an incident.',
        },
        {
          q: 'You must store 500M user sessions of 1 KB each in a cache. Can one 64 GB-RAM node hold them?',
          options: [
            'Yes, easily',
            'No — 500M × 1KB = 500 GB; you need ~8–10 such nodes (sharding) or to cache only the hot subset',
            'Yes, with compression',
            'Sessions cannot be cached',
          ],
          answer: 1,
          explanation:
            '500e6 × 1e3 bytes = 5e11 = 500 GB ≫ 64 GB. Either shard across a cluster or exploit skew (if 10% of sessions are active, 50 GB fits). Doing this arithmetic unprompted is a strong interview signal.',
        },
      ],
    },
    {
      type: 'estimation',
      id: 'est-1',
      title: 'Estimation drill: does it fit in RAM?',
      problem: `
**Instagram-style service.** 400M daily active users; each fetches a profile object (~2 KB) and a feed of 50 post metadata items (~500 B each) several times a day.

1. How big is the full profile dataset for 2B total users?
2. How big is the HOT set if daily-active users' profiles dominate traffic?
3. Post metadata: 500M new posts/day, hot window = last 3 days. Size of the hot post set?
4. How many 64 GB cache nodes for hot profiles + hot posts, with 2× headroom for replication/overhead?

Round aggressively (1 day ≈ 10⁵ s is fine everywhere).
`,
      hints: [
        'Full ≠ hot: cache sizing uses the hot set.',
        '2B × 2KB — convert to TB. 400M × 2KB — convert to GB.',
        'Posts: 500e6 × 500B × 3 days.',
      ],
      solution: `
**1. Full profile set:** 2e9 × 2e3 B = 4e12 B = **4 TB** — too big for one node's RAM; this is disk/DB territory.

**2. Hot profiles:** 400e6 × 2 KB = 8e11 = **800 GB**. Still chunky — but with real-world skew (a fraction of DAU dominates), an effective hot set might be 100–200 GB. State the assumption out loud.

**3. Hot posts:** 500e6 posts/day × 500 B × 3 days = 7.5e11 ≈ **750 GB**.

**4. Node count:** (800 + 750) GB ≈ 1.55 TB × 2 (headroom/replication) ≈ 3.1 TB ÷ 64 GB ≈ **~50 cache nodes**.

**The interview takeaway:** a three-line calculation turned "we'll add a cache" into "a ~50-node Redis cluster holding ~1.5 TB hot data" — that specificity is what separates senior answers. Also note the full 4 TB profile dataset stays in a sharded DB; the cache holds only the hot layer.
`,
    },
    {
      type: 'lab',
      id: 'lab-1',
      title: 'Feel the hierarchy on your own machine',
      intro: 'Measure RAM vs disk vs page-cache speeds for real.',
      steps: [
        {
          instruction: 'Check your machine’s RAM and current memory pressure.',
          command: 'sysctl hw.memsize | awk \'{print $2/1073741824 " GB RAM"}\' && memory_pressure | tail -1',
          expected: 'Your RAM size and a "normal/warn/critical" pressure level.',
        },
        {
          instruction: 'Write a 1 GB file and time it (sequential write speed).',
          command: 'time dd if=/dev/zero of=/tmp/bigfile bs=1m count=1024 2>&1 | tail -1',
          expected: 'NVMe Macs: often 1–3+ GB/s sequential. Note the number.',
        },
        {
          instruction: 'Read it twice — cold vs page-cached — and compare.',
          command: 'time cat /tmp/bigfile > /dev/null && time cat /tmp/bigfile > /dev/null',
          expected: 'Second read is dramatically faster: it came from RAM (the OS page cache), not disk. You just watched the hierarchy work.',
        },
        {
          instruction: 'See the memorized table with CURRENT-year numbers.',
          command: 'open https://colin-scott.github.io/personal_website/research/interactive_latency.html',
          expected: 'Drag the year slider — notice which gaps shrank over decades (disk→SSD) and which never will (speed of light).',
        },
        {
          instruction: 'Clean up, then recite from memory: RAM read, SSD read, disk seek, same-DC RTT, cross-region RTT.',
          command: 'rm /tmp/bigfile',
          expected: '~100 ns / ~100 µs / ~10 ms / ~0.5 ms / ~100 ms. Say them until automatic — you will use them in every estimation.',
        },
      ],
    },
  ],
}
