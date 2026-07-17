export default {
  id: 'web-crawler',
  title: 'Design a Web Crawler',
  subtitle: 'Crawl billions of pages: the BFS frontier, politeness, dedup at scale, and traps',
  days: 2,
  content: `
## The problem

Design a web crawler (like Googlebot): starting from seed URLs, download pages, extract their links, and keep crawling outward to build a corpus (for a search index). At scale it must fetch **billions of pages**, be **polite** to servers, **avoid re-crawling duplicates and traps**, and run continuously. It's a beautiful distributed-systems problem: a giant **graph traversal (BFS)** turned into a pipeline of queues and workers, dominated by **politeness** and **deduplication**.

## Step 1 — Requirements

**Functional:** given seed URLs, fetch pages, extract links, and recursively crawl; store page content; respect **robots.txt**; re-crawl periodically for freshness. *De-scope:* the search-indexing half (that's the Twitter/search topic), JavaScript rendering (mention).

**Non-functional:** **scale** (billions of pages, must be distributed), **politeness** (don't hammer any single site — a hard requirement, not optional), **robustness** (handle bad HTML, timeouts, redirects, crawler traps), **freshness** (re-crawl changing pages), and **efficiency** (don't waste bandwidth re-downloading unchanged/duplicate content).

## Step 2 — Estimation

- Crawl **1B pages/month** → ~**400 pages/sec** average (peak higher). Each page ~100 KB → **100 TB/month** of raw content → object storage, not a DB.
- The **URL frontier** (URLs discovered but not yet crawled) can hold **billions** of URLs → it's a distributed, disk-backed queue, not an in-memory list.
- These numbers force: distributed workers, object storage for pages, and a big external frontier.

## Step 3 — The crawl loop (conceptually)

\`\`\`
seed URLs → [URL Frontier queue] → Fetcher (download) → Parser (extract links + content)
                    ▲                                          │
                    └────── new URLs (after dedup + filters) ──┘
                                          │
                              content → Object Storage
\`\`\`
It's **BFS over the web graph**: the frontier is the BFS queue; each fetched page yields links that (after filtering) go back into the frontier. Everything hard is in the details.

\`\`\`mermaid
flowchart LR
  Frontier["URL Frontier — per-host queues"] --> Fetcher["Fetcher — polite, rate-limited"]
  Fetcher --> Parser["Parser — extract links + content"]
  Parser --> Dedup["Content dedup — hash check"]
  Dedup --> Filter["URL filter — Bloom seen-set + traps"]
  Filter --> Frontier
  Dedup --> Store["Object storage"]
\`\`\`

## Step 4 — Components & data

- **URL Frontier:** the heart — a massive queue of URLs-to-crawl, with **priority** (important/fresh pages first) and **politeness** built in (below).
- **Fetcher workers:** download pages (respecting robots.txt, timeouts, redirects). Horizontally scaled.
- **Parser/extractor:** parse HTML, extract links and text content.
- **Content store:** raw pages in **object storage**; a metadata DB tracks \`url → last_crawled, content_hash, status\`.
- **"Seen URLs" set:** for dedup (below).
- **DNS resolver** (with caching — DNS lookups are a surprising bottleneck at this scale).

## Step 5 & 6 — Deep dives (where this problem lives)

### Deep dive 1 — Politeness (the defining constraint)
You must not overwhelm any single web server (or you'll get IP-banned and you're a bad citizen). Rules:
- **Respect robots.txt** — fetch and cache each domain's crawl rules; honor disallowed paths and crawl-delay.
- **Rate-limit per domain** — e.g. ≤1 request/sec to a given host, regardless of how many URLs from it are queued.
- **Implementation:** the frontier isn't one queue — it's **partitioned by host**, with a **per-host queue** and a scheduler that only releases a URL from a host after its politeness delay has elapsed. A common design: a set of **back queues, one per worker thread, each dedicated to a single host** at a time, fed by a router that maps host → back queue. This guarantees a single host is hit by only one worker at a controlled rate. **Politeness is what makes the frontier complex** — emphasize this.

### Deep dive 2 — Deduplication (avoid crawling/storing the same thing twice)
- **URL dedup:** before adding a URL to the frontier, check a **"seen URLs" set**. With billions of URLs, an exact set is huge → use a **Bloom filter** (Phase 3 probabilistic structures) as a fast, memory-efficient membership test: "probably seen" → skip; "definitely not seen" → add. Accept rare false positives (occasionally skipping a new URL) for massive memory savings — a great callback.
- **Content dedup:** different URLs can serve identical content (mirrors, print vs normal). **Hash the page content** (e.g. a checksum / SimHash for near-duplicates) and skip storing/processing duplicates. Normalize URLs (strip fragments, sort query params, canonicalize) before dedup so trivially-different URLs collapse.

### Deep dive 3 — Crawler traps & robustness
- **Traps:** infinite spaces — calendar pages with "next month" forever, session-id URLs generating infinite variants, deep dynamic link loops. Defenses: **max crawl depth per domain**, **URL-length limits**, **per-domain page caps**, detecting excessive similar URLs, and canonicalization.
- **Robustness:** timeouts on slow servers, handling redirects/loops, malformed HTML, non-HTML content types; retry transient failures with backoff; a **dead-letter** path for persistently failing URLs.

### Deep dive 4 — Freshness & prioritization
- Re-crawl pages based on **change frequency** — news sites hourly, static pages monthly (adaptive: track how often a page's content-hash changes and schedule accordingly). The frontier's **priority** reflects importance (e.g. PageRank-ish) and staleness, so high-value/fresh pages are crawled first.

### Scale & distribution
- **Distributed:** many crawler nodes; **partition the frontier and seen-set by host/URL hash** so work is sharded and each host stays owned by one partition (helps politeness). Object storage scales content horizontally. DNS caching avoids a resolution bottleneck.

## Step 7 — Wrap-up

A web crawler is **distributed BFS over the web graph**: a giant **URL frontier** queue feeds **fetcher** and **parser** workers whose extracted links loop back into the frontier, with pages stored in **object storage**. The two dominating concerns are **politeness** — the frontier is partitioned into **per-host queues** with rate-limiting and robots.txt so no server is overwhelmed — and **deduplication** — a **Bloom filter** "seen URLs" set plus **content hashing** to avoid re-crawling/storing duplicates, after **URL normalization**. Add **trap defenses** (depth/length/page caps, canonicalization), **robustness** (timeouts, retries, redirects), and **adaptive re-crawl** for freshness. Trade-offs: Bloom-filter false positives (rarely skip a new URL) for memory; politeness caps throughput per host; approximate prioritization. The signal is recognizing that **politeness and dedup, not raw fetching, are the hard parts.**

## How this shows up in interviews

- The interviewer is listening for the **URL frontier** as the central component and, crucially, **politeness** (per-host rate limiting + robots.txt via host-partitioned queues) — the constraint that makes the design non-trivial. Lead there.
- Expect **"how do you avoid crawling the same URL/page repeatedly?"** — Bloom filter for URL dedup + content hashing + URL normalization. Naming the Bloom filter is a strong callback.
- Expect **"how do you avoid getting stuck / crawler traps?"** — depth/URL-length/page-cap limits and canonicalization.
- Bonus: framing it as BFS, adaptive re-crawl for freshness, object storage for content, DNS caching, and distributing by host hash.
`,
  resources: [
    {
      title: 'Design a Web Crawler',
      url: 'https://www.youtube.com/watch?v=BKZxZwUgL3Y',
      type: 'video',
      source: 'ByteByteGo',
    },
    {
      title: 'System Design: Web Crawler (frontier, politeness, dedup)',
      url: 'https://www.hellointerview.com/learn/system-design/problem-breakdowns/web-crawler',
      type: 'article',
      source: 'Hello Interview',
    },
    {
      title: 'Crawling at scale — Mercator / IR textbook chapter on crawling',
      url: 'https://nlp.stanford.edu/IR-book/html/htmledition/web-crawling-and-indexes-1.html',
      type: 'doc',
      source: 'Stanford IR Book',
    },
  ],
  challenges: [
    {
      type: 'quiz',
      id: 'quiz-1',
      title: 'Web crawler check',
      questions: [
        {
          q: 'What is "politeness" in a web crawler, and how is it implemented in the URL frontier?',
          options: [
            'Sending friendly headers',
            'Not overwhelming any single web server: respect robots.txt and rate-limit per host (e.g. ≤1 req/s/host). Implemented by partitioning the frontier into per-host queues with a scheduler that releases a host’s URL only after its politeness delay — so one host is hit by one worker at a controlled rate',
            'Crawling only during the day',
            'Asking site owners for permission by email',
          ],
          answer: 1,
          explanation:
            'Politeness is a hard requirement (ignore it and you get IP-banned and harm sites). It’s what makes the frontier complex: rather than one queue, you partition by host with per-host rate limits and robots.txt compliance, ensuring no server is hammered.',
        },
        {
          q: 'With billions of discovered URLs, how do you efficiently check whether a URL has already been seen?',
          options: [
            'Store every URL in a SQL table and query it each time',
            'Use a Bloom filter as the "seen URLs" set — a memory-efficient probabilistic membership test: "probably seen" → skip, "definitely not seen" → add; accept rare false positives (occasionally skipping a new URL) for huge memory savings',
            'Keep all URLs in a Python set in memory',
            'Never dedup; crawl everything repeatedly',
          ],
          answer: 1,
          explanation:
            'An exact set of billions of URLs is enormous. A Bloom filter (Phase 3) tests membership in bounded memory; false positives (rarely dropping a genuinely-new URL) are an acceptable trade for the space savings. A strong callback to probabilistic structures.',
        },
        {
          q: 'Two different URLs return byte-identical content (a mirror / print version). How do you avoid processing both?',
          options: [
            'You can’t detect this',
            'Content deduplication: hash the page content (checksum, or SimHash for near-duplicates) and skip storing/processing a page whose hash you’ve already seen; also normalize/canonicalize URLs before dedup',
            'Crawl both and store both',
            'Compare full page text character by character across all pages',
          ],
          answer: 1,
          explanation:
            'URL dedup (Bloom filter) handles repeated URLs; content dedup via hashing handles distinct URLs with identical/near-identical content (mirrors, print pages). URL normalization first collapses trivially-different URLs (fragments, query order).',
        },
        {
          q: 'What is a "crawler trap" and how do you defend against it?',
          options: [
            'A firewall that blocks crawlers; you use a VPN',
            'An infinite URL space (e.g. a calendar’s endless "next month", session-id URLs) that can trap the crawler forever. Defend with max crawl depth, URL-length limits, per-domain page caps, and URL canonicalization',
            'A CAPTCHA; you solve it automatically',
            'A slow server; you increase the timeout',
          ],
          answer: 1,
          explanation:
            'Traps generate unbounded distinct URLs (calendars, session ids, dynamic loops) that would consume the crawler indefinitely. Depth/length/page-cap limits and canonicalization bound the crawl and detect the runaway similar-URL pattern.',
        },
      ],
    },
    {
      type: 'design',
      id: 'design-1',
      title: 'Design exercise: a large-scale web crawler',
      prompt: `
Design a web crawler that starts from seed URLs and crawls outward to fetch ~1 billion pages/month for a search corpus. It must be distributed, polite to web servers, avoid re-crawling duplicate URLs and content, survive crawler traps and bad pages, and re-crawl pages for freshness.

Cover the framework, but spend depth on: (1) the crawl loop and the URL frontier, (2) politeness — how you avoid overwhelming any single server, (3) deduplication of both URLs and content at this scale, and (4) crawler traps/robustness. Add freshness/prioritization and note the trade-offs.
`,
      hints: [
        'Frame it as BFS over the web graph — the frontier is the BFS queue.',
        'Politeness makes the frontier complex: per-host queues + rate limiting + robots.txt.',
        'Dedup: Bloom filter for URLs, content hashing for pages; normalize URLs first.',
      ],
      modelAnswer: `
**Requirements** — Functional: fetch pages from seeds, extract links, crawl recursively, store content, respect robots.txt, re-crawl for freshness (de-scope indexing/JS rendering). Non-functional: billions of pages (distributed), **politeness** (hard requirement), robustness (traps, bad HTML, timeouts), freshness, bandwidth efficiency.

**Estimation** — ~1B pages/month ≈ ~400 pages/s; ~100 KB/page → ~100 TB/month → **object storage**; the **frontier** holds billions of URLs → distributed disk-backed queue.

**Crawl loop** — **BFS over the web graph**: seed URLs → **URL Frontier** → **Fetcher** downloads → **Parser** extracts links + content → new URLs (after dedup/filter) loop back into the frontier; content → object storage; metadata DB tracks \`url → last_crawled, content_hash\`.

**Deep dives:**
1. *Frontier* — a massive priority queue of URLs-to-crawl, partitioned/distributed; the heart of the system.
2. *Politeness (defining constraint)* — respect **robots.txt** (fetched + cached per domain) and **rate-limit per host** (e.g. ≤1 req/s). Implement via **per-host back queues** with a scheduler releasing a host’s next URL only after its delay, so each host is crawled by one worker at a controlled rate. This is what makes the frontier non-trivial.
3. *Deduplication* — **URL dedup** with a **Bloom filter** "seen set" (billions of URLs in bounded memory; rare false positives acceptable); **content dedup** by **hashing page content** (checksum/SimHash for near-dupes); **normalize/canonicalize URLs** (strip fragments, sort query params) before dedup.
4. *Traps + robustness* — bound crawls with **max depth, URL-length limits, per-domain page caps**, canonicalization, and similar-URL detection; handle timeouts, redirects/loops, malformed HTML; retry transient failures with backoff, dead-letter persistent failures.

**Freshness/prioritization** — adaptive re-crawl by observed change frequency (news hourly, static monthly); frontier priority reflects importance + staleness. **Distribution**: shard frontier and seen-set **by host/URL hash** (aids politeness); DNS caching avoids a resolution bottleneck.

**Trade-offs** — Bloom-filter false positives (rarely skip a new URL) for memory; politeness caps per-host throughput; approximate prioritization; near-duplicate detection is heuristic.

**One-line summary:** distributed BFS with a host-partitioned URL frontier enforcing politeness (robots.txt + per-host rate limits), dedup via a Bloom-filter seen-set and content hashing after URL normalization, trap defenses (depth/length/page caps + canonicalization), and adaptive re-crawl — recognizing that politeness and dedup, not fetching, are the hard parts.
`,
    },
  ],
}
