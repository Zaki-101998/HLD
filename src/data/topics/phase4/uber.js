export default {
  id: 'uber',
  title: 'Design Uber (Ride-Hailing)',
  subtitle: 'Geospatial indexing, matching riders to nearby drivers, and real-time location at scale',
  days: 2,
  content: `
## The problem

Design a ride-hailing service: riders request a ride, the system finds **nearby available drivers**, matches one, and both track each other's **live location** through the trip. Uber/Lyft. The distinguishing challenges are **geospatial indexing** — "find drivers within 2km of this point, fast" over millions of constantly-moving drivers — and **real-time location updates** at high write volume. It ties together geohashing/quadtrees (Phase 3), high-write ingestion, and matching.

## Step 1 — Requirements

**Functional:** drivers publish live location; a rider requests a ride at a pickup point; the system finds nearby available drivers and **matches** one; both parties see live location and ETA during the trip. *De-scope:* pricing/surge (mention), payments (separate topic), ratings.

**Non-functional:** **low-latency matching** (find nearby drivers in ms); **very high write volume** (millions of drivers each pinging location every few seconds); **high availability**; **geographically distributed**; accuracy (matches should reflect current positions). Consistency: matching must avoid double-booking a driver (needs care), but location can be eventually consistent.

## Step 2 — Estimation

- ~**5M active drivers**, each sending a location update **every ~4 seconds** → ~**1.25M location writes/sec.** This enormous, continuous write load is the defining fact — the location store must absorb it, so it's an **in-memory, high-write system (Redis)**, not a disk DB updated per ping.
- Ride requests are far fewer (~thousands/sec). So: **writes (location) hugely dominate reads (matching)**, but the reads are latency-critical.

## Step 3 — API

\`\`\`
POST /drivers/location   { driver_id, lat, lng }        // very high frequency
POST /rides/request      { rider_id, pickup_latlng }    → matched driver + ETA
GET  /rides/{id}/track                                   // live locations during trip
\`\`\`

## Step 4 — The core problem: geospatial indexing

Naively, "find drivers within 2km of (lat,lng)" means scanning all 5M drivers and computing distance — **impossible per request**. You need a **spatial index** that groups nearby points so you only examine a small region. Two standard approaches (Phase 3 probabilistic/geo topic):

- **Geohash:** encode a lat/lng into a short string where **shared prefixes mean geographic proximity** (nearby points share a prefix, e.g. \`9q8yy\`). Store drivers in buckets keyed by geohash prefix (e.g. 5–6 char cells ≈ a neighborhood). To find nearby drivers: compute the query point's geohash, look up **its cell + the 8 neighboring cells** (to handle the boundary problem where a close driver is just across a cell edge), and distance-filter the small candidate set. Simple, works great with a KV store (Redis GEO commands use this).
- **Quadtree:** recursively subdivide 2D space into 4 quadrants until each cell holds ≤ N points; dense areas (downtown) subdivide more, sparse areas less. Query = descend the tree to the region. Adapts to density better than fixed geohash cells; more complex to maintain.

**Either is a correct answer** — geohash is the simpler, more common pick; quadtree handles uneven density. Know the trade-off.

## Step 5 & 6 — Architecture and deep dives

\`\`\`
 Drivers ──location pings (1.25M/s)──▶ Location Service ──▶ [Redis: geospatial index, driver→cell]
                                                                    ▲
 Rider request ─▶ Matching Service ─▶ query index for nearby drivers│ ─▶ rank/select ─▶ dispatch offer
                                          └─▶ lock/assign driver (no double-book)
 Trip ─▶ live locations streamed rider↔driver (WebSocket/push)
\`\`\`

### Deep dive 1 — Handling the location write firehose
1.25M writes/sec can't go to a disk database. Keep the **live location + spatial index in memory (Redis)**, sharded (below). Each ping updates the driver's position and their geohash-cell membership. **Latest-value-wins** — you only care about a driver's *current* location, so it's a cheap in-memory upsert, not an append. Persist to durable storage only asynchronously/aggregated (for history/analytics), not on the hot path.

### Deep dive 2 — Matching (the read side)
On a ride request: geohash the pickup, gather candidate drivers from the pickup cell + neighbors, **filter to available + within radius**, then **rank** (closest ETA considering road distance/traffic, driver rating, etc.) and **dispatch an offer**. Crucially, **prevent double-booking**: when a driver is offered/accepts a ride, mark them unavailable **atomically** (a lock / conditional update) so two riders can't grab the same driver (a concurrency problem — Phase 3). If the driver declines/times out, release and offer the next. Matching is often a short async workflow, not a single synchronous call.

### Deep dive 3 — Sharding by geography
Partition the location service and index **by region** (e.g. by geohash prefix / city). A driver's pings and a rider's matching query for the same area hit the same shard — locality keeps queries fast and confines load. This also scales writes: different regions live on different nodes. Handle region boundaries by querying neighbor cells (which may be on adjacent shards) — the boundary problem again.

### Deep dive 4 — Live trip tracking
During a trip, rider and driver need each other's live position → **push/WebSocket** (the chat-system transport): the driver's pings stream to the rider (and vice versa) in near-real-time, with ETA recomputed. This is a localized publish/subscribe between the two parties.

## Step 7 — Wrap-up

Uber is a **geospatial + high-write-ingestion** problem. Millions of drivers pinging location every few seconds (~1.25M writes/sec) force an **in-memory, sharded-by-region location store (Redis)** with **latest-value-wins** upserts. The core is a **spatial index** — **geohash** (proximity = shared prefix; query a cell + its 8 neighbors) or a **quadtree** (density-adaptive) — so "find nearby available drivers" examines a tiny region instead of all drivers. **Matching** filters + ranks candidates and **atomically locks** a driver to prevent double-booking. Live trip tracking uses **WebSocket/push** between the two parties. Trade-offs: eventual consistency for location (fine — you want *current* position), in-memory store (durability via async persistence), and the geohash boundary problem (solved by neighbor-cell queries). The signal: recognizing the **geospatial index** and the **location write firehose** as the twin cores.

## How this shows up in interviews

- The interviewer wants the **geospatial index** — say **geohash** (or quadtree) and explain how proximity search works, including the **boundary problem** (query neighboring cells). This is the make-or-break insight.
- Expect **"how do you handle millions of location updates per second?"** — in-memory Redis, sharded by region, latest-value-wins, async persistence off the hot path.
- Expect **"how do you avoid assigning one driver to two riders?"** — atomic lock/conditional update on driver availability during matching.
- Bonus: sharding by geography for locality, WebSocket/push for live tracking, quadtree-vs-geohash trade-off (density adaptivity).
`,
  resources: [
    {
      title: 'Design Uber / Lyft — geospatial matching',
      url: 'https://www.youtube.com/watch?v=umWABit-wbk',
      type: 'video',
      source: 'ByteByteGo',
    },
    {
      title: 'System Design: Uber (geohashing, matching, location)',
      url: 'https://www.hellointerview.com/learn/system-design/problem-breakdowns/uber',
      type: 'article',
      source: 'Hello Interview',
    },
    {
      title: 'How Uber uses H3 / geospatial indexing',
      url: 'https://www.uber.com/blog/h3/',
      type: 'article',
      source: 'Uber Engineering (H3 hexagonal grid)',
    },
    {
      title: 'Design Location Based Service like Yelp',
      url: 'https://www.youtube.com/watch?v=M4lR_Va97cQ',
      type: 'video',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
    {
      title: 'Design Google Maps',
      url: 'https://www.youtube.com/watch?v=jk3yvVfNvds',
      type: 'video',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
  ],
  challenges: [
    {
      type: 'quiz',
      id: 'quiz-1',
      title: 'Uber design check',
      questions: [
        {
          q: 'Why can’t you find "drivers within 2km" by scanning all drivers and computing distance, and what solves it?',
          options: [
            'You can; it’s fast enough',
            'With millions of drivers, per-request full scans are far too slow. A spatial index (geohash or quadtree) groups nearby points so you examine only a small region — e.g. geohash buckets where nearby points share a prefix',
            'Distance can’t be computed on a server',
            'You should store drivers in a graph database',
          ],
          answer: 1,
          explanation:
            'Brute-force distance over millions of moving drivers per ride request is infeasible. A geospatial index (geohash: proximity = shared prefix; or quadtree: recursive quadrant subdivision) limits the search to a tiny candidate region, making nearby-search fast.',
        },
        {
          q: 'When searching a geohash cell for nearby drivers, why must you also query the 8 neighboring cells?',
          options: [
            'For redundancy',
            'The boundary problem: a very close driver can sit just across a cell edge in an adjacent cell. Querying the target cell plus its 8 neighbors ensures nearby drivers near cell boundaries aren’t missed',
            'To double the results',
            'Neighbor cells are always empty',
          ],
          answer: 1,
          explanation:
            'Geohash cells have hard edges; two points meters apart can land in different cells. Including the 8 surrounding cells (then distance-filtering the candidates) fixes this boundary artifact. The same neighbor-query idea handles region-shard boundaries.',
        },
        {
          q: 'How do you handle ~1.25M driver location updates per second?',
          options: [
            'Write each update to a replicated SQL database synchronously',
            'Keep the live location + spatial index IN MEMORY (Redis), sharded by region, using latest-value-wins upserts (you only need current position); persist to durable storage asynchronously for history, off the hot path',
            'Batch them into hourly files only',
            'Reject most updates',
          ],
          answer: 1,
          explanation:
            'A disk DB can’t absorb 1.25M writes/s, and you only care about each driver’s current location, so an in-memory latest-value upsert (Redis), sharded by geography for locality, is the fit. Durable persistence happens async for analytics/history.',
        },
        {
          q: 'During matching, how do you ensure one driver isn’t assigned to two riders simultaneously?',
          options: [
            'Hope it doesn’t happen',
            'Atomically mark the driver unavailable when offering/assigning (a lock or conditional update) so concurrent requests can’t both grab them; release and offer the next driver if they decline or time out',
            'Assign every nearby driver and let riders sort it out',
            'Use eventual consistency for driver availability',
          ],
          answer: 1,
          explanation:
            'Two riders near the same driver create a classic concurrency race. An atomic availability update (compare-and-set / lock) ensures exactly one assignment; declines/timeouts release the driver for the next candidate. This is where matching needs stronger consistency than location does.',
        },
      ],
    },
    {
      type: 'design',
      id: 'design-1',
      title: 'Design exercise: ride-hailing matching',
      prompt: `
Design the core of Uber: millions of drivers continuously report their location, and when a rider requests a ride at a pickup point, the system quickly finds nearby available drivers, matches one, and lets both track each other live during the trip.

Cover the framework, but focus depth on: (1) the geospatial index that makes "find nearby drivers" fast (and the boundary problem), (2) how you absorb the location-update write firehose, (3) matching without double-booking a driver, and (4) live trip tracking. Add sharding strategy and note the trade-offs.
`,
      hints: [
        'The two cores are geospatial indexing and the location write volume — estimate the latter.',
        'Geohash vs quadtree — and why you query neighbor cells.',
        'Location can be eventually consistent; driver assignment needs an atomic lock.',
      ],
      modelAnswer: `
**Requirements** — Functional: drivers report live location; rider requests → find nearby available drivers → match; live tracking + ETA during trip (de-scope surge/payments/ratings). Non-functional: low-latency matching (ms), very high location-write volume, high availability, geo-distributed; location eventually consistent, matching must not double-book.

**Estimation** — ~5M drivers × a ping every ~4s ≈ **~1.25M location writes/s** (defining fact) → in-memory store; ride requests far fewer but latency-critical.

**API** — \`POST /drivers/location\` (high frequency), \`POST /rides/request\`, \`GET /rides/{id}/track\`.

**Geospatial index (core)** — **geohash**: encode lat/lng so nearby points share a prefix; bucket drivers by ~neighborhood-size cells (Redis GEO). Nearby search = query the pickup’s cell **plus its 8 neighbors** (the **boundary problem**) then distance-filter. Alternative **quadtree**: recursive quadrant subdivision, density-adaptive (downtown subdivides more) but more complex. Pick geohash for simplicity; mention quadtree/H3 for uneven density.

**Deep dives:**
1. *Index* — as above (proximity search + boundary neighbor queries).
2. *Location firehose* — live positions + spatial index **in memory (Redis), sharded by region**, **latest-value-wins** upserts (only current position matters); durable persistence async for history/analytics, off the hot path.
3. *Matching without double-booking* — geohash pickup → gather candidates from cell+neighbors → filter available/in-radius → **rank** (ETA/road distance/traffic, rating) → offer; **atomically mark the driver unavailable** (lock/conditional update) so two riders can’t grab the same driver; decline/timeout releases and offers the next. Often a short async workflow.
4. *Live tracking* — **WebSocket/push** between rider and driver streams positions in near-real-time with recomputed ETA (localized pub/sub).

**Sharding** — partition location service + index **by geography** (geohash prefix/city): a region’s pings and matching queries hit the same shard (locality, confined load, scalable writes); neighbor cells may cross shards — handle via neighbor queries.

**Trade-offs** — location is eventually consistent (fine — want current position); in-memory store needs async durability; geohash boundary handled by neighbor queries; matching uses stronger (atomic) consistency than location.

**One-line summary:** a geospatial + high-write system — an in-memory, region-sharded geohash (or quadtree) index answering nearby-driver queries via cell+neighbor lookups, absorbing ~1.25M latest-value-wins location writes/s, matching with an atomic driver-availability lock to prevent double-booking, and WebSocket push for live trip tracking.
`,
    },
  ],
}
