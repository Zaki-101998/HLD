export default {
  id: 'tcp-udp',
  title: 'TCP vs UDP',
  subtitle: 'Handshakes, reliability, flow & congestion control — and when to pick which',
  days: 3,
  content: `
## Why this matters for system design

"Would you use TCP or UDP for this?" is a genuine interview question (video calls, gaming, live streams, metrics pipelines). More importantly, TCP's behavior — handshakes, head-of-line blocking, slow start — quietly explains *why* we keep connections alive, *why* HTTP/3 exists, and *why* connection pools matter.

## TCP — reliable, ordered, connection-oriented

TCP turns IP's "unreliable packet soup" into a clean, ordered **byte stream**. To do that, it needs machinery:

### The 3-way handshake

Before any data flows, client and server agree to talk — and when they're done, they tear the connection down just as carefully:

\`\`\`mermaid
sequenceDiagram
  autonumber
  participant C as Client
  participant S as Server
  Note over C,S: Setup — 3-way handshake (costs 1 RTT)
  C->>S: SYN (seq=x) — my counter starts at x
  S-->>C: SYN-ACK (seq=y, ack=x+1) — me too, mine starts at y
  C->>S: ACK (ack=y+1) — great, let's go
  Note over C,S: Data can now flow
  C->>S: application bytes
  S-->>C: ACK + response bytes
  Note over C,S: Teardown — FIN / ACK each way
  C->>S: FIN
  S-->>C: ACK
  S->>C: FIN
  C-->>S: ACK, then TIME_WAIT
\`\`\`

**Cost: one full round trip before the first byte of data.** Cross-continent, that's ~100+ ms of pure overhead — *per new connection*. This single fact justifies: connection pooling, HTTP keep-alive, and QUIC's 0-RTT.

### Reliability machinery

- **Sequence numbers**: every byte is numbered, so the receiver can reorder and detect gaps.
- **ACKs + retransmission**: unacknowledged data is re-sent after a timeout (or "fast retransmit" on duplicate ACKs).
- **Checksums**: corrupted segments are dropped (then retransmitted).

TCP's checksum is only 16 bits and only checked hop-by-hop by the receiving stack — it catches random bit-flips but is too weak to trust for integrity at scale, and it says nothing about corruption introduced *after* TCP hands bytes to the application. That's why real systems add their own **end-to-end** integrity check on top: content hashes, ETags, or checksums computed over whole files/blobs. It's why Dropbox- and S3-style storage designs hash every chunk before and after transfer — TCP got the bytes there reliably enough for a socket, but the application still verifies the bytes are the ones it meant to send.

### Flow control vs congestion control (interviewers love this distinction)

- **Flow control** protects the *receiver*: it advertises a window ("I can buffer 64 KB right now"), and the sender never exceeds it.
- **Congestion control** protects the *network*: the sender probes for available bandwidth with a congestion window that starts small and grows (**slow start**: doubles each RTT), then backs off sharply on packet loss.

> Consequence: a fresh TCP connection is *slow for the first several round trips* even on a fat pipe. Short-lived connections never reach full speed — another reason to reuse connections.

### Head-of-line (HOL) blocking

TCP promises *in-order* delivery. If packet #5 is lost, packets #6–#100 sit in the kernel buffer — delivered to the app only after #5 is retransmitted. One lost packet stalls everything behind it. Remember this for the HTTP/2 vs HTTP/3 topic.

\`\`\`mermaid
flowchart LR
  P5["pkt 5 — LOST, awaiting retransmit"]
  subgraph Buf["Kernel buffer — holds in-order only"]
    P6["pkt 6 arrived"]
    P7["pkt 7 arrived"]
  end
  P5 -. blocks .-> Buf
  Buf -. "stuck until 5 arrives" .-> App["Application"]
  classDef accent fill:#312e81,stroke:#6366f1,color:#e0e7ff
  class P5 accent
\`\`\`

### Connection teardown

Four messages (FIN/ACK each way). The closer's side holds the socket in **TIME_WAIT** for a while — servers that open/close thousands of connections per second can exhaust ports/file descriptors. (You'll see \`lsof\` evidence in the lab.)

## UDP — fire and forget

UDP adds almost nothing to IP: just ports and a checksum. **No handshake, no ordering, no retransmission, no congestion control.** A UDP "connection" is a fiction — you just send datagrams.

Why would anyone want that?

1. **Latency**: no handshake round trip; no waiting for retransmits.
2. **Freshness beats completeness**: in a video call, a lost frame is *stale* by the time you could retransmit it — better to skip it. Same for game state and live metrics.
3. **You can build your own reliability**: QUIC (the transport under HTTP/3) is "TCP-like reliability, reimplemented over UDP, without HOL blocking and with 0-RTT handshakes".

## Decision table

| Use case | Pick | Why |
|---|---|---|
| Web APIs, file transfer, DB connections | TCP | Correctness is non-negotiable |
| Video/voice calls (WebRTC) | UDP (RTP) | Old frames are worthless; low latency wins |
| Multiplayer game state | UDP | Latest position matters, not every position |
| DNS lookups | UDP (TCP fallback) | One tiny packet each way; handshake would double cost |
| Live video streams | Often QUIC/UDP | Startup latency + no HOL blocking |
| Metrics/logs firehose | Often UDP (statsd) | Losing 0.1% of datapoints is fine; backpressure is not |

## Numbers to carry into interviews

- Handshake cost: **1 RTT** (TCP) + **1–2 RTT** (TLS) before the first data byte. QUIC: 1 RTT, or **0-RTT** on resumption.
- A connection is identified by the **4-tuple** (src IP, src port, dst IP, dst port) — this is what load balancers hash on for "sticky" L4 routing.
- Default TCP behavior you may cite: slow start doubles the congestion window every RTT from ~10 packets (~14 KB).

## How this shows up in interviews

- *"Why do we pool database connections?"* → handshake + slow start cost, plus server-side memory per connection.
- *"Design a video call app"* → UDP/WebRTC, tolerate loss, maybe FEC (forward error correction) instead of retransmits.
- *"Why is HTTP/3 faster on lossy mobile networks?"* → removes TCP HOL blocking (next topics).
`,
  resources: [
    {
      title: 'TCP vs UDP Comparison',
      url: 'https://www.youtube.com/watch?v=uwoD5YsGACg',
      type: 'video',
      source: 'PowerCert Animated Videos',
    },
    {
      title: 'TCP handshake deep dive',
      url: 'https://hpbn.co/building-blocks-of-tcp/',
      type: 'article',
      source: 'High Performance Browser Networking (free book)',
    },
    {
      title: 'TCP Fundamentals (backend engineering lens)',
      url: 'https://www.youtube.com/watch?v=qqRYkcta6IE',
      type: 'video',
      source: 'Hussein Nasser (YouTube)',
    },
    {
      title: 'TCP vs UDP',
      url: 'https://algomaster.io/learn/system-design/tcp-vs-udp',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
    {
      title: 'Checksums',
      url: 'https://algomaster.io/learn/system-design/checksums',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
  ],
  challenges: [
    {
      type: 'quiz',
      id: 'quiz-1',
      title: 'Transport layer showdown',
      questions: [
        {
          q: 'Your mobile users on flaky networks report that one lost packet freezes their HTTP/2 downloads briefly. Which TCP property causes this?',
          options: [
            'Slow start',
            'Head-of-line blocking from in-order delivery',
            'The 3-way handshake',
            'TIME_WAIT',
          ],
          answer: 1,
          explanation:
            'TCP delivers bytes in order: a single lost segment blocks delivery of everything behind it until retransmitted. HTTP/2 multiplexes many streams onto one TCP connection, so one loss stalls all streams — the problem QUIC/HTTP-3 was built to fix.',
        },
        {
          q: 'Why does a brand-new TCP connection transfer data slowly at first, even on a 1 Gbps link?',
          options: [
            'DNS hasn’t finished resolving',
            'Congestion control (slow start) begins with a small window and ramps up per round trip',
            'The checksum calculation is expensive',
            'UDP packets get priority over new TCP connections',
          ],
          answer: 1,
          explanation:
            'The sender starts with a small congestion window (~10 packets) and doubles it each RTT while probing for capacity. Short transfers finish before ever reaching link speed — a core argument for connection reuse.',
        },
        {
          q: 'Flow control vs congestion control — which pairing is correct?',
          options: [
            'Flow control protects the network; congestion control protects the receiver',
            'Flow control protects the receiver; congestion control protects the network',
            'Both protect the sender',
            'They are two names for the same mechanism',
          ],
          answer: 1,
          explanation:
            'Flow control = receiver’s advertised window ("my buffer is this big"). Congestion control = sender inferring network capacity from loss/delay. Interviewers use this to separate memorizers from understanders.',
        },
        {
          q: 'For a real-time multiplayer game sending player positions 30×/sec, why is UDP usually the right call?',
          options: [
            'UDP packets are encrypted by default',
            'A retransmitted position is already stale — dropping it and sending the newest one is better than TCP’s guaranteed delivery',
            'UDP has larger maximum packet sizes',
            'TCP cannot send small packets',
          ],
          answer: 1,
          explanation:
            'The game only cares about the LATEST state. TCP would stall newer updates behind retransmissions of obsolete ones (HOL blocking). UDP lets you skip losses and stay current.',
        },
        {
          q: 'A load balancer identifies "the same TCP connection" using which information?',
          options: [
            'The HTTP Host header',
            'The MAC addresses',
            'The 4-tuple: source IP, source port, destination IP, destination port',
            'The TLS certificate',
          ],
          answer: 2,
          explanation:
            'The 4-tuple uniquely identifies a connection, and L4 load balancers hash it to consistently route packets of one connection to one backend. (Host headers are L7 — invisible to a pure L4 device.)',
        },
        {
          q: 'Your service opens a new TCP+TLS connection to a payment API for EVERY request, adding ~200ms. The fix?',
          options: [
            'Switch to UDP',
            'Use connection pooling / keep-alive to reuse established connections',
            'Increase server CPU',
            'Reduce the TLS certificate size',
          ],
          answer: 1,
          explanation:
            'Handshakes (TCP 1 RTT + TLS 1–2 RTT) dominate small-request latency. Pools amortize that cost across many requests — the standard pattern for DBs and internal services.',
        },
        {
          q: 'DNS uses UDP for queries. What is the main reason?',
          options: [
            'DNS answers must be unreliable',
            'A query fits one small packet, so a TCP handshake would triple the round trips for no benefit',
            'UDP supports encryption and TCP does not',
            'Root servers only speak UDP',
          ],
          answer: 1,
          explanation:
            'One request packet, one reply packet. With TCP you’d pay handshake + query + teardown. If the answer is lost, the client just retries; large answers fall back to TCP.',
        },
      ],
    },
    {
      type: 'lab',
      id: 'lab-1',
      title: 'Watch a handshake happen',
      intro:
        'You will observe real TCP connections being born and living on your machine.',
      steps: [
        {
          instruction: 'Watch curl narrate its connection setup. Look for "Connected to" (TCP done) and the TLS handshake lines.',
          command: 'curl -v https://example.com -o /dev/null 2>&1 | head -25',
          expected: 'Lines showing DNS resolution, "Connected to example.com (…) port 443", then "TLS handshake" / "SSL connection using TLSv1.3".',
        },
        {
          instruction: 'Measure exactly where request time goes — DNS vs connect vs TLS vs first byte.',
          command: `curl -so /dev/null -w 'dns=%{time_namelookup}s connect=%{time_connect}s tls=%{time_appconnect}s ttfb=%{time_starttransfer}s total=%{time_total}s\\n' https://www.wikipedia.org`,
          expected: 'Note how much of total time is connect+tls (pure handshakes). Run twice — does it get faster? (Often yes: DNS cache.)',
        },
        {
          instruction: 'Prove connection reuse is faster: two requests, one connection.',
          command: `curl -so /dev/null -so /dev/null -w 'request done: total=%{time_total}s (connect=%{time_connect}s)\\n' https://www.wikipedia.org https://www.wikipedia.org`,
          expected: 'The second request shows connect≈0 — it reused the warm connection. That delta is what pooling saves on every request.',
        },
        {
          instruction: 'List the TCP connection states currently on your machine.',
          command: 'netstat -an -p tcp | awk \'{print $6}\' | sort | uniq -c | sort -rn | head',
          expected: 'Counts of ESTABLISHED, TIME_WAIT, LISTEN etc. TIME_WAIT entries are recently-closed sockets lingering by design.',
        },
        {
          instruction: 'Optional (10 min): capture a real handshake with tcpdump. Run this, then in ANOTHER terminal: curl http://example.com',
          command: 'sudo tcpdump -i any -n "tcp port 80" -c 8',
          expected: 'The first three packets show [S] (SYN), [S.] (SYN-ACK), [.] (ACK) — the 3-way handshake, live.',
        },
      ],
    },
    {
      type: 'design',
      id: 'design-1',
      title: 'Mini-design: transport for a live auction app',
      prompt: `
You're building a live auction feature: thousands of viewers watch a price ticker that updates ~10 times/second, and occasionally tap "Bid".

**Decide the transport strategy:**
1. What do you use for the price ticker fan-out, and why?
2. What do you use for placing bids, and why?
3. What happens to each on a lossy mobile network?

Jot your reasoning first, then reveal.
`,
      hints: [
        'Are stale ticker updates worth retransmitting?',
        'Can you afford to lose or duplicate a bid?',
        'Different messages in one product can use different transports.',
      ],
      modelAnswer: `
**1. Price ticker → loss-tolerant, latency-first.**
Updates are absolute prices (not deltas), so any update supersedes all previous ones — retransmitting an old price is pure waste. Ideal: WebRTC data channel (UDP) with unordered/unreliable mode, or WebSockets-over-QUIC where available. Pragmatic web answer: WebSockets (TCP) are acceptable since updates are tiny, but acknowledge the HOL-blocking trade-off on lossy links: one lost packet briefly freezes the ticker, then it jumps to current price.

**2. Bids → reliability is non-negotiable.**
A bid is money: it must arrive exactly once, be acknowledged, and be attributable. Use HTTPS (TCP+TLS) POST with an **idempotency key** (client-generated UUID) so retries after timeouts can't double-bid. Latency matters less: users accept ~200 ms for a confirmed action.

**3. On lossy mobile:**
- Ticker (if UDP): some updates vanish — fine, next update corrects the display; show "reconnecting" if gap > 2 s.
- Ticker (if TCP/WebSocket): brief freezes then jumps; mitigate by sending full state (not diffs) so recovery is instant.
- Bids: TCP retransmits handle loss; the idempotency key handles the client retrying after an ambiguous timeout.

**Key takeaway the interviewer wants:** you matched *message semantics* (superseding state vs at-least-once actions) to *transport guarantees*, instead of using one transport everywhere.
`,
    },
  ],
}
