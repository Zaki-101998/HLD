export default {
  id: 'rate-limiting',
  title: 'Rate Limiting',
  subtitle: 'Token bucket, sliding windows, distributed limiter design — a complete mini system design',
  days: 2,
  content: `
## Why this matters for system design

Rate limiting is doubly valuable: it appears *inside* every design (protecting APIs, login endpoints, per-tenant fairness), and "design a rate limiter" is itself a classic standalone interview question (it'll be your Phase 4 warm-up). Learn the four algorithms cold — this is one of the few topics where interviewers ask for specifics by name.

## Why limit at all

- **Protection:** one buggy/malicious client can't take down the service (a for-loop calling your API is an accidental DoS).
- **Fairness:** multi-tenant systems give each tenant their contracted share.
- **Cost control:** every request costs compute; paid tiers = rate tiers.
- **Security:** brute-force login, OTP spam, scraping.

Semantics: exceeding the limit → **429 Too Many Requests** + \`Retry-After\` header + \`X-RateLimit-Remaining\`-style headers (you saw GitHub's in the API lab). Decide *shed vs queue*: user-facing APIs shed (429); internal pipelines often queue (backpressure instead).

## The four algorithms

### 1. Fixed window counter
Counter per \`(client, window)\`: \`INCR user42:12:05\`; reject if > limit.
✅ Trivial, O(1) memory. ❌ **Boundary burst:** 100 at 12:04:59 + 100 at 12:05:01 = 200 in 2 seconds — double the intended rate.

### 2. Sliding window log
Store a timestamp per request; count entries in the last 60 s.
✅ Exact. ❌ Memory per request (a sorted set of every hit) — expensive at high limits.

### 3. Sliding window counter (approximation)
Two adjacent fixed windows, weighted: \`count = current + previous × overlap%\`.
✅ O(1) memory, smooths the boundary problem. Slight approximation (assumes even distribution in previous window). **The pragmatic production default.**

### 4. Token bucket ★ (the one to know best)
Bucket of capacity **B** tokens, refilled at rate **r**/second; each request takes a token; empty bucket → reject.
- **Steady rate r with bursts up to B** — matches real traffic (humans are bursty). "r=10/s, B=100" allows a 100-request spike, then 10/s sustained.
- O(1) memory (just \`tokens, last_refill\`), lazy refill on access: \`tokens = min(B, tokens + (now-last)*r)\`.

\`\`\`mermaid
flowchart TD
  Refill["Refill r tokens/sec, up to capacity B"] --> Bucket["Bucket"]
  Req["Request arrives"] --> Check{"Token available?"}
  Bucket --> Check
  Check -->|"yes — take a token"| Allow["Allow request"]
  Check -->|"no"| Reject["429 Too Many Requests"]
\`\`\`
- Cousin: **leaky bucket** — a queue drained at constant rate; smooths *output* (used for shaping/pacing, e.g. request pacing to a fragile downstream).

Interview answer for "which algorithm?": **token bucket** for its burst-friendliness, or sliding-window counter for strict windows; name the boundary flaw of fixed windows either way.

## Distributed rate limiting — where it becomes a system design

One limiter process is easy; 50 API gateways sharing "100 req/min per user" is the real question.

**Central store (Redis) — the standard answer:**
Every gateway does \`INCR + EXPIRE\` (or a token-bucket **Lua script** — atomic read-modify-write on the server, killing the race from your concurrency topic) against Redis, keyed \`ratelimit:{user}\`.
- Latency: +0.5 ms per request (same-DC Redis — your latency numbers).
- Scale: shard keys across a Redis cluster (consistent hashing — users distribute evenly).
- **Failure mode — decide and say it:** Redis down → **fail open** (allow; availability over protection) for product APIs, **fail closed** for security-sensitive endpoints (login). This trade-off statement is a reliable interviewer checkbox.

**Local + sync (the scale answer):** each gateway keeps local buckets and syncs asynchronously (or gets quota leases from a coordinator: "here's 1000 tokens, come back when done"). Slight over-admission possible during sync gaps — acceptable; limits are protective, not billing-grade. Cloudflare-scale systems work this way.

**Layering:** limit at the edge/gateway (cheapest rejection point — proxies topic), possibly again per-service for internal fairness.

## Design dimensions to name

- **Key:** per-user (authenticated), per-IP (anonymous — beware NAT: one IP = a whole office; beware botnets: many IPs), per-API-key, per-tenant, or global (protect a fragile downstream).
- **Granularity:** per-endpoint costs (search = 10 tokens, read = 1) — cost-based buckets.
- **Tiers:** free = 100/min, pro = 10k/min → limit config lives in a fast lookup (cached).
- **Response contract:** 429 + Retry-After + remaining-quota headers; clients implement backoff (resiliency topic will formalize retry etiquette).

## How this shows up in interviews

- Standalone: "design a rate limiter" → algorithms → distributed store → failure mode → headers. (You'll do exactly this in Phase 4.)
- Inline: one sentence in every design — "the gateway rate-limits per user/IP (token bucket in Redis, fail-open)".
- Security flows: login/OTP endpoints get strict, fail-closed limits.
`,
  resources: [
    {
      title: 'Rate limiting algorithms explained',
      url: 'https://www.youtube.com/watch?v=FU4WlwfS3G0',
      type: 'video',
      source: 'ByteByteGo (YouTube)',
    },
    {
      title: 'How we built rate limiting capable of scaling to millions of domains',
      url: 'https://blog.cloudflare.com/counting-things-a-lot-of-different-things/',
      type: 'article',
      source: 'Cloudflare Engineering',
    },
    {
      title: 'Scaling your API with rate limiters (token bucket in production)',
      url: 'https://stripe.com/blog/rate-limiters',
      type: 'article',
      source: 'Stripe Engineering',
    },
    {
      title: 'Rate Limiting Algorithms Explained (with code)',
      url: 'https://blog.algomaster.io/p/rate-limiting-algorithms-explained-with-code',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
  ],
  challenges: [
    {
      type: 'quiz',
      id: 'quiz-1',
      title: 'Rate limiting check',
      questions: [
        {
          q: 'A fixed-window limit of 100/min lets a client send 200 requests in 2 seconds. How?',
          options: [
            'A bug in the counter',
            '100 requests at the end of one window + 100 at the start of the next: the boundary-burst flaw fixed by sliding windows or token buckets',
            'The client used two IPs',
            'Fixed windows cannot enforce limits at all',
          ],
          answer: 1,
          explanation:
            'Windows reset abruptly; straddling the boundary doubles the effective rate. This flaw IS the standard interview probe on fixed windows — name it before they ask.',
        },
        {
          q: 'Why is token bucket usually preferred for user-facing APIs?',
          options: [
            'It is the simplest to implement',
            'It permits short bursts (bucket capacity) while enforcing the sustained rate (refill) — matching naturally bursty human/client traffic',
            'It requires no storage',
            'It guarantees exactly-once delivery',
          ],
          answer: 1,
          explanation:
            'A page load fires 20 requests at once; strict windows would punish that. B=burst allowance, r=steady rate. Two parameters, O(1) state, lazy refill — the pragmatic sweet spot.',
        },
        {
          q: '50 gateways enforce a shared 100/min per user via Redis INCR. What makes the check-and-increment safe under concurrency?',
          options: [
            'Redis is single-threaded, and atomic commands/Lua scripts make read-modify-write one indivisible operation',
            'Gateways take turns',
            'TCP ordering',
            'It is not safe; distributed limits are approximate by definition',
          ],
          answer: 0,
          explanation:
            'Redis executes each command (or Lua script) atomically on its single thread — the same "one owner serializes access" idea from the concurrency topic. INCR-then-check has no interleaving window.',
        },
        {
          q: 'Redis (the limiter store) goes down. For the general product API, the defensible default is…',
          options: [
            'Fail closed: reject all traffic until Redis recovers',
            'Fail open: allow traffic unlimited temporarily — availability beats protection for product endpoints (but fail CLOSED for login/OTP)',
            'Queue all requests',
            'Switch to per-gateway local limits of zero',
          ],
          answer: 1,
          explanation:
            'Blocking every user because the LIMITER died inverts the priority — the limiter exists to protect availability. Security endpoints flip the calculus (brute-force risk). Stating both halves is the senior answer.',
        },
        {
          q: 'You rate limit anonymous traffic per-IP. Two opposite failure modes to name:',
          options: [
            'IPv4 vs IPv6',
            'NAT: one office/carrier IP = thousands of legit users sharing a limit; botnets: one attacker = thousands of IPs each under the limit',
            'DNS caching and TTLs',
            'Cookies being disabled',
          ],
          answer: 1,
          explanation:
            'Per-IP is both too strict (CGNAT — Phase 0!) and too lenient (distributed attacks). Mitigations: higher IP limits + per-account limits after auth, device fingerprinting, and WAF/bot-detection for the adversarial tail.',
        },
        {
          q: 'A proper 429 response should include…',
          options: [
            'Only the status code — details help attackers',
            'Retry-After and remaining-quota headers so well-behaved clients can back off intelligently',
            'A CAPTCHA in the body',
            'HTTP 500 instead, to look like an outage',
          ],
          answer: 1,
          explanation:
            'The contract makes good clients cheap to serve (they self-pace) — the point of limiting is shaping behavior, not punishing it. GitHub/Stripe both ship x-ratelimit-* headers; you saw them in the API lab.',
        },
      ],
    },
    {
      type: 'lab',
      id: 'lab-1',
      title: 'Build a real token bucket on Redis',
      intro: 'Implement the two production algorithms in a few lines each, and watch the boundary-burst flaw happen.',
      steps: [
        {
          instruction: 'Fixed window in two commands — and its race-free atomicity.',
          command: 'redis-cli del rl:user42; redis-cli incr rl:user42; redis-cli expire rl:user42 60 nx; redis-cli incr rl:user42; redis-cli get rl:user42',
          expected: 'Counter at 2 with a 60s TTL. Real check: allow iff INCR result ≤ limit. Atomic because Redis serializes commands.',
        },
        {
          instruction: 'Demonstrate boundary burst: 5-second windows, limit 5 — fire 5 at window end + 5 at window start.',
          command: `python3 -c "
import time, subprocess
def hit():
    w = int(time.time()) // 5
    n = int(subprocess.run(['redis-cli','incr',f'rl:w{w}'],capture_output=True,text=True).stdout)
    subprocess.run(['redis-cli','expire',f'rl:w{w}','10'],capture_output=True)
    return n <= 5
time.sleep(5 - time.time() % 5 - 0.4)          # align to just before a boundary
a = sum(hit() for _ in range(5))
time.sleep(0.8)                                 # cross the boundary
b = sum(hit() for _ in range(5))
print(f'{a+b}/10 allowed within ~1.2 seconds — limit was 5 per 5s window')"`,
          expected: '10/10 allowed in about a second — double the intended rate, live. THE fixed-window flaw.',
        },
        {
          instruction: 'Now a real token bucket (atomic via Lua): capacity 5, refill 1/sec.',
          command: `python3 -c "
import time, subprocess
LUA = '''
local key, cap, rate, now = KEYS[1], tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3])
local b = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(b[1]) or cap
local ts = tonumber(b[2]) or now
tokens = math.min(cap, tokens + (now - ts) * rate)
local allowed = 0
if tokens >= 1 then tokens = tokens - 1; allowed = 1 end
redis.call('HMSET', key, 'tokens', tokens, 'ts', now)
redis.call('EXPIRE', key, 60)
return allowed
'''
def hit():
    r = subprocess.run(['redis-cli','eval',LUA,'1','tb:user42','5','1',str(time.time())],capture_output=True,text=True)
    return r.stdout.strip() == '1'
subprocess.run(['redis-cli','del','tb:user42'],capture_output=True)
burst = sum(hit() for _ in range(8))
print(f'instant burst: {burst}/8 allowed (bucket capacity 5)')
time.sleep(2)
print(f'after 2s refill: {sum(hit() for _ in range(3))}/3 allowed (~2 tokens regenerated)')"`,
          expected: 'Burst: exactly 5/8 allowed (capacity). After 2 s: ~2/3 allowed (refill rate). You built Stripe’s limiter.',
        },
        {
          instruction: 'Clean up.',
          command: "redis-cli --scan --pattern 'rl:*' | xargs -r redis-cli del; redis-cli del tb:user42",
          expected: 'Keys removed.',
        },
      ],
    },
    {
      type: 'design',
      id: 'design-1',
      title: 'Design exercise: rate limiting for a public developer API',
      prompt: `
Design rate limiting for a Twilio-like API platform: 100k developer accounts across tiers (free: 10 req/s; pro: 500 req/s; enterprise: custom), 30 gateway nodes, 2M req/s aggregate peak. SMS-send endpoints must NEVER be over-admitted more than ~1% (cost per message!); read endpoints can tolerate ~10% over-admission during failures.

Cover: algorithm, storage architecture at 2M req/s, tier config distribution, failure behavior per endpoint class, and the client-facing contract.
`,
      hints: [
        'Can every one of 2M req/s hit one Redis? Do the math against ~100k ops/s/node.',
        'Two endpoint classes with different over-admission budgets might use two different mechanisms.',
        'Where do tier configs live so gateways don’t query a DB per request?',
      ],
      modelAnswer: `
**Algorithm:** token bucket per (account, endpoint-class) — burst-friendly, O(1) state, cost-based (SMS send = N tokens by destination country if desired).

**Storage at 2M req/s:** one Redis node (~100k ops/s) is 20× short → **Redis cluster sharded by account key** (consistent hashing; accounts spread evenly, ~20–30 shards + replicas). But also cut the load: gateways keep a **local L1 bucket** (say 1/30th of the account's rate each) and only sync to Redis every ~100 ms or on local exhaustion — Redis traffic drops ~10×, adding bounded imprecision.

**Two endpoint classes, two postures:**
- **Read APIs (10% budget):** local-first with async sync; Redis loss → pure local limits (fail open-ish, bounded by per-gateway caps). Cheap, fast, imprecise within budget.
- **SMS send (1% budget):** every request checks the **authoritative Redis bucket synchronously** (atomic Lua); Redis shard unreachable → **fail closed** for that shard's accounts with 503 + Retry-After (over-sending costs real money; a brief refusal is the cheaper error). This split — same platform, different failure postures per endpoint economics — is the answer's centerpiece.

**Tier config:** account→tier map is small (100k rows) — pushed to gateways via config service/pub-sub, cached in memory with version stamps; changes propagate in seconds. No per-request DB lookups.

**Client contract:** 429 + \`Retry-After\`, plus \`X-RateLimit-Limit / -Remaining / -Reset\` on every response; docs prescribe exponential backoff + jitter. Per-account dashboards expose usage (turning limits into a product feature, not just a wall).

**Metrics:** allow/deny rates per tier, Redis latency p99, local-vs-central admission drift (measures your over-admission budget compliance in production).
`,
    },
  ],
}
