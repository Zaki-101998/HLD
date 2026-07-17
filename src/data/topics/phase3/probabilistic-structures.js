export default {
  id: 'probabilistic-structures',
  title: 'Clever Structures: Bloom Filters, HyperLogLog & Friends',
  subtitle: 'Trading exactness for orders-of-magnitude efficiency — plus geo-indexes',
  days: 3,
  content: `
## Why this matters for system design

A family of "cheat code" data structures answers massive-scale questions in kilobytes by accepting tiny, *quantifiable* error. Interviewers love them because each has a signature use case: dropping one in at the right moment ("a Bloom filter in front of the store") is a compact, high-signal move. Learn each structure's one-line contract and its canonical placements.

## Bloom filters — "definitely not, or probably yes"

**Contract:** set membership with **no false negatives** and a tunable false-positive rate (say 1%), in ~10 bits per item — millions of items in a few MB, misses answered without touching disk.

**Mechanics (2 lines):** a bit array + k hash functions; add = set k bits; query = check k bits. Any zero bit → *definitely absent*. All ones → *probably present* (other items may have set those bits). Deletions unsupported (counting variants exist); sizing: ~9.6 bits/item ≈ 1% FP, k ≈ 7.

**Canonical placements:**
1. **LSM storage engines** (your NoSQL topic): per-SSTable filters — "is key K possibly in this file?" — skip most files per read.
2. **Cache penetration defense** (caching topic): filter of valid IDs in front of cache+DB; attacks with random IDs die at the filter.
3. **Web crawler "seen this URL?"** at billions of URLs (Phase 4 design).
4. **"One-hit wonder" cache admission** (CDNs: only cache on second request — Akamai reported ~75% of URLs are requested exactly once).
5. Recommendation dedup ("don't re-show seen posts") — false positive = one post wrongly hidden, harmless.

**The reasoning pattern interviewers want:** state which error direction is safe. Bloom FP = harmless extra check; FN would be a correctness bug — and Blooms never FN. Always follow a positive with the real lookup when correctness matters.

## HyperLogLog — count distinct in 12 KB

**Contract:** cardinality ("how many *unique* visitors/IPs/searches") within ~1–2% error, in ~12 KB — regardless of whether the true count is thousands or billions. Exact counting needs a set: 100M UUIDs ≈ gigabytes; HLL: 12 KB.

**Intuition:** hash every item; track the maximum run of leading zeros seen (seeing a hash with 20 leading zeros suggests ~2²⁰ distinct items); average many independent buckets to stabilize. Bonus property: HLLs **merge** (union) losslessly — per-hour sketches OR per-shard sketches combine into daily/global counts. Redis: \`PFADD/PFCOUNT/PFMERGE\`.

**Placements:** unique-view counters (YouTube views, ad reach), DAU-style dashboards, cardinality alerts ("distinct IPs hitting login spiked"), \`COUNT DISTINCT\` in analytics engines.

## Count-Min Sketch — frequencies & heavy hitters

**Contract:** approximate per-item counts in a stream (only ever *over*estimates, never under), fixed few-KB memory; paired with a small heap → **top-K / trending** items without storing every key.

**Placements:** trending hashtags/searches, hot-key detection (find your celebrity problem live!), per-IP request counting for rate-limit heuristics.

## Geo-indexes: geohash & quadtrees (deterministic, but same "clever encoding" family)

"Find drivers near me" can't be a B-tree range on (lat, lng) — two dimensions don't linearize naturally.

- **Geohash:** interleave lat/lng bits → base32 string ("tdr1y…"); **shared prefixes ≈ nearby** (mostly). Nearby search = prefix queries over cells (+ neighbor cells for edge cases) — works in ANY key-value/SQL store, e.g. Redis GEO commands. Cell sizes: 5 chars ≈ 5 km, 6 ≈ 1.2 km, 7 ≈ 150 m.
- **Quadtree:** recursively split the map into 4 quadrants, deeper where dense — adaptive resolution (Manhattan cells small, ocean cells huge). In-memory index in matching services.
- (S2/H3 = the industrial versions: sphere-correct cells used by Google/Uber.)

**Placements:** Uber/food-delivery proximity (Phase 4), "nearby friends," geofenced features. Interview line: "shard/bucket drivers by geohash cell; query = my cell + 8 neighbors."

## The meta-pattern (say this!)

All four share one trade: **exactness ⇄ orders of magnitude in space/speed** — viable whenever the product tolerates approximation (counts off by 1%, an extra cache check, trending that's directionally right). Flagging *where approximation is acceptable* is itself a senior design skill: it's how you serve analytics at 1/1000th the cost of exact answers.

## How this shows up in interviews

- "How do you avoid recrawling URLs?" / "cache penetration?" → Bloom filter (+ its FP caveat).
- "Count unique views at YouTube scale" → HLL, mergeable per shard/hour.
- "Trending topics" → count-min sketch + heap, windowed.
- "Find nearby drivers" → geohash cells or quadtree, neighbors included.
- Anywhere you say one of these, quote the memory: "12 KB", "~10 bits/item" — the numbers are the impressive part.
`,
  resources: [
    {
      title: 'Bloom filters explained',
      url: 'https://www.youtube.com/watch?v=V3pzxngeLqw',
      type: 'video',
      source: 'ByteByteGo (YouTube)',
    },
    {
      title: 'Bloom filters by example (interactive)',
      url: 'https://llimllib.github.io/bloomfilter-tutorial/',
      type: 'interactive',
      source: 'Bill Mill',
    },
    {
      title: 'HyperLogLog in Redis — counting with 12KB',
      url: 'https://antirez.com/news/75',
      type: 'article',
      source: 'Salvatore Sanfilippo (Redis creator)',
    },
    {
      title: 'Bloom Filters',
      url: 'https://algomaster.io/learn/system-design/bloom-filters',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
  ],
  challenges: [
    {
      type: 'quiz',
      id: 'quiz-1',
      title: 'Probabilistic structures check',
      questions: [
        {
          q: 'A Bloom filter guarding your database says "key not present". What do you know?',
          options: [
            'The key is probably absent — check the DB to confirm',
            'The key is DEFINITELY absent — skip the DB entirely; Bloom filters have no false negatives',
            'Nothing; Bloom answers are always probabilistic',
            'The key was deleted recently',
          ],
          answer: 1,
          explanation:
            'A negative is certain (some required bit was 0 — the key was never added). Only POSITIVES are probabilistic. This asymmetry is the entire value: misses (the common case under attack) cost zero I/O.',
        },
        {
          q: 'Counting unique daily visitors across 200M events with exact sets costs ~GBs of memory. HyperLogLog costs…',
          options: [
            '~200 MB',
            '~12 KB per counter, with ~1–2% error — and per-shard HLLs merge losslessly into the global count',
            '~1 GB but exact',
            'It cannot handle 200M events',
          ],
          answer: 1,
          explanation:
            'HLL memory is CONSTANT regardless of cardinality; mergeability means each app server keeps a local sketch and the dashboard PFMERGEs them. For "how many unique", 1% error is nearly always acceptable — say so.',
        },
        {
          q: 'Why can’t a standard B-tree index efficiently answer "restaurants within 2 km of me"?',
          options: [
            'B-trees don’t store numbers',
            'Proximity is 2-dimensional: an index sorted by lat gives a band of the right latitude spanning the whole globe’s longitudes; geohash/quadtrees encode 2D locality into 1D keys or adaptive cells',
            'Restaurants change location too often',
            'It can — with enough RAM',
          ],
          answer: 1,
          explanation:
            'Single-column sort order can’t capture 2D closeness. Geohash interleaves the dimensions so prefix-similarity ≈ spatial proximity (with neighbor-cell edge handling); quadtrees partition space adaptively.',
        },
        {
          q: 'For "trending searches (top 10, last hour)" over 500k searches/sec, the memory-sane approach is…',
          options: [
            'A hash map of every search term with counts',
            'A count-min sketch (few KB, overestimate-only counts) + a small top-K heap, windowed per time bucket',
            'Sort all searches every minute',
            'Sample 1 in 1000 searches and count exactly',
          ],
          answer: 1,
          explanation:
            'The full term-space is unbounded (typos, long tail); CMS gives approximate counts in fixed memory, the heap tracks candidates for top-K. (Sampling is a legitimate simpler alternative to mention — knowing both is depth.)',
        },
        {
          q: 'A recommendation system uses a Bloom filter per user for "posts already shown". A false positive means…',
          options: [
            'A user sees a duplicate post',
            'A never-shown post is wrongly skipped — mildly wasteful, invisible to the user; the SAFE error direction, which is why Bloom fits here',
            'The filter must be rebuilt',
            'The user’s feed goes empty',
          ],
          answer: 1,
          explanation:
            'Analyze the error direction: FP = skip fresh content occasionally (fine); FN would show duplicates (annoying) — and Blooms never FN. Matching error-direction to product tolerance is the whole game with these structures.',
        },
        {
          q: 'Drivers are bucketed by 6-character geohash (~1.2 km cells). A rider stands near a cell boundary. Correct query?',
          options: [
            'Query just the rider’s cell — geohash guarantees closeness',
            'Query the rider’s cell PLUS its 8 neighbors — prefix similarity breaks at cell edges, so boundary-adjacent drivers live in different prefixes',
            'Use a smaller cell size',
            'Fall back to scanning all drivers',
          ],
          answer: 1,
          explanation:
            'Two points 10 m apart can straddle a boundary and share NO prefix. Cell+neighbors (9 cells) is the standard correction — a detail that shows you’ve actually thought about geo-sharding (and it’ll return in the Uber design).',
        },
      ],
    },
    {
      type: 'lab',
      id: 'lab-1',
      title: 'Build a Bloom filter, count with HLL, bucket with geohash',
      intro: 'All three structures, hands-on: your own Bloom filter in Python, Redis’s HLL, and Redis GEO.',
      steps: [
        {
          instruction: 'Implement a Bloom filter in ~20 lines and measure its actual false-positive rate.',
          command: `python3 -c "
import hashlib
M, K, N = 100000, 7, 10000          # bits, hashes, items (~10 bits/item)
bits = bytearray(M // 8)
def hashes(item):
    for i in range(K):
        h = int(hashlib.md5(f'{i}:{item}'.encode()).hexdigest(), 16) % M
        yield h
def add(item):
    for h in hashes(item): bits[h//8] |= 1 << (h%8)
def query(item):
    return all(bits[h//8] & (1 << (h%8)) for h in hashes(item))
for i in range(N): add(f'user{i}')
fn = sum(1 for i in range(N) if not query(f'user{i}'))
fp = sum(1 for i in range(N, 2*N) if query(f'user{i}'))
print(f'false negatives: {fn} (must be 0)')
print(f'false positives: {fp/N:.2%} (theory ~1%) using {M//8//1024}KB for {N} items')"`,
          expected: 'FN = 0 always; FP ≈ 1% — 10k items answered from 12KB. The contract, verified by your own code.',
        },
        {
          instruction: 'HyperLogLog in Redis: count 100k unique items in 12KB and check the error.',
          command: 'redis-cli del hll; for i in $(seq 1 200); do redis-cli pfadd hll $(seq $((i*500-499)) $((i*500)) | tr "\\n" " ") > /dev/null; done; echo "estimated: $(redis-cli pfcount hll) (true: 100000)"; echo "memory: $(redis-cli memory usage hll) bytes"',
          expected: 'Estimate within ~1% of 100,000, memory ≈ 12–15 KB. An exact set would need megabytes.',
        },
        {
          instruction: 'Merge two HLLs (per-shard → global), the killer feature.',
          command: 'redis-cli del h1 h2; redis-cli pfadd h1 a b c d e > /dev/null; redis-cli pfadd h2 d e f g > /dev/null; redis-cli pfmerge global h1 h2; redis-cli pfcount global',
          expected: '7 — the UNION’s cardinality (a–g), not 5+4=9. Sketches merge without double counting.',
        },
        {
          instruction: 'Geo-bucketing with Redis GEO (geohash under the hood): add drivers, query a radius.',
          command: "redis-cli del drivers; redis-cli geoadd drivers 72.8777 19.0760 driver:1 72.8656 19.1136 driver:2 77.5946 12.9716 driver:3; redis-cli geosearch drivers FROMLONLAT 72.8777 19.0760 BYRADIUS 10 km ASC WITHDIST",
          expected: 'The two Mumbai drivers with distances; the Bangalore driver excluded. Redis stores each position as a geohash-encoded score in a sorted set — the structure you just studied.',
        },
        {
          instruction: 'Peek at the actual geohash strings.',
          command: 'redis-cli geohash drivers driver:1 driver:2 driver:3',
          expected: 'The Mumbai drivers share a long prefix (te7…); Bangalore diverges early. Prefix similarity ≈ proximity, visible in the raw encoding.',
        },
        {
          instruction: 'Clean up.',
          command: 'redis-cli del hll h1 h2 global drivers',
          expected: 'Done.',
        },
      ],
    },
    {
      type: 'design',
      id: 'design-1',
      title: 'Design exercise: the analytics sidebar of a video platform',
      prompt: `
A video platform needs, per video: total views (exact-ish), UNIQUE viewers (approximate ok), "trending now" (top 100 videos by views in the last hour, globally), and per-creator dashboards showing unique viewers per day for the last 90 days. Scale: 200M views/day across 50M videos, hot videos get 50k views/min.

Pick the structure/mechanism for each requirement, with memory estimates, and describe how the pieces update on each view event.
`,
      hints: [
        'Four requirements, four different tools from this phase (one is from the caching topic).',
        'Unique-viewers-per-day × 90 days × millions of videos — what property of HLL makes this affordable?',
        'Hot video counters: remember the hot-row problem.',
      ],
      modelAnswer: `
**Per view event → a Kafka topic (partitioned by video_id); consumers update:**

**1. Total views → sharded counters with write-behind.** Redis \`INCR views:{video_id}\` (hot videos: shard into \`views:{id}:0..7\`, sum on read — the hot-key fix), flushed to the DB in batches every few seconds. Exact-ish (loss window of seconds acceptable — say it). Memory: trivial.

**2. Unique viewers → HyperLogLog per video.** \`PFADD uniq:{video_id} user_id\`. 50M videos × ~12 KB is 600 GB — too much for ALL videos, so: dense HLLs only for videos active today (~5M?) ≈ 60 GB across a Redis cluster; inactive videos' sketches persisted to the DB/object storage and lazily reloaded. (Redis HLLs are also sparse when small — real memory is far lower; the honest estimate + tiering is the point.)

**3. Trending (top 100, last hour) → count-min sketch + top-K heap per 5-minute window.** A stream job holds 12 windows; trending = merge of the last 12 sketches' heaps, refreshed every minute. Memory: KBs per window. Alternative worth naming: exact Redis sorted-set counters per window on ONLY the ~100k videos that received any view that hour — also feasible; CMS wins when the key space per window is huge.

**4. Creator dashboards (uniques/day, 90 days) → daily HLLs + merge.** One HLL per (video, day), persisted at day close (12 KB each, object storage — cheap). "Uniques this week" = PFMERGE of 7 daily sketches; per-creator = merge across their videos. Mergeability is doing all the work: no re-scan of raw events, arbitrary rollups from 12 KB tiles.

**Flow summary:** one event → counter INCR (sharded), PFADD daily+total sketch, CMS window update. Every read the product needs is served from a structure sized in KBs — 200M events/day of analytics without touching the raw log except for replay/audit (which Kafka retention covers).
`,
    },
  ],
}
