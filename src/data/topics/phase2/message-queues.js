export default {
  id: 'message-queues',
  title: 'Message Queues & Event Streaming',
  subtitle: 'Async decoupling, Kafka vs RabbitMQ, delivery semantics, and backpressure',
  days: 3,
  content: `
## Why this matters for system design

The queue is the third pillar of every architecture (LB + cache + **queue**). It's how you make slow things async, absorb traffic spikes, decouple services, and fan events out to many consumers. Interviewers expect you to know *when* to reach for one, the Kafka-vs-RabbitMQ distinction, and the delivery-semantics question that always follows.

## The core idea: decouple in time

Synchronous: caller waits for the whole chain (upload → resize → notify → 8 seconds of spinner).
Asynchronous: caller enqueues a job, gets \`202 Accepted\` in 20 ms; **workers** process at their own pace.

What the queue buys:

1. **Latency:** the user waits only for the enqueue.
2. **Spike absorption:** flash-sale burst of 50k orders/s? The queue depth grows; workers drain at 5k/s; nothing falls over. The queue is a *shock absorber*.
3. **Decoupling:** producer doesn't know/care who consumes. New consumer (fraud check) = subscribe, zero producer changes.
4. **Failure isolation & retry:** consumer crashed? Messages wait. Downstream API flaky? Retry from the queue with backoff — the request path never feels it.

The rule of thumb: **anything the user doesn't need in the response should leave the request path** — emails, thumbnails, feed fan-out, analytics, webhooks, indexing. Systems built this way — services emitting events and reacting to each other's events instead of calling each other directly — are described as **event-driven architecture**; the queue/log is the backbone that makes it possible.

## Two species: message queues vs event logs

### Task/message queues (RabbitMQ, SQS)
A job dispatcher: message → one worker consumes it → ack → message DELETED.
- Rich routing (exchanges, priorities, per-message delays, dead-letter queues).
- Competing consumers scale horizontally naturally.
- Mental model: **a to-do list**.

### Event log / streaming (Kafka)
An **append-only log** (LSM lessons apply: sequential I/O + page cache + zero-copy = millions of msgs/s). Messages are NOT deleted on consumption — they live until retention expires (days/weeks/∞).
- Consumers track their own **offset** (position in the log); independent **consumer groups** each get ALL messages (fan-out for free).
- **Replay:** new service? Bug fix? Rewind the offset, reprocess history. This is the killer feature queues don't have.
- **Partitions** = Kafka's sharding: topic split into N partitions by message key; ordering guaranteed *within* a partition only; consumer-group parallelism ≤ partition count. Partition by \`user_id\` → each user's events stay ordered. (Everything from the sharding topic applies: hot keys included.)
- Mental model: **a newspaper archive with bookmarks**.

**Choosing:** task dispatch with routing/priorities → RabbitMQ/SQS. Event distribution to multiple consumers, high throughput, replay, stream processing → Kafka. Interview default for "events at scale" is Kafka; for "background jobs" either is fine (say why).

## Delivery semantics — the guaranteed follow-up

- **At-most-once:** fire and forget. Fast; losable (metrics, maybe).
- **At-least-once:** ack after processing; crash before ack ⇒ redelivery ⇒ **duplicates**. The practical default.
- **Exactly-once:** the unicorn. True exactly-once *delivery* is impossible over unreliable networks; what systems achieve is **effectively-once processing** = at-least-once delivery + **idempotent consumers** (dedupe by message/idempotency key) or transactional offsets (Kafka transactions).

\`\`\`mermaid
sequenceDiagram
  autonumber
  participant P as Producer
  participant B as Broker
  participant C as Consumer
  P->>B: publish (persisted)
  B->>C: deliver
  Note over C: crashes before ack
  B->>C: redeliver (no ack seen)
  Note over C: idempotent handler — dedupes by message key, processes once
\`\`\`

**The line to say:** "at-least-once delivery with idempotent consumers — dedupe on the message key." It answers 90% of follow-ups. (Full idempotency topic in Phase 3.)

Ordering caveat: retries + parallel consumers also scramble ORDER; if order matters, key-partition the stream and process each key serially.

## Operational patterns you must name

- **Dead-letter queue (DLQ):** after N failed attempts, park the message aside (with error metadata) instead of poison-pilling the queue forever; alert + inspect + replay.
- **Backpressure:** producers outpacing consumers forever = unbounded queue = eventual explosion. Monitor **queue depth & consumer lag** (THE health metrics); autoscale workers on lag; if still drowning — shed load or slow producers. A queue buffers *bursts*, not a permanent rate mismatch.
- **Outbox pattern (preview):** "write to DB AND publish event" atomically — write the event into an \`outbox\` table in the same DB transaction; a relay publishes it. Solves dual-write inconsistency; starred in Phase 3.
- **CDC (change data capture):** the DB's own change stream (via WAL) as an event source (Debezium → Kafka) — how caches/search indexes stay in sync without app dual-writes.

## Quick sizing intuitions

- A Kafka broker: ~**100s of MB/s**; partitions are the parallelism unit (rule of thumb: plan partitions ≈ target consumer parallelism × headroom).
- Queue depth × avg processing time = drain time. 1M backlog ÷ (100 workers × 10 msg/s) = 1,000 s ≈ 17 min — do this math aloud when discussing spikes.

## How this shows up in interviews

- Any upload/order/notification flow: draw the queue, name the pattern ("202 + async workers + DLQ").
- Feed/notification fan-out: Kafka partitioned by user, consumer groups per delivery channel.
- "What if a message is processed twice?" → at-least-once + idempotent consumer, always.
- "What if the consumer can't keep up?" → lag metrics, autoscale, backpressure, shed low-priority work.
`,
  resources: [
    {
      title: 'Message queues explained',
      url: 'https://www.youtube.com/watch?v=W4_aGb_MOls',
      type: 'video',
      source: 'ByteByteGo (YouTube)',
    },
    {
      title: 'Kafka in 100 seconds → then the full architecture',
      url: 'https://www.youtube.com/watch?v=uvb00oaa3k8',
      type: 'video',
      source: 'Fireship / Confluent',
    },
    {
      title: 'The Log: What every software engineer should know (foundational essay)',
      url: 'https://engineering.linkedin.com/distributed-systems/log-what-every-software-engineer-should-know-about-real-time-datas-unifying',
      type: 'article',
      source: 'Jay Kreps (Kafka creator), LinkedIn Engineering',
    },
    {
      title: 'Pub/Sub',
      url: 'https://algomaster.io/learn/system-design/pub-sub',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
    {
      title: 'Change Data Capture (CDC)',
      url: 'https://algomaster.io/learn/system-design/change-data-capture-cdc',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
    {
      title: 'Batch Processing vs Stream Processing',
      url: 'https://blog.algomaster.io/p/batch-processing-vs-stream-processing',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
    {
      title: 'What is Event-Driven Architecture?',
      url: 'https://www.confluent.io/learn/event-driven-architecture/',
      type: 'article',
      source: 'Confluent',
    },
    {
      title: 'Kafka: a Distributed Messaging System for Log Processing',
      url: 'https://notes.stephenholiday.com/Kafka.pdf',
      type: 'doc',
      source: 'LinkedIn (Kreps, Narkhede, Rao)',
    },
  ],
  challenges: [
    {
      type: 'quiz',
      id: 'quiz-1',
      title: 'Queues & streaming check',
      questions: [
        {
          q: 'Order placement calls: payment (sync) + email + loyalty points + analytics + warehouse notify. Latency is 2.5 s. What is the right split?',
          options: [
            'Make everything async including payment',
            'Payment stays synchronous (user needs the result); everything else publishes an "order_placed" event consumed by email/loyalty/analytics/warehouse services',
            'Make everything faster with more servers',
            'Batch orders every minute',
          ],
          answer: 1,
          explanation:
            'The user’s response needs exactly one answer: did payment succeed? All side effects are async subscribers. Response time drops to payment time; new consumers subscribe without touching checkout. The rule: nothing leaves the request path except what the response requires.',
        },
        {
          q: 'Kafka vs RabbitMQ: your feature needs 5 independent services to EACH receive every user-activity event, with 7-day replay for backfills. Which and why?',
          options: [
            'RabbitMQ — it is simpler',
            'Kafka — consumer groups give every service the full stream independently, and the retained log allows offset rewind/replay',
            'Either works identically',
            'A database table polled by all 5',
          ],
          answer: 1,
          explanation:
            'Queues delete on consumption — 5 consumers would need 5 bound queues and there’s no replay. The retained log with per-group offsets is exactly this use case. (Polling a table = building a worse Kafka.)',
        },
        {
          q: 'A worker processes "send ₹500" then crashes BEFORE acking. The queue redelivers. What must be true to avoid double-sending?',
          options: [
            'The queue must guarantee exactly-once delivery',
            'The consumer must be idempotent: check/store the message’s idempotency key so reprocessing returns the prior result instead of transferring again',
            'Workers must never crash',
            'Use at-most-once and accept lost transfers',
          ],
          answer: 1,
          explanation:
            'Redelivery-after-crash is unavoidable under at-least-once (the only practical guarantee). Dedup at the consumer (key → result table, or transactional processing) converts it to effectively-once. This exact Q&A appears in most queue discussions.',
        },
        {
          q: 'Your Kafka topic is partitioned by user_id. What ordering do you actually have?',
          options: [
            'Global ordering across all messages',
            'Per-user ordering: each user’s events stay in sequence within their partition; no ordering ACROSS users',
            'No ordering at all',
            'Ordering only within a single broker',
          ],
          answer: 1,
          explanation:
            'Kafka orders within a partition only. Keying by user_id puts each user’s events on one partition = per-user sequence (usually exactly what you need: a user’s cart events in order). Global order would require 1 partition = no parallelism.',
        },
        {
          q: 'One malformed message crashes the consumer, which restarts, reads the same message, crashes again — forever. The missing piece:',
          options: [
            'A faster consumer',
            'A dead-letter queue: after N failures, move the poison message aside with error context, alert, and continue with the rest',
            'Skip acking entirely',
            'Bigger messages',
          ],
          answer: 1,
          explanation:
            'Poison messages must exit the main flow after bounded retries — the DLQ preserves them for diagnosis/replay while the pipeline lives on. No DLQ = one bad message halts the world (a real outage classic).',
        },
        {
          q: 'Queue depth grows linearly all day and never drains. The correct read of this signal:',
          options: [
            'Normal queue behavior — queues are buffers',
            'Consumers are permanently slower than producers: autoscale workers / optimize processing / shed load — a queue absorbs BURSTS, not a sustained rate mismatch',
            'The queue needs more disk',
            'Producers should pause at night',
          ],
          answer: 1,
          explanation:
            'Ever-growing depth = arrival rate > service rate, permanently. The buffer only postpones the reckoning (and grows latency unboundedly). Fix throughput or reduce input; monitor consumer lag as a paged metric.',
        },
        {
          q: 'Service writes the order to its DB, then publishes "order_created" to Kafka — and crashes between the two. Orders exist that no one heard about. Named fix?',
          options: [
            'Publish first, then write the DB',
            'The transactional outbox: write order + event row in ONE DB transaction; a relay/CDC ships outbox rows to Kafka — the dual-write can no longer half-happen',
            'Two-phase commit between DB and Kafka',
            'Retry the publish forever',
          ],
          answer: 1,
          explanation:
            'Dual writes to two systems can’t be atomic without help (publish-first just inverts the failure). The outbox rides the DB’s own atomicity; the relay is at-least-once (+ idempotent consumers). Phase 3 formalizes it — recognizing it here is gold.',
        },
      ],
    },
    {
      type: 'lab',
      id: 'lab-1',
      title: 'Queues, consumer groups, and duplicates — with Redis',
      intro:
        'Redis Streams give you a mini-Kafka locally: append-only log, consumer groups, acks, pending lists. Perfect for feeling the semantics.',
      steps: [
        {
          instruction: 'Produce 5 events into a stream (append-only log).',
          command: "for i in 1 2 3 4 5; do redis-cli xadd orders '*' order_id $i amount $((i*100)) > /dev/null; done; redis-cli xlen orders",
          expected: '5 — an append-only log with auto-assigned, time-ordered IDs.',
        },
        {
          instruction: 'Read the log from the beginning — twice. Notice consumption does NOT delete.',
          command: 'redis-cli xrange orders - + COUNT 3 && echo "--- again ---" && redis-cli xrange orders - + COUNT 3',
          expected: 'Same events both times: log semantics (Kafka-style), not queue semantics. Replay is free.',
        },
        {
          instruction: 'Create a consumer group and consume as worker-1, WITHOUT acking.',
          command: "redis-cli xgroup create orders payments 0 2>/dev/null; redis-cli xreadgroup GROUP payments worker-1 COUNT 2 STREAMS orders '>'",
          expected: 'worker-1 receives 2 events; they are now "delivered but unacked" — the at-least-once window is open.',
        },
        {
          instruction: 'Simulate worker-1 crashing: check the pending (unacked) list, then CLAIM its messages as worker-2 — the redelivery that causes duplicates.',
          command: 'redis-cli xpending orders payments && redis-cli xautoclaim orders payments worker-2 0 0 COUNT 2',
          expected: 'worker-2 now holds the SAME messages worker-1 saw. If both had done real work: duplicate processing. THIS is why consumers must be idempotent.',
        },
        {
          instruction: 'Ack them as processed and confirm pending drains.',
          command: "ids=$(redis-cli xrange orders - + COUNT 2 | grep -E '^[0-9]+-[0-9]+$' | tr '\\n' ' '); redis-cli xack orders payments $ids; redis-cli xpending orders payments",
          expected: 'Pending count decreases — ack-after-processing is the at-least-once contract in action.',
        },
        {
          instruction: 'Do the drain-time math for a spike: 1M backlog, 50 workers × 20 msg/s each. How long? (Use the calculator or your head.)',
          expected: '1e6 / (50×20=1000/s) = 1000 s ≈ 17 minutes. Acceptable for emails; not for OTPs — which is why OTP queues get dedicated priority lanes.',
        },
        {
          instruction: 'Clean up.',
          command: 'redis-cli del orders',
          expected: 'Stream removed.',
        },
      ],
    },
    {
      type: 'design',
      id: 'design-1',
      title: 'Design exercise: async pipeline for video uploads',
      prompt: `
Design the post-upload pipeline for a video platform: after a creator uploads a raw video (already sitting in object storage), the system must: transcode to 5 resolutions (heavy, minutes each), generate thumbnails, run content moderation (calls an ML service), update the search index, and notify subscribers — WITHOUT making the creator wait.

Cover: the event flow, queue/stream choices, how transcode workers scale, failure handling (moderation service down for 1 hour), and what "the video is ready" means when steps finish at different times.
`,
      hints: [
        'One event, many independent consumers — which messaging species?',
        'Transcoding is CPU-bound (Phase 1!) — what does its worker fleet look like?',
        'A state machine on the video row answers the "ready" question.',
      ],
      modelAnswer: `
**Flow:** upload completes → API writes \`videos\` row (\`state=UPLOADED\`) + outbox event → **Kafka topic \`video.uploaded\`** (partitioned by video_id). Independent consumer groups: transcode, thumbnails, moderation, search-index, notifications. One event, five subscribers — Kafka's fan-out, chosen over a task queue because consumers are independent and replay matters (reprocess after a bad moderation model, backfill a new consumer).

**Transcoding:** its consumer group enqueues per-resolution TASKS into a work queue (SQS/Rabbit semantics fit here: each task to exactly one worker). Fleet is CPU-bound → dedicated instances (or GPU for encode), autoscaled on queue depth; each task idempotent (output keyed \`video/{id}/{res}\` in object storage — re-running overwrites identically). 5 resolutions in parallel; completion events append to \`video.assets\`.

**State machine (answers "ready"):** the video row aggregates progress: \`UPLOADED → PROCESSING → PLAYABLE (any one resolution + moderation PASSED) → COMPLETE (all resolutions)\`. Publish/subscribe visibility rules read the state; "playable at first rendition" is the UX win (YouTube behaves exactly this way — low-res first).

**Moderation down 1 hour:** its consumer group simply lags — messages retained in Kafka, offset stands still, lag alert fires; on recovery it drains the backlog. Videos stay in PROCESSING (not public) — failing CLOSED for trust-and-safety. Per-message errors → bounded retries with backoff → DLQ + human review queue.

**Semantics:** everything at-least-once + idempotent (deterministic output keys, upsert-style index updates, notification dedup on (user, video)). Subscriber notification fan-out itself goes through the notification service's own queue — this pipeline just emits one \`video.playable\` event.

**The sentence that ties it off:** "The creator's request ends at the outbox write; everything after is replayable, independently-scaled consumers hanging off one event log, with a state machine on the video row as the single source of truth for readiness."
`,
    },
  ],
}
