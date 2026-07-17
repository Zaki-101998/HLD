export default {
  id: 'load-balancers',
  title: 'Load Balancers',
  subtitle: 'L4 vs L7, balancing algorithms, health checks, and the LB as availability machinery',
  days: 2,
  content: `
## Why this matters for system design

The load balancer is the first box after "users" in every diagram you'll ever draw — and interviewers probe whether you know what it actually *does* beyond "balances load". Spoiler: its most important job is **availability** (routing around dead servers), not just spreading traffic.

## What a load balancer is

A reverse proxy (Phase 0!) that distributes incoming requests across a pool of backend servers. It gives you:

1. **Horizontal scaling** — N servers behave as one endpoint.
2. **Availability** — health checks evict dead/slow backends automatically.
3. **Zero-downtime deploys** — drain a server (stop sending new requests, let in-flight finish), update it, re-add it. Rolling deploys are an LB feature.
4. **A control point** — TLS termination, rate limiting, routing (from the proxies topic).

## L4 vs L7 — the distinction interviewers test

**L4 (transport-level):** sees only IPs and ports; balances *connections* by forwarding/NAT-ing packets (typically hashing the 4-tuple).
- ✅ Extremely fast (millions of conns, µs latency), protocol-agnostic (any TCP/UDP), cheap.
- ❌ Blind to HTTP: no path routing, no per-request decisions — one long-lived connection's requests all hit one backend.

**L7 (application-level):** terminates TLS+HTTP, reads each *request*, and picks a backend per request.
- ✅ Path/host/header routing (\`/video → video-svc\`), per-request balancing (great with HTTP/2 multiplexing), retries, canary %-splits, sticky cookies, WAF.
- ❌ More CPU per request; must understand the protocol.

**Standard production layout — both:** anycast/DNS → **L4 tier** (e.g. cloud NLB) for raw packet spraying → **L7 tier** (ALB/nginx/Envoy) for smart routing → services. In interviews: "an L7 LB per service entry, L4 in front if we need millions of raw connections (chat gateways, game servers)."

## Balancing algorithms

| Algorithm | How | When |
|---|---|---|
| **Round robin** | Next server each time | Uniform requests, default |
| **Weighted RR** | Proportional to capacity | Mixed hardware; canary %-splits |
| **Least connections** | Fewest active conns wins | Variable request durations (uploads, streams) |
| **Least response time** | Fastest recent server | Latency-sensitive, auto-avoids degrading nodes |
| **IP hash / consistent hash** | hash(client or key) → server | Stickiness or cache locality (see below) |
| **Random two choices** | Pick 2 random, take less-loaded | Avoids herd behavior at scale — elegant and common |

**Consistent-hash balancing** deserves a flag: routing \`hash(user_id)\` to the same backend gives that backend a warm local cache for that user. You'll formalize consistent hashing in the sharding topic — note that LBs use it too.

## Health checks — the availability engine

A failed probe pulls a backend out of rotation immediately — healthy servers keep serving, the LB never routes to a dead one:

\`\`\`mermaid
flowchart TD
  C["Clients"] --> LB["Load balancer"]
  LB --> S1["Server 1 — healthy"]
  LB --> S2["Server 2 — healthy"]
  LB -.->|"health check failed — removed from rotation"| S3["Server 3 — down"]
\`\`\`

- **Active:** LB probes each backend (\`GET /healthz\` every 5 s); K consecutive failures → out of rotation; successes → back in.
- **Passive:** watch real traffic — a backend throwing connection errors/timeouts gets ejected ("outlier detection" in Envoy).

Design nuances worth saying:
- Health endpoints should check **dependencies shallowly**: "can I serve at all" (process up, not deadlocked) — NOT "is the database up", or one DB blip makes the LB kill EVERY backend simultaneously (a classic self-inflicted outage).
- **Slow start / warm-up:** newly added backends get ramped traffic (cold caches, JIT warm-up), avoiding the "new server instantly slammed" trap.
- **Connection draining** on removal — finish in-flight requests before shutdown.

## Sticky sessions & stateful backends

L7 LBs can pin a user to a backend via cookie ("sticky sessions"). Legit for: WebSocket/long-lived connections (unavoidable — the connection physically lives on one box). A smell for: session data (externalize it instead — statelessness topic). If a sticky backend dies, its users' in-memory context dies with it — say this trade-off out loud when you use stickiness.

## Who balances the balancer?

The LB looks like a single point of failure. The stack that fixes it:
- **LB pairs/fleets**: multiple LB instances.
- **DNS**: multiple A records (each region's LB).
- **Anycast/BGP or ECMP**: one IP announced from many boxes; routers spread flows. This is how cloud LBs are themselves distributed systems with no single box.

In an interview one sentence suffices: "the LB tier is itself replicated behind anycast/DNS — no single box".

## Global (multi-region) load balancing

DNS latency-routing or anycast picks the *region* (Phase 0's DNS topic); the regional LB picks the *server*. Global entry = GeoDNS → regional L4 → L7 → service.

## How this shows up in interviews

- Draw it by default; when asked why, lead with **health checks + rolling deploys**, then scaling.
- Long-connection systems (chat): L4 + least-connections + connection draining.
- Canary deploys: weighted routing 99/1 → 95/5 → …
- "What if a server dies mid-request?" → LB retries idempotent requests on another backend (and here's why idempotency keys matter again).
`,
  resources: [
    {
      title: 'Load Balancers explained',
      url: 'https://www.youtube.com/watch?v=sCR3SAVdyCc',
      type: 'video',
      source: 'ByteByteGo (YouTube)',
    },
    {
      title: 'What is load balancing?',
      url: 'https://www.cloudflare.com/learning/performance/what-is-load-balancing/',
      type: 'article',
      source: 'Cloudflare Learning Center',
    },
    {
      title: 'Introduction to modern network load balancing and proxying',
      url: 'https://blog.envoyproxy.io/introduction-to-modern-network-load-balancing-and-proxying-a57f6ff80236',
      type: 'article',
      source: 'Matt Klein (Envoy creator)',
    },
    {
      title: 'Load Balancing Algorithms Explained (with code)',
      url: 'https://blog.algomaster.io/p/load-balancing-algorithms-explained-with-code',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
    {
      title: 'What is a Failover?',
      url: 'https://www.druva.com/glossary/what-is-a-failover-definition-and-related-faqs',
      type: 'article',
      source: 'Druva',
    },
    {
      title: 'Design a Load Balancer',
      url: 'https://algomaster.io/learn/system-design-interviews/design-load-balancer',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
  ],
  challenges: [
    {
      type: 'quiz',
      id: 'quiz-1',
      title: 'Load balancing check',
      questions: [
        {
          q: 'You need /api/chat to reach the chat service and /api/video the video service, from one domain. Which LB capability is required?',
          options: [
            'L4 connection hashing',
            'L7 (application-layer) routing — the LB must read the HTTP path, which requires terminating TLS',
            'DNS round robin',
            'Sticky sessions',
          ],
          answer: 1,
          explanation:
            'Path-based routing needs request visibility = L7. An L4 balancer never sees HTTP (encrypted bytes flow through it) — connecting this to the TLS-termination topic is exactly the linkage interviewers reward.',
        },
        {
          q: 'Your backends handle a mix of 50 ms API calls and 30-second uploads. Round robin causes some servers to drown in uploads. Better algorithm?',
          options: [
            'IP hash',
            'Least connections — it accounts for requests still in flight, naturally routing away from busy servers',
            'Faster round robin',
            'Random',
          ],
          answer: 1,
          explanation:
            'Round robin assumes uniform request cost. With high-variance durations, in-flight connection count is the live load signal. (Least-response-time is the other good answer for latency skew.)',
        },
        {
          q: 'The health check endpoint queries the database, and the database has a 10-second blip. What happens with naive config?',
          options: [
            'Nothing — health checks don’t matter',
            'ALL backends fail their checks simultaneously; the LB ejects the entire fleet; total outage from a partial dependency blip',
            'Only slow requests fail',
            'The database gets ejected',
          ],
          answer: 1,
          explanation:
            'Deep health checks couple your availability to every dependency. Liveness should be shallow ("process serving?"); dependency health belongs in metrics/degradation logic, not fleet-wide ejection criteria. A real and common outage pattern.',
        },
        {
          q: 'How do rolling zero-downtime deploys actually work at the LB?',
          options: [
            'Deploy to all servers at once, quickly',
            'Drain one server (stop new traffic, let in-flight finish), update, health-check, re-add — repeat across the fleet',
            'Restart the load balancer with new code',
            'Use DNS to point at a backup datacenter during deploys',
          ],
          answer: 1,
          explanation:
            'Connection draining + rotation = users never notice a deploy. This is arguably the LB’s most-used feature day-to-day, and mentioning drain/warm-up shows operational maturity.',
        },
        {
          q: '"Isn’t the load balancer a single point of failure?" Best answer:',
          options: [
            'Yes, we accept the risk',
            'The LB tier is replicated: multiple LB instances behind anycast/ECMP or multi-record DNS — cloud LBs are already distributed fleets, not boxes',
            'No, load balancers never fail',
            'We use two and hope',
          ],
          answer: 1,
          explanation:
            'Redundancy applies to the LB tier itself: many instances, one virtual entry (anycast IP or DNS records with health checks). Every hop in your diagram needs this question answered — the LB included.',
        },
        {
          q: 'For a WebSocket chat gateway fleet holding millions of long-lived connections, the front tier is typically…',
          options: [
            'L7-only balancing per message',
            'L4 with least-connections: balance at connection time, cheaply, and let each connection live on its gateway',
            'DNS only',
            'No LB — clients pick servers',
          ],
          answer: 1,
          explanation:
            'The unit of balancing for persistent sockets is the CONNECTION, not the request. L4 handles millions of them cheaply; least-connections corrects imbalance as connections churn. (L7 can still front the initial HTTP upgrade if you need routing.)',
        },
      ],
    },
    {
      type: 'lab',
      id: 'lab-1',
      title: 'Run a real load balancer on your laptop',
      intro:
        'Two backend "servers", one balancer, real health-check behavior — in ~10 minutes with Python only.',
      steps: [
        {
          instruction: 'Terminal 1 — backend A on port 9001:',
          command: `python3 -c "
from http.server import *
class H(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200); self.end_headers()
        self.wfile.write(b'response from backend A (9001)\\n')
    def log_message(self,*a): print('A got a request')
HTTPServer(('',9001),H).serve_forever()"`,
          expected: 'Sits waiting. Leave it running.',
        },
        {
          instruction: 'Terminal 2 — backend B on port 9002 (same, letter B):',
          command: `python3 -c "
from http.server import *
class H(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200); self.end_headers()
        self.wfile.write(b'response from backend B (9002)\\n')
    def log_message(self,*a): print('B got a request')
HTTPServer(('',9002),H).serve_forever()"`,
          expected: 'Waiting too.',
        },
        {
          instruction: 'Terminal 3 — a 25-line round-robin L7 load balancer with passive health checks:',
          command: `python3 -c "
import http.client
from http.server import *
backends=[('localhost',9001),('localhost',9002)]; state={'i':0}
class LB(BaseHTTPRequestHandler):
    def do_GET(self):
        for _ in range(len(backends)):
            host,port=backends[state['i']%len(backends)]; state['i']+=1
            try:
                c=http.client.HTTPConnection(host,port,timeout=1)
                c.request('GET',self.path); r=c.getresponse(); body=r.read()
                self.send_response(r.status); self.end_headers(); self.wfile.write(body); return
            except Exception:
                print(f'health: {port} DOWN, trying next backend')
        self.send_response(502); self.end_headers(); self.wfile.write(b'all backends down\\n')
    def log_message(self,*a): pass
print('LB listening on :8080 ->', backends)
HTTPServer(('',8080),LB).serve_forever()"`,
          expected: 'LB listening on :8080',
        },
        {
          instruction: 'Terminal 4 — send traffic and watch round robin alternate:',
          command: 'for i in 1 2 3 4 5 6; do curl -s localhost:8080/; done',
          expected: 'A, B, A, B, A, B — round robin, live.',
        },
        {
          instruction: 'Kill backend A (Ctrl+C in terminal 1), then send traffic again:',
          command: 'for i in 1 2 3; do curl -s localhost:8080/; done',
          expected: 'LB logs "9001 DOWN, trying next" and every response comes from B. You just watched failover — the LB’s real job.',
        },
        {
          instruction: 'Restart backend A and confirm it rejoins rotation. Then Ctrl+C everything.',
          expected: 'Alternating A/B again. Total infra cost: $0.',
        },
      ],
    },
    {
      type: 'design',
      id: 'design-1',
      title: 'Design exercise: LB architecture for a video platform',
      prompt: `
A video platform has three traffic types on one domain (\`app.vidly.io\`):
- REST API calls (~50k QPS, 20 ms)
- Video segment downloads (~500k QPS via CDN, but ~25k QPS reach origin)
- Creator uploads (long-lived, multi-GB streams, ~2k concurrent)

Design the load-balancing tiers: what layers (L4/L7), what algorithms per pool, health-check strategy, and how canary deploys of the API happen. Keep it to ~8 bullet points.
`,
      hints: [
        'Different traffic shapes want different algorithms — uploads are the odd one out.',
        'Where does TLS terminate for each type?',
        'Canary = a weighted-routing story.',
      ],
      modelAnswer: `
- **Entry:** GeoDNS → per-region **anycast L4 tier** (cloud NLB) for all traffic → **L7 tier** (Envoy/ALB) that routes by host/path: \`/api/*\`, \`/upload/*\`, \`/segments/*\` to separate backend pools. TLS terminates at the L7 tier (path routing requires it).
- **API pool (50k QPS, short requests):** L7 per-request balancing, **least-request/least-response-time**; retries (once, on idempotent GETs) to another backend on connection failure.
- **Upload pool (2k long streams):** balance at connection start with **least connections**; generous idle timeouts; **connection draining measured in hours** config — or better, direct-to-object-storage presigned uploads so app servers never proxy the bytes (strong bonus point).
- **Origin segment pool (25k QPS, cacheable):** **consistent-hash on segment URL** so each origin node serves a stable slice → high local page-cache hit rate (cache-locality routing).
- **Health checks:** shallow active probes (\`/healthz\` = process alive) every 5 s, 3-fail ejection + passive outlier detection (kick backends with spiking 5xx/timeouts). Explicitly NOT checking the DB in liveness.
- **Warm-up:** new API/origin nodes get slow-start ramp (cold caches).
- **Canary:** L7 weighted split on the API pool — 1% to canary group, compare error/latency dashboards, ramp 1→10→50→100; instant rollback = weight to 0.
- **LB tier redundancy:** ≥3 L7 instances per region behind the L4 anycast IP; the L4 tier is the cloud provider's distributed fleet — no single box anywhere.
`,
    },
  ],
}
