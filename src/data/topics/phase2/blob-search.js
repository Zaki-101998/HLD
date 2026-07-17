export default {
  id: 'blob-search',
  title: 'Blob Storage & Search Indexes',
  subtitle: 'Object stores, presigned URLs, inverted indexes — the last two building blocks',
  days: 2,
  content: `
## Why this matters for system design

Two specialized stores complete your toolbox: **object storage** (where all the big bytes live — every media design depends on it) and **search indexes** (how "find me X" works — the moment a design needs text search or filtering at scale, you should reach for an inverted index, not \`LIKE '%…%'\`).

## Object (blob) storage — S3 and friends

A flat key → blob store over HTTP: \`PUT/GET bucket/key\`. Not a filesystem (no real directories, no partial in-place edits, no POSIX), and that's *why* it scales.

What you get:
- **Effectively infinite capacity & throughput** — petabytes, millions of requests/s, flat namespace sharded internally by key.
- **11 nines durability** via replication/erasure coding across zones (erasure coding: split an object into k data + m parity fragments; any k of k+m reconstruct it — ~1.5× storage overhead instead of 3× for the same durability).
- **Cheap tiers:** hot (standard) → infrequent access → archival (Glacier), with lifecycle rules automating transitions ("after 90 days → cold tier") — say this when storing petabytes forever.
- **Versioning, TTL/expiry, event notifications** ("object created" → queue — how upload pipelines trigger).

### The pattern: DB for metadata, blobs for bytes
Never store images/videos in the database; never store queryable structure in blobs:
\`\`\`
photos table: id, owner, caption, s3_key, created_at   ← query this
S3: photos/{id}/original.jpg (+ sizes)                  ← stream this (via CDN)
\`\`\`

### Presigned URLs — the upload/download pattern to name
Don't proxy bytes through your API servers (they'd become a bandwidth bottleneck — remember the upload pool in the LB exercise). Instead the API **signs a time-limited URL**; the client PUTs/GETs **directly to object storage**:
\`\`\`
client → API: "uploading photo" → {presigned PUT URL, key}
client → S3: PUT bytes directly (API fleet never touches them)
S3 event → queue → processing pipeline (thumbnails etc.)
\`\`\`
One sentence of this in any media design is a reliable point-scorer. Same trick for downloads of private content (time-limited GET links).

## Search — the inverted index

**The problem:** \`WHERE body LIKE '%pizza%'\` can't use a B-tree (not a prefix) → full scan → dead at scale.

**The inverted index** flips document→words into **word→documents**:
\`\`\`
"pizza"  → [doc3, doc7, doc42, …]     (posting list)
"best"   → [doc7, doc9, …]
query "best pizza" = intersect the two lists → rank → return
\`\`\`

Build-time pipeline: tokenize → lowercase → remove stopwords → **stem** ("running"→"run") → index. Query text goes through the same pipeline, then lists are intersected and results **ranked** (TF-IDF/BM25: rare-word matches in short docs score higher; real engines blend recency, popularity, personalization).

This is Elasticsearch/OpenSearch/Lucene territory; they add: fuzzy matching (typos), prefix/edge-ngram search (autocomplete!), faceted filtering (brand/price buckets), geo-queries, highlighting.

### Keeping the index in sync — say this unprompted
The search index is a **derived, eventually-consistent view** of your primary DB:
\`\`\`
Postgres (truth) → CDC/outbox events → indexer consumers → Elasticsearch
\`\`\`
Never dual-write from the app (the dual-write inconsistency you met in the queues topic); never serve source-of-truth reads from the index. Lag of ~seconds is normal — a new product appearing in search 5 s after creation is fine, and you should say so.

### Sharding a search index
Same story as the sharding topic: index split into shards by doc hash; a query fans out to all shards and merges ranked results (scatter-gather is *inherent* to search — one place where it's the designed-for pattern, mitigated by replicas per shard and tight timeouts).

## How this shows up in interviews

- **Any media system:** metadata in DB + blobs in object storage + CDN in front + presigned upload/download. Four boxes, near-mandatory.
- **"Users can search posts/products"** → "Elasticsearch fed by CDC from the primary DB; BM25 + filters; eventually consistent by a few seconds."
- **Autocomplete/typeahead** → prefix/edge-ngram index (full design in Phase 4).
- **Estimation tie-in:** blob budgets (PB) vs metadata (TB at most) vs index (~similar order to text corpus) — three different stores, three different cost profiles.
`,
  resources: [
    {
      title: 'How S3-style object storage works',
      url: 'https://www.youtube.com/watch?v=v3HfUNQ0JOE',
      type: 'video',
      source: 'ByteByteGo (YouTube)',
    },
    {
      title: 'Elasticsearch from the bottom up (inverted indexes explained)',
      url: 'https://www.elastic.co/blog/found-elasticsearch-from-the-bottom-up',
      type: 'article',
      source: 'Elastic Engineering',
    },
    {
      title: 'Presigned URLs — the pattern',
      url: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html',
      type: 'doc',
      source: 'AWS Documentation',
    },
    {
      title: 'From Zero to 50 Million Uploads per Day: Scaling Media at Canva',
      url: 'https://www.canva.dev/blog/engineering/from-zero-to-50-million-uploads-per-day-scaling-media-at-canva/',
      type: 'article',
      source: 'Canva Engineering',
    },
    {
      title: 'The Google File System',
      url: 'https://static.googleusercontent.com/media/research.google.com/en//archive/gfs-sosp2003.pdf',
      type: 'doc',
      source: 'Google, SOSP 2003',
    },
    {
      title: 'Design Distributed Cloud Storage like S3',
      url: 'https://www.youtube.com/watch?v=UmWtcgC96X8',
      type: 'video',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
  ],
  challenges: [
    {
      type: 'quiz',
      id: 'quiz-1',
      title: 'Blob & search check',
      questions: [
        {
          q: 'Why should a photo app’s API servers NOT proxy image uploads to storage?',
          options: [
            'HTTP cannot carry binary data',
            'The stateless API fleet becomes a bandwidth/connection bottleneck for bytes it adds no value to; presigned URLs let clients upload directly to object storage',
            'Object storage rejects server uploads',
            'It breaks TLS',
          ],
          answer: 1,
          explanation:
            'Every GB through the API tier costs its sockets, memory, and egress for zero logic. Sign a time-limited URL, let S3 absorb the bytes, and let the "object created" event trigger processing. A near-mandatory sentence in media designs.',
        },
        {
          q: 'WHERE description LIKE \'%wireless%\' is slow on 50M products because…',
          options: [
            'LIKE is deprecated',
            'A leading wildcard can’t use a B-tree (which indexes prefixes) — it’s a full scan; substring/word search needs an inverted index',
            'The description column is too long',
            'Postgres lacks string functions',
          ],
          answer: 1,
          explanation:
            'B-trees answer "starts with", not "contains". The inverted index (word → posting list of docs) makes word queries O(list intersection). This is THE trigger for "add a search engine" in designs.',
        },
        {
          q: 'How should the search index stay in sync with the primary database?',
          options: [
            'The app writes to both Postgres and Elasticsearch in each request',
            'CDC/outbox events stream DB changes to indexer consumers — a derived, eventually-consistent view with no dual-write inconsistency',
            'Nightly full reindex only',
            'Elasticsearch becomes the primary store',
          ],
          answer: 1,
          explanation:
            'App-level dual writes half-fail (the queues topic’s dual-write problem — crash between the two writes). The event-stream pipeline gives ordered, replayable, at-least-once index updates (idempotent upserts by doc id).',
        },
        {
          q: 'Erasure coding (k=8 data + m=4 parity) vs 3× replication for 11-nines durability:',
          options: [
            'Erasure coding is faster to read',
            'Erasure coding reaches comparable durability at ~1.5× storage overhead vs 3× — the economics of exabyte storage; cost is reconstruction compute on failure',
            'Replication is more durable at the same cost',
            'They are identical techniques',
          ],
          answer: 1,
          explanation:
            'Any 8 of 12 fragments reconstruct the object — surviving 4 simultaneous losses at half the overhead of triplication. This is why S3-class storage is as cheap as it is; one sentence of it shows infra depth.',
        },
        {
          q: 'Search queries fan out to all 20 index shards and merge results. One shard’s p99 is spiking. Effect and standard mitigations?',
          options: [
            'No effect; other shards compensate',
            'Query latency ≈ slowest shard (scatter-gather tail problem): use replicas per shard, hedge/retry the laggard, and enforce per-shard timeouts returning partial results',
            'The index must be rebuilt',
            'Merge order changes',
          ],
          answer: 1,
          explanation:
            'Fan-out latency is a MAX, not an average (the tail-latency math from scalability). Search accepts scatter-gather by design and buys back the tail with redundancy + hedging + graceful partials — worth narrating.',
        },
        {
          q: 'Store 2 PB of user videos "forever", where 95% are rarely watched after 60 days. Cost lever?',
          options: [
            'Delete old videos',
            'Lifecycle policies: hot tier for new/popular content, automatic transition to infrequent-access/archival tiers — cutting storage cost several-fold',
            'Compress everything to 240p',
            'Move old videos into the database',
          ],
          answer: 1,
          explanation:
            'Tiered storage matches cost to access frequency (archival is ~10–20× cheaper than hot). Popularity-skew + lifecycle rules = the boring, correct answer to petabyte economics.',
        },
      ],
    },
    {
      type: 'lab',
      id: 'lab-1',
      title: 'Build an inverted index from scratch',
      intro: 'Forty lines of Python make the whole concept concrete — tokenize, index, intersect, rank.',
      steps: [
        {
          instruction: 'Build an inverted index over a mini corpus and run a two-word query.',
          command: `python3 -c "
import re
from collections import defaultdict
docs = {
 1:'The best margherita pizza in town, wood fired',
 2:'Wireless noise cancelling headphones with best battery',
 3:'Pizza and pasta restaurant, family friendly',
 4:'Best wireless earbuds for running and gym',
 5:'Deep dish pizza — the best pizza dough recipe',
}
STOP={'the','in','and','with','for','a','of'}
def tokens(t): return [w for w in re.findall(r'[a-z]+', t.lower()) if w not in STOP]
index = defaultdict(set)
for id, text in docs.items():
    for w in tokens(text): index[w].add(id)
print('posting list for pizza:', sorted(index['pizza']))
print('posting list for best :', sorted(index['best']))
q = tokens('best pizza')
result = set.intersection(*(index[w] for w in q))
print('query best pizza ->', sorted(result))"`,
          expected: "pizza→{1,3,5}, best→{1,2,4,5}, intersection → docs 1 and 5. That intersection IS how search engines answer queries.",
        },
        {
          instruction: 'Add TF ranking: score by term frequency so doc 5 ("pizza" twice) outranks doc 1.',
          command: `python3 -c "
import re
from collections import defaultdict, Counter
docs = {1:'best margherita pizza wood fired', 5:'deep dish pizza best pizza dough recipe'}
def tokens(t): return re.findall(r'[a-z]+', t.lower())
tf = {id: Counter(tokens(t)) for id, t in docs.items()}
q = ['best','pizza']
scores = {id: sum(tf[id][w] for w in q) for id in docs}
print(sorted(scores.items(), key=lambda x:-x[1]))"`,
          expected: 'doc 5 scores 3 (pizza×2 + best×1), doc 1 scores 2 — term frequency ranking, the seed of BM25.',
        },
        {
          instruction: 'Feel why LIKE %...% dies: time a substring scan over 1M rows in SQLite vs the idea of a posting-list lookup.',
          command: `sqlite3 /tmp/search.db "CREATE TABLE p(t TEXT); WITH RECURSIVE s(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM s WHERE i<1000000) INSERT INTO p SELECT 'product number '||i||CASE i%997 WHEN 0 THEN ' wireless' ELSE '' END FROM s;" && time sqlite3 /tmp/search.db "SELECT count(*) FROM p WHERE t LIKE '%wireless%';" && rm /tmp/search.db`,
          expected: 'The scan takes real time over 1M rows and grows linearly; an inverted-index lookup for "wireless" would touch ~1000 postings directly.',
        },
        {
          instruction: 'See presigned URLs in the wild: any private file link from Google Drive/Slack/WhatsApp Web — inspect the URL parameters.',
          expected: 'Long signature + expiry parameters in the URL (X-Amz-Signature, Expires, etc.) — time-limited capability links, exactly the pattern from this topic.',
        },
      ],
    },
    {
      type: 'design',
      id: 'design-1',
      title: 'Design exercise: storage + search for a resume-hosting product',
      prompt: `
A LinkedIn-lite: 50M users upload resume PDFs (~1 MB), recruiters run searches like "kubernetes AND mumbai, 5+ years, available now", and each profile page shows the PDF inline. ~200 uploads/s peak, ~2k searches/s peak.

Design the storage and search architecture: where PDFs live, the upload flow, what gets indexed and how it stays fresh, the search query path, and access control for private resumes (only recruiters with credits can view).
`,
      hints: [
        'PDF bytes vs searchable text vs filterable fields — three different homes.',
        'Text must be EXTRACTED from PDFs — where does that fit? (You built this pipeline shape in the queues topic.)',
        'Private blob + CDN — what makes a link safe to hand out?',
      ],
      modelAnswer: `
**Three homes for three shapes of data:**
- **PDF bytes → object storage** (\`resumes/{user_id}/{version}.pdf\`), private bucket, lifecycle old versions to cold tier.
- **Structured fields (name, city, years, availability) → Postgres** — source of truth, transactional profile edits.
- **Searchable text + filters → Elasticsearch** — inverted index on extracted resume text, keyword fields for city/years/availability facets.

**Upload flow:** client asks API → **presigned PUT** → uploads directly to the bucket → object-created event → queue → extraction workers (PDF→text, virus scan, parse skills) → write parsed fields to Postgres → outbox/CDC event → indexer upserts the ES document. All steps idempotent (keyed by user+version); the API fleet never carries PDF bytes. At 200/s × 1 MB = 200 MB/s of upload bandwidth that just bypassed your servers.

**Search path:** recruiter query → API → ES: BM25 over text (\`kubernetes\`) AND filters (\`city=mumbai, years>=5, available=true\`) → ranked ids → hydrate display cards from Postgres/cache. 2k searches/s across a modest ES cluster (e.g. 6–10 shards + replicas); scatter-gather with per-shard timeouts and partial results on laggards.

**Freshness:** index is eventually consistent (seconds behind edits) — fine for discovery, and the profile PAGE reads Postgres, so users always see their own edits (read-your-writes where it matters, eventual where it doesn't — the consistency topic applied).

**Access control:** the search result shows snippets; opening the actual PDF calls the API, which checks recruiter entitlement/credits, records the view (billing event!), and returns a **short-lived presigned GET** (60 s). The bucket stays private; the CDN can still front it with signed URLs/cookies. Leaked links die in a minute — capability-based access without proxying bytes.
`,
    },
  ],
}
