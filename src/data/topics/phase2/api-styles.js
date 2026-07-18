export default {
  id: 'api-styles',
  title: 'Choosing an API Style',
  subtitle: 'REST vs SOAP vs gRPC vs GraphQL vs WebSockets vs webhooks — the decision framework',
  days: 1,
  content: `
## Why this matters for system design

You've now met every API style this app covers — REST, webhooks, GraphQL (api-design topic), and WebSockets, SSE, long polling, gRPC (http-evolution topic). Interviewers rarely ask "explain gRPC" in isolation; they ask **"how do these two boxes talk, and why that way?"** — and they ask it for every arrow you draw. This topic adds the one style you haven't seen (SOAP) and, more importantly, puts all of them into a single decision framework you can run in seconds.

## Step 1: pick the family, then the style

Every arrow in your diagram belongs to one of two families:

- **Request/response** — the client asks, the server answers: **REST, SOAP, gRPC, GraphQL**. Choose here when the client knows *when* it wants data.
- **Push/event** — the server initiates: **WebSockets, SSE, long polling, webhooks**. Choose here when the *server* knows first (new message, payment settled, driver moved).

Half of API-choice mistakes are family mistakes: polling for events (should push), or holding a socket open for data that changes hourly (should request/response). Get the family right and the style choice is usually obvious.

## The request/response family

### REST — the default
Resources as nouns, HTTP verbs, JSON, status codes, cacheable GETs (the api-design topic is the deep dive). **Wins:** universal tooling, human-readable, HTTP caching for free, zero client codegen. **Loses:** over/under-fetching, N round trips for graphs, no enforced contract (OpenAPI is opt-in). **Default for:** public APIs and anything browser-facing.

### SOAP — the enterprise elder
SOAP is a **protocol**, not a convention: every message is an XML **envelope** (header + body), the service's operations and types are formally defined in a **WSDL** contract, and a stack of **WS-\\* standards** (WS-Security for message-level signing/encryption, WS-ReliableMessaging, WS-AtomicTransaction) layers on guarantees plain HTTP doesn't have. Transport-independent — SOAP runs over HTTP, SMTP, or a message queue.

**Why it lost the web:** verbose XML payloads, heavyweight tooling (generated stubs, strict schemas), and none of HTTP's native caching — REST's simplicity won for browser/mobile-facing APIs. **Why it's still alive:** banking, insurance, government, airlines, and telecom run decades of SOAP services, and its formal contract + message-level security genuinely fit compliance-heavy B2B integration (message-level security survives intermediaries; TLS only covers point-to-point).

**Interview posture:** *you encounter SOAP, you don't choose it for new systems.* The right sentence: "if the partner/legacy system mandates SOAP/WSDL, I'll integrate via an adapter service that speaks SOAP outward and REST/gRPC internally — I won't let XML leak into my core."

### gRPC — for machines talking to machines
HTTP/2 + Protobuf + codegen: binary payloads, enforced schemas with cheap evolution (field numbers), built-in streaming (http-evolution topic). **Wins:** latency, throughput, type-safe polyglot contracts. **Loses:** browsers can't speak it natively; not human-readable. **Default for:** internal service-to-service calls.

### GraphQL — for aggregating clients
Clients query exactly the fields/graph they need in one round trip (api-design topic). **Wins:** kills over/under-fetching for diverse clients. **Loses:** resolver complexity, N+1, hard caching, unbounded-query defense. **Default for:** many varied clients composing views over many services — not a reflex.

## The push/event family

- **Webhooks** — server-to-**server** notification: provider POSTs to your registered URL. Needs HMAC verification, idempotent receivers, retries + DLQ (api-design topic). *Stripe telling your backend a payment settled.*
- **WebSockets** — **bidirectional** browser real-time; costs stateful connection servers + a pub/sub backbone (http-evolution topic). *Chat, games, collaborative editing.*
- **SSE** — **one-way** server→browser stream over plain HTTP; auto-reconnect. *Feeds, tickers, LLM token streaming.*
- **Long polling** — the maximum-compatibility fallback when the above are blocked.

The browser-real-time decision tree between these lives in the http-evolution topic; the webhook-vs-polling call lives in api-design. What's new here is seeing them beside the request/response family as one menu.

## The unified comparison table

| Style | Contract | Payload | Direction | Browser-native | Caching | Sweet spot |
|---|---|---|---|---|---|---|
| REST | conventions (+ optional OpenAPI) | JSON | client → server | yes | HTTP caching free | public & general-purpose APIs |
| SOAP | **WSDL (formal, enforced)** | XML envelope | client → server | clunky | none | enterprise/legacy B2B, compliance |
| gRPC | .proto (enforced, codegen) | Protobuf (binary) | client → server + streaming | no (needs gRPC-Web) | none | internal microservices |
| GraphQL | schema (typed) | JSON | client → server | yes | hard (POST, one endpoint) | diverse clients aggregating views |
| Webhook | provider-defined events | JSON | server → **server** | n/a | n/a | third-party event notification |
| WebSocket | app-defined messages | anything | **bidirectional** | yes | n/a | chat, games, live collab |
| SSE | event stream | text events | server → client | yes | n/a | feeds, tickers, token streaming |
| Long polling | plain HTTP | JSON | server → client (simulated) | yes | n/a | fallback |

## The decision flowchart

\`\`\`mermaid
flowchart TB
  Q0{"Who knows first that\ndata changed?"} -->|"client asks"| Q1{"Who's the consumer?"}
  Q0 -->|"server knows first"| Q4{"Consumer is…"}
  Q1 -->|"public / partners / browser"| Q2{"Partner mandates WSDL,\nWS-Security, legacy stack?"}
  Q2 -->|no| REST["REST/JSON — the default"]
  Q2 -->|yes| SOAP["SOAP via an adapter service"]
  Q1 -->|"your own internal services"| GRPC["gRPC"]
  Q1 -->|"many diverse clients\naggregating many services"| GQL["GraphQL / BFF"]
  Q4 -->|"another backend\nwith a public endpoint"| WH["Webhooks (HMAC + idempotent receiver)"]
  Q4 -->|"a browser/app, bidirectional"| WS["WebSockets + pub/sub"]
  Q4 -->|"a browser/app, one-way"| SSE["SSE (long polling as fallback)"]
  classDef accent fill:#312e81,stroke:#6366f1,color:#e0e7ff
  class REST,GRPC,WH accent
\`\`\`

## The interview-safe defaults

Say this composite out loud and you cover 90% of designs:

1. **REST/JSON at the public edge** — universal, cacheable, debuggable.
2. **gRPC between internal services** — latency + enforced contracts.
3. **WebSockets/SSE for browser real-time** — bidirectional vs one-way decides which.
4. **Webhooks for server-to-server notification** — with signing, idempotency, retries.
5. **GraphQL only when the problem begs** — many clients, many services, aggregation pain.
6. **SOAP only when a legacy/enterprise partner mandates it** — behind an adapter.

Then justify the *one* choice the problem actually stresses. Naming the default *and* the exception ("REST at the edge — but courier location is server-push, so that edge is SSE") is what separates a checklist answer from an engineered one.

## How this shows up in interviews

- **"REST or gRPC for your services?"** → gRPC internally (binary, contracts, streaming), REST at the edge (browsers, tooling). Both, with a boundary.
- **"Why not GraphQL here?"** → have a reason ready either way: how many client types? how much view aggregation? who owns caching?
- **"How does the client get live updates?"** → run the push-family tree: bidirectional → WS; one-way → SSE; another backend → webhook.
- **"The bank only exposes SOAP."** → adapter service at the boundary; core stays clean.
`,
  resources: [
    {
      title: 'Top 6 most popular API architecture styles',
      url: 'https://www.youtube.com/watch?v=4vLxWqE94l4',
      type: 'video',
      source: 'ByteByteGo (YouTube)',
    },
    {
      title: 'SOAP vs REST — the difference',
      url: 'https://aws.amazon.com/compare/the-difference-between-soap-rest/',
      type: 'article',
      source: 'AWS',
    },
    {
      title: 'gRPC vs REST — the difference',
      url: 'https://aws.amazon.com/compare/the-difference-between-grpc-and-rest/',
      type: 'article',
      source: 'AWS',
    },
    {
      title: 'Understanding gRPC, OpenAPI and REST — and when to use them',
      url: 'https://cloud.google.com/blog/products/api-management/understanding-grpc-openapi-and-rest-and-when-to-use-them',
      type: 'article',
      source: 'Google Cloud',
    },
  ],
  challenges: [
    {
      type: 'quiz',
      id: 'quiz-1',
      title: 'Which style, and why?',
      questions: [
        {
          q: 'A bank partner integration requires a formal machine-readable contract, message-level encryption that survives intermediaries, and their stack only speaks XML. Which style — and how do you keep it out of your core?',
          options: [
            'REST with JSON Schema — XML is obsolete',
            'SOAP (WSDL contract + WS-Security), integrated via an adapter service that speaks SOAP outward and REST/gRPC internally',
            'gRPC — Protobuf is the strictest contract',
            'GraphQL — the bank can query what it needs',
          ],
          answer: 1,
          explanation:
            'WSDL gives the formal contract; WS-Security signs/encrypts the MESSAGE itself (TLS only protects point-to-point hops). You don’t choose SOAP for new systems — but when a partner mandates it, an adapter at the boundary keeps XML from leaking into your services.',
        },
        {
          q: 'Fifty internal microservices in three languages call each other at high QPS and keep breaking each other with payload changes. Best fit?',
          options: [
            'REST with careful documentation',
            'gRPC — Protobuf schemas enforce the contract across languages, field numbers make evolution safe, binary payloads and HTTP/2 cut latency',
            'SOAP — WSDL is the strongest contract',
            'WebSockets between all services',
          ],
          answer: 1,
          explanation:
            'This is gRPC’s home turf: codegen gives type-safe clients in every language, schema evolution is designed-in, and binary-over-HTTP/2 beats JSON parsing at high QPS. SOAP has contracts too but the XML/tooling weight is why it lost. The standard line: gRPC internally, REST at the edge.',
        },
        {
          q: 'Your mobile home screen makes 6 REST calls to different services and throws away 80% of each response. The team proposes GraphQL. What’s the honest trade-off?',
          options: [
            'GraphQL is strictly better — migrate everything',
            'It fixes over-fetching and round trips for aggregating clients, but you take on resolver/N+1 complexity, harder caching, and query-cost limits — worth it here, not as a blanket replacement',
            'Never use GraphQL — caching is impossible',
            'Use SOAP — it also reduces round trips',
          ],
          answer: 1,
          explanation:
            'This scenario (diverse client, many services, heavy aggregation) is exactly when GraphQL earns its complexity. The interview skill is naming BOTH sides: what it fixes and what it costs. A BFF (per-client gateway, microservices topic) is the lighter alternative worth mentioning.',
        },
        {
          q: 'Your backend must know when a payment settles at the provider. Settlements take minutes to days. Best mechanism?',
          options: [
            'Poll the provider’s API every second',
            'Hold a WebSocket open to the provider',
            'Register a webhook: the provider POSTs the event to your endpoint — verify the HMAC signature and make the handler idempotent (at-least-once delivery)',
            'SSE stream from the provider',
          ],
          answer: 2,
          explanation:
            'Server-to-server notification with unpredictable timing is the webhook’s exact use case — near-instant without wasted polls. The follow-ups you must nail: HMAC verification (anyone can POST to a public URL) and idempotent handling (retries mean duplicates). WS/SSE fit browsers, not backend-to-backend.',
        },
        {
          q: 'Browser clients need live sports scores — server pushes, clients never send. Simplest right answer?',
          options: [
            'WebSockets — always best for real-time',
            'SSE: one-way server→client over plain HTTP, browser auto-reconnect, no full-duplex socket infrastructure for a one-way problem',
            'Short polling every 100 ms',
            'Webhooks to each browser',
          ],
          answer: 1,
          explanation:
            'One-way push is SSE’s sweet spot — WebSockets work but buy bidirectionality you don’t need, at the cost of stateful socket servers. Browsers can’t receive webhooks (no public endpoint). Choosing the SIMPLEST sufficient tool is the signal interviewers look for.',
        },
        {
          q: 'Why do public-facing APIs usually stay REST/JSON instead of gRPC, even at companies using gRPC everywhere internally?',
          options: [
            'gRPC is slower over the public internet',
            'Browsers can’t speak native gRPC (needs a gRPC-Web proxy), binary payloads aren’t debuggable by third parties, and REST’s universal tooling/caching matters most at the edge',
            'gRPC cannot be secured with TLS',
            'Licensing restricts gRPC to internal use',
          ],
          answer: 1,
          explanation:
            'The edge optimizes for reach and developer experience: any client, curl-ability, HTTP caching. Internally you control both ends, so binary + codegen wins. That boundary — REST outside, gRPC inside — is the expected interview answer.',
        },
      ],
    },
    {
      type: 'design',
      id: 'design-1',
      title: 'Design exercise: one system, five API styles',
      prompt: `
You're designing a food-delivery platform. Assign an API style to each edge, with a one-line justification each:

1. Public API for restaurant partners to manage menus and receive orders
2. The consumer mobile app's home screen (restaurants, offers, order status, recommendations — aggregated from 5 internal services)
3. Internal calls between order, payment, courier, and notification services
4. Live courier location on the customer's tracking map
5. The payment provider informing you of settlements/chargebacks
6. Integration with a large restaurant chain's legacy ERP that only exposes WSDL-defined XML services

Then answer the classic follow-up: "Why not just use one style everywhere?"
`,
      hints: [
        'Run the framework: who initiates each edge — client request or server event?',
        'Edge 4: does the customer send anything back on that channel, or only receive?',
        'Edge 6: the style is forced — the design decision is WHERE it lives.',
      ],
      modelAnswer: `
**1. Partner API → REST/JSON.** Third parties need universal tooling, curl-ability, docs, HTTP caching; version it (/v1/), webhook them new orders (see 5 — same pattern outbound).

**2. Mobile home screen → BFF, GraphQL if aggregation pain grows.** One mobile-tailored endpoint composing the 5 services kills the 6-round-trip problem; GraphQL is the heavier tool if client views keep diversifying. Naming BFF first shows restraint.

**3. Internal services → gRPC.** High-QPS machine-to-machine: Protobuf contracts, codegen across languages, HTTP/2 streaming for things like courier-location fan-in.

**4. Live tracking map → SSE (WebSockets also defensible).** Server→client one-way push: SSE is the simplest sufficient tool, auto-reconnects, plain HTTP. If the same channel later carries customer chat (bidirectional), upgrade that edge to WebSockets + pub/sub backbone.

**5. Payment provider → webhooks.** Provider-initiated, server-to-server, unpredictable timing. Verify HMAC signatures, idempotent handlers (at-least-once), 2xx fast + process async off a queue.

**6. Legacy ERP → SOAP behind an adapter service.** The style is mandated; the decision is containment: one adapter speaks WSDL/XML outward and gRPC/REST inward, so the core never sees an envelope.

**"Why not one style everywhere?"** Because the edges have different masters: the public edge optimizes for reach and debuggability (REST), internal edges for latency and contract safety (gRPC), real-time edges for push direction (SSE/WS), third-party events for decoupling (webhooks), and legacy edges for compatibility (SOAP). One style everywhere means every edge but one is running a tool mismatched to its constraints — the framework (family first, then style, per edge) IS the answer.
`,
    },
  ],
}
