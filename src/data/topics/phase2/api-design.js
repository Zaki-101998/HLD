export default {
  id: 'api-design',
  title: 'API Design',
  subtitle: 'REST done right, pagination, versioning, idempotent endpoints — the interview’s API section',
  days: 2,
  content: `
## Why this matters for system design

Every design interview has an explicit "define the API" step — usually 3–5 minutes where you write endpoints on the board. Clean, conventional APIs signal engineering maturity instantly; weird ones burn credibility. This topic is your checklist for that step, plus the follow-up favorites: pagination, versioning, idempotency.

## REST — the conventions that matter

Resources are **nouns**; HTTP methods are the verbs:

\`\`\`
POST   /v1/rides                # create (returns 201 + the resource + its id)
GET    /v1/rides/{id}           # read one
GET    /v1/rides?status=active  # list + filter
PATCH  /v1/rides/{id}           # partial update
DELETE /v1/rides/{id}           # delete (204)
POST   /v1/rides/{id}/cancel    # action that isn't CRUD → sub-resource verb, fine
\`\`\`

Method semantics interviewers check:
- **GET** — safe (no side effects), cacheable. Never mutate on GET.
- **PUT** — full replace, **idempotent** by definition.
- **PATCH** — partial update.
- **POST** — create/act; NOT idempotent by default (the interesting case, below).

Status codes that matter: 200/201/202 (accepted-for-async — your queue topic!), 204, 400 (client's fault), 401 vs 403 (unauthenticated vs unauthorized), 404, 409 (conflict — version/state), **429 (rate limited)**, 500, 503 (+ \`Retry-After\`).

Error bodies: machine-readable code + human message + request id (\`{"error": {"code": "INSUFFICIENT_FUNDS", "message": "...", "request_id": "..."}}\`) — the request id ties into observability (Phase 3).

## Pagination — always asked

**Offset (\`?page=3&limit=20\`):** simple; jump-to-page works.
Two real problems: (1) **deep offsets are slow** — \`OFFSET 100000\` walks and discards 100k rows; (2) **page drift** — inserts between requests shift items across pages (duplicates/skips in feeds).

**Cursor (keyset):** return an opaque cursor encoding the last item's sort key: \`?after=eyJpZCI6...&limit=20\` → \`WHERE (created_at, id) < (cursor) ORDER BY created_at DESC, id DESC LIMIT 20\` — an index seek (sql topic!), O(page) at any depth, immune to drift.

**Interview default: cursor pagination for anything feed-like or large.** Offset is acceptable for small admin tables. Note the composite tiebreaker (id) — timestamps collide.

## Versioning & compatibility

- Path versioning (\`/v1/\`) is the pragmatic standard; header versioning is purist. Either is fine — *having* a strategy is the point.
- The deeper rule: **additive changes are free** (new optional fields); **breaking changes** (rename/remove/retype) require v2 + deprecation window. Clients must ignore unknown fields (tolerant reader).
- Internal APIs: this is what protobuf schemas + field numbers give you (gRPC topic tie-in).

## Webhooks — when the server calls you

Polling asks "is it done yet?" over and over; a **webhook** flips the direction — the provider POSTs to a URL the consumer registered when the event actually happens (payment settled, build finished, order shipped). Cheaper than polling and near-instant, but it comes with its own contract:

- **Delivery is at-least-once.** Networks retry ambiguous failures, so the same event can arrive twice — the receiving endpoint must be **idempotent** (same idea as the idempotency keys below, just on the receiving side this time).
- **Verify the sender.** Anyone can POST to a public URL, so providers sign the payload (HMAC over the body + a shared secret) and the consumer verifies the signature before trusting it.
- **The provider needs its own retry/backoff and a dead-letter path** for endpoints that are down or slow — exactly the queue-topic patterns, just aimed outward at a third party instead of an internal consumer.
- **When to reach for it vs polling vs SSE/WebSockets:** webhooks fit server-to-server notifications where the consumer has a public endpoint (Stripe → your backend); polling is simpler when events are rare or the consumer can't expose one; SSE/WebSockets (HTTP topic) fit a browser that needs live updates and can hold a connection open.

## Idempotency & retries (the follow-up you must nail)

\`POST /payments\` times out. Client retries. Two charges?

**Idempotency keys:** client generates a unique key per logical operation (\`Idempotency-Key: uuid\`); server stores \`key → response\` (with TTL) and replays the stored response for duplicates. Stripe's API is the canonical example. Combine with 409/425 for "original still in flight".

Rules of thumb: GET/PUT/DELETE are naturally idempotent (say it); POST needs the key; the server-side store needs atomicity (unique index on the key — your concurrency topic again).

## The practical checklist for the interview's API step

1. 3–6 endpoints max — the core flows, not the whole product.
2. Nouns + right verbs + status codes.
3. Request/response bodies: only the important fields, with types.
4. **Pagination** on any list. **Idempotency key** on any money/creation POST.
5. Auth in one line: "Bearer JWT via the gateway" (don't design OAuth unless asked).
6. Async jobs: \`202 + Location: /v1/jobs/{id}\` polling, or webhook/SSE callback (http topic!).

### Example: the 90-second API section for a ride app

\`\`\`
POST /v1/rides            {pickup, dropoff, payment_method_id}
  Idempotency-Key header · 201 → {ride_id, state:"MATCHING", eta}
GET  /v1/rides/{id}       → state machine snapshot
POST /v1/rides/{id}/cancel → 200 | 409 if already IN_RIDE
GET  /v1/riders/me/rides?after=<cursor>&limit=20   (history, cursor-paginated)
WS/SSE /v1/rides/{id}/updates   (live driver location & state)
\`\`\`

That block — with the header, the 409, the cursor — is what "strong API hygiene" looks like in a design interview.

## GraphQL — one honest paragraph

GraphQL lets clients query exactly the fields/graph they need (kills over/under-fetching and N-round-trip mobile screens); costs: server complexity (resolvers, N+1), caching is harder (POSTs to one endpoint), and unbounded queries need depth/cost limits. Interview posture: "REST by default; GraphQL when many diverse clients aggregate varied views (e.g. a mobile home screen hitting 6 services)." Don't lead with it unless the problem begs.

## How this shows up in interviews

- The API step of every design (use the checklist).
- "What happens if this request is retried?" → idempotency key story.
- "How does the feed paginate?" → cursor, with the WHERE clause.
- "How do you evolve the API?" → additive vs breaking + versioning.
`,
  resources: [
    {
      title: 'API design best practices',
      url: 'https://www.youtube.com/watch?v=_gQaygjm_hg',
      type: 'video',
      source: 'ByteByteGo (YouTube)',
    },
    {
      title: 'Stripe API reference — study its idempotency & pagination design',
      url: 'https://stripe.com/docs/api',
      type: 'doc',
      source: 'Stripe (the gold standard)',
    },
    {
      title: 'Evolving API pagination at Slack (offset→cursor war story)',
      url: 'https://slack.engineering/evolving-api-pagination-at-slack/',
      type: 'article',
      source: 'Slack Engineering',
    },
    {
      title: 'Webhooks',
      url: 'https://algomaster.io/learn/system-design/webhooks',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
    {
      title: 'REST vs GraphQL',
      url: 'https://blog.algomaster.io/p/rest-vs-graphql',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
    {
      title: 'REST vs RPC',
      url: 'https://blog.algomaster.io/p/106604fb-b746-41de-88fb-60e932b2ff68',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
  ],
  challenges: [
    {
      type: 'quiz',
      id: 'quiz-1',
      title: 'API design check',
      questions: [
        {
          q: 'A feed API uses ?page=5000&limit=20 and the DB is suffering. Why, and what’s the fix?',
          options: [
            'Page 5000 exceeds HTTP limits',
            'OFFSET 100000 forces the DB to walk and discard 100k rows per request; switch to cursor/keyset pagination (WHERE sort_key < cursor LIMIT 20 — an index seek)',
            'The limit should be 100',
            'Add more replicas',
          ],
          answer: 1,
          explanation:
            'Offset cost grows linearly with depth; keyset cost stays O(page size) because the index seeks directly to the cursor position (leftmost-prefix + range — the SQL topic). Cursors also fix page drift from concurrent inserts.',
        },
        {
          q: 'Which endpoint design correctly handles "client retried a timed-out payment POST"?',
          options: [
            'Make POST /payments idempotent by checking amount+user+time window heuristically',
            'Require Idempotency-Key; store key→response atomically (unique index); replay the stored response on duplicates',
            'Reject all retries with 400',
            'Use PUT because it is idempotent',
          ],
          answer: 1,
          explanation:
            'Heuristic dedup misfires (two genuine ₹500 orders). The client-supplied key names the LOGICAL operation; a unique-index insert makes the check atomic under concurrency. This is Stripe’s exact design and the expected answer.',
        },
        {
          q: 'Your v1 response renames "userName" to "user_name". What is this, and what should you have done?',
          options: [
            'An additive change — ship it',
            'A breaking change: renames/removals require a v2 (or a deprecation cycle shipping both fields) — clients parsing userName now crash',
            'Fine if documented in the changelog',
            'Fine because JSON is schemaless',
          ],
          answer: 1,
          explanation:
            'Adding optional fields is free; changing existing contract shape breaks parsers. Rule: additive = free, breaking = version bump + overlap window. (And clients should be tolerant readers — ignore unknown fields.)',
        },
        {
          q: 'Generating a large report takes ~60 s. The right API shape?',
          options: [
            'Hold the HTTP request open for 60 s',
            'POST /reports → 202 Accepted + Location: /reports/{id}; client polls (or gets a webhook/SSE) until state=READY with a download URL',
            'Return 500 until it is ready',
            'Break the report into 60 one-second requests',
          ],
          answer: 1,
          explanation:
            '202 + job resource is the async-work idiom (and pairs with your queue topic: the POST enqueues). Held connections waste sockets and die at proxies/timeouts. Bonus: the job resource gives progress + retry semantics for free.',
        },
        {
          q: '401 vs 403 vs 429 — which mapping is right?',
          options: [
            '401 = banned, 403 = not logged in, 429 = server crashed',
            '401 = not/badly authenticated, 403 = authenticated but not allowed, 429 = rate limited (send Retry-After)',
            'They are interchangeable client errors',
            '403 = TLS failure, 401 = DNS failure',
          ],
          answer: 1,
          explanation:
            '401 → who are you? 403 → I know you, and no. 429 → slow down (the rate-limiting topic implements it). Precise codes let clients react correctly (refresh token vs give up vs back off).',
        },
        {
          q: 'A cursor-paginated feed sorts by created_at only. Two posts share a timestamp and users report a post appearing on two consecutive pages. Fix?',
          options: [
            'Use offset pagination instead',
            'Add a unique tiebreaker to the sort + cursor: ORDER BY (created_at, id) with WHERE (created_at, id) < (:t, :id)',
            'Round timestamps to seconds',
            'Forbid simultaneous posts',
          ],
          answer: 1,
          explanation:
            'A cursor must identify a TOTAL order position; ties make the boundary ambiguous. Composite (timestamp, id) makes the order total and the cursor exact — a detail that quietly demonstrates real-world API scars.',
        },
      ],
    },
    {
      type: 'lab',
      id: 'lab-1',
      title: 'Dissect world-class APIs',
      intro: 'Read the masters: study how Stripe and GitHub answer the exact questions above.',
      steps: [
        {
          instruction: 'Hit GitHub’s public API and inspect its pagination headers.',
          command: 'curl -sI "https://api.github.com/repos/facebook/react/issues?per_page=5" | grep -iE "link|x-ratelimit"',
          expected: 'A Link header with rel="next" cursors AND x-ratelimit-* headers — cursor pagination and rate-limit signaling in one response.',
        },
        {
          instruction: 'Look at a real, well-formed error body (unauthenticated request).',
          command: 'curl -s https://api.github.com/user | head -5',
          expected: 'A JSON error object with message + documentation_url — machine-parseable, human-debuggable. Compare with your last project’s errors…',
        },
        {
          instruction: 'Read Stripe’s idempotency docs (5 min) — the canonical design.',
          command: 'open https://stripe.com/docs/api/idempotent_requests',
          expected: 'Note: key in a header, 24h retention, response replay, and their advice to always send keys on POSTs.',
        },
        {
          instruction: 'Check how a real API does versioning: peek at any Stripe endpoint’s docs and find the version mechanism.',
          expected: 'Stripe pins an account-level API version + per-request override header — a more sophisticated variant of /v1/. Path versioning remains the common answer; knowing both is depth.',
        },
        {
          instruction: 'Write (on paper/notes) the 5-endpoint API for a URL shortener — you’ll design the full system in Phase 4. Include: create (idempotent how?), redirect (which status code?), stats (paginated how?).',
          expected: 'POST /v1/urls with Idempotency-Key → 201; GET /{code} → 301/302 (pick and justify — 302 lets you count clicks); GET /v1/urls/{code}/stats?after=cursor. Keep this — you’ll compare against your Phase 4 answer.',
        },
      ],
    },
    {
      type: 'design',
      id: 'design-1',
      title: 'Design exercise: the API for a splitwise-style expense app',
      prompt: `
Design the REST API for a bill-splitting app: users create groups, add expenses ("dinner ₹3000, paid by A, split equally among A/B/C"), see balances ("B owes A ₹1000"), and settle up.

Produce: the endpoint list (≤7), request/response sketches for the two most important ones, pagination choice for expense history, the idempotency story for expense creation and settlement, and one deliberate API decision you'd defend under pushback.
`,
      hints: [
        'Balances: computed resource — GET of a derived view. Does it need its own endpoint?',
        'Settlement is money movement — which header is mandatory?',
        'What happens when two roommates add the same dinner simultaneously?',
      ],
      modelAnswer: `
**Endpoints:**
\`\`\`
POST /v1/groups                          create group
POST /v1/groups/{id}/members             add member
POST /v1/groups/{id}/expenses            add expense       (Idempotency-Key required)
GET  /v1/groups/{id}/expenses?after=&limit=   history       (cursor)
GET  /v1/groups/{id}/balances            derived balances view
POST /v1/groups/{id}/settlements         record settle-up  (Idempotency-Key required)
GET  /v1/users/me/groups                 my groups
\`\`\`

**Add expense:**
\`\`\`
POST /v1/groups/42/expenses
Idempotency-Key: 7f3a…
{ "description":"dinner", "amount_minor":300000, "currency":"INR",
  "paid_by":"user_a", "split":{"type":"EQUAL","among":["user_a","user_b","user_c"]} }
→ 201 { "expense_id":"exp_9","shares":[{"user":"user_b","owes_minor":100000}, …] }
\`\`\`
(Amounts in minor units as integers — never floats for money; a small decision that reads as experience.)

**Balances (derived, read-only):**
\`\`\`
GET /v1/groups/42/balances
→ 200 { "as_of":"…", "balances":[ {"from":"user_b","to":"user_a","amount_minor":100000}, … ] }
\`\`\`
Computed (and cached) from the expense ledger — clients never do the math; there's no PUT on balances because balances aren't a writable resource.

**Pagination:** cursor on \`(created_at, expense_id)\` — feed-like, growing, drift-prone under concurrent adds; offset would duplicate/skip.

**Idempotency:** expense + settlement POSTs require keys (unique index on key; replay stored response). Two roommates adding the same dinner is NOT a duplicate (different keys, different actors) — it's a product-level dedup hint ("similar expense added 1 min ago — add anyway?"), not an API rejection. Distinguishing transport retries from semantic duplicates under pushback is the mark of thought here.

**Decision to defend:** settlements are records ("B paid A ₹1000 in cash"), not payment execution — the API stores the fact and adjusts balances; actual money movement (UPI/Stripe) is a separate integration with its own idempotent flow. Keeping the ledger pure (append-only events; balances derived) gives auditability and makes every endpoint retry-safe.
`,
    },
  ],
}
