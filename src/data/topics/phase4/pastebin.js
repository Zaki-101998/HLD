export default {
  id: 'pastebin',
  title: 'Design Pastebin / a Text-Store Service',
  subtitle: 'Store-and-share blobs of text: blob storage vs DB, expiry, and read scaling',
  days: 2,
  content: `
## The problem

Design a service where users paste a blob of text (or code), get a unique URL, and share it; anyone with the URL can read it. Think Pastebin, GitHub Gist, or Hastebin. It's a close cousin of the URL shortener — same key-generation idea — but adds a **large content payload**, which introduces the **blob-storage-vs-database** decision and metadata/data separation. A great problem for showing you know *where different kinds of data belong*.

## Step 1 — Requirements

**Functional:** create a paste (up to some size limit, say 1–10 MB of text) → get a short URL; read a paste by URL; optional **expiration** (paste auto-deletes after a time/date) and **visibility** (public/unlisted). *De-scope:* editing, syntax highlighting (client-side), accounts, comments.

**Non-functional:** **read-heavy** (a paste is written once, read many times); low-latency reads; durable (don't lose pastes before expiry); highly available. Size limit per paste to bound storage.

## Step 2 — Estimation

- Say **1M new pastes/day** (~12 writes/sec) and **10:1 reads** (~120 reads/sec — modest; the popular ones spike). Average paste ~10 KB.
- **Storage:** 1M/day × 10 KB = **10 GB/day** → ~3.6 TB/year of *content*. Metadata (key, timestamps, expiry) is tiny by comparison. Content clearly outgrows a comfortable single DB → **object storage**.
- This estimation drives the central decision: **separate the small metadata from the large content.**

## Step 3 — API

\`\`\`
POST /api/paste { content, [expiry], [visibility] } → { url: "https://pb.io/aX9k2" }
GET  /{paste_id}                                    → the paste content (+ metadata)
DELETE /{paste_id}  (if owned / with token)
\`\`\`

## Step 4 — Data model — the key idea: split metadata from content

- **Metadata DB** (small, structured, queried): \`Paste { paste_id (PK), content_ref, created_at, expiry, visibility, size }\`. A KV/SQL store — tiny rows, fast lookups by paste_id.
- **Content store** (large blobs): the actual text lives in **object/blob storage** (S3, GCS) keyed by \`content_ref\`. Blob stores are cheap, durable (built-in replication), and scale to petabytes — exactly right for many large, immutable objects.

**Why not store text in the database?** Large blobs bloat the DB, slow backups, waste expensive DB storage/IO, and don't need query capabilities (you only fetch by id). This **metadata-in-DB, blob-in-object-store** pattern recurs everywhere (images, videos, documents) — naming it is a strong signal.

## Step 5 — High-level design

\`\`\`
 Create:  client ─▶ LB ─▶ App server ─▶ Key-Gen (paste_id)
                                   ├─▶ write text to Object Store (S3) → content_ref
                                   └─▶ write metadata row (paste_id, content_ref, expiry) to DB

 Read:    client ─▶ LB ─▶ App server ─▶ metadata DB (lookup by paste_id, check expiry)
                                   └─▶ fetch blob from Object Store (or CDN) → return
                        (hot pastes cached in Redis / served via CDN)
\`\`\`
Short, non-sequential \`paste_id\` generated exactly like the URL shortener (KGS / pre-generated keys / base62 counter). Popular pastes served from **CDN/cache** so the origin isn't hammered.

## Step 6 — Deep dives

**Read scaling & hot pastes.** Most reads hit a small set of viral pastes. Front the object store with a **CDN** (content is immutable → trivially cacheable) and/or **Redis** for small hot blobs. Immutability is a gift: no cache-invalidation problem — a paste never changes, so cache it forever (until expiry).

**Expiration / cleanup.** Two mechanisms, usually combined:
- **Lazy deletion:** on read, check \`expiry\`; if past, return 404 and it's effectively gone.
- **Active cleanup:** a background **cron/worker** periodically scans for expired pastes and deletes their metadata + blob to reclaim storage. Object stores also support **TTL/lifecycle policies** to auto-delete blobs after N days — offload expiry to the storage layer.

**Large uploads.** For big pastes, let the client **upload directly to object storage via a pre-signed URL** (the app server hands out a temporary signed S3 URL; the client PUTs the blob straight to S3, bypassing your servers). This keeps huge payloads off your app tier — a great detail that also applies to image/video/file uploads in later problems.

**Consistency & durability.** Write the blob first, then the metadata (so a metadata row never points at a missing blob). Object storage handles durability via replication; the metadata DB is replicated for availability.

## Step 7 — Wrap-up

Pastebin = URL shortener + a large payload. The defining decision is **separating small metadata (in a DB, for fast keyed lookup and expiry) from large immutable content (in object storage, cheap and durable)**, fronted by a **CDN/cache** that exploits the content's immutability for free read scaling. Key generation reuses the shortener's approach; expiry combines lazy checks with active/lifecycle cleanup; large uploads go **direct to object storage via pre-signed URLs**. Trade-offs: two writes (blob + metadata) and eventual consistency between them, in exchange for right-sized storage and effortless read scaling.

## How this shows up in interviews

- The interviewer wants to see you **not store big blobs in the database** — say "metadata in DB, content in object storage" and explain why (cost, backups, no query need). This is the signature insight.
- Expect **"how do you handle expiration?"** — lazy check + active cleanup + storage lifecycle TTL.
- Expect **"how do you scale reads / handle a viral paste?"** — CDN + cache, and the point that immutable content is trivially cacheable (no invalidation).
- Bonus: **pre-signed URLs** for direct uploads — reusable across every media/file problem.
`,
  resources: [
    {
      title: 'Design Pastebin (metadata vs blob storage)',
      url: 'https://github.com/donnemartin/system-design-primer/tree/master/solutions/system_design/pastebin',
      type: 'doc',
      source: 'System Design Primer',
    },
    {
      title: 'S3 pre-signed URLs — upload directly to object storage',
      url: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html',
      type: 'doc',
      source: 'AWS Documentation',
    },
    {
      title: 'Blob storage & CDN patterns for read-heavy content',
      url: 'https://www.youtube.com/watch?v=Rtl9qBAZUFo',
      type: 'video',
      source: 'ByteByteGo (CDN explainer)',
    },
  ],
  challenges: [
    {
      type: 'quiz',
      id: 'quiz-1',
      title: 'Pastebin check',
      questions: [
        {
          q: 'What is the signature design decision in a Pastebin-style service?',
          options: [
            'Using a graph database',
            'Separating small METADATA (paste_id, expiry, visibility) into a fast DB from the large CONTENT blob stored in cheap, durable object storage (S3) — don’t put big text in the database',
            'Storing everything in a single SQL table',
            'Using strong consistency everywhere',
          ],
          answer: 1,
          explanation:
            'Large blobs in a DB bloat it, slow backups, waste costly storage/IO, and gain nothing (you only fetch by id). Metadata-in-DB + content-in-object-store is the recurring pattern for any large-payload system (images, video, files). Naming it signals experience.',
        },
        {
          q: 'Why is a paste’s content especially easy to cache/serve from a CDN?',
          options: [
            'Because it’s small',
            'Because it’s IMMUTABLE — a paste never changes after creation, so there is no cache-invalidation problem; you can cache it until it expires',
            'Because CDNs only work for text',
            'Because it’s stored in SQL',
          ],
          answer: 1,
          explanation:
            'Immutability removes the hardest part of caching (invalidation). Since a paste is write-once/read-many and never updated, a CDN or Redis can hold it indefinitely (until expiry), giving effortless read scaling for viral pastes.',
        },
        {
          q: 'How do you handle expiration of pastes efficiently?',
          options: [
            'Delete synchronously on every write',
            'Combine lazy deletion (check expiry on read, return 404 if past) with an active background cleanup job (and/or object-storage lifecycle/TTL policies) to reclaim storage',
            'Never delete anything',
            'Ask users to delete their own pastes',
          ],
          answer: 1,
          explanation:
            'Lazy checks make expired pastes instantly unreadable without scanning; a periodic worker (or S3 lifecycle TTL) reclaims the actual storage. Combining them avoids both stale reads and unbounded storage growth.',
        },
        {
          q: 'For very large paste/file uploads, how do you keep the payload off your application servers?',
          options: [
            'Stream it through the app server to the database',
            'Hand the client a pre-signed URL so it uploads the blob DIRECTLY to object storage (S3), bypassing your app tier; the app only records metadata',
            'Reject large uploads entirely',
            'Base64-encode it into the URL',
          ],
          answer: 1,
          explanation:
            'A pre-signed URL is a temporary, signed link that authorizes a direct client→S3 PUT. Huge payloads never touch your servers’ bandwidth/CPU. This pattern reappears in image, video, and file-storage designs, so it’s worth having ready.',
        },
      ],
    },
    {
      type: 'design',
      id: 'design-1',
      title: 'Design exercise: Pastebin end to end',
      prompt: `
Design Pastebin: users submit text (up to ~10 MB), get a short shareable URL, and anyone with the URL can read it. Support optional expiration and unlisted/public visibility. Assume ~1M new pastes/day, read-heavy, with occasional viral pastes.

Cover the framework end to end, but spend your depth on: (1) where the paste content lives vs its metadata and WHY, (2) how you scale reads for a viral paste, (3) how expiration works, and (4) handling large uploads. Note the trade-offs (e.g. the two-write consistency question).
`,
      hints: [
        'Estimate content storage/day — does it belong in your database?',
        'Content is immutable — what does that unlock for caching?',
        'Expiry = lazy + active + storage TTL. Large uploads = pre-signed URLs.',
      ],
      modelAnswer: `
**Requirements** — Functional: create paste → short URL, read by URL, optional expiry + visibility (de-scope editing/highlighting/accounts). Non-functional: read-heavy, low-latency reads, durable, available; per-paste size cap.

**Estimation (drives the decision)** — 1M pastes/day × ~10 KB ≈ 10 GB/day ≈ ~3.6 TB/yr of *content*; metadata is tiny. Content clearly belongs in **object storage**, not the DB.

**API** — \`POST /paste\`, \`GET /{id}\`, \`DELETE /{id}\`.

**Data model (the crux)** — **Metadata DB**: \`Paste{paste_id PK, content_ref, created_at, expiry, visibility}\` (KV/SQL, fast keyed lookup). **Content**: the text in **object storage (S3)** keyed by content_ref. Reason: big immutable blobs bloat/slow a DB, cost more, and need no query capability — you only fetch by id.

**High-level** — Create: app server generates a short non-sequential \`paste_id\` (KGS/pre-generated keys, like the URL shortener), writes the blob to S3 (getting content_ref), then writes the metadata row. Read: look up metadata by id, check expiry, fetch blob from S3/CDN, return.

**Deep dives:**
1. *Metadata vs content* — as above; the signature insight.
2. *Read scaling / viral paste* — front S3 with a **CDN** and/or **Redis**; content is **immutable**, so cache it until expiry with no invalidation problem. Origin barely sees repeat reads.
3. *Expiration* — **lazy** (check expiry on read → 404) + **active cleanup** worker (delete metadata + blob) + **S3 lifecycle TTL** to auto-expire blobs. Combined, they keep reads correct and storage bounded.
4. *Large uploads* — issue a **pre-signed S3 URL**; the client PUTs the blob **directly to object storage**, bypassing app servers; app only records metadata.

**Trade-offs** — two writes (blob then metadata) → write blob first so metadata never dangles; eventual consistency between them is acceptable. We trade a slightly more complex write path for right-sized storage and near-free read scaling.

**One-line summary:** Pastebin is a URL shortener with a big immutable payload, so the design hinges on splitting tiny metadata (DB, keyed lookup + expiry) from large content (object storage), exploiting immutability for CDN/cache read scaling, expiring via lazy+active+lifecycle cleanup, and pushing large uploads straight to S3 through pre-signed URLs.
`,
    },
  ],
}
