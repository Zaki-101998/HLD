export default {
  id: 'proximity-service',
  title: 'Design a Proximity Service (Yelp / Nearby Places)',
  subtitle: 'The geospatial problem: "find things near me" fast — geohashing, quadtrees, and indexing the map so location queries scale',
  days: 2,
  content: `
## The problem

Design a service that answers **"what's near me?"** — given a user's latitude/longitude and a radius, return nearby businesses (restaurants, shops) ranked by distance, fast. The whole problem hinges on **spatial indexing**: a normal database index on \`lat\` and \`lng\` columns is useless for "within 5 km of this point," so you need a data structure that makes **geographic proximity queries** efficient.

## Step 1 — Requirements

**Functional:** (1) return businesses within a given radius of a lat/lng (or within the current map viewport), (2) sorted by distance, (3) with business details (name, category, rating), (4) support filters (category, open-now).

*De-scope but mention:* reviews/ratings write path, business owner tools, personalized ranking.

**Non-functional:** **very read-heavy** (millions browsing, businesses change rarely) → this drives heavy caching and read replicas. **Low latency** (a map should feel instant). **Data is fairly static** (a restaurant's location doesn't move), so we can **precompute spatial indexes** aggressively. Scale: hundreds of millions of places, high query volume.

## Step 2 — Estimation

- Say **200M businesses** worldwide, **100k proximity queries/sec** at peak. Businesses rarely change → the index is **read-optimized and cache-friendly**.
- Each place is small (~1 KB) → **~200 GB** of business data, easily sharded/replicated; the interesting part isn't storage size, it's the **query pattern**.
- The naive approach — compute distance from the user to **all 200M places** and sort — is **O(n) per query** and hopelessly slow. Estimation makes the case for a **spatial index** that prunes to a small candidate set.

## Step 3 — API

\`\`\`
GET /search?lat=..&lng=..&radius=..&category=..  → [ {business, distance}, ... ] sorted
GET /businesses/{id}                             → details
\`\`\`
Note: **never put precise location in a shareable URL** carelessly — but for a query it's a parameter. (Privacy aside: don't log/leak precise user coordinates.)

## Step 4 — Data model & the indexing problem

\`\`\`
Business { id, name, lat, lng, category, rating, geohash }
\`\`\`
The problem: a B-tree index on \`lat\` and a separate one on \`lng\` **can't** efficiently answer "within radius." A range on lat gives you a horizontal band across the entire globe; intersecting with a lng band still leaves a huge strip, and neither captures true circular distance. You need an index that **groups nearby points together on disk/in memory.** Two dominant approaches:

**Geohashing.** Recursively divide the world map into a grid; encode each cell as a short **base-32 string** where **shared prefixes mean geographic closeness** (\`9q8yy\` and \`9q8yz\` are adjacent cells). Store a \`geohash\` column, index it as a normal string, and a proximity query becomes a **prefix match** ("give me everything whose geohash starts with \`9q8y\`") — reducing 200M places to the handful in that cell and its 8 neighbors.

**Quadtree.** A tree that recursively splits each region into 4 quadrants until each leaf holds ≤ K points. Query by descending to the leaves overlapping your search area. **Adapts to density** — dense areas (Manhattan) subdivide deeply, empty areas (ocean) stay coarse — which fixed-grid geohashing doesn't.

## Step 5 — High-level design

\`\`\`
 client ─▶ LB ─▶ Location service ─▶ Geo index (geohash/quadtree, in memory + Redis)
                        │                        │
                        └─▶ Business service ─▶ DB (details) + read replicas + cache
\`\`\`

\`\`\`mermaid
sequenceDiagram
  autonumber
  participant U as User
  participant L as Location service
  participant G as Geo index
  participant B as Business DB
  U->>L: search(lat,lng,radius,category)
  L->>G: geohash(lat,lng) → cell + 8 neighbors
  G-->>L: candidate business ids in those cells
  L->>B: fetch details for candidates (filter category)
  B-->>L: businesses
  L->>L: compute exact distance, sort, take top N
  L-->>U: nearby results
\`\`\`
The geo index lives **in memory** (and Redis, which has native GEO commands built on geohashing) because it's read-heavy and mostly static; business details come from a sharded DB fronted by a cache and read replicas.

## Step 6 — Deep dive: making proximity fast (and correct at the edges)

**The candidate-set trick.** Instead of scanning everything, hash the query point to its **geohash cell**, fetch all businesses in that cell, then **compute exact distances only for that small set** and sort. This is index-prune-then-refine: cheap coarse filter, exact math on a handful.

**The boundary problem (the classic gotcha).** A place just across a cell boundary is geographically close but has a **different geohash prefix** — a naive single-cell lookup would miss it. **Fix:** always query the target cell **plus its 8 neighboring cells**, union the candidates, then filter by true distance. Naming and solving this boundary issue is the #1 signal of depth here.

**Choosing precision / cell size.** Geohash precision (prefix length) sets cell size: too coarse → each cell has too many places (slow refine); too fine → your radius spans many cells (more lookups) and dense areas overflow. Pick precision from the typical radius, or use a **quadtree** to adapt cell size to **density** automatically — the better answer for wildly uneven distributions (cities vs countryside).

**Geohash vs quadtree trade-off.**
- *Geohash:* dead simple, stores as a string prefix in any DB, works great with Redis GEO; but **fixed grid** wastes resolution in sparse areas and overflows dense ones, and boundary handling needs the neighbor trick.
- *Quadtree:* **density-adaptive**, elegant for skewed data; but it's an **in-memory tree** you must build and rebuild, and it's more complex to shard. Say which you'd pick and why (geohash for simplicity + Redis; quadtree for extreme density skew).

**Scaling the reads.** Because places rarely change, **cache aggressively** (popular cells, hot cities), use **read replicas**, and **shard the geo index by region**. Rebuild the index offline/periodically since updates are rare — a batch job, not a hot write path.

## Step 7 — Wrap-up

"Find nearby" is a **spatial indexing** problem: ordinary lat/lng column indexes can't answer radius queries, so I'd index locations with **geohashing** (map cells to prefix-shareable strings — a prefix match returns a small candidate set; Redis GEO does this natively) or a **quadtree** (density-adaptive quadrant splits). A query hashes the point to its cell, fetches that cell **plus its 8 neighbors** (the crucial boundary fix), then computes exact distances on that small set and sorts. Because the data is read-heavy and nearly static, I lean on **in-memory indexes, caching, read replicas, and region sharding**, rebuilding the index in batch rather than on a hot path. Pick geohash for simplicity/Redis, quadtree for severe density skew. With more time: personalized ranking, open-now/real-time signals, and an ETA/road-distance refinement over straight-line distance.

## How this shows up in interviews

- The definitive **geospatial** question (Yelp, "nearby friends," store locators). The signal is knowing that **plain lat/lng indexes don't work** and reaching for **geohashing or a quadtree**.
- Expect **"a business right across a cell boundary is close but has a different geohash — how do you not miss it?"** → query the cell **plus 8 neighbors**, then filter by exact distance. This boundary case is the classic follow-up.
- Expect **geohash vs quadtree** trade-offs — fixed grid + simple vs density-adaptive + more complex.
- A good place to note it's **read-heavy and static**, justifying heavy caching, replicas, and an offline-rebuilt index (ties back to Phase 2 caching/replication).
`,
  resources: [
    {
      title: 'Design a Proximity Service / Nearby Friends',
      url: 'https://www.hellointerview.com/learn/system-design/problem-breakdowns/yelp',
      type: 'article',
      source: 'Hello Interview',
    },
    {
      title: 'Geohashing and proximity search explained',
      url: 'https://www.youtube.com/watch?v=Ukr34lZueeM',
      type: 'video',
      source: 'system design walkthrough',
    },
    {
      title: 'Redis GEO commands (geohash-based)',
      url: 'https://redis.io/docs/latest/commands/geosearch/',
      type: 'doc',
      source: 'Redis Docs',
    },
    {
      title: 'Quadtrees and spatial indexing',
      url: 'https://en.wikipedia.org/wiki/Quadtree',
      type: 'doc',
      source: 'Wikipedia',
    },
  ],
  challenges: [
    {
      type: 'quiz',
      id: 'quiz-1',
      title: 'Proximity service check',
      questions: [
        {
          q: 'Why can\'t you efficiently answer "find businesses within 5 km" using ordinary B-tree indexes on separate lat and lng columns?',
          options: [
            'B-tree indexes don\'t support numbers',
            'A range on lat gives a horizontal band across the whole globe and a range on lng a vertical strip; intersecting them still leaves a huge area and doesn\'t capture true circular distance. You need a spatial index (geohash/quadtree) that groups nearby points together',
            'Latitude and longitude change too often',
            'You must scan every row regardless',
          ],
          answer: 1,
          explanation:
            'Two independent 1-D indexes can\'t express 2-D proximity efficiently. Geohashing encodes location as a prefix-shareable string (nearby → shared prefix) so proximity becomes a prefix match; a quadtree recursively partitions space. Both prune millions of places to a small candidate set.',
        },
        {
          q: 'A restaurant sits just across a geohash cell boundary from the user — geographically close but with a different geohash prefix. How do you avoid missing it?',
          options: [
            'Increase the radius until it\'s included',
            'Query the user\'s cell PLUS its 8 neighboring cells, union all candidates, then compute exact distances and filter — so a nearby place in an adjacent cell is still considered',
            'Ignore it; boundary cases don\'t matter',
            'Re-hash the restaurant into the user\'s cell',
          ],
          answer: 1,
          explanation:
            'This is the classic geohash boundary problem. A single-cell lookup misses close points just over the edge. Always search the target cell and its 8 neighbors, then refine by true distance. Solving this is the main depth signal for the question.',
        },
        {
          q: 'What is the key advantage of a quadtree over fixed-grid geohashing?',
          options: [
            'Quadtrees use less memory always',
            'A quadtree is density-adaptive: it subdivides dense regions (a city) deeply and leaves sparse regions (ocean) coarse, so no single cell overflows and sparse areas don\'t waste resolution — unlike a fixed geohash grid',
            'Quadtrees don\'t need distance calculations',
            'Geohashing cannot be stored in a database',
          ],
          answer: 1,
          explanation:
            'Fixed-grid geohashing can overflow dense cells and waste precision in empty ones. A quadtree recursively splits each region into 4 until a leaf holds ≤ K points, adapting to real-world density skew — at the cost of being an in-memory tree that must be built and is harder to shard.',
        },
      ],
    },
    {
      type: 'design',
      id: 'design-1',
      title: 'Design exercise: the full proximity service',
      prompt: `
Design a proximity / "nearby places" service (like Yelp) end to end using the 7-step framework. Support ~200M businesses and ~100k proximity queries/sec, returning places within a radius sorted by distance.

Cover: requirements (why is this read-heavy and cache-friendly?), estimation that motivates a spatial index (what's wrong with scanning all places?), the API, the data model and the indexing choice, the high-level design and query flow, and — as your deep dive — how geohashing (or a quadtree) makes proximity queries fast, including the cell-boundary problem. Then extend: how do you handle vastly uneven density (dense cities vs empty regions)?
`,
      hints: [
        'Estimation should kill the naive O(n) scan and justify a spatial index.',
        'Explain why two separate lat/lng indexes fail, then geohash prefix matching or a quadtree.',
        'Don\'t forget to query the cell PLUS its 8 neighbors, then refine by exact distance.',
        'For density skew, contrast fixed geohash grid vs density-adaptive quadtree.',
        'Lean on read replicas, caching, and an offline-rebuilt index since data is static.',
      ],
      modelAnswer: `
**Requirements** — Functional: businesses within radius (or viewport), sorted by distance, with details and filters (category, open-now). Non-functional: very read-heavy (data barely changes), low latency, precomputable static indexes, hundreds of millions of places.

**Estimation** — 200M places (~1 KB each ≈ 200 GB), ~100k queries/sec. Naive "distance to all 200M then sort" is O(n) per query — impossible at this rate. Conclusion: need a spatial index that prunes to a small candidate set; data is static → index is cache-friendly and can be rebuilt offline.

**API** — GET /search?lat&lng&radius&category (sorted results); GET /businesses/{id}. (Handle precise-location privacy carefully; don't leak coordinates.)

**Data model & index** — Business{id, name, lat, lng, category, rating, geohash}. Plain lat/lng indexes can't do radius. Choose geohashing (recursive grid → base-32 string; shared prefix = nearby; proximity = prefix match; Redis GEO implements this) or a quadtree (recursive quadrant splits, density-adaptive).

**High-level** — client → LB → Location service → in-memory/Redis geo index for candidate ids; Business service → sharded DB + read replicas + cache for details. Query flow: geohash the point → gather candidates in the cell (+ neighbors) → fetch details, filter → compute exact distance, sort, top N.

**Deep dive — fast proximity + boundary:** index-prune-then-refine — coarse cell filter, exact distance only on the small candidate set. Boundary fix: always query the target cell PLUS its 8 neighbors and union, else a close place just over the edge (different prefix) is missed; then filter by true distance. Precision/cell-size chosen from typical radius; too coarse = slow refine, too fine = many cell lookups.

**Extension — density skew:** fixed geohash grid overflows dense cells and wastes resolution in sparse ones. A quadtree adapts: subdivide Manhattan deeply, leave the ocean coarse, so leaves hold a bounded number of points. Trade-off: geohash is simple + string-storable + Redis-native but fixed-grid; quadtree is density-adaptive but an in-memory tree that's harder to shard and must be rebuilt.

**Scaling:** aggressive caching of hot cells/cities, read replicas, region-sharded index, offline/periodic index rebuild (updates are rare, not a hot write path).

**One-line summary:** a spatial-index (geohash or quadtree) over mostly-static locations that turns "find nearby" into a cell-plus-8-neighbors candidate lookup refined by exact distance, served from in-memory/Redis indexes with heavy caching and read replicas because the workload is read-heavy and the data barely changes.
`,
    },
  ],
}
