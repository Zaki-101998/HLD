export default {
  id: 'cdn',
  title: 'CDNs & Edge Computing',
  subtitle: 'Push vs pull, cache keys, what’s cacheable, and designing with the edge',
  days: 2,
  content: `
## Why this matters for system design

Any design with images, video, static assets, or a global audience needs a CDN in the first minute of your answer — and the estimation drills already showed why (YouTube: ~99% of 500 Tbps must come from the edge). This topic makes sure you can go deeper than "add a CDN" when the interviewer pushes.

## What a CDN is

A **Content Delivery Network** is a planet-wide fleet of caching reverse proxies ("edge servers" at **PoPs** — points of presence) placed near users. Users reach the nearest PoP (via anycast or GeoDNS — Phase 0 machinery), which serves cached content directly or fetches from your **origin** on a miss.

What it buys you:

1. **Latency:** content from 20 ms away instead of 200 ms — physics, solved by moving the content.
2. **Origin offload:** 95–99% of asset traffic never reaches your servers (your bandwidth bill and fleet shrink accordingly).
3. **Availability:** many PoPs can serve stale content even while your origin is down.
4. **DDoS absorption:** attack traffic distributes across the CDN's enormous capacity (Tbps-scale) instead of concentrating on you.

## Pull vs push

**Pull (origin pull) — the default:** edge caches on first request (miss → fetch origin → cache → serve). Lazy, zero ops effort; first user per region eats the miss.

**Push:** you upload content to the CDN/edge storage ahead of traffic. For: video releases, game patches, big launches — anything where a synchronized miss-storm at release time would crush the origin. (Modern practice is often "pull + pre-warming": issue requests to edges before launch.)

Interview line: "pull by default; pre-warm/push for predictable launches."

## The cache key & TTL mechanics

An edge caches by **cache key** — typically \`host + path (+ selected query params/headers)\`.

- **Versioned URLs are the pro move:** \`app.js?v=3\` or content-hashed filenames (\`app.9f8a2c.js\`) let you set TTL = 1 year AND deploy instantly (new content = new URL = guaranteed miss). "Cache forever, change the name" beats invalidation every time.
- \`Cache-Control\` headers drive behavior: \`max-age\` (browser), \`s-maxage\` (CDN), \`stale-while-revalidate\` (serve stale while refreshing — stampede protection built into HTTP!), \`private\`/\`no-store\` (never cache).
- **Purge/invalidation API:** for the "we shipped a bad image" case — but purges are slow-ish and rate-limited; versioned URLs avoid needing them.

## What can you cache? (further than most candidates think)

| Content | Cacheable? | Notes |
|---|---|---|
| Static assets (JS/CSS/images/fonts) | ✅ trivially | Hashed filenames, TTL 1y |
| Video segments (HLS/DASH chunks) | ✅ — THE CDN workload | Small files (2–10 s chunks), immutable |
| Public API responses (product page, trending list) | ✅ with short TTLs (5–60 s) | Massive origin relief for hot reads |
| Personalized pages (your feed) | ⚠️ split it | Cache the shell + public fragments; fetch personal data via API |
| Authenticated/private data | ❌ at shared edges | \`Cache-Control: private\`; beware caching with auth-header keys |
| Writes / POST | ❌ | Though the request still ENTERS via the CDN's network (faster TLS + optimized backbone to origin) |

That "cache public API reads for 10 s" trick is criminally underused in interviews: 10 s of TTL at 100k QPS = origin sees ~0.1 QPS per key.

## Edge compute (one level deeper)

Modern CDNs run code at PoPs (Cloudflare Workers, Lambda@Edge): auth-token checks, A/B routing, header rewrites, geo-blocking — before origin. Mention it when: rejecting unauthenticated traffic early, or per-region compliance routing. Don't over-index; one sentence suffices in most answers.

## Failure & consistency notes

- CDN caches are **eventually consistent by design** (TTL-bounded staleness). Never serve *account balances* from shared edge cache.
- **Serve-stale-on-origin-error** (\`stale-if-error\`): a strong availability trick — the site "stays up" through origin outages for cacheable content.
- Multi-CDN (two providers + DNS/anycast steering) is the availability endgame for giants; know the term.

## How this shows up in interviews

- Media designs (YouTube/Instagram/Netflix): CDN carries ~all bytes; origin = object storage behind it; pre-warm for premieres; per-title/per-segment cache keys.
- Global read-heavy APIs: short-TTL edge caching as the first scaling lever — before adding servers.
- News-feed style: split cacheable shell vs personal payload.
- Estimation: any Tbps-scale delivery answer that lacks a CDN is wrong by construction.
`,
  resources: [
    {
      title: 'What is a CDN and how does it work?',
      url: 'https://www.youtube.com/watch?v=RI9np1LWzqw',
      type: 'video',
      source: 'ByteByteGo (YouTube)',
    },
    {
      title: 'What is a CDN?',
      url: 'https://www.cloudflare.com/learning/cdn/what-is-a-cdn/',
      type: 'article',
      source: 'Cloudflare Learning Center',
    },
    {
      title: 'Caching best practices & Cache-Control',
      url: 'https://web.dev/articles/http-cache',
      type: 'article',
      source: 'web.dev (Google)',
    },
    {
      title: 'Content Delivery Network (CDN)',
      url: 'https://algomaster.io/learn/system-design/content-delivery-network-cdn',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
    {
      title: 'Design a Content Delivery Network (CDN)',
      url: 'https://www.youtube.com/watch?v=8zX0rue2Hic',
      type: 'video',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
  ],
  challenges: [
    {
      type: 'quiz',
      id: 'quiz-1',
      title: 'CDN & edge check',
      questions: [
        {
          q: 'Your JS bundle is cached at the CDN with TTL=1 year, but you deploy daily. How do users get new code within minutes of deploy?',
          options: [
            'Purge the whole CDN daily',
            'Content-hashed filenames (app.9f8a2c.js): each deploy references a NEW URL, so long TTLs and instant updates coexist',
            'Set TTL to 5 minutes instead',
            'Disable CDN caching for JS',
          ],
          answer: 1,
          explanation:
            '"Cache forever, change the name." The HTML (short TTL) references the hashed asset; new deploy → new hash → guaranteed fresh fetch. This pattern removes the invalidation problem entirely for static assets.',
        },
        {
          q: 'A product-listing API endpoint gets 80k QPS of identical requests for trending items. Cheapest massive win?',
          options: [
            'Add 50 more app servers',
            'Edge-cache the endpoint with a 10–30 s TTL (+ stale-while-revalidate) — origin load drops ~10,000×',
            'Shard the database',
            'Move to gRPC',
          ],
          answer: 1,
          explanation:
            'Public, identical-for-everyone reads with a small staleness budget are CDN gold. 30 s TTL at 80k QPS ≈ the origin computes each response once per 30 s. Most candidates only cache "static assets" — going further is a differentiator.',
        },
        {
          q: 'Why must a video platform use PUSH/pre-warming for a blockbuster premiere rather than plain pull?',
          options: [
            'Pull CDNs cannot serve video',
            'At release moment, millions of synchronized first-requests would all MISS simultaneously and stampede the origin — pre-placing content absorbs the spike at the edge',
            'Push is cheaper per GB',
            'Licensing requires it',
          ],
          answer: 1,
          explanation:
            'Pull caching works when misses trickle; premieres synchronize them (a global stampede — same pathology as the caching topic, at CDN scale). Pre-warm edges before the countdown hits zero.',
        },
        {
          q: 'Which content must NOT be cached at shared CDN edges?',
          options: [
            'HLS video segments',
            'Font files',
            'Authenticated personal data like account balances (Cache-Control: private / no-store)',
            'Product images',
          ],
          answer: 2,
          explanation:
            'A shared cache serving user A’s private data to user B is a security incident (and has happened via missing "private" directives). Personal data rides API calls; the edge caches the shell and public fragments.',
        },
        {
          q: 'Your origin goes down for 10 minutes. Which CDN feature keeps the site apparently up?',
          options: [
            'Anycast',
            'stale-if-error / serve-stale: edges keep serving expired cached copies while the origin is unreachable',
            'Push distribution',
            'Edge computing',
          ],
          answer: 1,
          explanation:
            'For cacheable content, TTL expiry + dead origin doesn’t have to mean errors — serving stale is almost always better than serving nothing. An availability trick worth one sentence in most designs.',
        },
        {
          q: 'A user in Jakarta requests an image no one in Asia has requested before. What actually happens (pull CDN)?',
          options: [
            'The request fails until content is pushed',
            'Jakarta PoP misses → (often via a regional mid-tier cache) → fetches from origin → caches locally → serves; subsequent Asian users get edge hits',
            'The user is redirected to a US URL',
            'The origin serves the user directly forever after',
          ],
          answer: 1,
          explanation:
            'First-request-per-region pays the miss (origin latency once); everyone after rides the edge. Big CDNs add a mid-tier ("origin shield") so a miss in 100 PoPs still hits origin roughly once.',
        },
      ],
    },
    {
      type: 'lab',
      id: 'lab-1',
      title: 'Catch CDNs red-handed',
      intro: 'Real CDN cache hits/misses are visible in response headers. Let’s go looking.',
      steps: [
        {
          instruction: 'Fetch a Wikipedia page twice and read its CDN headers.',
          command: 'curl -sI https://en.wikipedia.org/wiki/Computer_network | grep -iE "x-cache|age|server|cache-control"',
          expected: 'x-cache showing hit/miss and a cp#### (Wikipedia edge PoP) name, an Age header (seconds in cache), and cache-control policy.',
        },
        {
          instruction: 'Check which PoP city is serving YOU (Cloudflare publishes it).',
          command: 'curl -s https://www.cloudflare.com/cdn-cgi/trace | grep -E "colo|loc"',
          expected: 'colo=XXX — a 3-letter airport code of the edge datacenter you hit. That is why it is fast.',
        },
        {
          instruction: 'Compare latency: your nearest edge vs a far origin.',
          command: `curl -so /dev/null -w 'cloudflare edge: %{time_total}s\\n' https://www.cloudflare.com/ && curl -so /dev/null -w 'far origin:      %{time_total}s\\n' https://www.parliament.nz/`,
          expected: 'Edge typically several times faster. Distance = latency; CDN = shorter distance.',
        },
        {
          instruction: 'Find content-hashed assets in the wild: load any big site, devtools → Network → JS. Look at filenames and Cache-Control.',
          expected: 'Names like main.a3f8b2.js with cache-control: max-age=31536000, immutable — the "cache forever, change the name" pattern everywhere.',
        },
        {
          instruction: 'See an Age header climb: request the same static asset twice, 30s apart.',
          command: 'curl -sI https://upload.wikimedia.org/wikipedia/commons/6/63/Wikipedia-logo.png | grep -i age; sleep 30; curl -sI https://upload.wikimedia.org/wikipedia/commons/6/63/Wikipedia-logo.png | grep -i age',
          expected: 'Age increases — the same cached copy, sitting at the edge, getting older. (If it resets, you hit a different PoP server — also instructive!)',
        },
      ],
    },
    {
      type: 'estimation',
      id: 'est-1',
      title: 'Estimation drill: CDN economics for a photo app',
      problem: `
A photo-sharing app: 100M DAU, each views 200 photos/day at ~150 KB average (thumbnails + full views blended). Peak = 3× average. CDN hit rate 97%.

1. Average and peak photo-delivery bandwidth (Gbps)?
2. Origin egress bandwidth at peak (the 3% misses)?
3. At $0.02/GB CDN vs $0.08/GB origin egress, rough monthly delivery cost with CDN — and what it would be origin-only?
4. What single number in this problem is the most valuable to improve, and how?
`,
      hints: [
        '100e6 × 200 × 150e3 bytes/day ÷ 1e5 s; ×8 for bits.',
        'Origin = total × 3%.',
        'Monthly GB = daily bytes × 30.',
      ],
      solution: `
**1.** 100e6 × 200 × 150e3 = 3e15 B/day = 3 PB/day → ÷1e5 s = 30 GB/s ≈ **240 Gbps average → ~720 Gbps peak**. (Instantly justifies "CDN mandatory".)

**2.** Origin at peak: 3% × 720 ≈ **~22 Gbps** — large but servable from object storage + origin-shield tier.

**3.** Monthly volume ≈ 3 PB × 30 = 90 PB ≈ 9e7 GB.
- With CDN: 9e7 × 0.02 ≈ **$1.8M/month** (plus 3% × 0.08 ≈ $0.2M origin) ≈ $2M.
- Origin-only: 9e7 × 0.08 ≈ **$7.2M/month** — and an origin fleet that must serve 720 Gbps. CDN saves ~$5M/month AND makes the architecture feasible.

**4. Bytes per view.** Bandwidth = views × bytes; 150 KB → 60 KB via aggressive WebP/AVIF + right-sized thumbnails cuts every number above by ~60% (≈$1M+/month). Compression/format optimization is the highest-leverage lever in media systems — a very senior thing to point at unprompted. (Hit rate 97→99% is the runner-up: origin load drops 3×.)
`,
    },
  ],
}
