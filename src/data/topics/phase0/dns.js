export default {
  id: 'dns',
  title: 'DNS — The Internet’s Phonebook',
  subtitle: 'Resolution flow, record types, caching, TTLs, and DNS in system design',
  days: 2,
  content: `
## Why this matters for system design

DNS is the first step of *every* request to your system, and it's secretly one of your most powerful design tools: it's how you do **load balancing across regions**, **failover**, **blue-green deploys**, and **CDN routing**. It's also a famous single point of failure — major outages (like the 2016 Dyn attack that took down Twitter, Netflix, and Spotify) were DNS failures.

## The problem DNS solves

Humans remember names (\`api.myapp.com\`); the network needs IPs (\`3.7.21.9\`). DNS is a **globally distributed, hierarchical, heavily-cached key-value store** that maps names to records. Read that sentence again — it's a distributed KV store you already use daily, and it hits every design theme of this course: hierarchy, caching, replication, TTLs, eventual consistency.

## The resolution flow

When your browser needs \`api.myapp.com\`, the request first checks local caches, then hands off to a recursive resolver that walks the hierarchy on your behalf:

\`\`\`mermaid
sequenceDiagram
  autonumber
  participant C as Client (browser + OS cache)
  participant R as Recursive resolver (8.8.8.8)
  participant Root as Root server
  participant TLD as TLD server (.com)
  participant A as Authoritative NS
  C->>R: api.myapp.com? (all caches missed)
  R->>Root: who handles .com?
  Root-->>R: ask the .com TLD servers
  R->>TLD: who is authoritative for myapp.com?
  TLD-->>R: ask myapp.com's nameservers
  R->>A: A record for api.myapp.com?
  A-->>R: 3.7.21.9 (TTL 300)
  R-->>C: 3.7.21.9 — cached at every hop on the way back
\`\`\`

1. **Recursive resolver** (your ISP's, or Google's \`8.8.8.8\` / Cloudflare's \`1.1.1.1\`): does the legwork and caches aggressively.
2. **Root servers**: 13 logical addresses (hundreds of physical servers via anycast) that answer "who handles \`.com\`?"
3. **TLD servers**: answer "who is authoritative for \`myapp.com\`?"
4. **Authoritative nameserver**: the source of truth — *this is the part you control* (via Route53, Cloudflare, etc.).

A cold lookup takes 20–120 ms. That's why caching exists at every step.

## Record types you must know

| Record | Maps | Example use |
|---|---|---|
| **A** | name → IPv4 | \`api.myapp.com → 3.7.21.9\` |
| **AAAA** | name → IPv6 | same, for IPv6 |
| **CNAME** | name → another name | \`www.myapp.com → myapp.netlify.app\` |
| **NS** | domain → its authoritative servers | delegation |
| **MX** | domain → mail servers | email routing |
| **TXT** | name → arbitrary text | domain verification, SPF/DKIM |

## TTL — the knob that matters

Every record carries a **TTL (time to live)**: how long resolvers may cache it.

- **High TTL (hours/days)**: fewer lookups, faster for users, less load — but changes propagate slowly.
- **Low TTL (30–60 s)**: you can shift traffic quickly (failover, migrations) — but more lookup traffic and latency.

> **Classic interview trade-off:** before a planned migration, drop TTL to 60 s a day in advance, migrate, then raise it back. Also note: DNS changes are **eventually consistent** — some resolvers ignore your TTL, so never rely on DNS alone for instant failover.

## DNS as a system design tool

1. **Geo-routing / latency-based routing**: return a *different IP depending on who's asking* — US users get the US datacenter, Indian users get Mumbai. This is how global load balancing starts.

\`\`\`mermaid
flowchart LR
  U1["Delhi user"] -->|api.myapp.com| G{"Geo / latency DNS"}
  U2["London user"] -->|api.myapp.com| G
  U3["NYC user"] -->|api.myapp.com| G
  G -->|nearest| R1["Mumbai region LB"]
  G -->|nearest| R2["Frankfurt region LB"]
  G -->|nearest| R3["Virginia region LB"]
  classDef accent fill:#312e81,stroke:#6366f1,color:#e0e7ff
  class G accent
\`\`\`

2. **Anycast**: many datacenters announce the *same IP*, and BGP routes each user to the nearest one. This is how \`8.8.8.8\` and CDNs are everywhere at once.
3. **Weighted records**: send 5% of traffic to the new version (canary releases).
4. **Health-checked failover**: Route53 can stop returning an IP whose health check fails.

## Failure modes & gotchas

- **DNS is UDP port 53** (mostly) — single small packet each way, built for speed. Large responses and zone transfers use TCP.
- **Negative caching**: "domain doesn't exist" (NXDOMAIN) answers are cached too — a typo'd deploy can bite for minutes.
- **Client-side stickiness**: many runtimes (older JVMs famously) cache DNS forever by default — a "failover" that works in your browser may not work for your backend service until you tune its resolver settings.

## How this shows up in interviews

- Every "design X" answer that includes multiple regions or a CDN implicitly uses DNS routing — mention it in one sentence when drawing the entry path: *"users resolve api.myapp.com via latency-based DNS to the nearest region's load balancer."*
- Estimation: DNS adds one round trip on cold start — part of why p99 first-request latency is much worse than steady-state.
`,
  resources: [
    {
      title: 'DNS explained in detail',
      url: 'https://www.youtube.com/watch?v=27r4Bzuj5NQ',
      type: 'video',
      source: 'ByteByteGo (YouTube)',
    },
    {
      title: 'How DNS works — a fun comic',
      url: 'https://howdns.works/',
      type: 'interactive',
      source: 'DNSimple',
    },
    {
      title: 'What is DNS?',
      url: 'https://www.cloudflare.com/learning/dns/what-is-dns/',
      type: 'article',
      source: 'Cloudflare Learning Center',
    },
    {
      title: 'How DNS actually works',
      url: 'https://blog.algomaster.io/p/how-dns-actually-works',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
  ],
  challenges: [
    {
      type: 'quiz',
      id: 'quiz-1',
      title: 'DNS mastery check',
      questions: [
        {
          q: 'You are migrating api.myapp.com to a new datacenter next week. What should you do TODAY?',
          options: [
            'Nothing — DNS changes are instant',
            'Lower the record’s TTL (e.g. to 60s) so the change propagates quickly when you flip it',
            'Raise the TTL so users keep the old IP longer',
            'Delete the record and recreate it during migration',
          ],
          answer: 1,
          explanation:
            'Resolvers cache for the TTL that was set when they fetched the record. Lowering TTL in advance means that by migration day, everyone holds a short-lived cache and picks up the new IP within a minute.',
        },
        {
          q: 'A user in Delhi and a user in London resolve cdn.myapp.com and get DIFFERENT IPs. Which mechanism is this?',
          options: [
            'CNAME chaining',
            'Geo/latency-based DNS routing',
            'A DNS cache poisoning attack',
            'IPv6 fallback',
          ],
          answer: 1,
          explanation:
            'Geo-DNS answers based on the resolver’s location, sending each user to the nearest point of presence — step one of global load balancing. (Anycast achieves similar ends with one shared IP, via BGP routing instead.)',
        },
        {
          q: 'What is the correct resolution order on a completely cold lookup?',
          options: [
            'Authoritative NS → TLD → Root → Resolver',
            'Resolver → Root → TLD → Authoritative NS',
            'Root → Resolver → Authoritative NS → TLD',
            'TLD → Root → Resolver → Authoritative NS',
          ],
          answer: 1,
          explanation:
            'The recursive resolver asks root ("who handles .com?"), then the TLD server ("who is authoritative for myapp.com?"), then the authoritative server for the actual record.',
        },
        {
          q: 'Your failover plan is "if region A dies, update DNS to point at region B". What is the biggest flaw?',
          options: [
            'DNS cannot point to two regions',
            'Cached records (and clients/resolvers that ignore TTL) keep sending users to the dead region for minutes or longer',
            'Region B would need a different domain name',
            'BGP will block the new route',
          ],
          answer: 1,
          explanation:
            'DNS propagation is eventually consistent and some resolvers/JVMs cache well beyond TTL. Real designs pair DNS failover with health-checked load balancers or anycast for faster convergence.',
        },
        {
          q: 'Which record type would you use to point www.myapp.com at your hosting provider’s domain (myapp.vercel.app)?',
          options: ['A record', 'MX record', 'CNAME record', 'TXT record'],
          answer: 2,
          explanation:
            'CNAME aliases one name to another name, letting the provider manage the underlying IPs. A records need literal IPs; MX is mail; TXT is metadata.',
        },
        {
          q: 'Why is DNS considered a great real-world example of eventual consistency?',
          options: [
            'It uses the Raft consensus algorithm',
            'Updates propagate through independent caches over time; different users may see different answers until TTLs expire',
            'It stores data in a relational database',
            'It guarantees all resolvers update atomically',
          ],
          answer: 1,
          explanation:
            'There is no global synchronization — each cache converges on its own schedule. This is exactly the mental model for eventually-consistent reads you’ll use in Phase 2.',
        },
      ],
    },
    {
      type: 'lab',
      id: 'lab-1',
      title: 'Interrogate DNS like an SRE',
      intro: 'Use `dig` (installed by default on macOS) to watch resolution happen for real.',
      steps: [
        {
          instruction: 'Do a basic lookup and find the A record and its TTL (the number before IN A).',
          command: 'dig google.com',
          expected: 'An ANSWER SECTION with one or more A records. Run it twice — the TTL counts down, proving you hit a cache.',
        },
        {
          instruction: 'Watch the FULL hierarchy walk: root → TLD → authoritative.',
          command: 'dig +trace google.com | head -40',
          expected: 'Root servers (a.root-servers.net…), then .com TLD servers, then Google’s own nameservers answering.',
        },
        {
          instruction: 'Follow a CNAME chain of a real product.',
          command: 'dig www.reddit.com',
          expected: 'A CNAME pointing into a CDN (e.g. fastly), then A records — you are seeing "my domain, their infrastructure".',
        },
        {
          instruction: 'Compare answers from two different public resolvers.',
          command: 'dig @8.8.8.8 netflix.com +short\ndig @1.1.1.1 netflix.com +short',
          expected: 'Possibly different IPs! Geo-DNS + separate caches = eventual consistency, live.',
        },
        {
          instruction: 'Look up the mail and text records for a domain.',
          command: 'dig gmail.com MX +short\ndig google.com TXT +short',
          expected: 'MX shows prioritized mail servers; TXT shows SPF entries — DNS as a general metadata store.',
        },
      ],
    },
    {
      type: 'design',
      id: 'design-1',
      title: 'Mini-design: global entry point for a SaaS API',
      prompt: `
Your startup's API (\`api.acme.io\`) currently runs in one AWS region (us-east-1). You are expanding to serve customers in Europe and India who complain about 300 ms latencies.

**Sketch the DNS + entry-path design** that:
1. Routes each user to the nearest of 3 regions
2. Survives a full region outage within ~2 minutes
3. Lets you canary-test a new region with 5% of traffic

Write your answer as bullet points before revealing the model answer.
`,
      hints: [
        'Think about which DNS routing policies cloud providers offer (latency-based, weighted, failover).',
        'What TTL would you pick, and what breaks if it is too high or too low?',
        'DNS alone reacts slowly — what sits behind the DNS name in each region to absorb failures faster?',
      ],
      modelAnswer: `
**Entry path:** \`api.acme.io\` → latency-based DNS (e.g. Route53) → per-region load balancer → regional service fleet.

1. **Nearest-region routing:** create one latency-based record set per region (us-east-1, eu-west-1, ap-south-1), each pointing at that region's load balancer. The resolver's location picks the lowest-latency region automatically.

2. **Region failover within ~2 min:**
   - Attach **health checks** to each record (probing the LB's \`/healthz\` through the public path). When a region fails its checks, Route53 stops returning it.
   - Set **TTL ≈ 60 s** so cached answers expire quickly. Health check detection (~30–60 s) + TTL expiry (~60 s) ≈ under 2 minutes for most users.
   - Note the honest caveat: some resolvers ignore TTLs, so a small tail of traffic converges slowly — acceptable per requirements, but worth stating in an interview.

3. **5% canary:** within the target geography, use **weighted records**: 95 → stable region LB, 5 → canary region LB. Watch error/latency metrics, then ramp weights 5→25→50→100.

**Extras that impress:**
- Keep regions **stateless at the edge** (sessions in a shared store) so a user re-routed mid-session isn't logged out.
- Mention **anycast + global accelerator** (one static IP, BGP picks nearest region) as the lower-latency, faster-failover alternative to pure DNS.
- Call out that DNS is now on your critical path: use a managed, anycast DNS provider with an SLA.
`,
    },
  ],
}
