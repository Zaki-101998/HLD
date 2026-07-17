export default {
  id: 'idempotency',
  title: 'Idempotency & Effectively-Once Processing',
  subtitle: 'The retry-safety discipline that quietly underpins every correct distributed system',
  days: 2,
  content: `
## Why this matters for system design

You've now met idempotency four times (concurrency, queues, APIs, sagas) — because it IS the answer to distributed systems' most fundamental ambiguity: **a timeout tells you nothing.** The request may have failed before arriving, or succeeded and the reply was lost. Since you can't know, you must retry; since you must retry, every operation must tolerate being executed twice. This topic consolidates the scattered pieces into one discipline.

## The unavoidable chain

\`\`\`
Networks fail  →  timeouts are ambiguous  →  retries are mandatory
              →  duplicates are inevitable →  operations must be idempotent
\`\`\`

There is no step you can skip. "We just won't retry" = lost work on every transient blip. "Exactly-once delivery" = impossible over unreliable networks (the Two Generals problem). What's achievable is **effectively-once processing**: at-least-once delivery + duplicate-proof processing.

## Which operations are naturally safe?

| Operation | Idempotent? |
|---|---|
| \`SET status = 'shipped'\` | ✅ absolute assignment |
| \`balance = balance - 500\` | ❌ relative mutation |
| \`INSERT INTO payments VALUES (…)\` | ❌ (dup rows) — ✅ with unique key + ON CONFLICT |
| \`DELETE WHERE id = 7\` | ✅ (second call: 0 rows) |
| "Send email" | ❌ needs external dedup |
| \`PUT /users/42 {whole object}\` | ✅ by definition |
| \`POST /orders\` | ❌ needs an idempotency key |

Design instinct: **prefer absolute state over relative deltas** ("set to X" over "add Y"), and give every logical operation a **stable identity**.

## The idempotency-key pattern (the full recipe)

1. **Client** generates a unique key per *logical* operation (UUID per checkout attempt — NOT per HTTP attempt; the retry reuses the key. That distinction is the whole trick).
2. **Server**, atomically: \`INSERT INTO idempotency_keys (key, state='IN_PROGRESS') … ON CONFLICT DO NOTHING\` (unique index = the race-proof gate — your concurrency topic).
   - Insert won → execute the operation, store the response, mark DONE.
   - Insert lost → another attempt exists: if DONE, **replay its stored response**; if IN_PROGRESS, return 409/"retry later" (don't run concurrently!).
3. Keys expire after a policy window (Stripe: 24 h) — long enough to outlive any retry storm.

A retry after a lost response replays the stored result instead of re-running the operation:

\`\`\`mermaid
sequenceDiagram
  autonumber
  participant Client
  participant Server
  Client->>Server: POST /payments (Idempotency-Key: k1)
  Server->>Server: insert key k1, execute, store response
  Server-->>Client: 200 (response lost in transit)
  Note over Client: times out, retries same key
  Client->>Server: POST /payments (Idempotency-Key: k1)
  Server-->>Client: 200 — replays the stored response, no second charge
\`\`\`

Subtleties that separate senior answers:
- The key row and the business write should commit **in the same transaction** (or the operation itself must be replay-safe) — otherwise a crash between them re-opens the duplicate window.
- Scope keys per endpoint/operation type (same UUID to two endpoints ≠ same operation).
- The stored response should include the status code — replay must be byte-faithful, or clients see flapping results.

## Consumer-side dedup (queues)

Same recipe, message-shaped: the consumer records \`message_id\` (or a business key: \`order_id:event_type\`) in a processed-set **in the same transaction as its side effects**; redeliveries hit the set and no-op-ack. In Kafka: store processed offsets/ids WITH the output (transactional consumer), or make the output itself an idempotent upsert.

**Upserts are the underrated hero:** \`INSERT … ON CONFLICT (id) DO UPDATE\` makes reprocessing converge instead of duplicate — many pipelines need nothing more.

## Natural idempotency by design

Often you can dodge the bookkeeping entirely:

- **Deterministic derived keys:** thumbnail job writes \`photos/{id}/thumb_256.jpg\` — rerunning overwrites identically. (Your video-pipeline exercise used this.)
- **State-machine guards:** \`UPDATE orders SET state='PAID' WHERE id=? AND state='PENDING'\` — replays affect 0 rows. (Your saga lab used this.)
- **Version/timestamp conditions:** apply update only if \`incoming.version > current.version\` — stale replays and out-of-order deliveries both bounce off. (This is also LWW's honest cousin.)
- **Sets over counters:** "user 42 liked post 7" as a set member (re-adding = no-op), with the count derived — versus a raw counter that double-increments.

## What idempotency does NOT solve

- **Two different logical operations that look alike** (user genuinely orders the same pizza twice) — that's product-level dedup/confirmation, different keys.
- **Ordering:** dedup ≠ sequencing. Out-of-order updates need versions/sequence numbers (next topics: clocks).
- **Side effects you don't control:** calling a third party without ITS idempotency support → best effort: record-before-call + reconciliation jobs (compare your ledger with theirs — real payment systems run these nightly).

## How this shows up in interviews

- ANY payment/order/booking flow: say "idempotency key, unique-index gate, stored response replay" — one sentence, huge signal.
- ANY queue consumer: "at-least-once + dedup table in the same transaction" or "idempotent upsert".
- Retries discussion: "retries are safe because every mutation is keyed/guarded" — this is what makes the resiliency topic's aggressive retry policies legal.
`,
  resources: [
    {
      title: 'Implementing Stripe-like idempotency keys',
      url: 'https://brandur.org/idempotency-keys',
      type: 'article',
      source: 'Brandur Leach (ex-Stripe) — the definitive deep dive',
    },
    {
      title: 'Idempotency — what it is and why it matters',
      url: 'https://www.youtube.com/watch?v=XAccGbtl3Z8',
      type: 'video',
      source: 'ByteByteGo (YouTube)',
    },
    {
      title: 'You Cannot Have Exactly-Once Delivery',
      url: 'https://bravenewgeek.com/you-cannot-have-exactly-once-delivery/',
      type: 'article',
      source: 'Tyler Treat',
    },
    {
      title: 'Idempotency',
      url: 'https://algomaster.io/learn/system-design/idempotency',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
  ],
  challenges: [
    {
      type: 'quiz',
      id: 'quiz-1',
      title: 'Idempotency check',
      questions: [
        {
          q: 'Why is a timeout fundamentally different from an error response?',
          options: [
            'Timeouts are slower',
            'An error tells you the operation did NOT happen; a timeout tells you NOTHING — it may have fully succeeded with only the reply lost, which is why blind re-execution double-charges',
            'Errors can be retried, timeouts cannot',
            'Timeouts only occur on writes',
          ],
          answer: 1,
          explanation:
            'The ambiguity of timeouts is the root fact of this whole topic: you must retry (or reconcile), and the retry must be safe against the possibility the original succeeded.',
        },
        {
          q: 'The idempotency key should be generated per ___, and the biggest client-side mistake is ___.',
          options: [
            'per HTTP request; reusing keys',
            'per logical operation; generating a FRESH key on retry (which makes the retry a "new" operation and re-executes it)',
            'per user session; expiring keys',
            'per server; storing keys client-side',
          ],
          answer: 1,
          explanation:
            'The key names the INTENT ("this checkout"), not the attempt. A retry with a new key defeats the entire mechanism — the most common implementation bug.',
        },
        {
          q: 'What makes the server-side key check race-proof when two retries arrive simultaneously?',
          options: [
            'Checking SELECT before INSERT',
            'A unique index on the key: both attempts INSERT, the database serializes them, exactly one wins and executes; the loser reads/waits for the winner’s result',
            'Timestamps on each request',
            'Processing requests on one thread',
          ],
          answer: 1,
          explanation:
            'Check-then-insert has the classic TOCTOU window (Phase 1 races). The unique constraint IS the atomic test-and-set. Same principle as the seat-booking conditional update.',
        },
        {
          q: 'A consumer processes a message (writes rows) and records the message_id as processed — in two separate transactions. The remaining bug?',
          options: [
            'None; dedup is in place',
            'Crash between the two transactions → side effects committed but id not recorded → redelivery reprocesses and duplicates; the dedup record must commit WITH the side effects',
            'The message_id might collide',
            'Kafka forbids two transactions',
          ],
          answer: 1,
          explanation:
            'Dedup bookkeeping is only sound if it’s atomic with the work it guards — otherwise you’ve rebuilt the dual-write problem one level down. Same-transaction (or idempotent-output) is the rule.',
        },
        {
          q: 'Which redesign makes a "like" feature naturally idempotent?',
          options: [
            'UPDATE posts SET likes = likes + 1',
            'INSERT (user_id, post_id) into a likes table with a unique constraint (re-like = conflict = no-op); the count is derived/cached from the set',
            'Rate limiting like requests',
            'Blocking double-clicks in the UI',
          ],
          answer: 1,
          explanation:
            'Sets absorb duplicates by nature; counters accumulate them. Recording FACTS ("A likes B") instead of effects ("+1") also gives you unlike, audit, and per-user state for free. UI guards are politeness, not correctness.',
        },
        {
          q: 'Your service calls a partner API that has NO idempotency support, and the call times out. Least-bad approach?',
          options: [
            'Retry immediately — probably fine',
            'Record the attempt (intent row) before calling, don’t blind-retry mutations; run a reconciliation job against the partner’s records/statements to resolve ambiguous outcomes',
            'Never call that partner again',
            'Wrap the call in 2PC',
          ],
          answer: 1,
          explanation:
            'Without provider-side dedup, correctness needs OUT-OF-BAND truth: your intent log vs their statement. This is why real payment ops run nightly reconciliation — and why you should prefer partners with idempotency keys.',
        },
      ],
    },
    {
      type: 'lab',
      id: 'lab-1',
      title: 'Build the idempotency-key gate and break naive dedup',
      intro: 'Race 20 concurrent "retries" against a naive check-then-insert, then against a unique-index gate.',
      steps: [
        {
          instruction: 'Naive check-then-act under concurrency: 20 parallel attempts, each checks "key exists?" then charges.',
          command: `cd /tmp && rm -f idem.db && sqlite3 idem.db "CREATE TABLE keys(k TEXT); CREATE TABLE charges(id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT);" && for i in $(seq 1 20); do (exists=$(sqlite3 idem.db "SELECT count(*) FROM keys WHERE k='pay_abc';"); if [ "$exists" = "0" ]; then sqlite3 idem.db "INSERT INTO keys VALUES('pay_abc'); INSERT INTO charges(key) VALUES('pay_abc');" 2>/dev/null; fi) & done; wait; sqlite3 idem.db "SELECT count(*) AS times_charged FROM charges;"`,
          expected: 'times_charged frequently > 1 — several attempts passed the "exists?" check before any insert landed. TOCTOU race, live, with money.',
        },
        {
          instruction: 'Now the correct gate: UNIQUE index + insert-first. Same 20 concurrent retries.',
          command: `cd /tmp && rm -f idem.db && sqlite3 idem.db "CREATE TABLE keys(k TEXT PRIMARY KEY); CREATE TABLE charges(id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT);" && for i in $(seq 1 20); do (sqlite3 idem.db "INSERT INTO keys VALUES('pay_abc'); INSERT INTO charges(key) VALUES('pay_abc');" 2>/dev/null) & done; wait; sqlite3 idem.db "SELECT count(*) AS times_charged FROM charges;"`,
          expected: 'times_charged = 1, every run. The unique constraint made INSERT the atomic test-and-set; losers errored before charging.',
        },
        {
          instruction: 'State-machine guard idempotency: transition PENDING→PAID twice.',
          command: `sqlite3 /tmp/idem.db "CREATE TABLE orders(id INT, state TEXT); INSERT INTO orders VALUES(1,'PENDING');
UPDATE orders SET state='PAID' WHERE id=1 AND state='PENDING'; SELECT 'first attempt rows:', changes();
UPDATE orders SET state='PAID' WHERE id=1 AND state='PENDING'; SELECT 'replay rows:', changes();"`,
          expected: 'first=1, replay=0. Guarded transitions are free idempotency — no key table needed.',
        },
        {
          instruction: 'Upsert convergence: reprocess the same event three times.',
          command: `sqlite3 /tmp/idem.db "CREATE TABLE profile(user_id INT PRIMARY KEY, city TEXT);
INSERT INTO profile VALUES(42,'Pune') ON CONFLICT(user_id) DO UPDATE SET city=excluded.city;
INSERT INTO profile VALUES(42,'Pune') ON CONFLICT(user_id) DO UPDATE SET city=excluded.city;
INSERT INTO profile VALUES(42,'Pune') ON CONFLICT(user_id) DO UPDATE SET city=excluded.city;
SELECT count(*), city FROM profile;" && rm /tmp/idem.db`,
          expected: '1 row, Pune — three deliveries, one converged state. Upserts turn duplicates into no-ops.',
        },
        {
          instruction: 'Read the Brandur idempotency-keys essay (15 min) — the best single write-up in the field.',
          command: 'open https://brandur.org/idempotency-keys',
          expected: 'Note his treatment of IN_PROGRESS states and "atomic phases" — exactly the subtleties from the content above, in production depth.',
        },
      ],
    },
    {
      type: 'design',
      id: 'design-1',
      title: 'Design exercise: make a webhook delivery system duplicate-proof end-to-end',
      prompt: `
You run a payments platform delivering webhooks ("payment.succeeded") to merchant servers. Your delivery pipeline is at-least-once (retries with backoff for up to 24 h on failure). Merchants complain about duplicate webhooks causing double order-fulfillment on THEIR side; your support team complains some merchants get webhooks out of order ("payment.succeeded" before "payment.created").

Design the end-to-end idempotency + ordering story: what your platform sends, what you tell merchants to build (be concrete — their engineers will follow it verbatim), and how each side handles the 24-hour retry horizon.
`,
      hints: [
        'What identity + sequencing fields belong IN the webhook payload?',
        'The merchant’s handler is a queue consumer in disguise — which recipe applies?',
        'Ordering: can you make events self-ordering instead of guaranteeing delivery order?',
      ],
      modelAnswer: `
**What the platform sends (payload contract):**
- \`event_id\` — globally unique, STABLE across all retries of this event (the idempotency key).
- \`event_type\`, \`created_at\`, and crucially \`resource.version\` or a per-resource \`sequence\` number (payment 789's events are numbered 1,2,3…).
- Full resource state snapshot (not just a delta) — makes handlers order-tolerant (below).
- Signature header (authenticity), plus explicit docs: "delivery is at-least-once and MAY be out of order."

**What merchants must build (the verbatim recipe):**
1. On receipt: \`INSERT event_id INTO processed_events\` (unique index) **in the same transaction** as your side effects. Conflict → return 200 immediately (already handled). Returning 200 on duplicates matters — erroring makes our retries hammer you forever.
2. ACK fast (200 within seconds), do heavy work async from your own queue — a slow handler times out and manufactures MORE retries (a vicious cycle we see constantly).
3. Ordering: don't reconstruct order from arrival; apply state with a guard — \`UPDATE local_payment SET … WHERE version < incoming.version\` (stale/out-of-order events affect 0 rows). Because payloads carry full snapshots + versions, "succeeded before created" resolves itself: the later-versioned snapshot wins, the stale one no-ops. Never process deltas from webhooks.
4. Retention: keep processed_event_ids ≥ 30 days (comfortably beyond our 24 h retry horizon + your replay needs).

**Platform-side details:**
- Outbox-sourced events (no dual-write); per-merchant delivery queue keyed by resource_id so same-resource events go serially per merchant (best-effort ordering without global guarantees).
- Retries: exponential backoff + jitter, same event_id every time; after 24 h → merchant-visible dead-letter dashboard with manual/automatic replay (replay is safe BECAUSE of their dedup).
- A "reconciliation" API (\`GET /events?since=\`) so merchants can backfill gaps — pull-based truth to complement push-based delivery.

**The principle to close with:** the platform makes duplicates and disorder SAFE (stable ids, versions, snapshots) rather than impossible (which no one can promise) — and tells the consumer exactly how to be an idempotent, order-tolerant processor. Both sides of the contract, one discipline.
`,
    },
  ],
}
