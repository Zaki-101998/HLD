export default {
  id: 'payment-system',
  title: 'Design a Payment System (Capstone)',
  subtitle: 'Where correctness is sacred: idempotency, the ledger, exactly-once, reconciliation, and consistency',
  days: 3,
  content: `
## The capstone problem

Design a payment system: process payments between parties (a customer paying a merchant), integrating with external **payment service providers (PSPs)** like Stripe/banks, guaranteeing that **money is never lost, double-charged, or created from nothing.** This is the capstone because it inverts the priority of every previous problem: where feeds and search happily trade consistency for availability and speed, **payments demand correctness above all** — a single wrong number is a real financial loss and a compliance incident. It synthesizes idempotency, distributed transactions, the ledger/double-entry model, exactly-once semantics, and reconciliation — the hardest, most senior topic in the gauntlet.

## Step 1 — Requirements

**Functional:** accept a payment request (payer, payee, amount, currency); charge the payer via a PSP; record the transaction; handle **refunds**; maintain **balances/ledger**; support asynchronous payment status (payments settle over time). *De-scope:* fraud detection (mention), multi-currency FX details, payouts scheduling.

**Non-functional (the priorities are inverted):**
- **Correctness / consistency FIRST** — no double charges, no lost money, exact balances. **Strong consistency** where money moves.
- **Durability** — never lose a committed transaction.
- **Idempotency** — retries (which are inevitable) must not charge twice.
- **Auditability** — every money movement traceable (regulatory).
- Availability and latency matter, but **never at the cost of correctness** — better to reject/hold a payment than to process it wrongly.

## Step 2 — Estimation

- Even at "only" thousands of payments/sec, the scale challenge is secondary to correctness. Money data is comparatively small and **must be stored durably and consistently** → a **transactional (SQL/ACID) database** for the ledger, not an eventually-consistent store. This is a deliberate reversal of the "NoSQL for scale" default — justify it: **money requires ACID.**

## Step 3 — API

\`\`\`
POST /payments
  Header: Idempotency-Key: <client-generated-uuid>     ← mandatory
  { payer, payee, amount, currency }
  → { payment_id, status: "pending" | "succeeded" | "failed" }

POST /payments/{id}/refund   (also idempotent)
GET  /payments/{id}                                    // poll status
\`\`\`
The **idempotency key** in the header is non-negotiable and central (below).

## Step 4 — Data model: the ledger (double-entry)

Don't model balances as a single mutable number you increment/decrement — that's fragile and unauditable. Use a **ledger** of immutable entries (accounting's **double-entry bookkeeping**):
- Every transaction records **at least two entries** that sum to zero: debit one account, credit another (e.g. −$100 from customer, +$100 to merchant). Money is never created or destroyed — entries always balance.
- \`LedgerEntry { id, txn_id, account_id, amount (signed), currency, created_at }\` — **append-only, immutable**. A balance is the **sum of an account's entries** (often maintained as a materialized running balance for speed, but derivable from the immutable log — the source of truth).
- **Immutability + double-entry gives auditability and self-consistency**: you can always trace and re-derive every balance, and the books must balance. This is the single most important modeling insight for payments.
- \`Payment { payment_id, idempotency_key (unique), payer, payee, amount, status, psp_ref, created_at }\`.

## Step 5 & 6 — Architecture and the deep dives that define payments

\`\`\`
 client ─(Idempotency-Key)─▶ Payment Service ─▶ [idempotency check] ─▶ Ledger DB (ACID, double-entry)
                                   │                                        ▲
                                   ├─▶ PSP adapter ─▶ external PSP (Stripe/bank) ── async webhook ──┐
                                   │        (retries + circuit breaker)                              │
                                   └─▶ status updates ◀──────── reconciliation job ◀─────────────────┘
\`\`\`

### Deep dive 1 — Idempotency (the #1 payment concern)
Networks fail; clients and workers retry. Without protection, a retried "charge $100" charges twice — unacceptable. **The idempotency key** solves it (Phase 3 idempotency topic):
- The client generates a **unique key per payment attempt** and sends it with every retry of *that same* request.
- The server records the key **atomically** (unique constraint) with the payment. On a retry with the same key, it **returns the stored result instead of charging again.** First request does the work; duplicates are no-ops returning the same response.
- This makes the *charge* operation idempotent end-to-end. **Every mutating payment endpoint must be idempotent.** This is the thing interviewers most want to hear on a payment problem.

\`\`\`mermaid
sequenceDiagram
  autonumber
  participant Client
  participant API as Payment Service
  participant Ledger as Ledger DB
  participant PSP
  Client->>API: POST /payments (Idempotency-Key)
  API->>Ledger: record Payment(status=PENDING)
  API->>PSP: charge
  PSP-->>API: webhook: succeeded
  API->>Ledger: write debit + credit (atomic), status=COMMITTED
  API-->>Client: succeeded
\`\`\`

### Deep dive 2 — Distributed transaction across the PSP (exactly-once-ish)
A payment touches **your ledger** and an **external PSP** — you can't run a single ACID transaction across both. Naive "charge PSP, then write ledger" breaks if you crash in between (charged but not recorded → lost money) . Solutions (Phase 3 distributed transactions):
- **Two-phase / intent pattern:** first durably record a \`Payment(status=pending)\` in your DB (the intent), *then* call the PSP, then update status to succeeded/failed based on the result. If you crash after recording pending but before/after the PSP call, a **recovery process** re-checks the PSP (using the idempotency key so re-calling doesn't double-charge) and reconciles the final state. The **outbox pattern** reliably emits events (e.g. "notify merchant") without dual-write inconsistency.
- **Sagas** for multi-step flows (authorize → capture → payout) with **compensating actions** (refund/void) if a later step fails — no distributed lock, eventual consistency with compensation.
- **Exactly-once is achieved as: at-least-once delivery (retries) + idempotency (dedup) = effectively-once.** True exactly-once is impossible; this combination is how payments get it in practice.

### Deep dive 3 — Consistency choice (deliberately strong)
Where money moves, use **strong consistency and ACID transactions**: debiting the payer and crediting the merchant must be **atomic** (both or neither) — a single DB transaction writing both ledger entries. This is the **opposite** of the eventual-consistency choice you made for feeds/timelines, and you should **say so explicitly**: "unlike the news feed, here I choose strong consistency because a temporarily-wrong balance is a real financial error." Payment *status* to the user can be async (pending → settled), but the **ledger writes are atomic and consistent.**

### Deep dive 4 — Reconciliation (the safety net)
Even with all the above, your system's view and the PSP/bank's view can drift (a webhook lost, a timeout with unknown outcome). **Reconciliation** is a periodic (e.g. daily) job that **compares your ledger against the PSP's settlement report** and flags/repairs mismatches. It's the backstop that guarantees the books eventually match reality — a hallmark of a mature payment design that most candidates forget. Handle **"unknown" outcomes** (PSP timed out — did it charge or not?) by querying the PSP by idempotency key and reconciling; never assume.

### Deep dive 5 — Handling failure without losing/duplicating money
Apply Phase 3 resiliency to PSP calls: **retries with backoff** (safe because idempotent), a **circuit breaker** per PSP (fail over to a backup provider), and **timeouts** — but with **payments, fail-safe means the safe direction is "don't double-charge"**: on uncertainty, mark pending and reconcile rather than blindly retry-charging. A **dead-letter queue** captures stuck payments for investigation. Never silently drop a payment.

## Step 7 — Wrap-up

A payment system inverts every prior priority: **correctness over availability/latency.** The design rests on four pillars. **(1) Idempotency** — a client-supplied idempotency key recorded atomically makes every charge/refund safe to retry (no double charges); the #1 concern. **(2) A double-entry, append-only ledger** in an **ACID/SQL** store, where balances are the sum of immutable balanced entries — giving auditability and self-consistency, and where debit+credit are written **atomically with strong consistency** (explicitly the opposite of the feed's eventual consistency). **(3) Distributed-transaction handling** across the external PSP via a **pending-intent + recovery** pattern, **sagas with compensation**, and **outbox** events — achieving effectively-once as at-least-once + idempotency. **(4) Reconciliation** — a periodic job comparing the ledger to PSP settlement reports to catch and repair any drift, plus resilient PSP calls (retries/backoff/circuit breaker) that fail in the safe direction. Trade-offs: you accept lower availability and higher latency (pending states, holds, rejections) in exchange for never losing or duplicating money. The signal: **treating correctness as sacred and naming idempotency + ledger + reconciliation.**

## How this shows up in interviews

- This is the exam on **correctness under failure.** The interviewer wants, unprompted: **idempotency keys** (no double charge), a **double-entry ledger** in an **ACID database**, and **reconciliation** against the PSP. Hit those three and you've demonstrated senior judgment.
- Expect **"a customer got charged twice — how do you prevent it?"** — idempotency key recorded atomically; retries return the stored result.
- Expect **"you charged the PSP but crashed before recording it — now what?"** — pending-intent record before the call + recovery/reconciliation querying the PSP by idempotency key; never assume the outcome.
- Expect **"strong or eventual consistency here?"** — strong for ledger writes, and *explicitly contrast* with the eventual consistency you chose for feeds — showing you pick consistency per requirement, not by rote.
- Bonus: sagas + compensating transactions for multi-step flows, outbox pattern, fail-in-the-safe-direction on uncertainty, dead-letter for stuck payments, and the "exactly-once = at-least-once + idempotency" framing.
`,
  resources: [
    {
      title: 'Design a Payment System',
      url: 'https://www.youtube.com/watch?v=olfaBgJrUBI',
      type: 'video',
      source: 'ByteByteGo',
    },
    {
      title: 'System Design: Payment system (idempotency, ledger, reconciliation)',
      url: 'https://www.hellointerview.com/learn/system-design/problem-breakdowns/payment-system',
      type: 'article',
      source: 'Hello Interview',
    },
    {
      title: 'Designing a ledger & double-entry accounting for money',
      url: 'https://www.moderntreasury.com/journal/accounting-for-developers-part-i',
      type: 'article',
      source: 'Modern Treasury (ledger/double-entry deep dive)',
    },
    {
      title: 'Stripe — designing robust and predictable APIs with idempotency',
      url: 'https://stripe.com/blog/idempotency',
      type: 'article',
      source: 'Stripe Engineering',
    },
    {
      title: 'How Airbnb Avoids Double Payments in a Distributed Payments System',
      url: 'https://medium.com/airbnb-engineering/avoiding-double-payments-in-a-distributed-payments-system-2981f6b070bb',
      type: 'article',
      source: 'Airbnb Engineering',
    },
    {
      title: "Stripe's payments APIs — The first 10 years",
      url: 'https://stripe.com/blog/payment-api-design',
      type: 'article',
      source: 'Stripe Engineering',
    },
  ],
  challenges: [
    {
      type: 'quiz',
      id: 'quiz-1',
      title: 'Payment system check',
      questions: [
        {
          q: 'How do payment systems prevent a retried "charge $100" request from charging the customer twice?',
          options: [
            'They disable retries entirely',
            'A client-generated idempotency key sent with every retry; the server records it atomically (unique constraint) with the payment and, on a duplicate key, returns the STORED result instead of charging again — making the charge safe to retry',
            'They wait 24 hours between requests',
            'They rely on the customer to report duplicates',
          ],
          answer: 1,
          explanation:
            'Retries are inevitable (network failures, worker restarts). The idempotency key makes the first request do the work and all duplicates no-op with the same response. Every mutating payment endpoint must be idempotent — the #1 thing interviewers want to hear.',
        },
        {
          q: 'Why model balances with an append-only double-entry ledger instead of a single mutable balance number?',
          options: [
            'It’s faster to update',
            'Immutable, balanced entries (every transaction debits one account and credits another, summing to zero) give auditability and self-consistency — money is never created/destroyed, and any balance is derivable by summing entries, so you can always trace and verify',
            'It uses less storage',
            'Databases can’t store single numbers',
          ],
          answer: 1,
          explanation:
            'A mutable counter is fragile and unauditable. Double-entry, append-only entries mean the books always balance and every movement is traceable/re-derivable — the core modeling insight for payments, and a regulatory necessity.',
        },
        {
          q: 'For the ledger writes (debit payer, credit merchant), what consistency do you choose, and how does it contrast with earlier problems?',
          options: [
            'Eventual consistency, same as the news feed',
            'STRONG consistency / ACID — the debit and credit must be atomic (both or neither) in a transactional DB; explicitly the opposite of the eventual consistency chosen for feeds/timelines, because a temporarily-wrong balance is a real financial error',
            'No consistency guarantees needed',
            'Read-your-writes only',
          ],
          answer: 1,
          explanation:
            'Payments invert the usual trade-off: correctness beats availability/latency. Money movements need atomic, strongly-consistent writes (ACID/SQL). Saying explicitly "unlike the feed, I choose strong consistency here" shows you pick per requirement rather than by rote.',
        },
        {
          q: 'You call the PSP to charge the card, then your service crashes before recording the result. How do you avoid losing or duplicating money?',
          options: [
            'Assume it failed and charge again',
            'Record a pending-intent (Payment status=pending) BEFORE calling the PSP; on recovery, re-query the PSP by the idempotency key (so re-calling can’t double-charge) to learn the true outcome and reconcile — never assume the result',
            'Assume it succeeded and credit the merchant',
            'Ignore the payment',
          ],
          answer: 1,
          explanation:
            'You can’t run one ACID transaction across your DB and an external PSP. The pending-intent + recovery pattern, combined with the idempotency key on the PSP call, lets you safely determine and record the real outcome after a crash. Assuming either way risks lost or duplicated money.',
        },
        {
          q: 'What is reconciliation, and why is it a hallmark of a mature payment design?',
          options: [
            'Merging code branches',
            'A periodic job that compares your ledger against the PSP/bank settlement reports and flags/repairs mismatches (from lost webhooks, unknown timeouts, etc.) — the backstop guaranteeing your books eventually match reality, which most candidates forget',
            'Deleting old transactions',
            'Rebalancing database shards',
          ],
          answer: 1,
          explanation:
            'Even with idempotency and careful transactions, your view and the PSP’s can drift. Reconciliation is the safety net that detects and fixes discrepancies against the source of truth (settlement reports). Naming it signals real payment-systems maturity.',
        },
        {
          q: 'How is "exactly-once" payment processing actually achieved in practice?',
          options: [
            'With a special exactly-once network protocol',
            'It’s impossible as a primitive; you combine at-least-once delivery (retries ensure the work happens) with idempotency (dedup ensures it happens only once effectively) — "effectively-once"',
            'By never retrying',
            'By using two-phase commit across everything',
          ],
          answer: 1,
          explanation:
            'True end-to-end exactly-once can’t be guaranteed in a distributed system. Retries give at-least-once (nothing is lost); idempotency keys collapse duplicates; together they yield effectively-once — the practical foundation of correct payments.',
        },
      ],
    },
    {
      type: 'design',
      id: 'design-1',
      title: 'Capstone design exercise: a payment system',
      prompt: `
Design a payment system that processes payments from customers to merchants by integrating with external payment providers (Stripe/banks). The absolute requirements: never double-charge, never lose money, never create money from nothing, and keep an auditable record of every transaction.

This is the capstone — bring together everything. Cover the framework, but go deep on: (1) how you guarantee a retried request doesn’t double-charge, (2) how you model money/balances for correctness and auditability, (3) what consistency you choose and how it differs from earlier problems, (4) how you handle the transaction spanning your system and an external PSP (including crashes mid-flight), and (5) reconciliation. Explicitly state the trade-offs you accept for correctness.
`,
      hints: [
        'Payments invert the priorities — correctness over availability/latency. Say so.',
        'The five pillars: idempotency keys, double-entry ledger (ACID), strong consistency, PSP distributed-transaction/recovery, reconciliation.',
        'Contrast your consistency choice explicitly with the news feed’s eventual consistency.',
      ],
      modelAnswer: `
**Requirements** — Functional: process customer→merchant payments via a PSP, record transactions, refunds, balances/ledger, async status (de-scope fraud/FX). Non-functional (inverted): **correctness/consistency FIRST**, durability, idempotency, auditability; availability/latency matter but never at correctness’s expense — better to hold/reject than process wrongly.

**Estimation** — scale is secondary to correctness; money data is small but must be durable and consistent → **transactional ACID/SQL ledger** (deliberate reversal of the NoSQL-for-scale default: money requires ACID).

**API** — \`POST /payments\` with a **mandatory Idempotency-Key header**; idempotent refund; status poll.

**Data model — double-entry ledger** — immutable, append-only \`LedgerEntry{txn_id, account_id, signed amount, currency}\`; every transaction writes balanced entries summing to zero (debit payer, credit merchant); a balance = sum of entries (source of truth, optionally materialized). Plus \`Payment{payment_id, idempotency_key UNIQUE, payer, payee, amount, status, psp_ref}\`.

**Deep dives (the five pillars):**
1. *Idempotency (#1)* — client sends a unique key per attempt with every retry; server records it **atomically** (unique constraint) with the payment; duplicate key → return stored result, don’t re-charge. Every mutating endpoint idempotent.
2. *Ledger + auditability* — double-entry, immutable entries → books always balance, every movement traceable/re-derivable.
3. *Consistency (explicitly strong)* — debit + credit written **atomically in one ACID transaction**, strong consistency — **the opposite of the feed’s eventual consistency**, chosen because a wrong balance is a real financial error. Payment *status* to the user can be async (pending→settled).
4. *Distributed txn across PSP* — can’t ACID across your DB + external PSP. **Record Payment(pending) before calling the PSP**; update status from the result; on crash, a **recovery job re-queries the PSP by idempotency key** (safe, no double-charge) to learn the true outcome. **Sagas + compensating actions** (void/refund) for multi-step authorize→capture→payout; **outbox** for reliable event emission. Effectively-once = at-least-once (retries) + idempotency (dedup).
5. *Reconciliation* — periodic job comparing the ledger to PSP **settlement reports**, flagging/repairing drift (lost webhooks, unknown timeouts); handle "unknown" outcomes by querying, never assuming. Resilient PSP calls (retries/backoff, circuit breaker, failover) that **fail in the safe direction** (mark pending + reconcile rather than blind re-charge); dead-letter stuck payments.

**Trade-offs accepted** — lower availability and higher latency (pending states, holds, occasional rejections) in exchange for **never losing or duplicating money**. This is the deliberate inverse of every earlier problem.

**One-line summary:** payments put correctness above all — idempotency keys prevent double charges, a double-entry append-only ledger in an ACID store with atomic strongly-consistent debit/credit gives auditable exact balances (explicitly unlike the feed’s eventual consistency), a pending-intent + recovery/saga/outbox pattern safely spans the external PSP for effectively-once processing, and daily reconciliation against settlement reports is the backstop that guarantees the books match reality.
`,
    },
  ],
}
