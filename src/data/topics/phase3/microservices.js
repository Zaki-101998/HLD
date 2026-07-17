export default {
  id: 'microservices',
  title: 'Microservices, Service Discovery & API Gateways',
  subtitle: 'Monolith vs microservices, how services find each other, and the gateway at the edge',
  days: 2,
  content: `
## Why this matters for system design

Almost every "design X" answer eventually draws boxes and arrows between services. To do that credibly you need to know **when** splitting into services is worth it (and when it's a trap), **how** services locate and call each other at scale, and what the **API gateway** at the front does. Interviewers probe this to see whether you cargo-cult microservices or reason about the trade-off.

The honest headline: **microservices trade code complexity for operational and distributed-systems complexity.** You don't adopt them to be modern; you adopt them to let independent teams deploy independently. If you don't have that problem, a monolith is often the better engineering choice.

## Monolith vs microservices — the real trade-off

**Monolith:** one deployable app. All modules run in one process, call each other as in-process function calls, share one database.
- ✅ Simple to develop, test, deploy, and debug (one stack trace, no network between modules).
- ✅ Transactions are easy — one database, real ACID.
- ✅ No network latency or partial-failure between components.
- ❌ One codebase every team touches → merge/coordination friction as headcount grows.
- ❌ Deploy everything together → one risky change blocks all releases.
- ❌ Scale the *whole* app even if only one module is hot.
- ❌ One bug (memory leak, infinite loop) can take down everything.

**Microservices:** many small services, each owned by a team, each independently deployable, each (ideally) with its **own database**.
- ✅ **Independent deployment** — teams ship on their own cadence. *This is the primary reason to do it.*
- ✅ **Independent scaling** — scale only the hot service.
- ✅ **Fault isolation** — one service crashing needn't kill others (with resiliency patterns).
- ✅ **Tech heterogeneity** — right language/DB per service.
- ❌ **Distributed systems tax:** network calls fail, are slow, need retries/timeouts/circuit breakers (the resiliency topic).
- ❌ **No cross-service ACID transactions** → sagas / eventual consistency (distributed transactions topic).
- ❌ **Operational overhead:** dozens of deploys, service discovery, distributed tracing, more infra.
- ❌ **Harder debugging:** one user action spans many services and logs.

**The rule of thumb worth saying out loud:** start with a well-structured **modular monolith**; extract services when a specific module has a real, differing need — its own scaling profile, a team that must deploy independently, or a distinct reliability requirement. "Microservices are a solution to an *organizational* scaling problem as much as a technical one" (Conway's Law: your architecture ends up mirroring your org chart).

## The database-per-service rule

The line that actually makes services independent is **each service owns its own database, and no other service touches it directly.** If two services share a database, they're secretly coupled — you can't change a schema or deploy independently, and you've built a distributed monolith (the worst of both worlds). Cross-service data access goes through **APIs or events**, never a shared table. The cost is losing easy JOINs and transactions across services — which is exactly why sagas and eventual consistency show up.

## Service discovery — how do services find each other?

In a monolith, "calling module B" is a function call. Across services, B lives on some set of IPs/ports that **change constantly** (autoscaling, deploys, crashes, reschedules). Hardcoding addresses is impossible. Service discovery solves "where is service B right now?"

**A service registry** is the source of truth — a database of \`service name → healthy instances\`. Instances **register** on startup and send **heartbeats**; the registry evicts ones that stop heartbeating (health checking).

Two patterns for *using* it:
- **Client-side discovery:** the caller queries the registry, gets the instance list, and load-balances itself. (e.g. Netflix Eureka + Ribbon.) Fewer hops; smarter clients.
- **Server-side discovery:** the caller hits a stable load balancer / DNS name; that layer queries the registry and routes. (e.g. Kubernetes Services, AWS ALB.) Dumb clients; the platform handles it.

\`\`\`
Client-side:  caller ──ask──▶ registry ──list──▶ caller ──picks & calls──▶ instance
Server-side:  caller ──▶ stable LB/DNS ──(consults registry)──▶ instance
\`\`\`

Modern platforms (**Kubernetes**) build this in: a *Service* gives you a stable virtual name and IP; kube-proxy/DNS route to healthy pods; you rarely run a separate registry yourself. A **service mesh** (Istio, Linkerd) pushes discovery, retries, timeouts, mTLS, and telemetry into a **sidecar proxy** next to each service, so application code stays clean.

## API Gateway — the single front door

You don't want clients (web, mobile, third parties) calling dozens of internal services directly — they'd need to know every address, handle auth N times, and break whenever you refactor. An **API gateway** is a reverse proxy that is the single entry point for all client traffic.

**What it handles (cross-cutting concerns, done once at the edge):**
- **Routing** requests to the right backend service.
- **Authentication & authorization** — validate the token once, pass identity inward.
- **Rate limiting & throttling** (the rate-limiting topic) — protect the whole backend.
- **TLS termination**, request/response transformation, **API composition/aggregation** (fan out to several services, combine results).
- **Observability** — a central place for logging, metrics, tracing.

**BFF (Backend for Frontend):** a common variant — a *separate* gateway tailored per client type (one for mobile, one for web), because a phone wants small, aggregated payloads while a web app or partner API wants something different. Avoids one bloated generic gateway.

**Caution:** the gateway must not become a bottleneck or a "distributed monolith" where business logic creeps in. Keep it about cross-cutting concerns, not domain logic.

The gateway is the one door in; behind it, services register with (and heartbeat to) the registry so the gateway always routes to something alive:

\`\`\`mermaid
flowchart TD
  Clients["Clients"] --> GW["API Gateway — auth, rate limit, route"]
  GW --> A["Service A"]
  GW --> B["Service B"]
  GW --> C["Service C"]
  A -.->|"register + heartbeat"| Reg["Service registry"]
  B -.->|"register + heartbeat"| Reg
  C -.->|"register + heartbeat"| Reg
  GW -.->|"resolve healthy instances"| Reg
\`\`\`

## Beyond microservices: serverless, event-driven, and P2P

Microservices assume long-running processes calling each other over the network. Three related patterns relax that assumption differently:

- **Serverless / FaaS:** you deploy a function, not a process; the platform allocates capacity per invocation and scales to zero when idle. You stop managing servers or capacity — and stop paying for idle time — but each invocation pays a **cold-start** penalty (spinning up a fresh runtime), and long-lived connections (WebSockets, persistent DB pools) don't fit the model well. Good for spiky, event-triggered work (image processing on upload, a webhook receiver); a poor fit for steady high-throughput services where the cold-start tax and per-invocation pricing add up.
- **Event-driven architecture:** the pattern named in the message-queues topic — services publish facts ("order_created") instead of calling each other directly, and interested services subscribe and react. Coupling drops (a new consumer needs zero producer changes), but the overall flow becomes implicit — the same trade-off as choreography vs orchestration above, at the whole-system scale.
- **Peer-to-peer (P2P):** no client/server split at all — every node can act as both, and nodes talk directly to each other instead of routing through a central service. BitTorrent's chunk distribution (each peer serves pieces it already has to other peers) is the canonical example; it shows up in interviews for large-file/large-dataset distribution, where a central server would be a bandwidth bottleneck.

Client-server (every earlier topic in this course) optimizes for a trusted, centrally-operated backend; these three optimize away different pieces of that assumption — cost of idle capacity, direct coupling between services, and the central server itself.

## How this shows up in interviews

- **"Monolith or microservices for this?"** — the *senior* answer resists cargo-culting: "Given one small team and unproven scale, I'd start with a modular monolith and extract services only where a module has a distinct scaling or team-ownership need." Then name the trade-offs.
- **"How do services find each other?"** — service registry + health checks + heartbeats; client-side vs server-side discovery; "in practice Kubernetes Services / a service mesh handle this."
- **"How do clients talk to your backend?"** — through an API gateway handling auth, rate limiting, routing, TLS; maybe a BFF per client. Draw it as the single front door.
- Watch for the **distributed monolith** anti-pattern: services that share a database or must be deployed together — you paid the microservices cost and got none of the benefit.
- Tie in earlier topics: microservices *require* the resiliency patterns (timeouts, circuit breakers) and the distributed-transaction patterns (sagas) to work at all. Mentioning that shows systems thinking.
`,
  resources: [
    {
      title: 'Microservices — the pattern, benefits, and drawbacks',
      url: 'https://martinfowler.com/articles/microservices.html',
      type: 'article',
      source: 'Martin Fowler & James Lewis (the canonical definition)',
    },
    {
      title: 'Pattern: Service Registry & Service Discovery',
      url: 'https://microservices.io/patterns/server-side-discovery.html',
      type: 'article',
      source: 'Chris Richardson, microservices.io',
    },
    {
      title: 'What is an API Gateway? (and the BFF pattern)',
      url: 'https://www.youtube.com/watch?v=6ULyxuHKxg8',
      type: 'video',
      source: 'ByteByteGo',
    },
    {
      title: 'MonolithFirst — why to start with a monolith',
      url: 'https://martinfowler.com/bliki/MonolithFirst.html',
      type: 'article',
      source: 'Martin Fowler',
    },
    {
      title: 'What is an API Gateway?',
      url: 'https://blog.algomaster.io/p/what-is-an-api-gateway',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
    {
      title: 'HeartBeats in Distributed Systems',
      url: 'https://blog.algomaster.io/p/heartbeats-in-distributed-systems',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
    {
      title: 'Service Discovery in Distributed Systems',
      url: 'https://blog.algomaster.io/p/service-discovery-in-distributed-systems',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
    {
      title: 'Serverless Architecture',
      url: 'https://blog.algomaster.io/p/2edeb23b-cfa5-4b24-845e-3f6f7a39d162',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
    {
      title: 'What is Peer-to-Peer (P2P) Architecture?',
      url: 'https://www.spiceworks.com/tech/networking/articles/what-is-peer-to-peer/',
      type: 'article',
      source: 'Spiceworks',
    },
  ],
  challenges: [
    {
      type: 'quiz',
      id: 'quiz-1',
      title: 'Microservices & discovery check',
      questions: [
        {
          q: 'What is the PRIMARY reason to adopt microservices?',
          options: [
            'They are always faster than a monolith',
            'To let independent teams deploy independently (and scale/fail in isolation) — it solves an organizational scaling problem as much as a technical one',
            'They remove the need for databases',
            'They eliminate network failures',
          ],
          answer: 1,
          explanation:
            'Microservices trade code simplicity for operational and distributed-systems complexity. You take that trade to gain independent deployability and scaling for autonomous teams. If you don’t have many teams or a differing-scale problem, a monolith is usually the better engineering choice.',
        },
        {
          q: 'Two microservices read and write the SAME database tables directly. Why is this an anti-pattern?',
          options: [
            'Databases can only have one client',
            'It secretly couples them — you can’t change schemas or deploy independently, so you’ve built a "distributed monolith": the costs of microservices with none of the benefits',
            'It’s always slower',
            'It violates the CAP theorem',
          ],
          answer: 1,
          explanation:
            'Database-per-service is the rule that actually makes services independent. Sharing a database recreates tight coupling across a network boundary — the worst of both worlds. Cross-service data goes through APIs or events, never a shared table (which is why sagas/eventual consistency appear).',
        },
        {
          q: 'Why can’t services just hardcode the IP addresses of the services they call?',
          options: [
            'IPs are secret',
            'Instances come and go constantly (autoscaling, deploys, crashes, reschedules), so the set of healthy addresses changes all the time — you need dynamic service discovery',
            'Hardcoding is against HTTP',
            'IPv6 forbids it',
          ],
          answer: 1,
          explanation:
            'A service registry tracks name → healthy instances; instances register and heartbeat, and the registry evicts dead ones via health checks. Callers resolve the current instances at call time (client-side) or via a stable LB/DNS that consults the registry (server-side).',
        },
        {
          q: 'In SERVER-SIDE service discovery, how does the caller reach a target service?',
          options: [
            'It queries the registry itself and load-balances in its own code',
            'It calls a stable load balancer / DNS name, which consults the registry and routes to a healthy instance — the client stays "dumb" and the platform handles routing (e.g. Kubernetes Services)',
            'It broadcasts to all instances',
            'It uses a shared database of addresses',
          ],
          answer: 1,
          explanation:
            'Client-side discovery has the caller query the registry and pick an instance itself (e.g. Eureka+Ribbon). Server-side hides that behind a stable endpoint (K8s Service, ALB). Kubernetes and service meshes make server-side the common default today.',
        },
        {
          q: 'Which responsibility does an API Gateway typically handle?',
          options: [
            'Core business/domain logic for each feature',
            'Cross-cutting edge concerns done once for all traffic: routing, authentication, rate limiting, TLS termination, and sometimes aggregating several service calls',
            'Storing the primary database',
            'Running the CI/CD pipeline',
          ],
          answer: 1,
          explanation:
            'The gateway is the single front door: it centralizes auth, rate limiting, routing, TLS, and observability so clients don’t call dozens of services directly. Keep business/domain logic OUT of it — otherwise it becomes a bottleneck and a distributed monolith.',
        },
        {
          q: 'A team wants a "BFF" (Backend for Frontend). What problem does it solve?',
          options: [
            'It backs up the frontend files',
            'Different client types have different needs (a phone wants small aggregated payloads; a web app or partner wants richer data), so a per-client gateway tailors responses instead of one bloated generic gateway',
            'It replaces the database',
            'It is a testing framework',
          ],
          answer: 1,
          explanation:
            'A Backend for Frontend is a gateway tailored per client (mobile BFF, web BFF). It aggregates and shapes data for that specific client, avoiding a one-size-fits-none generic API and keeping mobile payloads lean.',
        },
      ],
    },
    {
      type: 'design',
      id: 'design-1',
      title: 'Design exercise: split a monolith the right way',
      prompt: `
You’ve inherited a successful 4-year-old e-commerce monolith. It’s one Rails app, one Postgres database, deployed by a single team. The company now has 60 engineers across teams for Catalog, Cart/Checkout, Search, and Recommendations. Pain points: every deploy is a coordinated all-hands event; Search needs far more CPU than everything else but scales with the whole app; and one team’s bad migration recently took the whole site down.

Leadership says "let’s go microservices." Give your recommendation: would you split, and if so, how would you approach it? Address which services you’d carve out first and why, the database question, how the resulting services find and call each other, and what new problems you’re signing up for. Avoid the common failure modes.
`,
      hints: [
        'The pain points map directly onto specific microservices benefits — which ones?',
        'What’s the danger of a "big bang" rewrite vs incremental extraction? (Strangler Fig)',
        'If you split services but keep one shared Postgres, what have you actually built?',
      ],
      modelAnswer: `
**Recommendation: yes, but incrementally — not a big-bang rewrite.** The pain points are real microservices problems, so the trade is justified here (unlike a small startup): coordinated deploys (want independent deployability), Search’s distinct CPU profile (want independent scaling), and a migration taking down everything (want fault isolation). But rewriting a working 4-year-old system all at once is how companies lose a year and ship bugs. Use the **Strangler Fig pattern**: stand up an **API gateway** in front of the monolith, then peel off one service at a time, routing its traffic to the new service while the monolith keeps serving the rest. The monolith shrinks gradually and is never "down for the rewrite."

**What to extract first, and why:**
1. **Search** — extract it first. It has the clearest, most self-contained boundary and the loudest pain (its CPU needs differ wildly). As a separate service it scales independently, and it naturally wants its own datastore anyway (an inverted index / Elasticsearch), so the database split is obvious.
2. **Recommendations** — a *soft dependency* (per the resiliency topic) with its own data and ML workload; safe to isolate and degrade. Good early candidate.
3. **Catalog** and **Cart/Checkout** — extract later; Checkout is the riskiest (money, transactions) so do it last, once the team is fluent in the new operational model.

**The database question (the crux):** each extracted service must get **its own database** — otherwise you’ve built a *distributed monolith* (services over a network still coupled through one Postgres, unable to deploy or change schemas independently — all cost, no benefit). Migrate data ownership per service; where another service needs that data, expose it via an **API or events**, never a shared table. Accept the consequence: cross-service operations lose ACID JOINs/transactions, so checkout-touching-inventory becomes a **saga** with eventual consistency and compensating actions.

**How services find and call each other:** run on a platform (**Kubernetes**) so each service gets a stable **Service** name and server-side discovery for free (health-checked routing to healthy pods) — no hand-rolled registry. Inter-service calls go through the **API gateway** at the edge (auth, rate limiting, routing, TLS once) and, for internal calls, ideally a **service mesh** sidecar providing retries, timeouts, mTLS, and tracing without polluting app code.

**New problems I’m explicitly signing up for (naming them shows maturity):**
- **Distributed-systems tax:** every call can fail/be slow → I must add timeouts, retries+backoff+jitter, and circuit breakers (resiliency topic).
- **No cross-service transactions** → sagas / outbox pattern and eventual consistency (distributed-transactions topic).
- **Operational overhead:** many deploys, CI/CD per service, and I now *need* distributed tracing and centralized metrics/logging (the observability topic) just to debug a single user action that spans services.
- **Data consistency & duplication** across service databases.

**One-line summary:** the split is justified by real independent-deploy, independent-scale, and fault-isolation needs, but I’d do it incrementally via a strangler-fig behind an API gateway, extract Search first, give every service its own database (or it’s a distributed monolith), lean on Kubernetes/service-mesh for discovery — and go in clear-eyed that I’m trading code simplicity for resiliency, saga, and observability work.
`,
    },
  ],
}
