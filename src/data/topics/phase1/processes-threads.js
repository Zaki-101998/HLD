export default {
  id: 'processes-threads',
  title: 'Processes & Threads',
  subtitle: 'What actually runs your code — context switching, scheduling, and why it matters at scale',
  days: 3,
  content: `
## Why this matters for system design

"How many requests can one server handle?" is the question underneath *every* capacity estimate you'll make. The answer depends on how servers use processes and threads. This topic also explains real architecture choices: why nginx beats Apache at 10k connections, why Node.js is single-threaded yet fast, and why Python services run "one process per core".

## Process vs thread

A **process** is a running program with its own private memory space (address space), file descriptors, and at least one thread. A **thread** is an execution unit *inside* a process — its own stack and instruction pointer, but **sharing the process's memory** with sibling threads.

| | Process | Thread |
|---|---|---|
| Memory | Isolated | Shared with siblings |
| Creation cost | Heavy (ms, MBs) | Light (µs, ~KBs–MB stack) |
| Communication | IPC: pipes, sockets, shared mem | Just read/write shared variables |
| One crashes | Others unaffected | Whole process dies |
| Safety | Isolation by default | Data races by default |

**The trade in one line:** processes give you *isolation* (safe, expensive), threads give you *sharing* (fast, dangerous). This same trade-off reappears at cluster scale: microservices (isolated processes across machines) vs modules in a monolith (shared memory).

Two processes never share memory; two threads in the same process share almost everything except their own stack:

\`\`\`mermaid
flowchart TD
  subgraph P1["Process A"]
    H1["Heap (private)"]
    C1["Code + globals (private)"]
    S1["Stack"]
  end
  subgraph P2["Process B"]
    H2["Heap (shared by T1, T2)"]
    C2["Code + globals (shared)"]
    S2a["Stack — T1"]
    S2b["Stack — T2"]
  end
\`\`\`

## Context switching — the hidden tax

One CPU core runs one thread at a time. The OS **scheduler** rapidly rotates runnable threads (preemptive multitasking, time slices of a few ms). Each **context switch** — save registers, swap memory mappings, flush CPU caches — costs roughly **1–10 µs** directly, and often more indirectly because CPU caches are now cold.

Why you care:

- 10,000 threads ≠ 10,000× throughput. Beyond a point, the CPU spends its time *switching* rather than *working* (thrashing).
- This is the core argument for **thread pools** (bounded worker sets) and **event loops** (one thread, no switching).

## CPU-bound vs I/O-bound — the most important classification

- **CPU-bound** work (video encoding, ML inference, compression): the thread genuinely uses the core. More threads than cores adds nothing but switching overhead. Scale with **more cores/machines**.
- **I/O-bound** work (typical web request: wait on DB, wait on cache, wait on another API): the thread spends 95%+ of its time *blocked*, using no CPU. One core can juggle **thousands** of concurrent I/O-bound requests — *if* your concurrency model doesn't burn a whole thread per waiting request.

> A typical API request: 1 ms of CPU + 50 ms waiting on the database. While one request waits, the core could serve 50 others. Concurrency models differ in how cheaply they exploit that gap.

## The three server concurrency models

1. **Process/thread per connection** (classic Apache, many Java servers): simple mental model; each connection gets a worker that may block freely. Cost: memory per thread (~1 MB stack) + switching. Struggles near ~10k connections (**the C10K problem**).
2. **Event loop** (nginx, Node.js, Redis): ONE thread + non-blocking I/O + an OS notification mechanism (epoll/kqueue). Handles 100k+ connections in one process. Rule: **never block the loop** — one slow synchronous call stalls *every* connection. CPU-heavy work must be offloaded.
3. **Hybrid** (Go, modern Java virtual threads): millions of ultra-light user-space threads (goroutines, ~KB stacks) multiplexed by a runtime scheduler onto a few OS threads. You write simple blocking-style code; the runtime does event-loop magic underneath.

**Redis is single-threaded** (for command execution) and still does ~100k+ ops/sec — because every operation is in-memory (no I/O wait) and there's zero locking or context-switch overhead. Interviewers love asking why.

## Little's Law — concurrency you can calculate

\`concurrency = throughput × latency\`

At 1,000 req/s with 50 ms average latency, you have 1000 × 0.05 = **50 requests in flight** on average. That number tells you how many workers/threads/connections you need — you'll reuse this constantly in estimation drills.

## How this shows up in interviews

- Capacity: "each app server handles ~X concurrent requests" — justify X via I/O-bound + Little's Law, not hand-waving.
- "Why is Node/nginx fast?" → event loop avoids per-connection threads.
- "Where does this design need a worker pool?" → CPU-heavy tasks (thumbnails, encoding) go to a separate fleet so they never block request threads — the seed of the async-worker pattern you'll use in Phase 2.
`,
  resources: [
    {
      title: 'Process vs Thread',
      url: 'https://www.youtube.com/watch?v=4rLW7zg21gI',
      type: 'video',
      source: 'ByteByteGo (YouTube)',
    },
    {
      title: 'Processes and Threads (OSTEP, free book chapter)',
      url: 'https://pages.cs.wisc.edu/~remzi/OSTEP/intro.pdf',
      type: 'doc',
      source: 'Operating Systems: Three Easy Pieces',
    },
    {
      title: 'What is the C10K problem?',
      url: 'http://www.kegel.com/c10k.html',
      type: 'article',
      source: 'Dan Kegel (classic)',
    },
  ],
  challenges: [
    {
      type: 'quiz',
      id: 'quiz-1',
      title: 'Execution model check',
      questions: [
        {
          q: 'Your API spends 2 ms on CPU and 78 ms waiting for the database per request. This workload is…',
          options: [
            'CPU-bound — add cores',
            'I/O-bound — one core can serve many concurrent requests if threads aren’t wasted on waiting',
            'Memory-bound',
            'Impossible to serve concurrently',
          ],
          answer: 1,
          explanation:
            '97% of request time is waiting. With async I/O or enough cheap threads, a single core can interleave dozens of such requests. Recognizing I/O-bound vs CPU-bound decides your whole scaling story.',
        },
        {
          q: 'Why does Redis achieve 100k+ ops/sec on a single thread?',
          options: [
            'It secretly uses many threads',
            'All data is in memory (no I/O waits per op) and a single thread means zero locks and zero context switches',
            'It uses UDP',
            'It batches every operation to disk',
          ],
          answer: 1,
          explanation:
            'Each command is a microsecond-scale memory operation. With nothing to wait for, one thread on one core is optimal — adding threads would only add locking and switching overhead. (Network I/O is multiplexed via an event loop.)',
        },
        {
          q: 'A Node.js service handles 5k concurrent connections fine, but one endpoint computes a large report synchronously and EVERYTHING freezes during it. Why?',
          options: [
            'Node ran out of memory',
            'The event loop is single-threaded: a CPU-bound synchronous task blocks processing for every connection until it finishes',
            'The OS scheduler crashed',
            'Too many sockets were open',
          ],
          answer: 1,
          explanation:
            'Event loops interleave WAITING, not COMPUTING. CPU-heavy work must move off-loop (worker threads, a job queue, a separate service) — the same reason your future designs push heavy work to async workers.',
        },
        {
          q: 'Little’s Law: your service gets 2,000 req/s and each takes 100 ms. Average requests in flight?',
          options: ['20', '200', '2,000', '200,000'],
          answer: 1,
          explanation:
            'Concurrency = throughput × latency = 2000 × 0.1 = 200. That’s the number of simultaneous workers/slots you must provision — a two-second calculation worth doing in every interview.',
        },
        {
          q: 'Threads in one process vs separate processes: which is TRUE?',
          options: [
            'Threads have isolated memory; processes share memory',
            'A crashing thread takes down its whole process; a crashing process leaves others running',
            'Processes are cheaper to create than threads',
            'Threads cannot run in parallel on multiple cores',
          ],
          answer: 1,
          explanation:
            'Threads share one address space — one segfault kills them all. Process isolation contains failures, which is why browsers run tabs as processes and why service isolation at cluster level echoes the same principle.',
        },
        {
          q: 'Why don’t we just spawn 100,000 OS threads for 100,000 connections?',
          options: [
            'The OS caps threads at 1,024',
            '~1MB stack each ≈ 100GB of memory, plus scheduler overhead and context-switch thrashing',
            'Threads cannot do network I/O',
            'It would work fine, servers just don’t try',
          ],
          answer: 1,
          explanation:
            'Per-thread memory and switching costs make thread-per-connection collapse around 10k (C10K). Event loops (nginx) or lightweight user-space threads (Go) exist precisely to break this wall.',
        },
        {
          q: 'A video platform needs to generate thumbnails for uploads. Where should this run?',
          options: [
            'Inline in the upload request handler',
            'In a separate worker pool/service sized to CPU cores, fed by a queue — CPU-bound work must not occupy request-serving threads',
            'In the database',
            'On the client only',
          ],
          answer: 1,
          explanation:
            'Mixing CPU-bound work into an I/O-bound request fleet destroys its concurrency. Enqueue the job, return 202, process on a dedicated fleet — the async-worker pattern you’ll formalize in Phase 2.',
        },
      ],
    },
    {
      type: 'lab',
      id: 'lab-1',
      title: 'Watch your OS juggle processes',
      intro: 'Every command works on stock macOS.',
      steps: [
        {
          instruction: 'Count the processes and threads running right now on your "idle" machine.',
          command: 'ps -ax | wc -l && ps -axM | wc -l',
          expected: 'Hundreds of processes, thousands of threads — the scheduler juggles all of them across your handful of cores.',
        },
        {
          instruction: 'Find how many threads a single app uses (Chrome or any browser).',
          command: 'ps -axM | grep -i chrome | wc -l',
          expected: 'Often 300–800+ threads across dozens of processes — process-per-tab isolation plus thread pools inside each.',
        },
        {
          instruction: 'Watch context switches happen live: run top, press "i" if needed, and observe CSW (context switches) counters.',
          command: 'top -l 2 -n 5 -stats pid,command,cpu,th,csw | tail -8',
          expected: 'The csw column: even quiet processes accumulate thousands of switches.',
        },
        {
          instruction: 'Prove the difference between CPU-bound parallelism and thread overhead: time a CPU task with 1 vs 8 parallel processes.',
          command: `time python3 -c "
import multiprocessing as mp
def burn(_):
    s=0
    for i in range(10**7): s+=i
    return s
with mp.Pool(8) as p: p.map(burn, range(8))
"`,
          expected: 'Roughly the time of ONE loop (they ran on 8 cores in parallel). Change Pool(8) to Pool(1): ~8× slower. Cores = real parallelism for CPU-bound work.',
        },
        {
          instruction: 'Apply Little’s Law to something real: estimate concurrency for a service you know (e.g. 500 req/s at 80 ms). Write the number down.',
          expected: '500 × 0.08 = 40 in-flight requests → a pool of ~50 workers with headroom. You just did a capacity plan.',
        },
      ],
    },
  ],
}
