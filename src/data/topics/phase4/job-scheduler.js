export default {
  id: 'job-scheduler',
  title: 'Design a Distributed Job Scheduler (Cron / Task Queue)',
  subtitle: 'Run tasks reliably at scale: schedule now-or-later, guarantee execution despite worker crashes, and avoid running the same job twice',
  days: 2,
  content: `
## The problem

Design a system that **runs tasks** — immediately, at a future time, or on a recurring schedule (cron) — reliably across a fleet of workers. Think AWS Lambda's scheduler, a background-job system (Celery/Sidekiq), or a cron-as-a-service. The core challenges: **guaranteeing a job actually runs even if a worker crashes mid-execution**, **not running the same job twice**, and **scaling to millions of scheduled jobs** without a single bottleneck.

## Step 1 — Requirements

**Functional:** (1) submit a job to run immediately, (2) schedule a job for a future time, (3) schedule recurring jobs (cron expressions), (4) execute jobs on workers, (5) report status (pending/running/succeeded/failed) and retry failures.

*De-scope but mention:* job dependencies/DAGs, priorities, resource quotas.

**Non-functional:** **reliability / durability** — a submitted job must **not be lost** and must eventually run (the defining requirement). **At-least-once execution** with **idempotency** so retries don't corrupt state. **Scalability** to millions of jobs and high submit rates. **Timeliness** — scheduled jobs fire close to their target time. **Availability** — no single component whose death stops all execution.

## Step 2 — Estimation

- Say **10M scheduled jobs** active, **10k jobs/sec** becoming due at peak. Job metadata is small (~1 KB) → **~10 GB** — a storage-light, coordination-heavy problem.
- Execution time varies wildly (ms to minutes) → **decouple scheduling from execution** with a queue, so a slow job doesn't block the scheduler.
- The hard part isn't volume of data; it's **exactly-which-worker-runs-what-when** under failures — a **coordination and fault-tolerance** problem.

## Step 3 — API

\`\`\`
POST /jobs        body:{ task, run_at | cron, payload, max_retries }  → { job_id }
GET  /jobs/{id}                                                       → status
DELETE /jobs/{id}                                                     → cancel
\`\`\`

## Step 4 — Data model

\`\`\`
Job { job_id, task_type, payload, status, run_at, cron, retries, max_retries,
      lease_owner, lease_expires_at, next_run_at }
      status ∈ { pending, queued, running, succeeded, failed }
\`\`\`
Store jobs in a **durable database** (so nothing is lost on crash). The critical fields are \`run_at\`/\`next_run_at\` (an index on these powers "which jobs are due now?") and the **lease** fields (\`lease_owner\`, \`lease_expires_at\`) that let you detect and reclaim jobs from dead workers.

## Step 5 — High-level design

\`\`\`
 client ─▶ API ─▶ Job store (durable DB, indexed by next_run_at)
                        │
                 Scheduler / poller  (finds due jobs, enqueues them)
                        │
                    Queue (Kafka / SQS)  ── decouples schedule from run
                        │
                 Worker pool  (lease → execute → ack; heartbeat)
                        │
                 update status / retry / reschedule recurring
\`\`\`

\`\`\`mermaid
sequenceDiagram
  autonumber
  participant API
  participant DB as Job store
  participant SCH as Scheduler
  participant Q as Queue
  participant W as Worker
  API->>DB: insert job (run_at)
  loop every tick
    SCH->>DB: SELECT jobs WHERE next_run_at <= now (due)
    SCH->>Q: enqueue due jobs
  end
  W->>Q: pull job
  W->>DB: acquire lease (status=running, lease_expires=now+T)
  W->>W: execute task
  alt success
    W->>DB: status=succeeded (+ reschedule if cron)
  else failure / timeout
    W->>DB: retries++, requeue (backoff) or mark failed
  end
\`\`\`

## Step 6 — Deep dive: reliability, exactly-which-worker, and no-double-run

**Separate scheduling from execution.** A **scheduler/poller** periodically queries the job store for jobs whose \`next_run_at <= now\` and pushes them onto a **durable queue** (Kafka/SQS). A **worker pool** consumes the queue and runs tasks. This decoupling means long-running jobs never stall the scheduler, and workers scale independently. (Reuses the Phase 2 queue building block.)

**The failure that defines the problem: a worker crashes mid-job.** If a worker pulls a job and dies, the job must **not be lost**. Solution: **leases (visibility timeouts).** When a worker takes a job it acquires a **time-bounded lease** (\`status=running, lease_expires_at=now+T\`) and sends **heartbeats** to extend it while working. If the worker dies, the lease **expires**, and a **reaper** (or the queue's visibility-timeout redelivery) returns the job to the queue for another worker. This guarantees **at-least-once execution** — the job always eventually runs.

**At-least-once ⇒ you can run a job twice ⇒ idempotency is mandatory.** Because a job can be redelivered (crash after doing work but before ack, or a slow job whose lease expired while still running), the **task itself must be idempotent** (Phase 3): use an idempotency key / dedup so re-execution doesn't double-charge, double-send, etc. Exactly-once *delivery* is effectively impossible across failures; **at-least-once + idempotent tasks** is the honest, correct answer.

**Preventing two workers from grabbing the same job simultaneously.** The lease acquisition must be **atomic**: \`UPDATE job SET status='running', lease_owner=me WHERE job_id=X AND status='queued'\` — only one worker's update succeeds (a compare-and-set). Or rely on the queue's per-message delivery semantics (SQS hands a message to one consumer and hides it for the visibility timeout). Either way, one owner at a time.

**Scaling the scheduler (avoid a SPOF/bottleneck).** A single scheduler polling one table is a bottleneck and a single point of failure. Options:
- **Shard the jobs** (by job_id or time bucket) across multiple scheduler instances, each responsible for a slice — horizontal scaling.
- **Leader election** (via ZooKeeper/etcd, Phase 3) for a hot-standby scheduler so there's always exactly one active per shard, with failover.
- Index on \`next_run_at\` so "due jobs" is a cheap range scan, not a full table scan.

**Timeliness for far-future jobs.** Don't poll every job constantly. Store by \`next_run_at\` and only pull the near-term window; a common optimization is a **two-tier design** — a durable DB for the long tail plus an in-memory **timing wheel / priority queue** for jobs due soon — so imminent jobs fire precisely without hammering the DB.

**Recurring (cron) jobs.** On successful completion, compute the **next** \`next_run_at\` from the cron expression and re-insert — the job re-enters the schedule. Guard against **missed windows** (scheduler was down): decide whether to skip or backfill.

**Retries & failures.** On failure, increment \`retries\`, requeue with **exponential backoff**; after \`max_retries\`, move to a **dead-letter queue** for inspection. Distinguish transient (retry) from permanent (fail fast) errors.

## Step 7 — Wrap-up

A distributed job scheduler is a **reliability + coordination** problem, not a storage one. Persist jobs in a **durable store indexed by \`next_run_at\`**; a (sharded, leader-elected) **scheduler** finds due jobs and enqueues them onto a **durable queue**, decoupling scheduling from a **worker pool** that executes. The defining requirement — a job must run even if a worker dies — is met with **leases + heartbeats**: a crashed worker's lease expires and a reaper (or queue visibility timeout) redelivers the job, giving **at-least-once execution**. Because that means a job can run twice, **tasks must be idempotent** (exactly-once delivery isn't realistic). Atomic **compare-and-set lease acquisition** ensures one worker per job; **sharding + leader election** removes the scheduler SPOF; a **timing wheel** front-end gives precise near-term firing. Recurring jobs reschedule themselves from their cron expression; failures retry with backoff into a dead-letter queue. With more time: job DAGs/dependencies, priorities, and multi-region execution.

## How this shows up in interviews

- A favorite for probing **fault tolerance**. The signal is: **what happens when a worker crashes mid-job?** → **leases/visibility timeouts + heartbeats + a reaper** that redelivers, giving at-least-once.
- Expect **"at-least-once means a job can run twice — is that OK?"** → no, so **make tasks idempotent** (Phase 3); exactly-once delivery is effectively impossible.
- Expect **"how do you stop two workers running the same job?"** → atomic compare-and-set lease acquisition or the queue's single-consumer delivery.
- Expect **"your single scheduler is a bottleneck/SPOF"** → **shard jobs + leader election**, index by \`next_run_at\`, timing wheel for imminent jobs.
- Cleanly reuses Phase 2 (queues) and Phase 3 (idempotency, leader election, consensus) — a great capstone for showing the building blocks combine.
`,
  resources: [
    {
      title: 'Design a Distributed Job Scheduler',
      url: 'https://www.hellointerview.com/learn/system-design/problem-breakdowns/job-scheduler',
      type: 'article',
      source: 'Hello Interview',
    },
    {
      title: 'Designing a distributed task scheduler',
      url: 'https://www.youtube.com/watch?v=Vhtpz6uwCPo',
      type: 'video',
      source: 'system design walkthrough',
    },
    {
      title: 'Hashed and Hierarchical Timing Wheels (paper)',
      url: 'https://www.cs.columbia.edu/~nahum/w6998/papers/ton97-timing-wheels.pdf',
      type: 'doc',
      source: 'Varghese & Lauck',
    },
    {
      title: 'Delayed jobs & visibility timeouts (SQS)',
      url: 'https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html',
      type: 'doc',
      source: 'AWS Docs',
    },
  ],
  challenges: [
    {
      type: 'quiz',
      id: 'quiz-1',
      title: 'Job scheduler check',
      questions: [
        {
          q: 'A worker pulls a job and crashes halfway through. How do you guarantee the job still eventually runs without being lost?',
          options: [
            'Nothing — the job is lost',
            'Give each running job a time-bounded lease (visibility timeout) that the worker extends via heartbeats; if the worker dies, the lease expires and a reaper (or the queue\'s visibility-timeout redelivery) returns the job to the queue for another worker — giving at-least-once execution',
            'Have every worker run every job',
            'Store the job only in the crashed worker\'s memory',
          ],
          answer: 1,
          explanation:
            'Leases + heartbeats + a reaper are the standard fault-tolerance mechanism. A live worker keeps extending its lease; a dead one lets it expire, so the job is reclaimed and redelivered. This guarantees the job runs at least once despite crashes.',
        },
        {
          q: 'At-least-once execution means a job can occasionally run twice (e.g., a worker finishes but dies before acking). How do you keep this from corrupting state?',
          options: [
            'Accept double side effects',
            'Make the task idempotent — use an idempotency/dedup key so a re-run has no additional effect (no double-charge, no duplicate email). Exactly-once delivery is effectively impossible across failures, so at-least-once + idempotent tasks is the correct approach',
            'Switch to exactly-once delivery, which is easy',
            'Run every job three times and vote',
          ],
          answer: 1,
          explanation:
            'You can\'t reliably get exactly-once delivery across crashes, so you design for at-least-once and make the work idempotent (Phase 3). An idempotency key lets a duplicate execution be detected and skipped, so re-delivery is safe.',
        },
        {
          q: 'A single scheduler polling one job table is a bottleneck and a single point of failure. How do you scale and harden it?',
          options: [
            'Run the scheduler on a bigger machine forever',
            'Shard jobs (by id or time bucket) across multiple scheduler instances and use leader election (ZooKeeper/etcd) for hot-standby failover per shard, with an index on next_run_at so finding due jobs is a cheap range scan',
            'Remove the scheduler entirely',
            'Have workers schedule themselves with no coordination',
          ],
          answer: 1,
          explanation:
            'Sharding spreads the scheduling load horizontally; leader election ensures exactly one active scheduler per shard with automatic failover (no SPOF). Indexing by next_run_at makes "which jobs are due?" a fast range query instead of a full scan.',
        },
      ],
    },
    {
      type: 'design',
      id: 'design-1',
      title: 'Design exercise: the full job scheduler',
      prompt: `
Design a distributed job scheduler (like a cron-as-a-service / background task system) end to end using the 7-step framework. Support run-now, run-at-a-future-time, and recurring (cron) jobs across a worker fleet; ~10M active scheduled jobs and ~10k becoming due per second.

Cover: requirements (emphasize reliability — a job must never be lost), estimation (why is this coordination-heavy rather than storage-heavy?), the API, the data model (which fields make it work?), the high-level design that separates scheduling from execution, and — as your deep dive — how you guarantee execution when a worker crashes and how you avoid running a job twice. Then extend: how do you remove the single-scheduler bottleneck and fire near-term jobs precisely?
`,
      hints: [
        'Persist jobs durably, indexed by next_run_at. Separate the scheduler (finds due jobs) from workers (execute) via a queue.',
        'Worker crash → leases/visibility timeouts + heartbeats + a reaper → at-least-once execution.',
        'At-least-once means possible double-run → tasks must be idempotent (Phase 3).',
        'One worker per job → atomic compare-and-set lease acquisition (or the queue\'s single-consumer semantics).',
        'Scale/harden scheduler: shard jobs + leader election; timing wheel/priority queue for imminent jobs; reschedule cron on completion.',
      ],
      modelAnswer: `
**Requirements** — Functional: submit run-now, run-at future time, recurring cron; execute on workers; status + retries. Non-functional: reliability/durability (never lose a job, must eventually run — the defining requirement), at-least-once + idempotency, scalability to millions of jobs, timeliness, no SPOF.

**Estimation** — ~10M active jobs × ~1 KB ≈ 10 GB (storage-light). ~10k due/sec at peak. Execution time varies ms→minutes → decouple scheduling from execution with a queue. The hard part is coordination/fault-tolerance, not data volume.

**API** — POST /jobs (task, run_at|cron, payload, max_retries) → job_id; GET /jobs/{id}; DELETE to cancel.

**Data model** — Job{job_id, task_type, payload, status, run_at/next_run_at, cron, retries, max_retries, lease_owner, lease_expires_at}. Durable DB so nothing is lost; index next_run_at for cheap "due now" range scans; lease fields to detect/reclaim dead-worker jobs.

**High-level** — client → API → durable job store; a scheduler/poller finds jobs with next_run_at ≤ now and enqueues them onto a durable queue (Kafka/SQS); a worker pool consumes, acquires a lease, executes, updates status, retries or reschedules. Decoupling keeps long jobs from stalling scheduling and lets workers scale independently.

**Deep dive — reliability + no double-run:** worker crash mid-job → leases (visibility timeouts) + heartbeats; a live worker extends its lease, a dead one's lease expires and a reaper (or queue redelivery) returns the job → at-least-once execution (never lost). Because that allows a job to run twice (finish-then-crash-before-ack, or lease expiry while still running), tasks must be idempotent (idempotency key/dedup); exactly-once delivery is effectively impossible. One worker per job via atomic compare-and-set lease acquisition (UPDATE ... WHERE status='queued') or the queue's single-consumer visibility semantics.

**Extension — scale + timeliness:** remove the single-scheduler SPOF/bottleneck by sharding jobs (by id or time bucket) across scheduler instances with leader election (ZooKeeper/etcd) for per-shard failover; index next_run_at. For precise near-term firing, a two-tier design: durable DB for the long tail + an in-memory timing wheel / priority queue for imminent jobs so they fire on time without constantly polling the DB. Recurring jobs recompute next_run_at from the cron expression on completion and re-insert (decide skip vs backfill for missed windows).

**Failures/retries** — increment retries, requeue with exponential backoff; after max_retries move to a dead-letter queue; distinguish transient vs permanent errors.

**Trade-offs:** at-least-once + idempotency over unattainable exactly-once; sharding/leader election adds coordination but removes SPOF; timing wheel adds complexity for precise timeliness.

**One-line summary:** a durable next_run_at-indexed job store feeding a sharded, leader-elected scheduler that enqueues due jobs to a queue for a worker pool, made crash-safe by leases + heartbeats + a reaper (at-least-once) with idempotent tasks preventing double-run, plus a timing wheel for precise near-term firing.
`,
    },
  ],
}
