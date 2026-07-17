export default {
  id: 'internet-basics',
  title: 'How the Internet Works',
  subtitle: 'IP addresses, routing, and the OSI vs TCP/IP models',
  days: 2,
  content: `
## Why this matters for system design

Every system you will ever design — a chat app, a video platform, a payment system — is just machines sending packets to each other. When an interviewer asks "what happens when a user hits your API?", the confident candidates can walk the request from the browser all the way to the server. That story starts here.

## The core idea: packet switching

The internet does **not** open a dedicated wire between you and the server (that's how old telephone networks worked — *circuit switching*). Instead, your data is chopped into small **packets** (~1.5 KB each), and each packet is independently passed from router to router like a relay race. Packets can take different paths, arrive out of order, or get dropped entirely. Everything above this layer exists to cope with that chaos.

> **Interview framing:** the internet gives you an *unreliable, best-effort* packet delivery service. Reliability, ordering, and security are all bolted on top (by TCP, TLS, etc.). Knowing *which layer solves which problem* is the skill.

## IP addresses — the "postal address" of a machine

- **IPv4**: 32-bit numbers, written as \`142.250.183.14\` (about 4.3 billion possible — we ran out, hence NAT and IPv6).
- **IPv6**: 128-bit, written as \`2404:6800:4009::200e\` — effectively unlimited.
- **Public vs private**: your laptop's \`192.168.x.x\` address only means something inside your home network. Your router translates it to a public IP (NAT — more in the proxies topic).
- **Ports** extend an address to a specific *process* on a machine: \`142.250.183.14:443\` means "the process listening on port 443". Well-known ports: 80 (HTTP), 443 (HTTPS), 22 (SSH), 5432 (Postgres), 6379 (Redis).

## Routing — how packets find their way

No single machine knows the whole internet. Each **router** only knows "for addresses like X, forward to neighbor Y" (its routing table). Routers exchange this knowledge using protocols like **BGP** (between ISPs/organizations). Your packet typically makes 10–20 **hops** to cross the world.

Key consequences you'll use in design interviews:

1. **Latency is physics.** A round trip across an ocean costs ~100–150 ms no matter how good your code is. This is *why* CDNs and multi-region deployments exist.
2. **Any hop can fail.** Networks partition. This is *why* the CAP theorem matters (Phase 2).
3. **Bandwidth ≠ latency.** Bandwidth is the width of the pipe (GB/s); latency is the length of it (ms). A truck full of hard drives has huge bandwidth and terrible latency.

## The layer models

Networking is taught with two "layer cake" models. The OSI model has 7 layers; the practical TCP/IP model collapses them into 4–5. What matters is the idea: **each layer only talks to the layer directly above and below it, and each solves one problem.**

| Layer (practical) | Problem it solves | Examples | You'll design with… |
|---|---|---|---|
| Application | What the bytes *mean* | HTTP, DNS, gRPC, SMTP | APIs, webhooks |
| Transport | Reliable (or fast) process-to-process delivery | TCP, UDP, QUIC | Choosing TCP vs UDP |
| Network | Machine-to-machine addressing across networks | IP, ICMP, BGP | Regions, VPCs, anycast |
| Link + Physical | Moving bits over one physical hop | Ethernet, Wi-Fi, fiber | (rarely directly) |

The diagram below is the **practical TCP/IP stack** — the 4 layers you'll actually reason about — with the OSI layer numbers each one absorbs shown in brackets. A request travels *down* the stack on the sender and back *up* on the receiver. The **Transport** layer is highlighted: it's where you'll make the most design decisions (TCP vs UDP).

\`\`\`mermaid
flowchart TB
  A["Application  ·  OSI 5–7  ·  HTTP, DNS, gRPC, SMTP"] --> B["Transport  ·  OSI 4  ·  TCP, UDP, QUIC"]
  B --> C["Network  ·  OSI 3  ·  IP, ICMP, BGP"]
  C --> D["Link + Physical  ·  OSI 1–2  ·  Ethernet, Wi-Fi, fiber"]
  classDef accent fill:#312e81,stroke:#6366f1,color:#e0e7ff
  class B accent
\`\`\`

**Encapsulation:** when you send an HTTP request, the HTTP bytes get wrapped in a TCP segment, which is wrapped in an IP packet, which is wrapped in an Ethernet frame — like nested envelopes. Each router opens only the IP envelope to read the destination.

\`\`\`
[ Ethernet [ IP [ TCP [ HTTP: GET /feed ] ] ] ]
    hop      end-to-end  end-to-end   application
\`\`\`

## The classic interview question: "What happens when you type google.com and press Enter?"

Rehearse this 60-second story — it strings together everything in Phase 0:

\`\`\`mermaid
sequenceDiagram
  autonumber
  participant B as Browser
  participant R as DNS resolver
  participant L as Load balancer
  participant S as App server
  B->>R: resolve google.com (cache miss)
  R-->>B: A record 142.250.x.x
  B->>L: TCP 3-way handshake (SYN, SYN-ACK, ACK)
  B->>L: TLS 1.3 handshake (cert + keys)
  B->>L: HTTP GET /
  L->>S: proxy to a healthy app server
  S-->>L: 200 OK
  L-->>B: response — render, reuse warm connection
\`\`\`

1. Browser checks its cache; OS checks its DNS cache; else a **DNS lookup** resolves \`google.com\` → an IP (next topic).
2. Browser opens a **TCP connection** to that IP on port 443 (3-way handshake).
3. A **TLS handshake** negotiates encryption keys and verifies the server's certificate.
4. Browser sends an **HTTP request**; the server (usually a load balancer first!) routes it to an app server.
5. Response comes back, browser renders, and follow-up requests reuse the warm connection.

Each bold term is one topic in this phase. By the end you'll tell this story fluently.

## Mental models to keep

- **The internet is a postal system**: IP = address on the envelope, routers = sorting facilities, TCP = registered mail with delivery receipts, UDP = throwing postcards.
- **Layers are contracts**: HTTP doesn't know or care if you're on Wi-Fi or fiber. That separation is what makes the whole thing composable — the same idea you'll apply when designing services.
`,
  resources: [
    {
      title: 'How does the INTERNET work?',
      url: 'https://www.youtube.com/watch?v=x3c1ih2NJEg',
      type: 'video',
      source: 'ByteByteGo (YouTube)',
    },
    {
      title: 'The Internet, explained (interactive)',
      url: 'https://www.cloudflare.com/learning/network-layer/how-does-the-internet-work/',
      type: 'article',
      source: 'Cloudflare Learning Center',
    },
    {
      title: 'OSI Model explained with real examples',
      url: 'https://www.youtube.com/watch?v=0y6FtKsg6J4',
      type: 'video',
      source: 'PowerCert Animated Videos',
    },
    {
      title: 'OSI Model',
      url: 'https://algomaster.io/learn/system-design/osi',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
    {
      title: 'IP Addresses',
      url: 'https://algomaster.io/learn/system-design/ip-address',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
    {
      title: 'Client-Server Architecture',
      url: 'https://algomaster.io/learn/system-design/client-server-architecture',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
  ],
  challenges: [
    {
      type: 'quiz',
      id: 'quiz-1',
      title: 'Internet fundamentals check',
      questions: [
        {
          q: 'Your API server in Mumbai serves a user in New York. The request feels slow even though both machines are idle. What is the most fundamental cause?',
          options: [
            'The server needs more CPU cores',
            'Speed-of-light latency across ~12,000 km plus router hops',
            'IPv4 addresses are slower than IPv6 addresses',
            'HTTP is a slow protocol',
          ],
          answer: 1,
          explanation:
            'A one-way trip across half the planet costs tens of milliseconds by physics alone; a round trip 100ms+. No amount of hardware fixes distance — this is why CDNs and multi-region deployments exist.',
        },
        {
          q: 'Which statement about packet switching is TRUE?',
          options: [
            'A dedicated path is reserved between the two machines for the whole conversation',
            'Packets from the same connection always take the same route',
            'Packets may arrive out of order, duplicated, or not at all',
            'Routers guarantee delivery of every packet they receive',
          ],
          answer: 2,
          explanation:
            'IP is best-effort: packets are routed independently and may be lost, reordered, or duplicated. TCP exists precisely to hide this chaos from applications.',
        },
        {
          q: 'What uniquely identifies a specific process (e.g. your Postgres server) on the network?',
          options: [
            'The IP address alone',
            'The MAC address',
            'The IP address + port combination',
            'The hostname',
          ],
          answer: 2,
          explanation:
            'An IP identifies the machine; the port (e.g. 5432) identifies which listening process on that machine. Together (plus protocol) they define a socket endpoint.',
        },
        {
          q: 'In the layered model, which layer is responsible for getting a packet across multiple networks from source machine to destination machine?',
          options: [
            'Application layer (HTTP)',
            'Transport layer (TCP)',
            'Network layer (IP)',
            'Link layer (Ethernet)',
          ],
          answer: 2,
          explanation:
            'IP handles machine-to-machine addressing and routing across networks. TCP handles process-to-process reliability on top; Ethernet only handles one physical hop.',
        },
        {
          q: 'Bandwidth vs latency: which system change improves LATENCY specifically?',
          options: [
            'Upgrading the server NIC from 1 Gbps to 10 Gbps',
            'Serving users from a datacenter physically closer to them',
            'Compressing responses with gzip',
            'Adding more servers behind the load balancer',
          ],
          answer: 1,
          explanation:
            'Latency is dominated by distance and hops. Moving content closer (CDN/edge/multi-region) is the latency lever. Bigger pipes and more servers help throughput, not round-trip time (compression helps transfer time for large payloads, but not the round trip itself).',
        },
        {
          q: 'Why do we say "each layer only talks to adjacent layers" is a big deal for system design?',
          options: [
            'It makes packets smaller',
            'It lets you swap implementations (Wi-Fi→fiber, HTTP/1→HTTP/2) without changing other layers — the same decoupling you want between services',
            'It encrypts data automatically',
            'It guarantees zero packet loss',
          ],
          answer: 1,
          explanation:
            'Layering is the original "well-defined interface". HTTP neither knows nor cares about the physical medium. You will reuse this principle constantly: services should depend on contracts, not implementations.',
        },
      ],
    },
    {
      type: 'lab',
      id: 'lab-1',
      title: 'Trace a packet across the world',
      intro:
        'You will watch your own packets hop across routers and measure real latency. All commands work in the macOS/Linux terminal.',
      steps: [
        {
          instruction: 'Find your private IP address, then your public IP. Notice they differ — that is NAT at work.',
          command: 'ipconfig getifaddr en0        # private IP (macOS)\ncurl -s ifconfig.me           # public IP',
          expected: 'A 192.168.x.x / 10.x.x.x private address vs a completely different public one.',
        },
        {
          instruction: 'Trace the route to a nearby site and count the hops.',
          command: 'traceroute -q1 google.com',
          expected: 'Around 8–15 hops. The first hop is your home router (192.168.x.1). Some hops show * (routers that ignore probes).',
        },
        {
          instruction: 'Now trace a server on another continent and compare hop count and times.',
          command: 'traceroute -q1 bbc.co.uk',
          expected: 'Watch the per-hop latency jump (often +80–150 ms) at the hop where packets cross an ocean — you are literally seeing the speed of light.',
        },
        {
          instruction: 'Measure round-trip latency distribution with ping (Ctrl+C after ~10 packets).',
          command: 'ping -c 10 google.com',
          expected: 'Note min/avg/max. Try pinging a far-away host and compare averages — this difference is what a CDN eliminates.',
        },
        {
          instruction: 'Look at which processes are using the network on YOUR machine right now — every row is an (IP, port) socket.',
          command: 'lsof -nP -iTCP -sTCP:ESTABLISHED | head -20',
          expected: 'Browsers, Slack, etc., each connected from a random local port to a server’s well-known port (443).',
        },
      ],
    },
  ],
}
