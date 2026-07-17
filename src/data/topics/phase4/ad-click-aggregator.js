export default {
  id: 'ad-click-aggregator',
  title: 'Design an Ad Click Aggregator',
  subtitle: 'High-volume stream processing: ingest millions of click events/sec and serve accurate, near-real-time aggregates — the batch vs streaming (Lambda) classic',
  days: 2,
  content: `
## The problem

Design a system that records **ad click events** at massive scale (millions per second) and lets advertisers query **aggregated metrics** — clicks per ad, per minute/hour, by region — in near-real-time, while also producing **accurate** totals for billing. The tension at the core: **fast approximate aggregates for dashboards** vs **exact, deduplicated, reconciled numbers for money**. This is the canonical **data-intensive / stream-processing** interview.

## Step 1 — Requirements

**Functional:** (1) ingest click events reliably, (2) query aggregated metrics (clicks by ad_id, time window, dimension) with low latency, (3) support near-real-time (last few minutes) **and** historical queries.

*De-scope but mention:* fraud detection, impression tracking, complex attribution.

**Non-functional:** **extreme write throughput** (millions of events/sec) — the defining constraint. **Low-latency reads** on aggregates. **Accuracy** — this feeds billing, so we can't just drop events; ideally **exactly-once / deduplicated** counting. **Availability + durability** (a lost click is lost revenue). **Idempotency** (retries must not double-count).

## Step 2 — Estimation

- Say **10M clicks/sec** peak. Each event ~100 bytes → **~1 GB/sec** ingest, **~86 TB/day** raw. You **cannot** store and scan raw events per query — you must **pre-aggregate**.
- Queries are over **aggregates** (clicks per ad per minute), which are tiny compared to raw events → pre-aggregation shrinks read-side data by orders of magnitude.
- The write:read ratio is **write-dominated** at ingest but read-friendly after aggregation. This split — heavy write pipeline feeding a small, fast read store — shapes the whole design.

## Step 3 — API

\`\`\`
POST /click        body:{ ad_id, user_id, ts, region, event_id }   → 202 accepted
GET  /metrics?ad_id=..&from=..&to=..&granularity=minute            → time series of counts
\`\`\`
Ingest is **fire-and-forget (202 Accepted)** — you acknowledge fast and process asynchronously; you never make the click path wait on aggregation. The \`event_id\` is the **idempotency key** for dedup.

## Step 4 — Data model

- **Raw events (optional, cold):** appended to cheap storage (S3/data lake) for reprocessing and audits — not queried directly.
- **Aggregates (hot, served):** \`(ad_id, minute_bucket, region) → count\`, stored in an **OLAP / columnar store** (e.g., ClickHouse, Druid, or a time-series DB) optimized for group-by/range scans over dimensions. This is what dashboards query.

Pre-aggregating into time buckets (per-minute, rolled up to hour/day) is the key modeling move: reads hit small, indexed summaries, not billions of rows.

## Step 5 — High-level design (streaming pipeline)

\`\`\`
 clients ─▶ Ingest API (202) ─▶ Kafka (durable log, partitioned by ad_id)
                                      │
                     Stream processor (Flink/Spark Streaming)
                     — windowed aggregation, dedup by event_id —
                                      │
                          ┌───────────┴───────────┐
                    OLAP store (hot aggregates)   Data lake (raw, cold)
                          │                                 │
                     Dashboard queries              Batch recompute (nightly)
\`\`\`

\`\`\`mermaid
graph LR
  C[Clients] -->|POST click 202| I[Ingest API]
  I --> K[(Kafka<br/>partitioned by ad_id)]
  K --> S[Stream processor<br/>window + dedup]
  S --> O[(OLAP store<br/>minute aggregates)]
  K --> L[(Data lake<br/>raw events)]
  L --> B[Nightly batch<br/>recompute]
  B --> O
  O --> Q[Advertiser dashboards]
\`\`\`

## Step 6 — Deep dive: the pipeline, exactly-once, and Lambda architecture

**Why a message queue first?** Millions of events/sec is spiky and must not be lost. **Kafka** absorbs the firehose as a **durable, replayable log**, decoupling ingest speed from processing speed (back-pressure protection). Partition by \`ad_id\` so all events for an ad land in order on one partition — enabling correct per-ad windowed aggregation. (This is the Phase 2 message-queue building block at full scale.)

**Stream processing with windows.** A stream processor (**Flink / Spark Streaming / Kafka Streams**) consumes partitions and maintains **tumbling windows** (e.g., 1-minute buckets), incrementing counts per (ad_id, minute, region), then flushes each closed window's totals to the OLAP store. Dashboards read near-real-time counts seconds after the clicks happen.

**Exactly-once / dedup (the accuracy crux).** Because this feeds billing, double-counting = overcharging. Sources of duplicates: client retries, at-least-once queue delivery, processor restarts. Defenses:
- **Idempotency key** (\`event_id\`) — dedup within a window by tracking seen ids (a set, or a probabilistic filter like a **Bloom filter** from Phase 3 for memory efficiency, accepting a tiny false-positive rate for non-billing paths).
- **Exactly-once processing** in Flink via **checkpointing + transactional sinks**, so a restart replays from the last checkpoint without re-emitting counts.
- **Idempotent writes** to the aggregate store (upsert a bucket to an absolute value rather than blind increments where possible).

**Late/out-of-order events.** Clicks can arrive late (mobile offline, network delay). Use **event-time windows with watermarks** (process by the event's own timestamp, not arrival time) and allow a grace period; extremely late events get corrected by the batch layer.

**Lambda architecture — speed layer + batch layer (the headline pattern).** Serve two paths:
- **Speed layer** (streaming) → fast, *approximate*, near-real-time counts for dashboards. Optimized for latency; may miss a few late events or over/under-count slightly.
- **Batch layer** (nightly job over the raw data lake) → **recomputes exact, deduplicated, reconciled totals** and overwrites the day's aggregates. This is the **source of truth for billing**.

The dashboard shows the fast streaming number immediately; the batch layer later corrects it to the exact figure. Naming this **speed-vs-batch (Lambda) trade-off** — *approximate-and-fast* reconciled by *exact-and-slow* — is the strongest single point you can make. (Mention **Kappa architecture** — a streaming-only variant that reprocesses from the Kafka log — as the modern alternative that avoids maintaining two codebases.)

**Scaling reads.** The OLAP store is columnar and pre-aggregated, so group-by/time-range queries are fast; shard by ad_id/time and cache hot advertiser dashboards.

## Step 7 — Wrap-up

An ad click aggregator is a **write-heavy stream-processing** problem: absorb millions of events/sec into a **durable, partitioned Kafka log** (fire-and-forget 202 ingest, never blocking the click), aggregate with a **windowed stream processor** into per-minute buckets in an **OLAP/columnar store** that dashboards query in near-real-time. Because the counts drive **billing**, accuracy is non-negotiable: dedup by **event_id**, get **exactly-once** via checkpointing + idempotent/transactional writes, and handle **late events** with event-time windows and watermarks. The defining architectural choice is **Lambda**: a fast approximate **speed layer** for live dashboards, reconciled by a **batch layer** that recomputes exact totals from the raw data lake as the billing source of truth (or **Kappa** to do it all from the stream). With more time: fraud filtering, richer dimensions/roll-ups, and tiered retention.

## How this shows up in interviews

- The flagship **data-intensive / streaming** question. The signal is reaching for a **queue → stream processor → OLAP** pipeline and reasoning about **throughput, windowing, and exactly-once**.
- Expect **"how do you avoid double-counting when clicks feed billing?"** → idempotency keys / dedup, exactly-once (checkpointing + transactional sinks), idempotent aggregate writes.
- Expect **"fast dashboards vs accurate billing — how do you get both?"** → **Lambda**: speed layer (approximate, real-time) + batch layer (exact, reconciled); mention Kappa.
- Expect **"clicks arrive late / out of order"** → event-time windows + watermarks + grace period, corrected by batch.
- A natural place to reuse Phase 2 (message queues) and Phase 3 (idempotency, Bloom filters) — showing the building blocks compose.
`,
  resources: [
    {
      title: 'Design an Ad Click Aggregator',
      url: 'https://www.hellointerview.com/learn/system-design/problem-breakdowns/ad-click-aggregator',
      type: 'article',
      source: 'Hello Interview',
    },
    {
      title: 'Lambda vs Kappa architecture explained',
      url: 'https://www.youtube.com/watch?v=B-ts_bMorpU',
      type: 'video',
      source: 'system design walkthrough',
    },
    {
      title: 'Apache Flink — exactly-once & event time',
      url: 'https://nightlies.apache.org/flink/flink-docs-stable/docs/concepts/time/',
      type: 'doc',
      source: 'Apache Flink Docs',
    },
    {
      title: 'Streaming 101: the world beyond batch',
      url: 'https://www.oreilly.com/radar/the-world-beyond-batch-streaming-101/',
      type: 'article',
      source: "O'Reilly (Tyler Akidau)",
    },
  ],
  challenges: [
    {
      type: 'quiz',
      id: 'quiz-1',
      title: 'Ad click aggregator check',
      questions: [
        {
          q: 'Why put a durable message queue (Kafka) between the ingest API and the aggregation logic, and why partition by ad_id?',
          options: [
            'To make the API slower',
            'Kafka durably absorbs the millions-of-events/sec firehose and decouples ingest speed from processing speed (back-pressure protection, replayable log so nothing is lost); partitioning by ad_id keeps all of an ad\'s events together so per-ad windowed aggregation is correct',
            'Kafka stores the final aggregates',
            'It removes the need for a database',
          ],
          answer: 1,
          explanation:
            'A durable, replayable log absorbs spikes, prevents event loss, and lets the (slower) stream processor consume at its own pace. Partitioning by ad_id routes an ad\'s events to one partition in order, which is what correct per-ad, per-window counting needs.',
        },
        {
          q: 'These counts feed billing, so double-counting overcharges advertisers. Which combination best ensures accurate, exactly-once counts?',
          options: [
            'Just trust the client not to retry',
            'An idempotency key (event_id) to dedup, exactly-once stream processing via checkpointing + transactional sinks, and idempotent/upsert writes to the aggregate store — so retries, at-least-once delivery, and processor restarts don\'t inflate counts',
            'Count everything twice and divide by two',
            'Use a bigger database',
          ],
          answer: 1,
          explanation:
            'Duplicates come from client retries, at-least-once queues, and restarts. Dedup by event_id, exactly-once processing (checkpoint + transactional sink so a restart replays without re-emitting), and idempotent aggregate writes together prevent inflation on the billing path.',
        },
        {
          q: 'How does a Lambda architecture give you BOTH real-time dashboards and exact billing numbers?',
          options: [
            'It only does real-time',
            'A speed layer (streaming) serves fast, approximate near-real-time counts for dashboards, while a batch layer periodically recomputes exact, deduplicated, reconciled totals from the raw event log and overwrites them as the billing source of truth',
            'It stores every raw event and scans them per query',
            'It uses two databases for the same speed',
          ],
          answer: 1,
          explanation:
            'Lambda splits fast-but-approximate (speed/streaming) from slow-but-exact (batch over the raw data lake). Dashboards show the live streaming number; the batch layer later corrects it to the precise figure for billing. Kappa is the streaming-only alternative that reprocesses from the log to avoid two codebases.',
        },
      ],
    },
    {
      type: 'design',
      id: 'design-1',
      title: 'Design exercise: the full ad click aggregator',
      prompt: `
Design an ad click aggregator end to end using the 7-step framework. Ingest ~10M click events/sec and let advertisers query aggregated metrics (clicks by ad, per minute/hour, by region) in near-real-time, while producing exact totals for billing.

Cover: requirements (call out the write throughput and the accuracy/billing tension), estimation that proves you can't store-and-scan raw events per query, the API (why fire-and-forget ingest?), the data model (raw vs aggregates, which store?), the streaming pipeline, and — as your deep dive — how you get exactly-once accuracy and handle the "fast dashboards vs exact billing" trade-off. Then extend: how do you handle clicks that arrive late or out of order?
`,
      hints: [
        'Estimation: raw volume (~1 GB/s, ~86 TB/day) forces pre-aggregation into time buckets.',
        'Pipeline: Ingest (202) → Kafka (partition by ad_id) → stream processor (windows) → OLAP store.',
        'Exactly-once: event_id dedup + checkpointing/transactional sinks + idempotent aggregate writes.',
        'The headline is Lambda: speed layer (approximate, real-time) reconciled by batch (exact, billing). Mention Kappa.',
        'Late events: event-time windows + watermarks + grace period, corrected by the batch layer.',
      ],
      modelAnswer: `
**Requirements** — Functional: ingest clicks reliably; query aggregates by ad_id/time-window/dimension; near-real-time + historical. Non-functional: extreme write throughput (millions/sec), low-latency aggregate reads, accuracy (feeds billing → exactly-once/dedup), durability (a lost click = lost revenue), idempotency.

**Estimation** — 10M clicks/sec × ~100 B ≈ 1 GB/s, ~86 TB/day raw. Can't store-and-scan raw per query → must pre-aggregate into per-minute buckets, which are orders of magnitude smaller and read-friendly. Write-dominated ingest feeding a small fast read store.

**API** — POST /click → 202 Accepted (fire-and-forget; never block the click on aggregation), event_id as idempotency key. GET /metrics?ad_id&from&to&granularity → time series.

**Data model** — Raw events appended to a cheap data lake (S3) for reprocessing/audit (not queried directly). Aggregates (ad_id, minute_bucket, region) → count in an OLAP/columnar store (ClickHouse/Druid) for fast group-by/range scans; roll minutes up to hour/day.

**Pipeline** — Ingest API → Kafka (durable, replayable, partitioned by ad_id for ordered per-ad aggregation, absorbs spikes/back-pressure) → stream processor (Flink/Spark Streaming) doing tumbling-window aggregation → flush closed windows to OLAP; Kafka also lands raw events in the lake.

**Deep dive — exactly-once + speed vs billing:** dedup by event_id (a set or Bloom filter for memory on non-billing paths); exactly-once via Flink checkpointing + transactional sinks so restarts replay without re-emitting; idempotent/upsert aggregate writes. Lambda architecture: speed layer streams fast approximate counts to dashboards; batch layer nightly recomputes exact, deduplicated, reconciled totals from the raw lake and overwrites the day — the billing source of truth. Dashboards show the live number, corrected later to the exact one. Kappa (streaming-only, reprocess from the Kafka log) avoids maintaining two codebases.

**Extension — late/out-of-order:** use event-time windows with watermarks (aggregate by the event's own timestamp, not arrival) and a grace period for slightly-late events; very late ones are corrected by the batch layer.

**Scaling reads:** columnar pre-aggregated store makes time-range group-bys fast; shard by ad_id/time; cache hot advertiser dashboards.

**Trade-offs:** speed layer trades exactness for latency, reconciled by batch; at-least-once delivery + dedup vs the complexity of end-to-end exactly-once; keeping raw events costs storage but enables recompute/audit.

**One-line summary:** a fire-and-forget ingest into a durable ad_id-partitioned Kafka log, windowed by a stream processor into per-minute OLAP aggregates for near-real-time dashboards, with exactly-once dedup and a Lambda batch layer that recomputes exact reconciled totals from the raw lake as the billing source of truth.
`,
    },
  ],
}
