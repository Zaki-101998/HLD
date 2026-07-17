export default {
  id: 'http-evolution',
  title: 'HTTP Evolution & Real-Time Communication',
  subtitle: 'HTTP/1.1 → 2 → 3, plus WebSockets, SSE, long polling, and gRPC',
  days: 3,
  content: `
## Why this matters for system design

"How do the client and server talk?" is a decision you make in *every* design interview. Chat apps, live dashboards, notifications, video — each pushes you toward a specific technique (WebSockets? SSE? polling?). And knowing *why* HTTP/2 and HTTP/3 exist proves you understand the transport layer you just studied.

## HTTP basics (fast recap)

HTTP is a **request/response** protocol: method + path + headers + optional body → status + headers + body. It's **stateless** — each request stands alone, which is exactly *why* horizontal scaling works (any server can answer any request). State lives in cookies/tokens (client) or databases/caches (server).

## HTTP/1.1 (1997) — one request at a time

- **Keep-alive**: reuse one TCP connection for sequential requests (huge win vs 1.0).
- **The problem**: one connection handles one request *at a time*. A slow response blocks the next request (application-level head-of-line blocking).
- **The workaround**: browsers open ~6 parallel connections per domain; sites did "domain sharding", sprite sheets, bundling — all hacks around this limit.

## HTTP/2 (2015) — multiplexing

- **Streams**: many concurrent requests/responses interleaved on **one** TCP connection, as binary frames.
- **Header compression (HPACK)**: repeated headers (cookies!) shrink dramatically.
- **Server push** (mostly abandoned in practice).
- **The remaining flaw**: it all rides one TCP connection — so a single lost packet stalls *every* stream (TCP head-of-line blocking, from the TCP topic). On lossy mobile networks, HTTP/2 can be *slower* than HTTP/1.1 with 6 connections.

## HTTP/3 (2022) — QUIC

- Replaces TCP with **QUIC over UDP**: streams are independent at the transport level, so one lost packet stalls only its own stream.
- **Faster handshakes**: transport + TLS 1.3 combined = 1 RTT, or **0-RTT** for returning clients.
- **Connection migration**: switch from Wi-Fi to cellular without dropping the connection (connections are identified by IDs, not the 4-tuple).
- Now carries a large share of Google/Meta/CDN traffic; you get it for free by fronting with a modern CDN.

| | HTTP/1.1 | HTTP/2 | HTTP/3 |
|---|---|---|---|
| Transport | TCP | TCP | QUIC (UDP) |
| Concurrent requests per connection | 1 | many (multiplexed) | many |
| HOL blocking | at HTTP level | at TCP level | none (per-stream) |
| Handshake to first byte | 2–3 RTT | 2–3 RTT | 1 RTT (0-RTT resumed) |

## Real-time: the server wants to talk FIRST

HTTP is client-initiated. But chat messages, notifications, and live scores originate at the *server*. Four patterns, in order of increasing capability — here's how each one puts bytes on the wire:

\`\`\`mermaid
sequenceDiagram
  participant C as Client
  participant S as Server
  Note over C,S: Short polling — ask on a timer, usually empty
  C->>S: anything new?
  S-->>C: nothing
  C->>S: anything new?
  S-->>C: here's a message
  Note over C,S: Long polling — server holds the request until data exists
  C->>S: anything new? (held open ~30s)
  S-->>C: message (client immediately re-asks)
  Note over C,S: SSE — one response the server keeps appending (one-way)
  C->>S: GET /events (text/event-stream)
  S-->>C: event 1
  S-->>C: event 2
  Note over C,S: WebSocket — full-duplex persistent channel
  C->>S: HTTP Upgrade: websocket
  S-->>C: 101 Switching Protocols
  C->>S: message
  S-->>C: message (either side, anytime)
\`\`\`

### 1. Short polling
Client asks "anything new?" every N seconds. Trivial to build; wasteful (most polls return nothing); latency = poll interval. Fine for non-urgent data (e.g. refresh badge count every 60 s).

### 2. Long polling
Client asks; server **holds the request open** until data exists (or ~30 s timeout), responds, client immediately re-asks. Near-real-time latency with plain HTTP. Costs: a held connection per client, thundering re-connects. The classic pre-WebSocket chat solution and still a common *fallback*.

### 3. Server-Sent Events (SSE)
One long-lived HTTP response the server keeps appending to (\`Content-Type: text/event-stream\`). **One-way** (server→client), auto-reconnect built into browsers, plain HTTP (works through proxies/LBs). Perfect for: live feeds, notifications, stock tickers, **LLM token streaming** (this is what ChatGPT-style apps use).

### 4. WebSockets
Starts as an HTTP request with \`Upgrade: websocket\`, then becomes a **full-duplex, persistent, message-based** channel over the same TCP connection. Both sides can send anytime. Perfect for: chat, multiplayer games, collaborative editing, trading.

**Costs interviewers expect you to know:** each open socket holds server memory + a file descriptor; you now need **stateful** connection servers (a user is "on" server #7), so cross-server delivery requires a pub/sub backbone (Redis/Kafka) — "how do I message a user connected to another node?" is a classic follow-up. Load balancers must support sticky/long-lived connections.

### Decision guide

| Need | Choose |
|---|---|
| Updates every few minutes | Short polling |
| Server→client only, text events | SSE |
| Bidirectional, low latency | WebSockets |
| Broad proxy/firewall compatibility, simplicity | Long polling (fallback) |

\`\`\`mermaid
flowchart TB
  Q1{"Does the server need to push?"} -->|no| REQ["Plain request / response"]
  Q1 -->|yes| Q2{"Bidirectional?"}
  Q2 -->|"yes, low latency"| WS["WebSockets + pub/sub backbone"]
  Q2 -->|"server to client only"| Q3{"Need broad proxy compatibility?"}
  Q3 -->|"modern, text events"| SSE["Server-Sent Events"]
  Q3 -->|"maximum compatibility"| LP["Long polling fallback"]
  classDef accent fill:#312e81,stroke:#6366f1,color:#e0e7ff
  class WS,SSE accent
\`\`\`

## gRPC — HTTP for machines

gRPC = **HTTP/2 + Protocol Buffers + code generation**.

- **Protobuf**: a binary, schema-defined format — smaller and much faster to parse than JSON, with enforced types.
- **Streaming**: unary, server-streaming, client-streaming, bidirectional — all built in.
- **Codegen**: define the service once in a \`.proto\` file; generate type-safe clients/servers in any language.

**Where it wins:** internal service-to-service calls (microservices), high-QPS APIs, polyglot companies.
**Where it doesn't:** browsers can't speak native gRPC (needs gRPC-Web proxy); payloads aren't human-readable; public APIs usually stay REST/JSON.

**Standard interview take:** REST/JSON at the public edge, gRPC between internal services.

## How this shows up in interviews

- Chat app → WebSockets + pub/sub backbone; mention long-polling fallback.
- Notifications feed → SSE (or push service on mobile).
- "Why HTTP/3?" → QUIC kills TCP HOL blocking, 0-RTT, connection migration for mobile.
- Microservices → gRPC internally for latency + contracts, REST externally.
`,
  resources: [
    {
      title: 'HTTP/1 to HTTP/2 to HTTP/3',
      url: 'https://www.youtube.com/watch?v=a-sBfyiXysI',
      type: 'video',
      source: 'ByteByteGo (YouTube)',
    },
    {
      title: 'Polling vs SSE vs WebSockets — how to choose',
      url: 'https://www.youtube.com/watch?v=ZBM28ZPlin8',
      type: 'video',
      source: 'Hussein Nasser (YouTube)',
    },
    {
      title: 'What is gRPC? (why Protobuf matters)',
      url: 'https://grpc.io/docs/what-is-grpc/introduction/',
      type: 'doc',
      source: 'grpc.io',
    },
    {
      title: 'HTTP/HTTPS',
      url: 'https://algomaster.io/learn/system-design/http-https',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
    {
      title: 'WebSockets',
      url: 'https://blog.algomaster.io/p/websockets',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
    {
      title: 'Long Polling vs WebSockets',
      url: 'https://blog.algomaster.io/p/long-polling-vs-websockets',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
  ],
  challenges: [
    {
      type: 'quiz',
      id: 'quiz-1',
      title: 'Protocols & real-time patterns',
      questions: [
        {
          q: 'HTTP/2 multiplexes 50 streams on one TCP connection. A single packet is lost on a flaky network. What happens?',
          options: [
            'Only the stream whose packet was lost stalls',
            'All 50 streams stall until TCP retransmits — TCP-level head-of-line blocking',
            'The connection closes and all streams fail',
            'Nothing; HTTP/2 ignores packet loss',
          ],
          answer: 1,
          explanation:
            'TCP delivers one ordered byte stream; it can’t know the bytes belong to independent HTTP streams. Everything waits for the retransmission. QUIC (HTTP/3) makes streams independent at the transport layer to fix exactly this.',
        },
        {
          q: 'You are streaming LLM-generated tokens to a browser (server→client only). The simplest right-sized tool is:',
          options: [
            'WebSockets',
            'Server-Sent Events (SSE)',
            'Short polling every 100 ms',
            'gRPC bidirectional streaming',
          ],
          answer: 1,
          explanation:
            'SSE is exactly this: a long-lived HTTP response the server appends to, with browser auto-reconnect. WebSockets work but add bidirectional machinery you don’t need; polling wastes resources; browsers can’t do native gRPC.',
        },
        {
          q: 'Your WebSocket chat service scales to 3 servers. User A (on server 1) messages user B (connected to server 3). What do you need?',
          options: [
            'Nothing — WebSockets handle routing automatically',
            'A pub/sub backbone (e.g. Redis) or a connection registry so server 1 can get the message to server 3',
            'Both users must reconnect to the same server',
            'Switch to HTTP/3',
          ],
          answer: 1,
          explanation:
            'Persistent connections make servers stateful: each server only holds ITS sockets. Cross-node delivery needs an internal channel — every server subscribes to a bus, or a registry maps userId → node. This follow-up appears in almost every chat design interview.',
        },
        {
          q: 'Why do mobile users benefit most from HTTP/3’s QUIC?',
          options: [
            'Phones have special QUIC chips',
            'Loss-prone radio links avoid TCP HOL blocking, 0-RTT resumption cuts handshakes, and connection migration survives Wi-Fi↔cellular switches',
            'QUIC compresses images better',
            'UDP is battery-free',
          ],
          answer: 1,
          explanation:
            'All three QUIC headline features target mobile pain: lossy links (independent streams), frequent reconnects (0-RTT), and network switching (connection IDs instead of IP 4-tuples).',
        },
        {
          q: 'For internal microservice calls at 50k req/s, why might you pick gRPC over REST/JSON?',
          options: [
            'gRPC works better in browsers',
            'Binary protobuf is smaller/faster to serialize, HTTP/2 multiplexing reduces connections, and generated clients enforce type-safe contracts',
            'gRPC does not need a network',
            'JSON cannot exceed 1k req/s',
          ],
          answer: 1,
          explanation:
            'At high QPS, serialization CPU and payload bytes are real money, and schema-enforced contracts prevent an entire class of integration bugs. The browser limitation is why the PUBLIC edge usually stays REST.',
        },
        {
          q: 'Long polling vs short polling: the key advantage of long polling is…',
          options: [
            'It uses UDP',
            'Near-instant delivery without a fixed polling interval — the server responds the moment data exists',
            'It requires no server support',
            'It never holds connections open',
          ],
          answer: 1,
          explanation:
            'Short polling latency averages half the interval and wastes most requests. Long polling parks the request server-side until there’s news — real-time-ish over plain HTTP, at the cost of held connections.',
        },
        {
          q: 'HTTP being stateless is directly what enables…',
          options: [
            'Faster DNS lookups',
            'Any server behind the load balancer to handle any request — i.e., horizontal scaling',
            'Binary framing',
            'Cookie-free authentication',
          ],
          answer: 1,
          explanation:
            'No per-request server memory of previous requests → requests are freely routable → add servers to add capacity. The moment you add server-held state (WebSocket sessions, local sessions), routing gets constrained — a recurring design tension.',
        },
      ],
    },
    {
      type: 'lab',
      id: 'lab-1',
      title: 'See protocol versions and streaming in the wild',
      intro: 'Use curl and your browser’s devtools to observe HTTP versions and real-time techniques on production sites.',
      steps: [
        {
          instruction: 'Check which HTTP version big sites negotiate with you.',
          command: `curl -sI --http2 https://www.google.com -o /dev/null -w 'google: %{http_version}\\n'\ncurl -sI https://www.cloudflare.com -o /dev/null -w 'cloudflare: %{http_version}\\n'`,
          expected: 'Version 2 (curl usually caps at h2; browsers go h3). The negotiation happened via ALPN during the TLS handshake.',
        },
        {
          instruction: 'In Chrome: open devtools → Network tab → right-click the column header → enable "Protocol". Then browse youtube.com.',
          expected: 'A mix of h2 and h3 requests. h3 = QUIC in action.',
        },
        {
          instruction: 'Watch SSE streaming live from your terminal (a public test stream).',
          command: 'curl -N https://stream.wikimedia.org/v2/stream/recentchange | head -5',
          expected: 'Lines arriving continuously on ONE response — Wikipedia’s real-time edit feed as Server-Sent Events. Ctrl+C to stop.',
        },
        {
          instruction: 'Find a WebSocket in the wild: open web.whatsapp.com (or any live chat/trading site) → devtools → Network → filter "WS" → click the connection → Messages tab.',
          expected: 'The 101 Switching Protocols upgrade, then frames flowing both directions on one connection.',
        },
        {
          instruction: 'Compare payload size: JSON vs binary intuition. Check how much headers alone weigh.',
          command: 'curl -sI https://www.amazon.com | wc -c',
          expected: 'Often 1–2+ KB of headers per response — this is what HPACK header compression in HTTP/2 attacks.',
        },
      ],
    },
    {
      type: 'design',
      id: 'design-1',
      title: 'Mini-design: live cricket score platform',
      prompt: `
Design the client-communication layer for a cricket score app: 5 million concurrent users during a big match, score updates every few seconds, plus a live comment stream. Users can also post comments (writes are much rarer than reads).

1. Which protocol(s) do you use for delivering score updates and comments to viewers?
2. How do the connection servers scale, and how does an update reach 5M clients?
3. What's your fallback for restrictive corporate networks?
`,
      hints: [
        'Is viewer traffic one-way or two-way? Mostly?',
        'Fan-out: one score update → 5M deliveries. What sits between the source and the connection servers?',
        'Estimate: 5M connections at ~64KB kernel/app memory each — how many servers?',
      ],
      modelAnswer: `
**1. Protocol choice.** Viewing is 99% server→client: **SSE is a great fit** (simple, HTTP-native, auto-reconnect, CDN/proxy friendly). Posting a comment is a plain HTTPS POST — no persistent upstream channel needed. (WebSockets also work and many real apps use them, but you should articulate that bidirectionality isn't actually required here.)

**2. Scale + fan-out.**
- ~5M concurrent connections ÷ ~100k connections per connection-server node ≈ **50–60 nodes** behind an L4 load balancer (long-lived connections; least-connections balancing).
- Connection servers are **subscribers**: score service publishes \`match:1234\` events to a pub/sub tier (Redis pub/sub / Kafka); every connection node receives it once and writes it to its local sockets. One publish → 50 node deliveries → 5M socket writes.
- Since every viewer of a match gets IDENTICAL data, you can push fan-out even further out: broadcast via CDN edge (e.g. SSE through an edge network) so origin only feeds the edge.
- Comments: same pipe, but rate-limit and batch (e.g. ship at most 1 comment bundle/sec) to cap fan-out cost.

**3. Fallback.** Long polling over plain HTTPS port 443 for networks that buffer/kill streaming responses; client library degrades automatically (this is exactly what libraries like socket.io do).

**Bonus points:** mention thundering herd on reconnect after a node dies (add reconnect jitter), and that scores are supersede-able state so missed events don't need replay — each update carries the full current score.
`,
    },
  ],
}
