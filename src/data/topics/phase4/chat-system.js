export default {
  id: 'chat-system',
  title: 'Design a Chat System (WhatsApp / Messenger)',
  subtitle: 'Real-time messaging: WebSockets, the connection-routing problem, delivery status, and offline delivery',
  days: 2,
  content: `
## The problem

Design a real-time 1:1 (and group) messaging app: users send messages that arrive on the recipient's device near-instantly, with **sent / delivered / read** receipts, working even when the recipient is offline. WhatsApp-scale. This problem is about **persistent connections (WebSockets)** instead of request/response, the **"which server holds this user's connection?" routing problem**, and **guaranteed delivery + ordering**.

## Step 1 — Requirements

**Functional:** send/receive 1:1 messages in real time; **online/last-seen presence**; **delivery receipts** (sent → delivered → read); **offline delivery** (messages queued and delivered when the recipient reconnects); group chat; media messages. *De-scope initially:* end-to-end encryption (mention it), calls.

**Non-functional:** **low latency** (feels instant); **reliable delivery** (never lose a message) and **in-order** within a conversation; **high availability**; huge scale (billions of messages/day, hundreds of millions of concurrent connections).

## Step 2 — Estimation

- **50B messages/day** ≈ ~600k messages/sec average (peak higher). Hundreds of millions of **simultaneously connected** clients. Each connection is a live socket held open on a server — so **connection count, not just QPS, is a first-class scaling dimension** (a single box holds ~tens of thousands of sockets).
- Message storage: 50B/day × ~100 bytes ≈ 5 TB/day → needs a horizontally-scalable store (wide-column like Cassandra/HBase), partitioned by conversation/user.

## Step 3 — Why not plain HTTP? The transport decision

Chat needs the **server to push to the client** the instant a message arrives — HTTP request/response can't (the client would have to poll). Options (Phase 0 HTTP-evolution topic):
- **Long polling** — works, but wasteful (repeated reconnects, latency).
- **WebSockets** — a **persistent, full-duplex TCP connection**: either side can send anytime. **The right choice** for chat. (SSE is server→client only; WebSocket is bidirectional — better here.)

So each client holds an open **WebSocket to a "chat server"** for its whole session.

## Step 4 — API / protocol

Over the WebSocket, a small message protocol: \`{type: "send", to, conversation_id, client_msg_id, body}\`, \`{type: "ack", ...}\`, \`{type: "receipt", status: "delivered"|"read"}\`, \`{type: "presence", ...}\`. A REST API handles login, fetching history (\`GET /conversations/{id}/messages?cursor=\`), and uploading media (pre-signed URL to object storage).

## Step 5 & 6 — Architecture and the core deep dives

\`\`\`
 User A ──WebSocket──▶ Chat Server 1 ─┐
                                       ├─▶ [routing: where is B connected?] ─▶ Chat Server 7 ──WS──▶ User B
 User B ──WebSocket──▶ Chat Server 7 ─┘        (via a queue / pub-sub + a
                                                 "user → server" registry)
                              │
                              ├─▶ Message Store (Cassandra/HBase, by conversation)
                              └─▶ Presence service (Redis)
\`\`\`

### Deep dive 1 — The connection-routing problem (the crux)
User A is connected to **Chat Server 1**; user B is connected to **Chat Server 7**. When A sends "hi" to B, Server 1 must get it to Server 7 to push down B's socket. How does Server 1 know where B is?

\`\`\`mermaid
sequenceDiagram
  autonumber
  participant A as User A
  participant GW1 as Chat Server 1
  participant Reg as Connection registry
  participant GW2 as Chat Server 7
  participant B as User B
  A->>GW1: send "hi" (WebSocket)
  GW1->>Reg: where is B connected?
  Reg-->>GW1: Chat Server 7
  GW1->>GW2: route message (pub-sub/queue)
  alt B online
    GW2->>B: push over WebSocket
  else B offline
    GW2->>GW2: enqueue in offline inbox
    GW2-->>A: delivered once B reconnects + push notification sent
  end
\`\`\`
- Maintain a **connection registry / presence store**: \`user_id → chat_server\` (in Redis or a service), updated when a user connects/disconnects.
- Server 1 looks up B → Server 7, then delivers via **inter-server messaging**: either a direct call or (more robustly) a **message queue / pub-sub** where Server 1 publishes to a channel Server 7 subscribes to. Kafka or a pub-sub layer decouples the servers.
- This "route a message to whichever stateful server holds the recipient's live connection" is the defining challenge — call it out explicitly.

### Deep dive 2 — Guaranteed delivery + offline
- **Persist first:** the server writes the message to the durable **message store before acking the sender** — so a crash never loses it. The sender's **"sent" tick** means "server durably has it."
- **If B is online:** push over B's socket; when B's client acks receipt, mark **"delivered"** and notify A.
- **If B is offline:** the message sits in the store (and/or a per-user **offline queue / inbox**). On reconnect, B's server **pulls undelivered messages** and delivers them, then B acks → "delivered." A **push notification** (previous topic) nudges B to open the app.
- **Ordering:** within a conversation, assign a **monotonic sequence number** (per-conversation, from the owning partition — Phase 3 clocks topic) so all participants see the same order regardless of device clocks. Client message IDs enable **idempotent** de-dup on retries (Phase 3).

### Deep dive 3 — Presence
- Track online/offline in **Redis** (\`user_id → status, last_seen\`), updated on connect/disconnect and **heartbeats** (the socket sends periodic pings; miss a few → mark offline). Presence is high-churn and best-effort — eventual consistency and a little staleness are fine. Fan-out presence changes only to a user's contacts, not everyone (avoid a broadcast storm).

### Group chat & media
- **Group message** = fan out one message to each member's delivery path (like a mini feed fan-out). For huge groups, the same active/celebrity considerations apply.
- **Media**: upload to object storage via pre-signed URL; send only the **reference** in the message; recipient downloads via CDN.
- **E2E encryption** (WhatsApp): mention that message bodies are encrypted client-side (Signal protocol) so servers route ciphertext they can't read — a nice differentiator to name even if de-scoped.

## Step 7 — Wrap-up

A chat system replaces request/response with **persistent WebSocket connections** so the server can push messages instantly. The signature challenge is **routing a message to whichever stateful chat server currently holds the recipient's live socket** — solved with a **user→server connection registry** plus **inter-server pub-sub/queue**. Reliability comes from **persisting the message before acking** (never lose it), an **offline queue** delivered on reconnect (plus a push notification), and **per-conversation sequence numbers** for consistent ordering with idempotent de-dup. Presence lives in Redis via heartbeats, best-effort. Media goes to object storage/CDN by reference. Trade-offs: stateful connection servers (harder to scale/deploy than stateless tiers) bought in exchange for true real-time delivery; eventual consistency for presence; and at-least-once + idempotency rather than impossible exactly-once.

## How this shows up in interviews

- The interviewer wants **WebSockets** (justified over polling/HTTP) and, above all, the **connection-routing problem** — "how does the server holding the sender reach the server holding the recipient?" Answer: connection registry + pub-sub/queue between stateful servers.
- Expect **"how do you guarantee delivery / handle offline users?"** — persist-before-ack, offline queue, deliver on reconnect, push notification.
- Expect **"how do messages stay in order?"** — per-conversation sequence numbers (single-writer ordering), not device timestamps (ties back to Phase 3 clocks).
- Bonus: presence via heartbeats in Redis, group fan-out, media by reference + CDN, and naming E2E encryption.
`,
  resources: [
    {
      title: 'Design a Chat System (WhatsApp) — WebSockets & delivery',
      url: 'https://www.youtube.com/watch?v=vvhC64hQZMk',
      type: 'video',
      source: 'ByteByteGo',
    },
    {
      title: 'System Design: WhatsApp / real-time messaging',
      url: 'https://www.hellointerview.com/learn/system-design/problem-breakdowns/whatsapp',
      type: 'article',
      source: 'Hello Interview',
    },
    {
      title: 'How WhatsApp handles connections at scale',
      url: 'https://www.youtube.com/watch?v=vQTLBWQE_KA',
      type: 'video',
      source: 'Gaurav Sen (messaging system design)',
    },
    {
      title: 'Design WhatsApp',
      url: 'https://algomaster.io/learn/system-design-interviews/design-whatsapp',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
    {
      title: 'How Discord Stores Trillions of Messages',
      url: 'https://discord.com/blog/how-discord-stores-trillions-of-messages',
      type: 'article',
      source: 'Discord Engineering',
    },
    {
      title: 'Real Time Messaging at Slack',
      url: 'https://slack.engineering/real-time-messaging/',
      type: 'article',
      source: 'Slack Engineering',
    },
  ],
  challenges: [
    {
      type: 'quiz',
      id: 'quiz-1',
      title: 'Chat system check',
      questions: [
        {
          q: 'Why do chat systems use WebSockets rather than normal HTTP request/response?',
          options: [
            'WebSockets are more secure',
            'The server must PUSH a message to the recipient the instant it arrives; HTTP request/response can’t (the client would have to poll). A WebSocket is a persistent, full-duplex connection so either side can send anytime',
            'HTTP can’t carry text',
            'WebSockets use less code',
          ],
          answer: 1,
          explanation:
            'Chat is server-initiated and bidirectional. Long polling works but is wasteful; SSE is one-way. WebSockets give a persistent full-duplex channel — the right transport for instant, two-way messaging. Each client holds one open socket to a chat server.',
        },
        {
          q: 'User A (connected to Chat Server 1) messages User B (connected to Chat Server 7). What is the core routing challenge and its solution?',
          options: [
            'There’s no challenge; all servers share memory',
            'Server 1 must find which server holds B’s live socket. Solution: a connection registry (user_id → chat_server, e.g. in Redis) plus inter-server messaging (a queue/pub-sub) so Server 1 can hand the message to Server 7 to push down B’s socket',
            'A stores the message and B polls the database',
            'B must reconnect to Server 1',
          ],
          answer: 1,
          explanation:
            'Connections are stateful and spread across many servers, so delivery requires locating the recipient’s server (registry) and routing to it (pub-sub/queue). This "reach the server holding the recipient’s connection" problem is the defining challenge of chat design.',
        },
        {
          q: 'How do you guarantee a message is never lost, including when the recipient is offline?',
          options: [
            'Only deliver when both users are online',
            'Persist the message to the durable store BEFORE acking the sender; if the recipient is offline, keep it in their offline queue/inbox and deliver on reconnect (nudged by a push notification), marking "delivered" once their client acks',
            'Keep it only in the sender’s device',
            'Rely on TCP retransmission alone',
          ],
          answer: 1,
          explanation:
            'Persist-before-ack means the "sent" tick guarantees durability, so a server crash loses nothing. Offline recipients get messages from the store/offline queue on reconnect, prompted by a push notification; the delivered receipt fires when their client acknowledges receipt.',
        },
        {
          q: 'How do you ensure all participants in a conversation see messages in the SAME order?',
          options: [
            'Sort by each sender’s device clock',
            'Assign a per-conversation monotonic sequence number from the conversation’s owning partition (single-writer ordering) — device clocks are untrustworthy; client message IDs also enable idempotent de-dup of retries',
            'Order by arrival at each reader',
            'Use vector clocks per message shown to users',
          ],
          answer: 1,
          explanation:
            'Device timestamps disagree (Phase 3 clocks). Funneling a conversation’s messages through one owner that stamps a monotonic sequence gives a single consistent order for everyone. Client message IDs let the server dedup retried sends idempotently.',
        },
      ],
    },
    {
      type: 'design',
      id: 'design-1',
      title: 'Design exercise: WhatsApp-style messaging',
      prompt: `
Design a real-time 1:1 chat system (WhatsApp-scale): messages arrive near-instantly, with sent/delivered/read receipts, working even when the recipient is offline, and messages stay in order within a conversation.

Cover the framework, but focus your depth on: (1) the transport choice and why, (2) the connection-routing problem — how a message reaches the server holding the recipient’s live connection, (3) guaranteed delivery including offline recipients, and (4) message ordering. Also address presence (online/last-seen). Note the trade-offs of stateful connection servers, and mention how you’d extend to group chat and media.
`,
      hints: [
        'Server must push instantly — which transport, and why not HTTP polling?',
        'Sender’s server and recipient’s server differ — how do they connect? (registry + pub-sub)',
        'Persist-before-ack + offline queue; ordering via per-conversation sequence numbers.',
      ],
      modelAnswer: `
**Requirements** — Functional: real-time 1:1 messaging, presence/last-seen, sent/delivered/read receipts, offline delivery, ordered within a conversation (group + media as extensions; E2E encryption mentioned). Non-functional: low latency, never lose/mis-order a message, high availability, WhatsApp scale (hundreds of millions of concurrent connections).

**Estimation** — ~50B msgs/day (~600k/s), hundreds of millions of **concurrent sockets** — connection count is a first-class scaling axis; ~5 TB/day storage → wide-column store partitioned by conversation.

**Transport** — **WebSockets**: persistent full-duplex connection so the server can push instantly (vs wasteful long polling; SSE is one-way). Each client holds an open socket to a chat server.

**Architecture** — clients ↔ WebSocket ↔ stateful **chat servers**; a **connection registry** (Redis: user → server); **inter-server pub-sub/queue**; **message store** (Cassandra/HBase by conversation); **presence** in Redis.

**Deep dives:**
1. *Transport* — as above.
2. *Connection routing (crux)* — A on Server 1, B on Server 7. Server 1 looks up B in the **registry** → Server 7, then routes via **pub-sub/queue** so Server 7 pushes down B’s socket. Locating and reaching the recipient’s stateful server is the defining problem.
3. *Guaranteed delivery + offline* — **persist to the store before acking the sender** ("sent" = durably stored). Online B → push, B’s client acks → "delivered." Offline B → message waits in store/**offline queue**; delivered on **reconnect**, nudged by a **push notification**.
4. *Ordering* — **per-conversation monotonic sequence number** from the conversation’s owning partition (single-writer), not device clocks; **client message IDs** give idempotent de-dup of retries.

**Presence** — Redis \`user → status/last_seen\`, updated on connect/disconnect and **heartbeats** (missed pings → offline); best-effort/eventually-consistent; fan out presence changes only to contacts.

**Extensions** — **group chat** = fan out to each member’s delivery path; **media** uploaded to object storage via pre-signed URL, sent by **reference**, fetched via CDN; **E2E encryption** (Signal protocol) so servers route ciphertext.

**Trade-offs** — stateful connection servers are harder to scale/deploy than stateless tiers but are required for real-time push; presence is eventually consistent; delivery is at-least-once + idempotent rather than impossible exactly-once.

**One-line summary:** persistent WebSockets for instant push, a user→server registry plus pub-sub to route a message to whichever stateful server holds the recipient’s socket, persist-before-ack with an offline queue and push-notification fallback for guaranteed delivery, and per-conversation sequence numbers for consistent ordering — trading stateful-server complexity for true real-time messaging.
`,
    },
  ],
}
