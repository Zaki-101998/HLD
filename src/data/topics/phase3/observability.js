export default {
  id: 'observability',
  title: 'Observability: Metrics, Logs, Traces & SLOs',
  subtitle: 'The three pillars, how to know your system is healthy, and defining reliability with SLIs/SLOs',
  days: 2,
  content: `
## Why this matters for system design

Once your design has more than a couple of moving parts, "is it working?" stops being obvious. **Observability** is how you answer that question — and how you find the answer to "*why* is it broken?" at 3am. In interviews, tacking a thoughtful observability section onto a design ("here's how I'd monitor and alert on this") is a strong senior signal; most candidates forget it entirely.

A useful distinction: **monitoring** watches for *known* failure modes (dashboards and alerts you set up in advance — "CPU > 90%"). **Observability** is the property that lets you ask *new, unanticipated* questions about your system's behavior from its outputs, without shipping new code. You want both, but observability is what saves you during a novel incident.

## The three pillars

### 1. Metrics — numbers over time
Aggregated numeric measurements sampled at intervals: request rate, error rate, latency, CPU, queue depth. **Cheap to store** (just numbers + tags), great for **dashboards and alerts**, and answer "*what* and *how much*."
- Types: **counters** (monotonic, e.g. total requests), **gauges** (a value that goes up/down, e.g. active connections), **histograms** (distributions — essential for latency percentiles).
- **Always look at percentiles, not averages.** An average latency of 50ms can hide a p99 of 5s that's ruining 1% of users. Track **p50 / p95 / p99 / p99.9**. Averages lie; tail latency is where users feel pain.
- Tools: Prometheus (pull-based), StatsD, Grafana for visualization.

### 2. Logs — discrete events with detail
Timestamped records of individual events ("user 123 failed login from IP x"). High detail, great for **debugging a specific event**, but expensive at volume.
- Use **structured logging** (JSON with fields), not free-text. \`{ "level":"error", "user_id":123, "latency_ms":812, "trace_id":"abc" }\` is queryable; \`"error for user 123"\` is not.
- **Log levels** (DEBUG/INFO/WARN/ERROR) let you dial verbosity. Don't log secrets/PII.
- **Sample** high-volume logs to control cost.
- Tools: the ELK stack (Elasticsearch/Logstash/Kibana), Loki, Splunk. Logs are *centralized* — you can't SSH into 500 boxes.

### 3. Traces — one request's journey across services
A **distributed trace** follows a single request as it hops across services, showing the timing of each step. Essential in microservices, where one user action touches a dozen services.
- A **trace** = a tree of **spans**; each span is one unit of work (a service call, a DB query) with start/end time and metadata.
- A **trace/correlation ID** is generated at the edge and **propagated** through every downstream call (via headers). That's what stitches the spans together and lets you grep all logs for one request.
- Answers "*where* is the time going?" and "which service failed in this specific request?" — you'll instantly see "8 of the 900ms was in the recommendations call."
- Tools: OpenTelemetry (the emerging standard for instrumentation), Jaeger, Zipkin, AWS X-Ray.

\`\`\`
Metrics: "error rate jumped to 5% at 14:30"        (WHAT is wrong — alerting)
Traces:  "requests are slow because service C's      (WHERE — which hop)
          DB query span takes 3s"
Logs:    "service C error: connection pool           (WHY — the detail)
          exhausted, user_id=123"
\`\`\`
The three pillars are complementary: metrics alert you, traces localize it, logs explain it.

\`\`\`mermaid
flowchart TD
  S["Services emit telemetry"] --> M["Metrics"]
  S --> L["Logs"]
  S --> T["Traces"]
  M --> D["Dashboards + alerts"]
  L --> D
  T --> D
  T -.->|"trace_id joins metrics, logs, and spans for one request"| L
\`\`\`

## SLIs, SLOs, SLAs — defining "reliable"

You can't improve reliability you haven't defined. This vocabulary (from Google's SRE practice) is interview gold.

- **SLI (Indicator):** a *measured* number that reflects user happiness. E.g. "proportion of requests served < 300ms," or "successful requests / total requests." Pick SLIs that reflect the **user's experience**, not internal minutiae.
- **SLO (Objective):** the *target* for an SLI. E.g. "99.9% of requests succeed over 30 days." This is your internal goal — the line between "fine" and "we have a problem."
- **SLA (Agreement):** a *contract* with customers, with financial/legal consequences if breached. Always **looser** than your SLO (you want an internal safety margin — alert on the SLO before you'd ever breach the SLA).

### The error budget — the killer concept
If your SLO is 99.9% success, then **0.1% is your error budget** — the allowed unreliability. Over 30 days, 99.9% availability ≈ 43 minutes of downtime you're *allowed* to spend.
- This reframes reliability as a **budget to spend, not a number to maximize.** 100% is the wrong target — it's impossibly expensive and blocks all progress.
- **Budget remaining → ship fast, take risks.** **Budget exhausted → freeze features, focus on stability.** It turns the eternal dev-vs-ops "move fast" vs "stay stable" fight into a *shared, data-driven* decision. This is the single most valuable idea to name in an interview.

### The "nines"
| Availability | Downtime / year | Downtime / month |
|---|---|---|
| 99% ("two nines") | ~3.65 days | ~7.2 hours |
| 99.9% ("three nines") | ~8.76 hours | ~43 min |
| 99.99% ("four nines") | ~52 min | ~4.3 min |
| 99.999% ("five nines") | ~5 min | ~26 sec |
Each extra nine costs roughly 10× more effort. Don't promise five nines unless the business truly needs it.

## Alerting — the part that pages you

- **Alert on symptoms, not causes.** Page on "user-facing error rate / latency SLO is breaching" (a symptom users feel), not on "CPU is high" (which may be totally fine). CPU alerts create noise; SLO alerts create signal.
- **Every page must be actionable.** An alert nobody can act on trains people to ignore alerts → **alert fatigue** → the real page gets missed.
- The **RED method** for request-driven services (**R**ate, **E**rrors, **D**uration) and the **USE method** for resources (**U**tilization, **S**aturation, **E**rrors) are handy checklists for *what* to measure.

## How this shows up in interviews

- **"How would you monitor this system?"** — walk the three pillars: metrics for the RED dashboard + SLO alerts, distributed tracing to debug cross-service latency, structured centralized logs for detail. Naming all three shows range.
- **"How do you know if it's healthy / how do you define reliability?"** — SLIs/SLOs and, crucially, the **error budget** framing. This one concept sets you apart.
- **"A user reports it's slow but your dashboards look fine."** — that's the averages-vs-percentiles trap; check **p99**, and use a **trace** to find which hop is slow for the affected requests.
- **"How do you debug an issue that spans 5 services?"** — trace/correlation ID propagated from the edge, distributed tracing to see the span timings, then centralized logs filtered by that trace ID.
- Tie back to earlier topics: observability is *how you operate* microservices and *how you verify* your resiliency patterns actually work (did the circuit breaker trip? the metric tells you).
`,
  resources: [
    {
      title: 'Google SRE Book — Service Level Objectives (SLIs/SLOs/error budgets)',
      url: 'https://sre.google/sre-book/service-level-objectives/',
      type: 'doc',
      source: 'Google SRE (the definitive source on SLOs)',
    },
    {
      title: 'Monitoring & Observability — the three pillars, explained',
      url: 'https://www.youtube.com/watch?v=CAQ_a2-9UOI',
      type: 'video',
      source: 'ByteByteGo',
    },
    {
      title: 'The RED Method — key metrics for microservices',
      url: 'https://grafana.com/blog/2018/08/02/the-red-method-how-to-instrument-your-services/',
      type: 'article',
      source: 'Grafana Labs (Tom Wilkie)',
    },
    {
      title: 'What is Distributed Tracing? (OpenTelemetry concepts)',
      url: 'https://opentelemetry.io/docs/concepts/observability-primer/',
      type: 'doc',
      source: 'OpenTelemetry',
    },
    {
      title: 'What is Distributed Tracing?',
      url: 'https://www.dynatrace.com/news/blog/what-is-distributed-tracing/',
      type: 'article',
      source: 'Dynatrace',
    },
    {
      title: 'Design an Analytics Platform (Metrics & Logging)',
      url: 'https://www.youtube.com/watch?v=kIcq1_pBQSY',
      type: 'video',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
  ],
  challenges: [
    {
      type: 'quiz',
      id: 'quiz-1',
      title: 'Observability & SLO check',
      questions: [
        {
          q: 'Your average latency dashboard reads a healthy 50ms, but users complain the app is slow. What’s the most likely explanation?',
          options: [
            'The users are wrong',
            'The average hides the tail — p99 latency could be several seconds, so ~1% of requests are painfully slow. Track percentiles (p50/p95/p99), not averages',
            'The dashboard is broken',
            'Latency doesn’t affect users',
          ],
          answer: 1,
          explanation:
            'Averages lie. A low mean coexists happily with a terrible tail. Users feel the tail — the slow requests. Always monitor latency as percentiles and pay special attention to p99/p99.9; that’s where the pain lives.',
        },
        {
          q: 'A request is slow and it touches 6 microservices. Which pillar best tells you WHERE the time is going?',
          options: [
            'Metrics — they’ll show which service is slow for this request',
            'Distributed tracing — a trace of spans shows the timing of each hop for that specific request, so you see e.g. "3s of the 3.4s was service C’s DB query"',
            'Logs — grep every server',
            'None; you must add print statements',
          ],
          answer: 1,
          explanation:
            'Metrics tell you WHAT (error rate up) but are aggregate; logs tell you WHY (the detail) but per-event. Traces tell you WHERE across services — that’s their whole purpose. A correlation/trace ID propagated from the edge stitches the spans (and the logs) together.',
        },
        {
          q: 'Your SLO is 99.9% success over 30 days. Your "error budget" is…',
          options: [
            'The money spent on servers',
            'The allowed 0.1% of unreliability — about 43 minutes of downtime per month you’re permitted to "spend"; reframes reliability as a budget, not a number to maximize',
            'The number of engineers on call',
            'Zero — you must never have errors',
          ],
          answer: 1,
          explanation:
            '99.9% availability leaves 0.1% ≈ 43 min/month. The power move: budget remaining → ship fast and take risks; budget exhausted → freeze features and fix stability. It turns "move fast vs stay stable" into a shared, data-driven decision — the single most valuable observability idea for interviews.',
        },
        {
          q: 'Why should you generally alert (page someone) on error rate / latency SLO breaches rather than on "CPU > 90%"?',
          options: [
            'CPU can’t be measured reliably',
            'Alert on SYMPTOMS users feel, not causes. High CPU may be perfectly fine and creates noise; a breaching user-facing SLO is a real, actionable signal. Noisy alerts cause alert fatigue and missed real pages',
            'CPU alerts are more expensive',
            'You should alert on both equally, always',
          ],
          answer: 1,
          explanation:
            'Page on symptoms (the user experience degrading), investigate with causes. CPU/memory are useful diagnostics on a dashboard but poor paging triggers — high utilization is often normal. Every page must be actionable, or people learn to ignore alerts and miss the one that matters.',
        },
        {
          q: 'What’s the difference between an SLO and an SLA?',
          options: [
            'They’re the same thing',
            'An SLO is your internal reliability target (e.g. 99.9%); an SLA is a customer contract with financial/legal penalties if breached — and is set LOOSER than the SLO to give an internal safety margin',
            'An SLA is stricter than an SLO',
            'SLO is for latency, SLA is for errors',
          ],
          answer: 1,
          explanation:
            'You alert on the tighter SLO so you notice and fix problems before you ever breach the customer-facing SLA. If SLO and SLA were equal (or SLA tighter), you’d have no margin to react before owing penalties.',
        },
        {
          q: 'Why is structured logging (JSON with fields) preferred over free-text log lines?',
          options: [
            'JSON files are smaller',
            'Structured fields (user_id, latency_ms, trace_id, level) are queryable and filterable at scale, so you can slice and correlate; free-text like "error for user 123" can only be crudely grepped',
            'Free text isn’t allowed by HTTP',
            'JSON logs never contain errors',
          ],
          answer: 1,
          explanation:
            'At scale you query centralized logs, not eyeball them. Structured fields let you filter by trace_id (to see one request across services), aggregate by error type, and correlate with traces. Free-text is nearly unqueryable. (And never log secrets/PII in either form.)',
        },
      ],
    },
    {
      type: 'estimation',
      id: 'estimation-1',
      title: 'Estimation drill: error budgets and log volume',
      problem: `
Work these out (use the calculator; think in orders of magnitude):

1. A service handles **10,000 requests/second**. Its SLO is **99.95%** success over a **30-day** month. How many FAILED requests does that error budget allow for the month? Roughly how many minutes of a *total* outage would exhaust the entire budget?

2. That same service writes **one structured log line (~1 KB)** per request. If you log **100%** of requests, how much log data per **day**? Per **month**? If storing logs costs **~$0.03 per GB-month**, what’s the rough monthly bill — and what does **sampling at 5%** do to it?
`,
      hints: [
        'Requests/month = 10,000 × seconds in 30 days. Error budget = 0.05% of that (100% − 99.95%).',
        'A total outage fails 10,000 req/s; "minutes of budget" = allowed failures ÷ (10,000 × 60).',
        'Log/day = 10,000 × 1KB × 86,400 s. Watch your GB↔TB conversions.',
      ],
      solution: `
**Part 1 — error budget:**
- Seconds in 30 days = 30 × 86,400 = **2,592,000 s**.
- Requests/month = 10,000 × 2,592,000 = **2.592 × 10¹⁰** (~25.9 **billion** requests).
- Error budget = (100% − 99.95%) = **0.05%** = 0.0005 of requests = 2.592×10¹⁰ × 0.0005 = **~12.96 million failed requests allowed** for the month.
- As a *total* outage (everything fails): 10,000 req/s fail, so budget in seconds = 12.96M ÷ 10,000 = **1,296 s ≈ 21.6 minutes**. So 99.95% ≈ ~22 min of full downtime per month — spend it wisely. (Sanity check vs the "nines" table: 99.9% ≈ 43 min, and 99.95% is between 99.9% and 99.99%, so ~22 min is right.)

**Part 2 — log volume & cost:**
- Per second: 10,000 × 1 KB = 10,000 KB ≈ **10 MB/s**.
- Per day: 10 MB/s × 86,400 s = 864,000 MB = **~864 GB/day** (~0.86 TB/day).
- Per month: 864 GB × 30 = **~25,920 GB ≈ 25.9 TB/month**.
- Cost at $0.03/GB-month ≈ 25,920 × $0.03 ≈ **~$780/month** just to *store* one month of logs (ignoring ingestion/indexing, which are often far pricier).
- **Sampling at 5%** cuts volume and cost ~20×: **~1.3 TB/month, ~$39/month.**

**Takeaways:** (1) even a strict-sounding 99.95% is only ~22 minutes/month — error budgets make "how much downtime is OK" concrete instead of hand-wavy. (2) Full-fidelity logging at scale is genuinely expensive, which is exactly why you sample high-volume logs, lean on cheap metrics for the always-on view, and reserve detailed logs/traces for errors and a sampled fraction of traffic.
`,
    },
  ],
}
