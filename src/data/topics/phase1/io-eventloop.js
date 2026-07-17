export default {
  id: 'io-eventloop',
  title: 'I/O, Sockets & the Event Loop',
  subtitle: 'Blocking vs non-blocking I/O, epoll, and how one machine holds 100k connections',
  days: 3,
  content: `
## Why this matters for system design

When you claim "each connection server holds 100k WebSocket connections" in a chat design, this topic is why that's credible. It also completes your OS foundation: you now know what a request *costs* — memory (last topic), CPU & scheduling (processes topic), and now the mechanics of waiting for the network.

## Sockets — the API of networking

A **socket** is the OS handle for one network conversation (one TCP 4-tuple, from Phase 0). To your program it's a **file descriptor (fd)** you \`read()\` and \`write()\`. Server lifecycle:

\`\`\`
listen_fd = socket() → bind(:443) → listen()
loop:
  conn_fd = accept(listen_fd)   # one fd PER client connection
  read(conn_fd) … write(conn_fd) … close(conn_fd)
\`\`\`

Two resource facts with design consequences:

- **fds are finite** (configurable, e.g. 1M) — "too many open files" is a classic production outage.
- Each connection holds **kernel buffers** (~tens of KB) + your app's per-connection state. 100k idle connections ≈ a few GB — fine. The real cost historically was the *concurrency model*, not the sockets.

## Blocking vs non-blocking I/O

**Blocking (default):** \`read()\` puts your thread to sleep until data arrives. Simple code — but the thread is hostage. Serving 10k connections needs 10k threads → the C10K wall from the processes topic.

**Non-blocking:** \`read()\` returns instantly with data or \`EWOULDBLOCK\` ("nothing yet"). Now one thread can *poll* many sockets — but a naive check-everything loop burns CPU asking 100k sockets "anything? anything?".

The missing piece: let the **kernel** tell you which sockets are ready.

## I/O multiplexing — epoll/kqueue

**epoll** (Linux) / **kqueue** (macOS) let one thread say: *"Here are 100,000 fds I care about. Wake me when any have data."*

\`\`\`
epoll_ctl(add, fd1..fd100000)          # register once
loop:
  ready = epoll_wait()                  # sleeps until something happens
  for fd in ready: handle(fd)           # only touch LIVE sockets
\`\`\`

Cost scales with **active** connections, not total connections. 100k mostly-idle chat connections where 500 have new messages → each loop wakes with ~500 events. This is THE mechanism under nginx, Redis, Node.js, HAProxy, and every modern proxy. (Older \`select()\`/\`poll()\` scanned the full list each call — O(n) — and capped fds; that's the pre-C10K world.)

## The event loop, assembled

\`\`\`
one thread:
  events = epoll_wait()
  for each event:
    run its callback / resume its coroutine   ← must be FAST
    issue next non-blocking operation
  repeat
\`\`\`

The same cycle as a loop diagram — nothing here blocks, so one thread keeps spinning through it:

\`\`\`mermaid
flowchart LR
  W["epoll_wait() — sleep until ready"] --> H["handle ready fds — run callbacks"]
  H --> I["issue next non-blocking read/write"]
  I --> W
\`\`\`

- \`async/await\` in Node/Python is exactly this: \`await\` = "register interest, yield to the loop"; the loop resumes your coroutine when epoll signals readiness.
- **The cardinal rule: never block the loop.** One synchronous DB call or heavy computation freezes ALL connections. CPU work → worker pool; blocking libraries → banned.
- Multi-core scaling: run **one event loop per core** (nginx worker processes, Node cluster mode) — combining last topic's "processes for parallelism" with this topic's "event loop for concurrency".

### Concurrency models, final scorecard

| Model | Memory/conn | Complexity | Concurrency ceiling | Used by |
|---|---|---|---|---|
| Thread per connection | ~1 MB (stack) | Low (blocking code) | ~10k | classic Apache, JDBC apps |
| Event loop | ~KBs | Higher (async discipline) | ~100k–1M+ | nginx, Node, Redis |
| Lightweight threads | ~KBs (growable) | Low (looks blocking) | ~1M | Go, Java virtual threads |

## Zero-copy — one more OS trick worth naming

Serving a file the naive way copies bytes: disk → kernel → your app → kernel → NIC. \`sendfile()\` (**zero-copy**) streams disk → NIC inside the kernel, skipping your process entirely. Kafka and CDNs cite zero-copy + page cache as core to their throughput. One sentence about it in a "design a CDN/video server" interview lands well.

## Timeouts — the I/O hygiene rule

Every network call needs a **timeout**; a missing timeout turns a slow dependency into an fd/thread/memory leak and then an outage (threads pile up waiting forever). Defaults in most libraries are infinite or absurdly long. Pair timeouts with retries + backoff (Phase 3's resiliency topic formalizes this).

## Numbers for your notes

- One modern server: **100k–1M concurrent connections** is achievable (WhatsApp famously ran ~2M per box on Erlang).
- Per-connection floor: kernel buffers + app state ≈ **10–100 KB** → 100k conns ≈ 1–10 GB RAM.
- epoll wakeups cost per **active** event, so idle-heavy workloads (chat, notifications) are nearly free to hold open.

## How this shows up in interviews

- Chat/notification designs: "connection gateway nodes — event-loop servers, ~100k conns each, so 10M concurrent users ≈ 100 nodes."
- "Why nginx in front of everything?" — event-loop model absorbs slow clients cheaply, shielding thread-based app servers.
- Any latency conversation: name the timeout on every arrow you draw.
`,
  resources: [
    {
      title: 'The Node.js Event Loop explained',
      url: 'https://www.youtube.com/watch?v=8aGhZQkoFbQ',
      type: 'video',
      source: 'Philip Roberts, JSConf (classic talk)',
    },
    {
      title: 'epoll and why async beats threads for I/O',
      url: 'https://www.youtube.com/watch?v=oCgHXtOo9NU',
      type: 'video',
      source: 'Hussein Nasser (YouTube)',
    },
    {
      title: 'The C10K problem (original essay)',
      url: 'http://www.kegel.com/c10k.html',
      type: 'article',
      source: 'Dan Kegel',
    },
  ],
  challenges: [
    {
      type: 'quiz',
      id: 'quiz-1',
      title: 'I/O model check',
      questions: [
        {
          q: 'nginx serves 100,000 concurrent connections with a handful of worker processes. The key mechanism is…',
          options: [
            'Very fast threads, one per connection',
            'Non-blocking sockets + epoll/kqueue: the kernel wakes one thread only for sockets that have activity',
            'UDP instead of TCP',
            'A larger TCP window',
          ],
          answer: 1,
          explanation:
            'Readiness notification means cost scales with ACTIVE sockets, not total. One event-loop thread per core handles the rest. Thread-per-connection at 100k would need ~100 GB of stacks.',
        },
        {
          q: 'In an event-loop server, a developer adds a synchronous 300 ms image-resize inside a request handler. Result?',
          options: [
            'Only that request is slower',
            'Every connection on that loop freezes for 300 ms — the loop can’t process any other events until the handler returns',
            'The OS moves the work to another core',
            'Nothing, epoll handles it',
          ],
          answer: 1,
          explanation:
            'The loop is one thread; callbacks must be quick. CPU work belongs in a worker pool/queue. This "never block the loop" rule is also why blocking DB drivers are forbidden in Node.',
        },
        {
          q: 'Why does holding 500k mostly-IDLE WebSocket connections cost surprisingly little CPU?',
          options: [
            'Idle TCP connections send keepalives that do the work',
            'epoll_wait sleeps until events occur, so idle sockets cost ~0 CPU — just kernel/app memory per connection',
            'The OS closes idle sockets automatically',
            'WebSockets are UDP-based',
          ],
          answer: 1,
          explanation:
            'Readiness-based multiplexing makes idle connections nearly free (memory only). That’s why chat gateways quote 100k+ connections per node — and why the estimate is credible.',
        },
        {
          q: 'Your service calls a partner API with no timeout. The partner hangs (accepts connections, never responds). What unfolds?',
          options: [
            'Requests fail fast with errors',
            'In-flight requests pile up holding threads/sockets/memory until the service exhausts a resource and falls over — a slow dependency became YOUR outage',
            'The OS times out after 1 second automatically',
            'epoll cancels the requests',
          ],
          answer: 1,
          explanation:
            'Without timeouts, waiting work accumulates without bound. Every network call gets a deadline; pair with retries/backoff and circuit breakers (Phase 3). "No timeout" is a top-3 real-world outage cause.',
        },
        {
          q: 'What is zero-copy (sendfile) and who benefits?',
          options: [
            'RAM that costs nothing',
            'The kernel streams file→NIC directly, skipping copies through user space — big win for static file servers, CDNs, Kafka',
            'A compression algorithm',
            'Copy-on-write for databases',
          ],
          answer: 1,
          explanation:
            'Naive serving copies each byte 3–4× between kernel and app. sendfile keeps it all in-kernel (often DMA-assisted). Combined with the page cache, this is Kafka’s and CDNs’ throughput story.',
        },
        {
          q: 'Go handles 1M concurrent connections with simple blocking-style code. How?',
          options: [
            '1M OS threads',
            'Goroutines: ~KB-stack user-space threads that the runtime multiplexes onto a few OS threads, parking them on I/O via epoll under the hood',
            'It disables the scheduler',
            'Go uses UDP internally',
          ],
          answer: 1,
          explanation:
            'The runtime hides the event loop: when a goroutine "blocks", the runtime swaps it off the OS thread. You get event-loop scalability with thread-style code — the model Java virtual threads adopted too.',
        },
      ],
    },
    {
      type: 'lab',
      id: 'lab-1',
      title: 'Sockets and fds up close',
      intro: 'Inspect real sockets, file descriptors, and an event loop in action.',
      steps: [
        {
          instruction: 'Check your shell’s file-descriptor limit — the ceiling on connections per process.',
          command: 'ulimit -n',
          expected: 'Often 256 (!) on stock macOS shells — production servers raise this to 100k–1M+. Low limits cause "too many open files".',
        },
        {
          instruction: 'Start a tiny server, then count ITS open fds from another terminal.',
          command: 'python3 -m http.server 8000 &\nsleep 1 && lsof -p $! | wc -l && kill %1',
          expected: 'A few dozen fds even idle (binary, libs, the listening socket). Every accepted connection would add one more.',
        },
        {
          instruction: 'Watch kqueue (macOS’s epoll) be the thing your programs sleep in.',
          command: 'lsof -p $(pgrep -x node | head -1) 2>/dev/null | grep -i kqueue || echo "start any node process first (e.g. npm run dev) then rerun"',
          expected: 'A KQUEUE descriptor — the event loop’s wakeup mechanism, live in a real process.',
        },
        {
          instruction: 'Demonstrate blocking-the-loop in miniature: an async server whose one synchronous sleep freezes both clients.',
          command: `python3 - <<'EOF'
import asyncio, time
async def handler(name, delay, block):
    await asyncio.sleep(delay)
    if block:
        print(f'{name}: BLOCKING the loop 2s (sync sleep)'); time.sleep(2)
    else:
        print(f'{name}: yielding politely (await)'); await asyncio.sleep(0.1)
    print(f'{name}: done at {time.strftime("%X")}')
async def main():
    t0=time.time()
    await asyncio.gather(handler('A',0.1,True), handler('B',0.2,False), handler('C',0.2,False))
    print(f'total: {time.time()-t0:.1f}s — B and C waited on A’s sync block')
asyncio.run(main())
EOF`,
          expected: 'B and C finish only AFTER A’s 2-second synchronous sleep — one blocking call froze every "connection" on the loop.',
        },
        {
          instruction: 'Watch the classic event-loop visualization talk (26 min — worth it).',
          command: 'open "https://www.youtube.com/watch?v=8aGhZQkoFbQ"',
          expected: 'After this you can whiteboard the loop: call stack, task queue, and the loop pumping between them.',
        },
      ],
    },
    {
      type: 'estimation',
      id: 'est-1',
      title: 'Estimation drill: size a WebSocket gateway fleet',
      problem: `
Design check for a chat platform:

- 40M concurrent connected users at peak
- Each connection: ~20 KB kernel buffers + ~30 KB app state
- Each user sends/receives ~1 message per 30 s on average (~1 KB each)
- One gateway node: 32 GB RAM (budget 60% for connections), 8 cores; assume a core comfortably processes 50k msg/s of event-loop work

1. Connections per node by the RAM budget?
2. Messages/sec across the fleet, and per node?
3. Nodes needed — which resource binds first, RAM or CPU?
4. Fleet size with 30% headroom, rounded sensibly?
`,
      hints: [
        '50 KB per connection total; 60% of 32 GB is the budget.',
        'Fleet msg/s = 40e6 × 2 (send+receive) / 30.',
        'Compare node capacity by RAM (connections) vs by CPU (messages).',
      ],
      solution: `
**1. RAM-bound connections/node:** budget = 0.6 × 32 GB ≈ 19 GB. 19e9 / 50e3 B ≈ **~380k connections per node** (call it 350k).

**2. Message load:** each user contributes 1 outgoing per 30 s, and each message is also delivered once → ≈ 40e6 × 2 / 30 ≈ **2.7M msg/s fleet-wide**. Per node (if ~115 nodes, see below) ≈ 23k msg/s.

**3. Which binds?** By RAM: 40e6 / 350e3 ≈ **~115 nodes**. By CPU: a node has 8 × 50k = 400k msg/s capacity ≫ 23k needed. **RAM binds first by a wide margin** — typical for chat: connections are many, messages are rare.

**4. With 30% headroom:** 115 × 1.3 ≈ **~150 gateway nodes**.

**Interview delivery:** "Connections are memory-bound at ~350k/node, so ~150 gateways for 40M concurrent — CPU is nowhere near the limit at ~2.7M msg/s fleet-wide." Two clean numbers, one conclusion, ten seconds.
`,
    },
  ],
}
