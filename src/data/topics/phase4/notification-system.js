export default {
  id: 'notification-system',
  title: 'Design a Notification System',
  subtitle: 'Fan-out to millions across push/SMS/email — queues, provider abstraction, and delivery guarantees',
  days: 2,
  content: `
## The problem

Design a system that sends notifications to users across multiple channels — **mobile push (APNs/FCM), SMS, email, and in-app**. It's triggered by events ("your order shipped", "someone liked your post", a marketing blast) and must reliably deliver to potentially **millions of users**. This problem is really about **asynchronous fan-out through queues**, **integrating unreliable third-party providers**, and **delivery semantics** — a showcase for Phase 2 (message queues) and Phase 3 (idempotency, resiliency).

## Step 1 — Requirements

**Functional:** accept a notification request (to a user/segment, on one or more channels), look up the user's device tokens / contact info and **preferences**, and deliver via the right provider. Support **transactional** (order shipped — high priority, immediate) and **bulk/marketing** (a promo to 10M users — lower priority) notifications. Respect user **opt-outs** and rate limits.

**Non-functional:** **high throughput** (millions of sends), **reliable delivery** (at-least-once — don't silently drop the "your payment failed" alert), **low latency for transactional**, resilient to flaky third-party providers, and it must **not lose messages** if a downstream is down.

## Step 2 — Estimation

- Say **10M notifications/day** average, but **bursty** — a marketing blast might be 10M in an hour (~2,800/sec) and product events spike unpredictably. This burstiness is the key driver: **you cannot send synchronously**; you need a **buffer (queue)** to absorb spikes and decouple producers from the slower delivery step.

## Step 3 — API

\`\`\`
POST /notifications
  { user_id | segment_id, channels: ["push","email"], template_id, data, priority }
  → 202 Accepted { notification_id }   // accepted for async delivery, not "sent"
\`\`\`
Note the **202 Accepted**: the API enqueues and returns immediately; actual sending happens asynchronously. Clients get a status via webhook or a status endpoint.

## Step 4 — Data model

- **User preferences / devices:** \`User { id, email, phone, device_tokens[], channel_prefs, opt_outs, timezone }\` — a DB queried at send time.
- **Templates:** \`Template { id, channel, subject, body_with_placeholders }\`.
- **Notification log:** \`Notification { id, user_id, channel, status (queued/sent/delivered/failed), attempts, timestamps }\` — for tracking, retries, dedup, and analytics.

## Step 5 — High-level design

\`\`\`
 producers ─▶ Notification API ─▶ [Message Queue] ─▶ Notification Workers
 (services)     (validate,          (buffer, decouple,   │  (look up prefs/tokens,
                 enqueue, 202)       priority queues)      │   render template,
                                                           │   check opt-out/rate limit)
                                                           ▼
                                          Channel adapters (Push / SMS / Email / In-app)
                                                           ▼
                                    3rd-party providers: APNs, FCM, Twilio, SES/SendGrid
                                                           ▼
                                    delivery receipts ─▶ update Notification log
\`\`\`

Core shape: **API → queue → workers → provider adapters → external providers**, with a **notification log** tracking state. The queue is the heart — it absorbs bursts, decouples fast producers from slow delivery, and enables retries.

## Step 6 — Deep dives

**Why a queue is mandatory.** Sending is slow (network round-trips to APNs/Twilio, rate limits) and bursty. Synchronous sending would (a) make the triggering request hang, (b) collapse under a marketing blast, and (c) lose everything on a crash. The queue **buffers the spike**, lets workers drain at a sustainable rate, and **persists** messages so nothing is lost if a worker or provider is down. Use **priority queues** (or separate queues) so transactional alerts jump ahead of bulk marketing.

**Provider abstraction & fan-out.** Wrap each provider behind a common **channel adapter** interface (\`send(notification)\`), so adding a provider or failing over from one SMS vendor to another doesn't ripple through the system. A dispatcher fans a single request out to multiple channels (push + email) as separate queue messages.

**Delivery guarantees — at-least-once + idempotency.** Queues give **at-least-once** delivery: a worker might crash after sending but before ack'ing, so a message gets reprocessed → **duplicate notification**. Prevent double-sends with an **idempotency key** per (notification_id, channel): the worker records "sent" atomically and skips if already sent (Phase 3 idempotency). Exactly-once *delivery* to a phone is impossible end-to-end, but at-least-once + dedup gets you effectively-once for the user.

**Handling flaky providers (resiliency).** Providers fail and throttle. Apply Phase 3 patterns: **retries with exponential backoff + jitter** for transient failures, a **circuit breaker** per provider (stop hammering a down vendor, fail over to a backup), and a **dead-letter queue** for messages that fail after N attempts (for inspection/manual retry, so they're never silently lost). Respect provider **rate limits** (token bucket per provider).

**Preferences, opt-outs, and throttling.** Before sending, check the user's channel preferences and **opt-out/unsubscribe** status (legal requirement for marketing) and **do-not-disturb / timezone** (don't SMS at 3am). Deduplicate/collapse noisy notifications ("3 people liked your post" instead of 3 pushes) to avoid notification fatigue.

**Scaling & analytics.** Workers scale horizontally (stateless, pull from the queue). Provider **delivery receipts/webhooks** flow back to update the notification log (sent → delivered → opened), feeding analytics and retry logic. Partition queues by channel/priority for isolation (a slow email provider shouldn't back up push).

## Step 7 — Wrap-up

A notification system is an **async fan-out pipeline**: an API that **enqueues** (returns 202), a durable **message queue** (with priorities) that absorbs bursts and decouples producers from slow delivery, **stateless workers** that render templates and apply preferences/opt-outs/rate limits, and **provider adapters** that abstract flaky third parties. Reliability comes from **at-least-once delivery + idempotency keys** (dedup double-sends), **retries/backoff + circuit breakers + a dead-letter queue** for provider failures, and a **notification log** tracking state. Trade-offs: at-least-once means we design for occasional duplicates rather than chase impossible exactly-once; priority queues trade complexity for the ability to keep transactional alerts fast under a marketing blast.

## How this shows up in interviews

- The core insight the interviewer wants: **it must be asynchronous — a queue decouples producers from slow, bursty, unreliable delivery.** Lead with that.
- Expect **"what if a provider goes down / a send fails?"** — retries + backoff + circuit breaker + dead-letter queue; never silently drop.
- Expect **"how do you avoid sending the same notification twice?"** — at-least-once + idempotency key + dedup on the notification log.
- Bonus signals: priority/transactional-vs-bulk separation, provider abstraction for failover, opt-out/DND/timezone handling, and collapsing to fight notification fatigue.
`,
  resources: [
    {
      title: 'Design a Notification System',
      url: 'https://www.youtube.com/watch?v=CUwt9_l0Dlg',
      type: 'video',
      source: 'ByteByteGo',
    },
    {
      title: 'Notification service — architecture & delivery guarantees',
      url: 'https://www.hellointerview.com/learn/system-design/problem-breakdowns/fb-news-feed',
      type: 'article',
      source: 'Hello Interview (queue/fan-out patterns)',
    },
    {
      title: 'Building a scalable notification system (queues + workers)',
      url: 'https://aws.amazon.com/builders-library/avoiding-insurmountable-queue-backlogs/',
      type: 'article',
      source: 'Amazon Builders’ Library',
    },
    {
      title: 'Design Notification Service',
      url: 'https://algomaster.io/learn/system-design-interviews/design-notification-service',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
  ],
  challenges: [
    {
      type: 'quiz',
      id: 'quiz-1',
      title: 'Notification system check',
      questions: [
        {
          q: 'Why must a notification system be asynchronous (API → queue → workers) rather than sending synchronously?',
          options: [
            'Asynchronous code is always faster',
            'Delivery is slow, bursty, and depends on flaky third parties; a durable queue buffers spikes (e.g. a 10M marketing blast), decouples fast producers from slow delivery, and persists messages so nothing is lost if a worker/provider is down',
            'Because HTTP requires it',
            'To avoid using a database',
          ],
          answer: 1,
          explanation:
            'Synchronous sending would hang the triggering request, collapse under bursts, and lose everything on a crash. The queue is the heart of the design: it absorbs bursts, lets workers drain at a sustainable rate, and durably holds messages for retry. Lead with this.',
        },
        {
          q: 'A worker sends a push, then crashes before ack’ing the queue message. What happens and how do you handle it?',
          options: [
            'The message is lost forever',
            'At-least-once delivery re-processes the message → a potential DUPLICATE notification; prevent double-sends with an idempotency key per (notification_id, channel) recorded atomically, so a re-processed message is skipped',
            'The queue crashes too',
            'Nothing — queues guarantee exactly-once',
          ],
          answer: 1,
          explanation:
            'Queues give at-least-once, not exactly-once — a crash between send and ack causes reprocessing. An idempotency key on the notification log lets the worker detect "already sent" and skip, giving the user effectively-once even though true end-to-end exactly-once is impossible.',
        },
        {
          q: 'An SMS provider (Twilio) starts failing intermittently. Which combination of patterns handles this well?',
          options: [
            'Retry forever with no delay',
            'Retries with exponential backoff + jitter for transient errors, a circuit breaker per provider (stop hammering it / fail over to a backup vendor), and a dead-letter queue for messages that fail after N attempts so they’re never silently dropped',
            'Immediately give up and drop the message',
            'Switch the whole system to email',
          ],
          answer: 1,
          explanation:
            'These are the Phase 3 resiliency patterns applied per provider. Backoff+jitter avoids hammering a struggling vendor; a circuit breaker enables fast-fail and failover; a dead-letter queue captures persistent failures for inspection/manual retry instead of losing them.',
        },
        {
          q: 'Why separate transactional and bulk/marketing notifications into different (or priority) queues?',
          options: [
            'They use different programming languages',
            'So a huge low-priority marketing blast can’t delay time-sensitive transactional alerts (e.g. "payment failed", "your code is 123456") — priority/queue separation keeps critical notifications fast under load',
            'Marketing messages are illegal otherwise',
            'It has no real benefit',
          ],
          answer: 1,
          explanation:
            'Without separation, 10M queued promos sit ahead of an urgent 2FA code. Priority queues (or dedicated queues per class) let transactional messages jump ahead, and isolating channels prevents a slow email provider from backing up push.',
        },
      ],
    },
    {
      type: 'design',
      id: 'design-1',
      title: 'Design exercise: multi-channel notification system',
      prompt: `
Design a notification system that delivers to users via mobile push, SMS, and email. It’s triggered both by product events (order shipped, 2FA code — urgent) and by marketing blasts (a promo to 10M users). Target reliable delivery to millions, resilient to flaky third-party providers.

Cover the framework, but focus your depth on: (1) why the architecture is asynchronous and what the queue does, (2) how you integrate multiple unreliable providers and fail over, (3) your delivery guarantee and how you avoid sending duplicates, and (4) how you keep urgent notifications fast while a 10M marketing blast is in flight. Include preference/opt-out handling and note the trade-offs.
`,
      hints: [
        'The burstiness (10M in an hour) is the key driver — what absorbs it?',
        'Queues give at-least-once — how do you prevent duplicate sends?',
        'Flaky providers → which Phase 3 patterns? And how do urgent vs bulk not collide?',
      ],
      modelAnswer: `
**Requirements** — Functional: send to a user/segment on chosen channels using templates, respecting preferences/opt-outs; support transactional (urgent) and bulk (marketing). Non-functional: high throughput (millions), at-least-once reliability, low latency for transactional, resilient to flaky providers, no message loss.

**Estimation** — ~10M/day but bursty (10M-in-an-hour blasts). Conclusion: **cannot send synchronously — need a buffering queue**.

**API** — \`POST /notifications\` returns **202 Accepted** (enqueued, not sent).

**Data model** — user prefs/devices, templates, and a **notification log** (status, attempts) for tracking/dedup/retry.

**High-level** — **producers → Notification API → message queue → stateless workers → channel adapters → providers (APNs/FCM/Twilio/SES)**, with delivery receipts updating the log.

**Deep dives:**
1. *Async + queue* — the queue **absorbs bursts**, **decouples** fast producers from slow delivery, **persists** messages (no loss on crash), and enables retries. Lead with this.
2. *Multiple providers / failover* — wrap each provider behind a common **channel adapter** interface; a **circuit breaker per provider** enables fast-fail and **failover to a backup vendor**; respect each provider’s **rate limit** (token bucket). Adding a provider is a new adapter, no ripple.
3. *Delivery guarantee + dedup* — **at-least-once** (queues can reprocess on a crash-before-ack). Prevent duplicates with an **idempotency key per (notification_id, channel)** recorded atomically in the log — reprocessed messages are skipped. True end-to-end exactly-once is impossible; at-least-once + dedup = effectively-once for the user. Provider failures use **retries + backoff + jitter**, then a **dead-letter queue** after N attempts (never silently dropped).
4. *Urgent vs bulk* — **priority/separate queues**: transactional (2FA, payment) jump ahead of a 10M marketing blast; isolate channels so a slow email provider can’t back up push. Workers scale horizontally to drain the blast without starving urgent traffic.

**Preferences/opt-outs** — before sending, check channel prefs, **opt-out/unsubscribe** (legal for marketing), and **DND/timezone** (no 3am SMS); collapse noisy events ("3 likes" → one push) to fight fatigue.

**Trade-offs** — at-least-once means designing for occasional duplicates rather than chasing impossible exactly-once; priority queues add complexity but protect urgent latency; async means the API reports "accepted," with true delivery status arriving later via receipts.

**One-line summary:** an async fan-out pipeline — enqueue-and-202, durable priority queues to absorb bursts and decouple slow delivery, stateless workers applying prefs/opt-outs, provider adapters with circuit-breaker failover and rate limits, and at-least-once + idempotency-key dedup plus retries/backoff/dead-letter for guaranteed, non-duplicated, resilient delivery.
`,
    },
  ],
}
