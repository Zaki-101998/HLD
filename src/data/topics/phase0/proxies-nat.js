export default {
  id: 'proxies-nat',
  title: 'Proxies, Reverse Proxies & NAT',
  subtitle: 'Forward vs reverse proxies, NAT, firewalls — the middleboxes of every architecture',
  days: 2,
  content: `
## Why this matters for system design

Almost every box you'll draw between "user" and "your service" — load balancer, API gateway, CDN edge, WAF — **is a reverse proxy**. Understanding the proxy pattern once means you understand all of them. NAT explains why your laptop can browse but can't be browsed *to* — which is why chat apps need persistent outbound connections and push notifications exist.

## Forward proxy vs reverse proxy — the direction of representation

A **proxy** is a middleman that terminates a connection on one side and opens another on the other side. The only question is *whom it represents*:

\`\`\`mermaid
flowchart TB
  subgraph FWD["Forward proxy — represents the CLIENT (server can't see the real client)"]
    direction LR
    c["client"] --> fp["corp / school proxy"] --> w["any website"]
  end
  subgraph REV["Reverse proxy — represents the SERVER (client can't see which server answered)"]
    direction LR
    cl["any client"] --> rp["nginx / LB / CDN"] --> app["your app servers"]
  end
\`\`\`

### Forward proxy uses
- Corporate egress control & content filtering
- Anonymity (the site sees the proxy's IP) — VPNs are cousins
- Egress caching and allow-listing for servers ("all outbound traffic goes through the egress proxy")

### Reverse proxy uses — memorize this list, it IS your entry tier
1. **Load balancing** across app servers
2. **TLS termination** (one place for certs)
3. **Caching** responses (static assets, even API responses)
4. **Compression** (gzip/brotli) offloaded from app servers
5. **Rate limiting & WAF** (block abuse before it hits your code)
6. **Routing**: \`/api/*\` → service A, \`/images/*\` → service B (path-based)
7. **Hiding topology**: clients see one IP; you can reshape the backend freely

nginx, HAProxy, Envoy, AWS ALB, Cloudflare — all reverse proxies with different emphases. An **API gateway** is a reverse proxy with API-specific features (auth, quotas, request transformation). A **CDN edge** is a geographically distributed caching reverse proxy.

## NAT — why your laptop is unreachable (and that's fine)

IPv4 has ~4.3B addresses; there are far more devices. **NAT (Network Address Translation)** lets your whole home share one public IP: the router rewrites (private IP, port) ↔ (public IP, port) using a translation table.

The design-relevant consequence: **connections can only be initiated outward.** Inbound packets with no table entry are dropped — nobody on the internet can open a connection *to* your phone.

This single fact shapes real architectures:

- **Push notifications**: your phone keeps ONE persistent outbound connection to Apple/Google (APNs/FCM); all pushes ride that. Your chat design should say "deliver via APNs/FCM when the app is backgrounded".
- **WebSockets are outbound**: clients dial in and keep the socket open — that's how servers "reach" clients through NAT.
- **WebRTC/P2P needs NAT traversal**: STUN (discover your public address), TURN (relay when direct fails) — worth one sentence in video-call designs.
- **Servers behind NAT**: cloud VMs in private subnets reach the internet via **NAT gateways** (outbound only), while inbound traffic must enter through load balancers. This is the standard secure VPC layout.

## Firewalls & the standard network layout

A **firewall** filters traffic by rules (IP/port/protocol; L7 firewalls also inspect content). Cloud security groups are per-instance firewalls.

The layout you should draw in interviews:

\`\`\`
Internet
   │
   ▼
[Edge: CDN / WAF]            ← caching, DDoS absorption
   │
   ▼
[Load balancer / API gateway]  (public subnet)   ← TLS ends here
   │
   ▼
[App servers]                 (private subnet — no public IPs)
   │
   ▼
[Databases / caches]          (private subnet — reachable ONLY from app tier)
\`\`\`

Each arrow is enforced by firewall rules: DB accepts port 5432 *only* from the app tier's security group. Compromising the web tier still doesn't expose the DB to the internet.

## X-Forwarded-For — a practical gotcha

Every proxy hop replaces the TCP source IP with its own. Your app sees the *proxy's* IP, not the user's. Proxies append the original client IP to the \`X-Forwarded-For\` header — needed for rate limiting, geo-features, audit logs. Trust it **only** from your own proxies (clients can forge it).

## How this shows up in interviews

- Your entry-path drawing (CDN → LB → services) is a chain of reverse proxies — name their jobs (TLS, cache, rate-limit, route).
- Mobile/chat designs: NAT is why delivery to offline/backgrounded devices goes through APNs/FCM.
- Security follow-up: private subnets + security groups; only the LB is public.
`,
  resources: [
    {
      title: 'Proxy vs Reverse Proxy',
      url: 'https://www.youtube.com/watch?v=4NB0NDtOwIQ',
      type: 'video',
      source: 'ByteByteGo (YouTube)',
    },
    {
      title: 'What is a reverse proxy?',
      url: 'https://www.cloudflare.com/learning/cdn/glossary/reverse-proxy/',
      type: 'article',
      source: 'Cloudflare Learning Center',
    },
    {
      title: 'NAT explained',
      url: 'https://www.youtube.com/watch?v=FTUV0t6JaDA',
      type: 'video',
      source: 'PowerCert Animated Videos',
    },
    {
      title: 'Proxy vs Reverse Proxy Explained',
      url: 'https://blog.algomaster.io/p/proxy-vs-reverse-proxy-explained',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
  ],
  challenges: [
    {
      type: 'quiz',
      id: 'quiz-1',
      title: 'Middleboxes check',
      questions: [
        {
          q: 'An nginx instance sits in front of your app servers doing TLS termination and path routing. It is a…',
          options: ['Forward proxy', 'Reverse proxy', 'NAT gateway', 'Firewall'],
          answer: 1,
          explanation:
            'It represents the SERVER side: clients connect to it believing it is the service. Load balancers, API gateways, and CDN edges are all specializations of this pattern.',
        },
        {
          q: 'Why can’t a random internet host open a TCP connection directly to your phone on mobile data?',
          options: [
            'Phones block TCP',
            'The carrier’s NAT has no translation entry for unsolicited inbound packets, so they are dropped',
            'Mobile networks only support UDP',
            'DNS does not have records for phones',
          ],
          answer: 1,
          explanation:
            'NAT tables are created by OUTBOUND connections. No entry → inbound packet has nowhere to go. This is why push notifications ride a persistent outbound connection to APNs/FCM.',
        },
        {
          q: 'Your rate limiter keys on client IP, but suddenly ALL requests appear to come from 10.0.1.5 (your load balancer). The fix?',
          options: [
            'Rate limit the load balancer',
            'Use the client IP from X-Forwarded-For as appended by YOUR trusted proxy layer',
            'Disable the load balancer',
            'Switch to UDP',
          ],
          answer: 1,
          explanation:
            'Each proxy hop rewrites the TCP source address. The original client IP travels in X-Forwarded-For — but only trust the entry appended by your own proxies, since clients can send fake values.',
        },
        {
          q: 'In a standard VPC layout, why do app servers live in a PRIVATE subnet behind a NAT gateway?',
          options: [
            'Private subnets are faster',
            'They can make outbound calls (APIs, updates) but accept no inbound internet connections — only traffic from the load balancer',
            'NAT gateways encrypt all traffic',
            'It reduces cloud costs',
          ],
          answer: 1,
          explanation:
            'Outbound-only via NAT + inbound-only via LB = minimal attack surface. Even if the LB tier is compromised, direct internet access to app/DB tiers doesn’t exist.',
        },
        {
          q: 'Which is NOT typically a reverse proxy responsibility?',
          options: [
            'TLS termination',
            'Response caching',
            'Hiding the client’s identity from the destination website',
            'Path-based routing to services',
          ],
          answer: 2,
          explanation:
            'Hiding the CLIENT is the forward proxy’s job (it represents the client). Reverse proxies hide/represent the SERVER side.',
        },
        {
          q: 'A video-call app needs two phones (both behind NAT) to exchange media directly. What makes this possible?',
          options: [
            'Port 443 is always open',
            'STUN to discover public-facing addresses and punch holes; TURN relays as fallback when direct connection fails',
            'IPv6 is required',
            'The phones must disable their firewalls',
          ],
          answer: 1,
          explanation:
            'NAT traversal: both sides learn their public mappings via STUN and try simultaneous connections (hole punching); when NATs are too strict, a TURN relay carries the media. One sentence of this in a video-call design scores points.',
        },
      ],
    },
    {
      type: 'lab',
      id: 'lab-1',
      title: 'Run your own reverse proxy',
      intro:
        'Experience the pattern first-hand with a tiny two-tier setup on your machine (needs Python 3, preinstalled on macOS).',
      steps: [
        {
          instruction: 'Start a trivial "app server" on port 9000 (this terminal stays busy).',
          command: 'mkdir -p /tmp/appdemo && echo "hello from the app server" > /tmp/appdemo/index.html && cd /tmp/appdemo && python3 -m http.server 9000',
          expected: 'Serving HTTP on :: port 9000',
        },
        {
          instruction: 'In a SECOND terminal, verify direct access to the app server.',
          command: 'curl -s http://localhost:9000/',
          expected: 'hello from the app server',
        },
        {
          instruction: 'Observe the proxy-visible IP problem: check what IP the app server logs show for your request (look at terminal 1).',
          expected: 'It logs 127.0.0.1 — with a proxy in front, EVERY request would log the proxy’s address. This is the X-Forwarded-For problem, live.',
        },
        {
          instruction: 'See NAT on your own network: compare your machine’s private IP with the public IP websites see.',
          command: 'echo "private: $(ipconfig getifaddr en0)" && echo "public:  $(curl -s ifconfig.me)"',
          expected: 'Two different addresses. Every device in your home shares that public one — the router’s NAT table keeps the flows apart.',
        },
        {
          instruction: 'Check your Mac’s own firewall state (Application Firewall).',
          command: '/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate',
          expected: 'Enabled or disabled — either way, note that unsolicited inbound is ALSO blocked upstream by your router’s NAT.',
        },
        {
          instruction: 'Clean up: stop the Python server with Ctrl+C in terminal 1.',
          command: 'rm -rf /tmp/appdemo',
          expected: 'Lab environment removed.',
        },
      ],
    },
    {
      type: 'design',
      id: 'design-1',
      title: 'Mini-design: secure entry path for a payments API',
      prompt: `
Sketch the network path for a payments startup's public API (\`pay.fintech.io\`), from the internet down to the Postgres database. Requirements:

1. DDoS and bot traffic must be absorbed before reaching app servers
2. The database must be unreachable from the internet even if a web server is compromised
3. Compliance wants client IPs in audit logs
4. Internal service-to-service calls must be authenticated

Draw it as a list of tiers with one line each on what that tier does.
`,
      hints: [
        'Chain of reverse proxies: which job belongs at which tier?',
        'Think subnets and security-group rules for requirement 2.',
        'Requirements 3 and 4 map to specific mechanisms from this topic and the TLS topic.',
      ],
      modelAnswer: `
**Tiers, outside in:**

1. **Anycast CDN + WAF edge** (e.g. Cloudflare): absorbs DDoS across global capacity, blocks known-bad bots/signatures, caches static content. Only its IP ranges may reach the next tier (firewall rule).
2. **API gateway / L7 load balancer** (public subnet): terminates TLS, authenticates API keys/JWTs, applies per-client rate limits, appends the verified client IP to \`X-Forwarded-For\`, routes by path to services.
3. **App services** (private subnet, no public IPs): business logic. Outbound internet (e.g. card networks) goes via a **NAT gateway / egress proxy** with an allow-list. Service-to-service calls use **mTLS** (mesh-issued certs) — requirement 4.
4. **Postgres** (isolated private subnet): security group accepts port 5432 **only from the app tier's security group**. No route to/from the internet at all — requirement 2 holds even if tier 3 is popped, and tier 2 never talks to the DB directly.

**Audit logging (req 3):** the gateway is the trust boundary — it strips any client-supplied \`X-Forwarded-For\` and appends the real TCP source IP; services log that value with every request.

**One-line summary you'd say in an interview:** "Everything between the user and my code is a chain of reverse proxies — edge for absorption and caching, gateway for TLS/auth/rate-limiting/routing — and everything below the gateway lives in private subnets with security groups so the blast radius of any single compromised tier is one hop."
`,
    },
  ],
}
