export default {
  id: 'ticket-booking',
  title: 'Design a Ticket Booking System (Ticketmaster / BookMyShow)',
  subtitle: 'The concurrency classic: preventing double-booking of the same seat under a thundering herd, with reservations, holds, and payment',
  days: 2,
  content: `
## The problem

Design a service that sells tickets to events (concerts, movies, sports) with **assigned seats**. Many users compete for the **same limited inventory** at the same instant — when Taylor Swift tickets drop, hundreds of thousands of people hit one show. The defining challenge is **concurrency correctness**: two people must never buy the same seat, yet the system must stay fast and available under an extreme, spiky read/write load.

## Step 1 — Requirements

**Functional:** (1) browse events and see available seats, (2) **reserve/hold** a specific seat while the user pays, (3) purchase (confirm) a held seat, (4) release the hold if payment doesn't complete in time.

*De-scope but mention:* dynamic pricing, seat recommendations, waitlists, refunds.

**Non-functional:** **strong consistency on the booking path** — a seat is sold at most once (this dominates the design; correctness > availability here). **High read availability** for browsing (people refreshing the seat map). **Handle massive spikes** ("thundering herd" on popular on-sales). **Low latency** for the seat-selection experience.

## Step 2 — Estimation

- Assume a hot event: **1M users** rushing a show with **50k seats** in the first minute. That's a **~20:1 demand-to-supply** ratio and a huge read burst on the seat map.
- Reads (seat-map views, refreshes) dwarf writes: maybe **hundreds of thousands of reads/sec** at peak vs. tens of thousands of reservation attempts collapsing onto **50k successful writes total**.
- Storage is small — events, seats, bookings are modest (millions of rows). This is **not a storage problem; it's a concurrency + traffic-shaping problem.**

## Step 3 — API

\`\`\`
GET  /events/{id}/seats            → seat map with status (available/held/booked)
POST /events/{id}/reservations     body:{ seat_ids, user_id } → { reservation_id, expires_at }  (creates a HOLD)
POST /reservations/{id}/confirm    body:{ payment_token }      → booking confirmed
DELETE /reservations/{id}          → release hold (or let it expire)
\`\`\`
The **reservation (hold)** is the key API: it converts "I want this seat" into a short-lived exclusive lock so the user can pay without someone stealing the seat mid-checkout.

## Step 4 — Data model

\`\`\`
Event   { event_id, name, venue_id, starts_at }
Seat    { seat_id, event_id, section, row, number, status, price }
         status ∈ { available, held, booked }
Reservation { reservation_id, seat_id, user_id, status, expires_at }
Booking { booking_id, reservation_id, user_id, seat_ids, paid_at }
\`\`\`
The seat's \`status\` (plus a \`held_until\` timestamp and \`held_by\`) is the contended field. Use a **relational DB (Postgres/MySQL)** here — you want **ACID transactions** to flip a seat available→held atomically. This is the textbook case where SQL's strong guarantees earn their keep over eventual-consistency NoSQL.

## Step 5 — High-level design

\`\`\`
 Browse:  client ─▶ CDN/Cache ─▶ Seat-map service ─▶ read replica (cached seat map)
 Reserve: client ─▶ LB ─▶ Booking service ──(ACID txn / lock)──▶ Primary DB
                                    │
                              hold expiry ◀── TTL (Redis key) / scheduled sweeper
 Confirm: client ─▶ Booking service ─▶ Payment service ─▶ mark seat booked
 Spike:   Virtual waiting room / queue in front of on-sale
\`\`\`

\`\`\`mermaid
sequenceDiagram
  autonumber
  participant U as User
  participant B as Booking service
  participant DB as Primary DB
  participant P as Payment service
  U->>B: POST reserve(seat 14C)
  B->>DB: BEGIN; SELECT seat FOR UPDATE
  alt seat available
    DB-->>B: available
    B->>DB: UPDATE seat SET status=held, held_until=now+10m; COMMIT
    B-->>U: reservation_id, expires in 10m
    U->>B: confirm(payment_token)
    B->>P: charge
    P-->>B: success
    B->>DB: UPDATE seat SET status=booked
    B-->>U: ticket confirmed
  else already held/booked
    DB-->>B: taken
    B-->>U: 409 seat unavailable
  end
\`\`\`

## Step 6 — Deep dive: preventing double-booking (the whole ballgame)

Three concurrency strategies, in increasing sophistication:

**A) Pessimistic lock — \`SELECT ... FOR UPDATE\`.** Inside a DB transaction, lock the seat row, check it's available, set it to \`held\`, commit. The row lock blocks any concurrent buyer until commit, so **double-booking is impossible**.
- ✅ Simple, ironclad correctness.
- ❌ Locks are held during the transaction; under a thundering herd on one popular section, contention serializes and latency spikes. Keep the transaction tiny (lock → update → commit; **never hold the lock across the payment call**).

**B) Status + expiry (the hold pattern).** A reservation sets \`status=held, held_until=now+10min\`. The user pays within that window; if they don't, the hold **expires** and the seat returns to the pool. Two ways to expire:
- **Lazy:** treat a hold as invalid if \`held_until < now\` on the next read/attempt.
- **Active:** a **Redis key with a TTL** per hold, or a **scheduled sweeper** job that flips expired holds back to available. Redis TTL is clean: \`SET seat:14C held EX 600 NX\` — the \`NX\` makes acquisition atomic (only if not already held), and the TTL auto-releases. This offloads the hot contention from the SQL primary onto Redis.

**C) Optimistic concurrency (version/CAS).** Read the seat with a version number; on write, \`UPDATE ... WHERE version = X\`; if 0 rows updated, someone else won — retry or fail. ✅ No held locks, great when contention is *low*. ❌ Under extreme contention (everyone fighting for row 1, seat A) it degrades to a retry storm. **For a hot on-sale, pessimistic locks or a Redis-hold with atomic \`SETNX\` are the stronger answers.**

**Never hold a lock across payment.** Payment can take seconds and can fail. Pattern: acquire a short **hold** (10 min), release the DB lock immediately after flipping to \`held\`, take payment against the hold, then flip \`held→booked\`. The hold — not a DB lock — is what protects the seat during checkout.

**Taming the thundering herd (traffic shaping):**
- **Virtual waiting room / queue.** Don't let 1M users hit the booking DB at once. Admit them in controlled batches — a queue (Redis/Kafka) issues turn tokens; users see "you're 40,000th in line." This converts a spike into a steady rate the DB can handle. (This is how real Ticketmaster on-sales work.)
- **Cache/CDN the seat map** for browsing, but the *authoritative* availability check happens in the transaction — the cached map is best-effort, and a reserve can still 409 if it was stale.
- **Shard by event** so one blockbuster doesn't starve every other show; the hot event can get dedicated capacity.

## Step 7 — Wrap-up

The core is a **correctness problem**: never sell a seat twice. I'd use a **relational DB with ACID transactions**, model the seat's status as available→held→booked, and protect selection with either a short **pessimistic lock** (\`SELECT FOR UPDATE\`) or an atomic **Redis hold with a TTL** (\`SETNX\` + expiry). The critical rule is to hold the lock only long enough to create the hold — **never across payment** — and let unpaid holds expire back into inventory. For popular on-sales, a **virtual waiting room / queue** shapes the thundering herd into a rate the booking path can absorb. Browsing is served from cache/replicas for availability; the booking path trades some availability for the strong consistency the domain demands. With more time: waitlists, anti-bot/fraud on the queue, and idempotent confirms (Phase 3) so a retried payment never double-charges.

## How this shows up in interviews

- The canonical **concurrency** interview. Interviewers are listening for: **how do you prevent double-booking?** Have pessimistic locking, the held-status + expiry pattern, and optimistic/CAS ready with trade-offs.
- Expect **"don't hold the DB lock during payment — so how do you protect the seat while the user checks out?"** → the **hold/reservation with a TTL** is the answer.
- Expect **"a million people hit the on-sale at once — what happens to your DB?"** → **virtual waiting room / queue** to shape traffic, cache the seat map for reads.
- A great place to name **idempotency** (from Phase 3) for the confirm/payment step, and to justify **SQL over NoSQL** on the basis of ACID.
`,
  resources: [
    {
      title: 'Design Ticketmaster — concurrency & holds',
      url: 'https://www.hellointerview.com/learn/system-design/problem-breakdowns/ticketmaster',
      type: 'article',
      source: 'Hello Interview',
    },
    {
      title: 'Design a Ticket Booking System (BookMyShow)',
      url: 'https://www.youtube.com/watch?v=lBAwJgAt-lE',
      type: 'video',
      source: 'ByteByteGo / system design walkthrough',
    },
    {
      title: 'Optimistic vs pessimistic locking',
      url: 'https://www.baeldung.com/jpa-optimistic-locking',
      type: 'article',
      source: 'Baeldung',
    },
  ],
  challenges: [
    {
      type: 'quiz',
      id: 'quiz-1',
      title: 'Ticket booking concurrency check',
      questions: [
        {
          q: 'Why should you NOT hold a database row lock (SELECT ... FOR UPDATE) across the user\'s payment step?',
          options: [
            'Row locks are not allowed in transactions',
            'Payment can take several seconds and may fail; holding the lock that long serializes all buyers for that seat and destroys throughput. Instead, briefly lock to set the seat to HELD (with an expiry), release the lock, then take payment against the hold',
            'Payments must always be synchronous',
            'It makes the design eventually consistent',
          ],
          answer: 1,
          explanation:
            'Keep the transaction tiny: lock → flip to held → commit. The short-lived HOLD (with a TTL) is what protects the seat during checkout, not a long-held DB lock. If payment fails or the user vanishes, the hold expires and the seat returns to inventory.',
        },
        {
          q: 'A million users hit a popular on-sale in the first minute. What is the standard technique to keep the booking database from collapsing?',
          options: [
            'Add more indexes',
            'A virtual waiting room / queue that admits users in controlled batches, converting the spike into a steady request rate the DB can handle (plus caching the seat map for browsing)',
            'Switch to eventual consistency for bookings',
            'Return 500 to half the users',
          ],
          answer: 1,
          explanation:
            'Traffic shaping is the answer. A queue (Redis/Kafka) issues turn tokens ("you are 40,000th in line") so the booking path sees a rate it can absorb. Real ticketing systems all use a waiting-room mechanism for hot on-sales.',
        },
        {
          q: 'Why is a relational (ACID) database usually preferred over an eventually-consistent NoSQL store for the core booking path here?',
          options: [
            'NoSQL cannot store seats',
            'The domain requires strong consistency — a seat must be sold at most once — and ACID transactions let you atomically check-and-flip a seat\'s status, making double-booking impossible',
            'SQL is always faster',
            'NoSQL cannot scale',
          ],
          answer: 1,
          explanation:
            'This is the textbook case for SQL: correctness (no double-booking) outweighs the availability/scale advantages of eventual-consistency stores. Inventory is small, so SQL\'s scale limits do not bite; its transactional guarantees are exactly what you need.',
        },
      ],
    },
    {
      type: 'design',
      id: 'design-1',
      title: 'Design exercise: the full ticket booking system',
      prompt: `
Design a ticket booking system (like Ticketmaster / BookMyShow) with assigned seating, end to end using the 7-step framework. A hot event has 50k seats and ~1M users competing in the first minute.

Cover: requirements (emphasize the consistency requirement), estimation of the spike, the API (including the reservation/hold), the data model and why you pick a SQL store, the high-level design, and — as your deep dive — how you guarantee a seat is never double-booked while keeping checkout responsive. Then extend: how do you protect the on-sale from a thundering herd of a million users?
`,
      hints: [
        'What is the seat\'s lifecycle: available → held → booked? Where does each transition happen?',
        'Compare pessimistic locking, an optimistic/CAS version check, and a Redis hold with SETNX + TTL.',
        'The lock must NOT span payment — what short-lived construct protects the seat during checkout?',
        'For the spike, think traffic shaping, not just more servers.',
      ],
      modelAnswer: `
**Requirements** — Functional: browse seats, reserve/hold a seat, confirm (pay), release/expire. Non-functional: strong consistency on booking (sell each seat at most once) is the dominant requirement; high read availability for browsing; survive extreme spikes; low latency for seat selection.

**Estimation** — 1M users / 50k seats in minute one → ~20:1 demand:supply, hundreds of thousands of reads/sec, tens of thousands of reservation attempts collapsing to 50k successful writes. Small storage. Conclusion: this is a concurrency + traffic-shaping problem, not a storage one.

**API** — GET seat map; POST reservation (creates a HOLD with expires_at); POST confirm (payment); DELETE/expire hold.

**Data model & storage** — Event, Seat{status: available|held|booked, held_until, held_by}, Reservation, Booking. Choose a relational DB for ACID transactions — atomically check-and-flip seat status. Inventory is small so SQL scale limits don't bite.

**High-level** — Browse path served from cache/CDN + read replicas (best-effort seat map). Booking path → LB → booking service → primary DB transaction. Redis (or a sweeper) manages hold expiry. Payment service handles the charge. A virtual waiting room fronts hot on-sales.

**Deep dive — no double-booking:** (a) Pessimistic: SELECT ... FOR UPDATE, check available, set held, commit — ironclad but keep the txn tiny. (b) Hold + expiry: set status=held, held_until=now+10m; expire via Redis TTL (SET seat held EX 600 NX — atomic acquire + auto-release) or a sweeper. (c) Optimistic/CAS: UPDATE ... WHERE version=X; good at low contention, degrades to retry storms when everyone fights for the same seat. Pick pessimistic lock or Redis SETNX-hold for hot events. Critical rule: hold the lock only to create the hold; never across payment. Flow: brief lock → held → commit → take payment against the hold → flip held→booked. Make the confirm idempotent (Phase 3) so a retried payment never double-charges or double-books.

**Extension — thundering herd:** a virtual waiting room / queue (Redis or Kafka) admits users in controlled batches with turn tokens ("you're 40,000th in line"), converting the spike into a steady rate. Cache the seat map for browsing (authoritative check still happens in the transaction, so a reserve can still 409). Shard by event so one blockbuster doesn't starve other shows.

**Trade-offs:** booking path favors consistency over availability (correct for the domain); browsing favors availability via caching (accepting a slightly stale map); Redis-hold offloads contention from SQL at the cost of another moving part.

**One-line summary:** a SQL/ACID inventory whose seats move available→held→booked, protected by short pessimistic locks or atomic Redis holds (never across payment) with TTL-based expiry, and fronted by a virtual waiting room that shapes the on-sale thundering herd into a rate the booking path can absorb.
`,
    },
  ],
}
