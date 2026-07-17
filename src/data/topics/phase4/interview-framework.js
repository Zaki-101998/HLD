export default {
  id: 'interview-framework',
  title: 'The System Design Interview Framework',
  subtitle: 'A repeatable 7-step structure to drive any design interview — never freeze on a blank whiteboard again',
  days: 2,
  content: `
## Why this matters

The system design interview isn't a test of whether you've memorized how Instagram works. It's a test of whether you can **drive a structured conversation** through an ambiguous, open-ended problem — the way you'd drive a real design review. Candidates fail not because they lack knowledge, but because they **freeze, ramble, or jump straight to databases** without understanding the problem. A framework fixes that. It gives you a track to run on so your knowledge (everything in Phases 0–3) has somewhere to go.

Memorize this 7-step flow. Every problem in this phase uses it. In a 45-minute interview, roughly: **5 min requirements, 5 min estimation, 5 min API + data model, 10–15 min high-level design, 10–15 min deep dives, 2 min wrap-up.**

## Step 1 — Requirements clarification (~5 min)

**Never start designing immediately.** The problem is deliberately vague ("design Twitter"). Your first job is to scope it. Ask questions and write the answers down.

- **Functional requirements** — what the system *does*. "Users can post tweets, follow others, and see a timeline." Nail down 3–5 core features. **Explicitly de-scope** the rest ("I'll skip DMs and ads for now") — this shows judgment and protects your time.
- **Non-functional requirements** — the *qualities*: scale (how many users/QPS?), latency (timeline must load < 200ms), availability vs consistency (can we tolerate a slightly stale timeline? — usually yes; can we tolerate a lost payment? — no), read vs write ratio, durability.
- The **read-heavy vs write-heavy** ratio is one of the most design-shaping facts. Twitter is ~100:1 read-heavy → optimize reads (fan-out, caching). A logging system is write-heavy → optimize ingestion.

**The single most important habit:** turn the vague prompt into a concrete, bounded problem *before* drawing anything. Interviewers are evaluating this.

## Step 2 — Back-of-envelope estimation (~5 min)

Compute the numbers that will drive your design decisions (see the Phase 2 estimation topic). Don't estimate for its own sake — estimate what *matters*:

- **QPS** (reads and writes separately): DAU × actions/day ÷ 86,400, then × a peak factor (~2–3×).
- **Storage**: items/day × size × retention → total. This decides whether it fits on one machine (no → sharding).
- **Bandwidth**: QPS × payload size.
- **Memory for cache**: apply the 80/20 rule — cache the hot 20%.

The point is to **justify later choices with numbers**: "40k writes/sec and 20 TB/year means a single database won't do it — we shard." Round aggressively; nobody wants precision.

## Step 3 — API design (~5 min)

Define the core endpoints — the contract between client and system. This crystallizes the functional requirements into something concrete.

- A handful of endpoints is enough: \`POST /tweet\`, \`GET /feed?userId=&cursor=\`, \`POST /follow\`.
- Note **REST vs gRPC/GraphQL** choice if relevant, **pagination** (cursor-based for feeds, not offset), and **idempotency** for writes (Phase 3).
- This is a good moment to show you think about the client, not just the backend.

## Step 4 — Data model (~5 min)

Define the main entities and pick storage per entity.

- Entities + key fields (User, Tweet, Follow…) and the **relationships**.
- **SQL vs NoSQL per entity** with a *reason* (Phase 2): relational/transactional data → SQL; massive-scale simple lookups or flexible schema → NoSQL; a graph of relationships → maybe a graph store.
- Call out the **access patterns** that drive the choice — "we always fetch a user's tweets by user_id, newest first, so we index/partition on (user_id, created_at)."

## Step 5 — High-level design (~10–15 min)

Now draw the boxes. Sketch the major components and the request flow, end to end.

- Standard cast: **clients → load balancer → API gateway/servers → services → caches → databases**, plus **queues** for async work and **blob storage / CDN** for media.
- **Walk a request through it**: "a user posts a tweet → API server validates → writes to DB → publishes a fan-out event to a queue → workers push it into followers' timeline caches."
- Keep it high-level here; resist diving deep too early. Get the whole skeleton on the board first so you and the interviewer share a map.
- **Stateless services** behind the load balancer (Phase 2) so you can scale horizontally.

## Step 6 — Deep dives (~10–15 min)

This is where senior candidates shine. Pick the **1–3 most interesting/hardest parts** and go deep — often the interviewer will steer you. This is where you deploy Phase 2–3 knowledge:

- **The bottleneck / hot path.** For Twitter: timeline generation → the **fan-out on write vs fan-out on read** trade-off, and the **celebrity problem** (hybrid approach).
- **Scaling the database:** sharding key choice and its consequences (hot shards?), replication, caching strategy + invalidation.
- **Handling failure** (Phase 3 resiliency): what happens when a component dies? Timeouts, retries, circuit breakers, graceful degradation.
- **Consistency:** where do you need strong consistency (payments, follower counts?) vs eventual (timeline)? Justify it.
- **Bottleneck-driven:** explicitly find the bottleneck ("the timeline read is the hot path at 100:1 read ratio") and design around it.

Depth over breadth here. One well-reasoned deep dive beats five shallow mentions.

## Step 7 — Wrap-up (~2 min)

- **Summarize** the design and how it meets the requirements.
- Name **trade-offs you made** and what you'd do with more time ("I chose eventual consistency for the timeline for availability; with more time I'd detail the media pipeline").
- Mention **bottlenecks, monitoring/observability** (Phase 3), and future scaling. Ending with self-aware trade-off talk is a strong finish.

## Meta-tips that separate strong candidates

- **Think out loud.** The interview evaluates your *reasoning*, not just the final diagram. Silence is invisible knowledge.
- **It's a conversation, not a monologue.** Check in ("does that make sense? want me to go deeper on the queue?"). Read their cues about where to spend time.
- **There is no single right answer.** They want to see you reason about trade-offs. "It depends, and here's what it depends on" is the correct energy.
- **Drive.** Own the whiteboard and the pace. Don't wait to be prompted for each step — move through the framework yourself.
- **Justify every choice with a requirement or a number.** "We shard because 20 TB won't fit on one node" beats "we shard because scale."
- **Manage time.** Don't spend 20 minutes on requirements. Keep an eye on the clock and make sure you reach a complete design.

## How this shows up in interviews

*This topic is the interview.* Every subsequent problem (URL shortener → payment system) is deliberate practice of this exact loop. As you work them, consciously narrate each step — requirements, estimation, API, data model, high-level, deep dive, wrap-up — until the structure is automatic and you can focus your energy on the interesting trade-offs instead of on "what do I do next?"
`,
  resources: [
    {
      title: 'System Design Interview – step-by-step framework',
      url: 'https://www.youtube.com/watch?v=i7twT3x5yv8',
      type: 'video',
      source: 'ByteByteGo (Alex Xu)',
    },
    {
      title: 'The System Design Interview Framework (written guide)',
      url: 'https://www.hellointerview.com/learn/system-design/in-a-hurry/introduction',
      type: 'article',
      source: 'Hello Interview (ex-Meta/Amazon staff)',
    },
    {
      title: 'How to succeed in a system design interview',
      url: 'https://github.com/donnemartin/system-design-primer',
      type: 'doc',
      source: 'System Design Primer (donnemartin)',
    },
    {
      title: 'Gaurav Sen — System Design playlist',
      url: 'https://www.youtube.com/playlist?list=PLMCXHnjXnTnvo6alSjVkgxV-VH6EPyvoX',
      type: 'video',
      source: 'Gaurav Sen',
    },
    {
      title: 'How to Answer a System Design Interview Problem',
      url: 'https://algomaster.io/learn/system-design-interviews/answering-framework',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
    {
      title: 'System Design Interviews (course)',
      url: 'https://algomaster.io/learn/system-design-interviews/introduction',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
    {
      title: 'AlgoMaster Newsletter',
      url: 'https://blog.algomaster.io/',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
    {
      title: 'ByteByteGo — YouTube channel',
      url: 'https://www.youtube.com/@ByteByteGo',
      type: 'video',
      source: 'ByteByteGo',
    },
    {
      title: 'codeKarle — YouTube channel',
      url: 'https://www.youtube.com/@codeKarle',
      type: 'video',
      source: 'codeKarle',
    },
  ],
  challenges: [
    {
      type: 'quiz',
      id: 'quiz-1',
      title: 'Framework & approach check',
      questions: [
        {
          q: 'The interviewer says "Design Twitter." What should you do FIRST?',
          options: [
            'Start drawing the database schema',
            'Clarify requirements — scope the functional features (and explicitly de-scope others) and the non-functional needs (scale, latency, consistency), writing the answers down before designing anything',
            'Estimate QPS immediately',
            'Name the technologies you’d use (Kafka, Redis, Cassandra)',
          ],
          answer: 1,
          explanation:
            'Jumping to design is the classic failure. The prompt is deliberately vague; your first job is to turn it into a concrete, bounded problem via requirements clarification. This demonstrates the judgment interviewers are specifically evaluating.',
        },
        {
          q: 'Why is the read-heavy vs write-heavy ratio such a design-shaping fact to establish early?',
          options: [
            'It determines the programming language',
            'It dictates what you optimize for: read-heavy systems (Twitter ~100:1) favor caching and fan-out/precomputation; write-heavy systems favor fast ingestion. It steers nearly every later decision',
            'It sets the color of the diagram',
            'It has no real effect on the design',
          ],
          answer: 1,
          explanation:
            'A 100:1 read-heavy timeline pushes you toward precomputed feeds and heavy caching; a write-heavy logging pipeline pushes you toward high-throughput ingestion and batch processing. Establishing this ratio early anchors your estimation and your deep dives.',
        },
        {
          q: 'What is the purpose of back-of-envelope estimation in the interview?',
          options: [
            'To show off arithmetic',
            'To produce numbers (QPS, storage, bandwidth) that JUSTIFY later design choices — e.g. "20 TB/year won’t fit on one node, so we shard." Estimate what will drive a decision, and round aggressively',
            'To get the exact server count right',
            'To fill time',
          ],
          answer: 1,
          explanation:
            'Estimation isn’t about precision; it’s about grounding decisions in reality. "We need caching because reads are 500k QPS" is far stronger than an unsupported assertion. Round hard — nobody wants five significant figures.',
        },
        {
          q: 'During the "deep dive" phase, what’s the right strategy?',
          options: [
            'Mention as many components as possible, briefly',
            'Go DEEP on the 1–3 hardest/most interesting parts (the bottleneck, the hot path, a scaling or consistency challenge), reasoning through trade-offs — depth over breadth',
            'Restart the design from scratch',
            'Avoid discussing failure scenarios',
          ],
          answer: 1,
          explanation:
            'The deep dive is where senior signal lives. One well-reasoned analysis of the real bottleneck (e.g. Twitter’s fan-out and celebrity problem) with explicit trade-offs beats five shallow name-drops. Often the interviewer steers you to the part they care about.',
        },
        {
          q: 'Which behavior most consistently distinguishes strong system-design candidates?',
          options: [
            'Silently drawing the perfect diagram, then explaining at the end',
            'Thinking out loud and justifying each choice with a requirement or a number, treating it as a two-way conversation and driving the structure themselves',
            'Reciting a memorized architecture for the exact company',
            'Choosing the newest, trendiest technologies',
          ],
          answer: 1,
          explanation:
            'The interview evaluates reasoning, not just the artifact. Verbalizing trade-offs, tying decisions to requirements/numbers, checking in with the interviewer, and driving the framework yourself are what signal seniority. There’s no single right answer — they want to watch you reason.',
        },
      ],
    },
    {
      type: 'design',
      id: 'design-1',
      title: 'Warm-up: apply the framework to a shortened URL service',
      prompt: `
Before the full problems, practice the FRAMEWORK itself on a simple example. You have 10 minutes. For "design a URL shortener," write out just the SKELETON of each of the 7 steps — a few bullets each — without going deep. The goal is to internalize the *structure* and the *order*, not to produce a complete design (you’ll do the full version in the next topic).

Produce: (1) 3 functional + 3 non-functional requirements, (2) one estimation that would drive a decision, (3) 2 API endpoints, (4) the main entity and its storage choice, (5) a one-line request flow for the read path, (6) one deep-dive topic you’d pick and why, (7) a one-sentence wrap-up with a trade-off.
`,
      hints: [
        'The point is the 7-step muscle memory, not completeness — keep each step short.',
        'For estimation, read:write is heavily read-skewed here — what number would justify caching?',
        'For the deep dive, what’s the single most interesting technical question in a URL shortener?',
      ],
      modelAnswer: `
A model skeleton (yours will differ — the structure is what matters):

**1. Requirements.**
- Functional: shorten a long URL → short code; redirect short code → original; (de-scoped: custom aliases, analytics, expiry — mention then set aside).
- Non-functional: very read-heavy (~100:1 redirects vs creations); redirects must be fast (< 100ms) and highly available; short codes unique and not guessable-in-bulk.

**2. Estimation (one that drives a decision).**
- Say 100M new URLs/month ≈ ~40 writes/s; reads at 100:1 ≈ ~4,000 redirects/s. Storage: 100M/mo × ~500 bytes × 5 yrs ≈ ~3 TB → fits with modest sharding; the read rate justifies heavy caching of hot links.

**3. API.**
- \`POST /shorten { long_url } -> { short_code }\`
- \`GET /{short_code} -> 301 redirect to long_url\`

**4. Data model.**
- Entity: \`Mapping { short_code (PK), long_url, created_at }\`. Storage: a key-value / NoSQL store — access is a single-key lookup by short_code, no relations, massive scale → KV is ideal (SQL also fine at this size).

**5. High-level (read path, one line).**
- Client → LB → app server → check cache (Redis) for short_code → hit: return redirect; miss: read KV store, populate cache, redirect.

**6. Deep dive I’d pick: short-code generation.** The interesting question — how to generate unique, short, non-sequential codes: base62 of a distributed counter / a key-generation service handing out ranges, vs hashing + collision handling. This is the technical heart of the problem, so I’d spend my depth here.

**7. Wrap-up.** "It’s a read-heavy KV lookup fronted by a cache; the key trade-off is code generation — I chose a pre-generated key service for guaranteed uniqueness without collision checks, at the cost of running that service."

**Self-check:** did you move through all 7 steps in order, keep each short, and pick a deep dive with a *reason*? That loop — not the specific answers — is what you’re drilling. The next topic does this same problem in full depth.
`,
    },
  ],
}
