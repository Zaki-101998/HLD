export default {
  id: 'distributed-transactions',
  title: 'Distributed Transactions: 2PC, Sagas & the Outbox',
  subtitle: 'Moving money and state across services without a global ACID umbrella',
  days: 3,
  content: `
## Why this matters for system design

The moment you shard a database or split into services, "debit A and credit B atomically" stops being a BEGIN/COMMIT away. Every marketplace, payment, booking, and inventory interview eventually lands here: *how do you keep multi-step operations correct when each step lives in a different system?*

## Two-phase commit (2PC) — the classical answer and why it's avoided

A **coordinator** runs two rounds over all participants:

\`\`\`
Phase 1 (prepare): "can you commit?" → each participant locks + votes YES/NO
Phase 2 (commit/abort): if ALL yes → "commit!" else → "abort!"
\`\`\`

Guarantee: atomic across systems. The costs that make architects flinch:

- **Blocking:** between voting YES and hearing the verdict, a participant holds locks *and cannot decide alone*. If the coordinator dies there, participants are stuck ("in doubt") — locks held, rows frozen, until it returns.
- **Latency:** 2 round trips × slowest participant, on the critical path.
- **Fragility:** availability = product of ALL participants + coordinator (any one down → no commits).
- Heterogeneous systems (your DB + Stripe + a Kafka topic) mostly don't speak a common 2PC anyway.

Where it legitimately lives: *inside* single vendors' distributed databases (Spanner et al., with consensus-backed coordinators fixing the blocking problem). Across microservices: almost never. Interview posture: explain it, then explain why you'll use a saga instead.

## Sagas — the practical answer

A **saga** = a multi-step operation expressed as a sequence of **local transactions**, each atomic in its own service, with **compensating actions** to semantically undo completed steps if a later one fails.

\`\`\`
Trip booking: reserve flight → reserve hotel → charge card
Failure at charge:  refund? no — compensate backwards:
                    cancel hotel ← cancel flight ← (charge never happened)
\`\`\`

Key mental shift: **atomicity is replaced by eventual completion-or-compensation**, and intermediate states are *visible* (the flight is reserved while the hotel is pending). You design those states into the product ("booking: PROCESSING").

\`\`\`mermaid
sequenceDiagram
  autonumber
  participant O as Orchestrator
  participant F as Flight service
  participant H as Hotel service
  participant P as Payment service
  O->>F: reserve flight
  F-->>O: reserved
  O->>H: reserve hotel
  H-->>O: reserved
  O->>P: charge card
  P-->>O: DECLINED
  Note over O: compensate backwards
  O->>H: cancel hotel
  O->>F: cancel flight
\`\`\`

### Orchestration vs choreography

- **Orchestration:** a saga coordinator (often a state machine in the order service, or a workflow engine like Temporal) explicitly calls each step and tracks state. ✅ visible flow, easy debugging/timeouts. The usual recommendation.
- **Choreography:** each service reacts to the previous service's event (order_created → payment listens → payment_done → inventory listens…). ✅ loose coupling; ❌ the flow exists only implicitly — hard to trace, easy to create cycles.

### Saga rules that make it actually work

1. **Every step and every compensation must be idempotent** (retries are the recovery mechanism — next topic goes deep).
2. **The saga's own state must be durable** (an \`orders.state\` column / workflow log): PENDING → PAYMENT_DONE → … A recovery worker scans for stuck sagas and resumes/compensates. You met this exact shape in the payments-sharding exercise.
3. **Order steps by risk:** put the hardest-to-compensate step LAST (charge the card after inventory is secured — refunds are easy, un-shipping isn't).
4. Compensation is *semantic* undo, not rollback: "cancel reservation," "issue refund," sometimes "send apology + coupon." Some steps are truly un-compensatable (sent email) — place them after the point of no return.

## The dual-write problem & the outbox pattern (the everyday distributed transaction)

The most common baby version: "commit to my DB **and** publish an event" — two systems, no shared transaction. Crash between them → order exists, world never told (or vice versa).

**Transactional outbox:** in the SAME local DB transaction, write the business row *and* an \`outbox\` row describing the event. A relay (poller or CDC/Debezium tailing the WAL) publishes outbox rows to the broker, marking them sent. Broker delivery is at-least-once → consumers dedupe (idempotency again).

\`\`\`
BEGIN;
  INSERT INTO orders …;
  INSERT INTO outbox (event_type, payload) VALUES ('order_created', …);
COMMIT;                       -- atomic: both or neither
→ relay → Kafka → consumers (idempotent)
\`\`\`

\`\`\`mermaid
flowchart LR
  T["One local transaction: order row + outbox row"] --> DB["Database"]
  DB --> Relay["Relay / CDC — tails the outbox"]
  Relay --> Broker["Broker"]
  Broker --> C1["Consumer (idempotent)"]
  Broker --> C2["Consumer (idempotent)"]
\`\`\`

This one pattern, plus sagas, replaces 2PC in ~all microservice designs. Say "outbox" whenever your design writes-then-publishes.

## Choosing (the interview decision tree)

- Steps in ONE database (even sharded, same shard)? → a plain local transaction. Prefer designs that make this the common case (sharding topic: co-locate what transacts together).
- Multiple services/stores, user can see "processing"? → **saga (orchestrated)** + outbox for its events.
- Write + publish? → **outbox**.
- True atomic multi-store commit, no visible intermediate state acceptable? → question the requirement; if immovable, a consensus-coordinated 2PC inside one system's boundary (e.g. pick a database that spans the data instead).

## How this shows up in interviews

- "Order = charge + inventory + shipping across services — keep it consistent" → orchestrated saga, state machine, compensations, idempotency keys, risk-ordered steps.
- "How does the search index/cache/analytics hear about the write?" → outbox/CDC, never dual-write.
- "Why not 2PC?" → blocking on coordinator failure, latency, availability-product — then pivot to saga.
`,
  resources: [
    {
      title: 'Sagas vs 2PC explained',
      url: 'https://www.youtube.com/watch?v=S4FnmSeRpAY',
      type: 'video',
      source: 'ByteByteGo (YouTube)',
    },
    {
      title: 'Pattern: Saga (the definitive write-up)',
      url: 'https://microservices.io/patterns/data/saga.html',
      type: 'article',
      source: 'Chris Richardson, microservices.io',
    },
    {
      title: 'Pattern: Transactional outbox',
      url: 'https://microservices.io/patterns/data/transactional-outbox.html',
      type: 'article',
      source: 'Chris Richardson, microservices.io',
    },
  ],
  challenges: [
    {
      type: 'quiz',
      id: 'quiz-1',
      title: 'Distributed transactions check',
      questions: [
        {
          q: 'In 2PC, a participant voted YES and the coordinator then crashed. Why is this the protocol’s infamous weakness?',
          options: [
            'The participant’s vote is lost',
            'The participant is "in doubt": it cannot unilaterally commit OR abort, so it holds its locks indefinitely until the coordinator recovers — blocking everything touching those rows',
            'The transaction silently commits twice',
            'Other participants take over automatically',
          ],
          answer: 1,
          explanation:
            'A YES vote is a promise to obey a verdict that may never arrive. Deciding alone could contradict what others were told. This blocking-on-coordinator-failure is the core reason microservices avoid 2PC.',
        },
        {
          q: 'A trip-booking saga fails at the payment step, after flight and hotel steps succeeded. What happens?',
          options: [
            'The database rolls back all three automatically',
            'Compensating transactions run backwards: cancel hotel, cancel flight — semantic undo by new local transactions, since committed steps cannot be rolled back',
            'The payment is retried forever',
            'The user keeps the reservations unpaid',
          ],
          answer: 1,
          explanation:
            'Each step already committed locally; "undo" means executing its designed inverse. This is the saga contract: every forward step ships with a compensation, and both are idempotent.',
        },
        {
          q: 'Why should "charge the customer" usually be the LAST step of an order saga?',
          options: [
            'Payment services are slow',
            'Order steps by compensation difficulty: refunding money is routine, while clawing back shipped goods or released inventory is painful — so secure everything else before taking money',
            'Regulations require it',
            'It reduces saga length',
          ],
          answer: 1,
          explanation:
            'Risk-ordered steps minimize the cost of the most likely compensations. (Real systems often use auth-then-capture: authorize early, capture at the end — knowing that refinement is a bonus.)',
        },
        {
          q: 'Orchestration vs choreography: your 6-step order saga keeps timing out somewhere and nobody can tell where. Which style — and what does it fix?',
          options: [
            'Choreography — fewer moving parts',
            'Orchestration: a central state machine (or workflow engine) tracks exactly which step each order is on, owns timeouts/retries, and makes stuck sagas queryable',
            'Neither; add more logging to all services',
            'Convert to 2PC',
          ],
          answer: 1,
          explanation:
            'Choreographed flows exist only as emergent event chains — debugging = archaeology. An orchestrator makes the saga a first-class, observable entity. Choreography stays fine for short 2-step flows.',
        },
        {
          q: 'Service code: db.commit(); kafka.publish(event). What can go wrong, and what fixes it?',
          options: [
            'Nothing — both are reliable systems',
            'Crash between the two → committed data whose event never fires (silent divergence downstream); the transactional outbox writes the event in the SAME DB transaction, and a relay publishes it',
            'Kafka might receive the event twice',
            'Publish first, then commit',
          ],
          answer: 1,
          explanation:
            'Two systems, no shared atomicity — either order can half-fail (publish-first → events about ghosts). Outbox rides the local transaction; the relay is at-least-once; consumers dedupe. The most useful pattern-per-line-of-explanation in this course.',
        },
        {
          q: 'A recovery worker finds an order stuck in state INVENTORY_RESERVED for 2 hours (payment service was down). Legit actions?',
          options: [
            'Delete the order row',
            'Resume the saga (retry payment — steps are idempotent) OR compensate (release inventory, cancel order) per business timeout policy — both are safe because state is durable and steps are idempotent',
            'Restart every service',
            'Manually edit the payment DB',
          ],
          answer: 1,
          explanation:
            'This is sagas working as designed: durable state + idempotent steps mean crashes leave resumable, auditable work — not corruption. The recovery worker IS the atomicity story, stretched over time.',
        },
      ],
    },
    {
      type: 'lab',
      id: 'lab-1',
      title: 'Build a saga with crash recovery',
      intro:
        'A complete orchestrated saga — state machine, crash, recovery, compensation — in one SQLite file. Run each step and watch the states.',
      steps: [
        {
          instruction: 'Set up: an order saga with durable state, and a "payment service" that fails.',
          command: `sqlite3 /tmp/saga.db "
CREATE TABLE orders(id INTEGER PRIMARY KEY, item TEXT, state TEXT, updated_at INT);
CREATE TABLE inventory(item TEXT PRIMARY KEY, stock INT);
CREATE TABLE outbox(id INTEGER PRIMARY KEY AUTOINCREMENT, event TEXT, sent INT DEFAULT 0);
INSERT INTO inventory VALUES('widget', 5);
INSERT INTO orders VALUES(1,'widget','PENDING', strftime('%s','now'));
SELECT * FROM orders;"`,
          expected: 'Order 1 in PENDING. The state column IS the saga.',
        },
        {
          instruction: 'Step 1 — reserve inventory + outbox event, atomically (note the transaction).',
          command: `sqlite3 /tmp/saga.db "
BEGIN;
UPDATE inventory SET stock = stock - 1 WHERE item='widget' AND stock > 0;
UPDATE orders SET state='INVENTORY_RESERVED', updated_at=strftime('%s','now') WHERE id=1 AND state='PENDING';
INSERT INTO outbox(event) VALUES('inventory_reserved:order1');
COMMIT;
SELECT state FROM orders; SELECT stock FROM inventory; SELECT event, sent FROM outbox;"`,
          expected: 'INVENTORY_RESERVED, stock=4, and an UNSENT outbox event — business change + event, one atomic commit.',
        },
        {
          instruction: 'Step 2 — payment "crashes" (we simply do nothing). The saga is now STUCK. Run the recovery worker’s query.',
          command: `sqlite3 /tmp/saga.db "SELECT id, state, strftime('%s','now') - updated_at AS stuck_seconds FROM orders WHERE state NOT IN ('COMPLETED','CANCELLED');"`,
          expected: 'Order 1, INVENTORY_RESERVED, stuck for N seconds. Durable state makes the stuck saga FINDABLE — the whole point.',
        },
        {
          instruction: 'Recovery decides to COMPENSATE (payment down too long): release inventory, cancel order — atomically, idempotently.',
          command: `sqlite3 /tmp/saga.db "
BEGIN;
UPDATE inventory SET stock = stock + 1 WHERE item='widget';
UPDATE orders SET state='CANCELLED', updated_at=strftime('%s','now') WHERE id=1 AND state='INVENTORY_RESERVED';
INSERT INTO outbox(event) VALUES('order_cancelled:order1');
COMMIT;
SELECT state FROM orders; SELECT stock FROM inventory;"`,
          expected: 'CANCELLED, stock back to 5. Compensation = designed inverse, guarded by the state check (WHERE state=…) for idempotency.',
        },
        {
          instruction: 'Prove the idempotency guard: run the SAME compensation again.',
          command: `sqlite3 /tmp/saga.db "
UPDATE orders SET state='CANCELLED' WHERE id=1 AND state='INVENTORY_RESERVED';
SELECT changes() AS rows_affected; SELECT stock FROM inventory;"`,
          expected: 'rows_affected=0 — the state guard made re-running harmless. (Note the naive inventory UPDATE outside a guard WOULD double-release: guards must cover every side effect — a real bug class.)',
        },
        {
          instruction: 'Play the outbox relay: "publish" unsent events and mark them.',
          command: `sqlite3 /tmp/saga.db "SELECT id, event FROM outbox WHERE sent=0;" && sqlite3 /tmp/saga.db "UPDATE outbox SET sent=1 WHERE sent=0;" && echo '(each event now goes to the broker; consumers dedupe by event id)'`,
          expected: 'The relay loop: read-unsent → publish → mark. At-least-once by construction (crash between publish and mark = re-publish) — hence consumer dedup.',
        },
        {
          instruction: 'Clean up.',
          command: 'rm /tmp/saga.db',
          expected: 'Done. You have now built: saga state machine, compensation, idempotency guards, recovery scan, and an outbox relay.',
        },
      ],
    },
    {
      type: 'design',
      id: 'design-1',
      title: 'Design exercise: checkout across four services',
      prompt: `
An e-commerce checkout spans: OrderService (Postgres), InventoryService (its own DB), PaymentService (wraps Stripe), NotificationService (email). Requirements: no overselling, no double-charging, user sees a clear order status throughout, and a payment-provider outage must not corrupt anything.

Design the saga: steps in order (justify the order), state machine, compensations, where outbox/idempotency appear, and exactly what happens during a 30-minute Stripe outage.
`,
      hints: [
        'Which step is hardest to compensate? It goes last.',
        'Stripe retries need what header (api topic)?',
        'The user-visible status list IS your state machine.',
      ],
      modelAnswer: `
**Saga (orchestrated by OrderService's state machine):**

\`CREATED → INVENTORY_RESERVED → PAYMENT_CAPTURED → CONFIRMED (→ notification, non-critical)\`

**Step order rationale:** reserve inventory before payment — releasing a reservation (compensation) is free; refunding is easy but charge-then-no-stock means charging for what you can't sell. Notification last and outside the critical path: un-compensatable (can't unsend email) and unimportant if lost (can re-send).

1. **Create order** (local txn: order row state=CREATED + outbox \`order_created\`).
2. **Reserve inventory:** orchestrator calls InventoryService, which does an atomic conditional decrement (\`stock ≥ qty\`) + reservation row with TTL, idempotent by order_id. Fail → order state=REJECTED_NO_STOCK (terminal, no compensation needed). Success → state=INVENTORY_RESERVED (+outbox).
3. **Capture payment:** PaymentService calls Stripe with **Idempotency-Key = order_id** (provider-side dedup — the api-design topic pays off). Success → PAYMENT_CAPTURED. Hard-decline → compensate: release reservation (idempotent, guarded), state=PAYMENT_FAILED.
4. **Confirm:** state=CONFIRMED + outbox \`order_confirmed\` → NotificationService consumes (at-least-once + dedup by order_id → effectively one email).

**Stripe down 30 minutes:** step 3 times out ambiguously. The orchestrator does NOT assume failure (a timeout may have charged!). It: (a) marks state=PAYMENT_PENDING, retries with the SAME idempotency key on backoff — replays get Stripe's stored outcome, so no double charge, ever; (b) shows the user "processing your payment" (visible intermediate state, by design); (c) inventory reservation TTL (say 45 min) is the business bound — recovery worker compensates sagas still unpaid past it (release stock, state=EXPIRED, notify user). No corruption: every state transition was a local transaction, every retry idempotent, every stuck saga findable by the scan.

**Where each pattern lives:** outbox on every state change (search/analytics/email hear reliably); idempotency keys at both layers (orchestrator→services by order_id; PaymentService→Stripe); compensations = release-reservation and refund (kept for post-confirm cancellations); 2PC nowhere — and you can say precisely why.
`,
    },
  ],
}
