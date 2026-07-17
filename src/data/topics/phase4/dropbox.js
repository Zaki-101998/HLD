export default {
  id: 'dropbox',
  title: 'Design Dropbox / Google Drive',
  subtitle: 'File sync & storage: chunking, dedup, metadata vs blobs, and multi-device sync/conflicts',
  days: 2,
  content: `
## The problem

Design a file hosting + sync service: users store files in the cloud and have them **sync across all their devices** — edit a file on your laptop, and it updates on your phone. Dropbox/Google Drive/OneDrive. The interesting pieces are **chunking large files** (so a one-byte change doesn't re-upload a 2 GB file), **deduplication** (store identical data once), the **metadata-vs-blob split**, and **multi-device sync with conflict handling** (a callback to Phase 3 clocks). It's the file-oriented cousin of Pastebin, scaled up with sync.

## Step 1 — Requirements

**Functional:** upload/download files; **sync** changes across a user's devices automatically; share files/folders; version history; work with large files efficiently. *De-scope:* real-time collaborative editing (that's Google Docs/CRDTs — mention), permissions details.

**Non-functional:** **durability above all** (never lose a user's file — this is sacred); **efficient sync** (only transfer what changed, not whole files); **availability**; scale (billions of files, petabytes); reasonable sync latency (seconds). Note: durability and efficiency dominate over raw latency here.

## Step 2 — Estimation

- Say **500M users**, ~**GBs each** → **exabytes** of storage → object storage, tiered. Most files are read/synced far more than written; many files are **duplicates** across users (the same PDF, meme, installer) → dedup saves enormous storage.
- Uploads of large files + frequent small edits → the **chunking + only-sync-changed-chunks** design is what makes this efficient.

## Step 3 — API

\`\`\`
POST /files (begin upload)   → per-chunk pre-signed upload URLs
PUT  /files/{id}/metadata    { name, path, chunk_list, version }
GET  /files/{id}             → metadata + chunk references (download chunks from storage/CDN)
GET  /changes?cursor=        // sync: what changed since last sync (delta)
\`\`\`

## Step 4 — The core idea: split files into chunks; separate metadata from blocks

- **Chunking:** break each file into fixed-size **blocks/chunks** (e.g. 4 MB). A file = an ordered list of chunk references. This is the foundational decision — everything good follows from it.
- **Metadata DB** (small, structured, transactional): \`File { file_id, user_id, name, path, version, [chunk_hashes in order] }\`, \`Chunk { hash, storage_location, size }\`. Needs consistency and query → SQL/relational.
- **Block/chunk store:** the actual chunk bytes live in **object storage**, keyed by the chunk's **content hash**. (Metadata-vs-blob split, like Pastebin.)

## Step 5 & 6 — Deep dives (why chunking is powerful)

### Deep dive 1 — Efficient sync via chunking (the killer feature)
When a user edits a large file, you don't re-upload the whole thing. The client:
1. **Re-chunks** the file and computes each chunk's **hash**.
2. Compares to the previous version's chunk hashes — **only the changed chunks differ**.
3. **Uploads only the changed chunks** and updates the file's chunk list (a new version pointing mostly at existing chunks).
A one-byte change in a 2 GB file → transfer one 4 MB chunk, not 2 GB. Downloads to other devices likewise fetch **only the chunks they don't already have**. This **delta sync** is the whole value proposition. (Real Dropbox uses content-defined/variable chunking so an insertion doesn't shift all subsequent boundaries — mention as a refinement.)

### Deep dive 2 — Deduplication (via content-hash chunks)
Because chunks are keyed by **content hash**, identical chunks — whether within one file, across a user's files, or **across different users** — are stored **once**. Before uploading a chunk, ask "does a chunk with this hash already exist?"; if yes, just reference it (no upload). The same popular file uploaded by a million users costs ~one copy of storage. This **content-addressed dedup** is a massive storage win and also speeds "uploads" (already-present chunks skip transfer entirely). (Security note: cross-user dedup has subtle privacy considerations — worth naming.)

### Deep dive 3 — Multi-device sync mechanics
How does device B learn that device A changed a file?
- Each client runs a **sync agent** that watches the local folder and talks to a **metadata/sync service**.
- On a change, A uploads changed chunks + updates metadata (new version). The service records the change and **notifies other devices** — via **long-polling / WebSocket** (a device holds a connection and gets pushed "something changed"), or the client periodically polls a **\`/changes?cursor\`** delta endpoint. Notified devices pull the new metadata and fetch only the missing chunks.
- A **change log / journal** per user (monotonic version cursor) lets a device sync incrementally from wherever it left off — efficient and resumable.

### Deep dive 4 — Conflicts (Phase 3 callback)
Two devices edit the same file while one is **offline**, then both sync → concurrent versions. You can't trust device timestamps (clocks lie). Detect concurrency with **versioning** (version numbers / vector clocks per file); if the incoming version isn't a descendant of the stored one, it's a **conflict**. Resolution for opaque files (you can't merge arbitrary binaries): **keep both** — Dropbox's famous "\`filename (conflicted copy from Laptop)\`" — never silently discard a user's edit. (Text/structured files could 3-way merge; general files can't.) This is exactly the offline-sync design from the clocks topic.

### Durability & scale
- **Durability:** object storage replicates chunks across zones; never delete chunks still referenced by any version (reference counting / GC only when unreferenced). Version history is cheap because unchanged chunks are shared.
- **Scale:** metadata sharded by user_id; chunk store scales horizontally; a CDN can serve downloads of popular shared files.

## Step 7 — Wrap-up

Dropbox is built on one foundational decision — **chunk files into content-hashed blocks** — from which the two superpowers follow: **delta sync** (upload/download only changed chunks, so a tiny edit to a huge file transfers one chunk) and **content-addressed deduplication** (identical chunks stored once, even across users). Metadata (file → ordered chunk hashes, versions) lives in a **transactional DB**; chunk bytes live in **replicated object storage** keyed by hash. **Multi-device sync** uses a per-user **change journal** plus **push/long-poll notifications** so devices pull deltas incrementally; **conflicts** from concurrent offline edits are detected via **versioning/vector clocks** and resolved by **keeping both copies** (clocks can't order concurrent edits). Trade-offs: chunking/hashing overhead and metadata complexity, traded for enormous bandwidth and storage savings; eventual consistency across devices; keep-both conflict handling over risky auto-merge. The signal: recognizing **chunking + content-hash dedup** as the core, and handling **sync conflicts** correctly.

## How this shows up in interviews

- The interviewer wants **chunking** and the two things it enables: **delta sync** (don't re-transfer whole files) and **content-hash deduplication** (store identical data once, across users). Lead with the chunk-and-hash insight.
- Expect **"how does a small edit to a huge file sync efficiently?"** — re-chunk, hash, upload only changed chunks; other devices fetch only missing chunks.
- Expect **"how do you handle two devices editing the same file offline?"** — versioning/vector clocks to detect concurrency, keep-both conflict resolution (a Phase 3 clocks callback).
- Bonus: metadata-vs-blob split, per-user change journal + push notifications for sync, durability via replication + reference-counted chunk GC, cross-user dedup privacy note.
`,
  resources: [
    {
      title: 'Design Dropbox / Google Drive (chunking, sync, dedup)',
      url: 'https://www.youtube.com/watch?v=U0xTu6E2CT8',
      type: 'video',
      source: 'ByteByteGo',
    },
    {
      title: 'System Design: Dropbox / file sync',
      url: 'https://www.hellointerview.com/learn/system-design/problem-breakdowns/dropbox',
      type: 'article',
      source: 'Hello Interview',
    },
    {
      title: 'How Dropbox scaled storage (Magic Pocket) & sync',
      url: 'https://dropbox.tech/infrastructure/inside-the-magic-pocket',
      type: 'article',
      source: 'Dropbox Engineering',
    },
  ],
  challenges: [
    {
      type: 'quiz',
      id: 'quiz-1',
      title: 'Dropbox design check',
      questions: [
        {
          q: 'What is the foundational design decision in a file sync service, and what two capabilities does it enable?',
          options: [
            'Storing whole files in a SQL database; enables joins and transactions',
            'Splitting files into content-hashed chunks/blocks — enabling delta sync (transfer only changed chunks) and content-addressed deduplication (store identical chunks once, even across users)',
            'Using a graph database; enables sharing',
            'Keeping files only on the client; enables offline mode',
          ],
          answer: 1,
          explanation:
            'Chunking is the root decision. Because a file is an ordered list of content-hashed chunks, a small edit re-uploads only the changed chunk(s), and identical chunks anywhere are stored once. Both superpowers — efficient sync and dedup — fall out of chunk-and-hash.',
        },
        {
          q: 'A user changes one byte in a 2 GB file. How does the client sync it efficiently?',
          options: [
            'Re-upload the entire 2 GB file',
            'Re-chunk the file, hash each chunk, compare to the previous version’s hashes, and upload ONLY the changed chunk(s) (e.g. one 4 MB block) while updating the file’s chunk list to a new version',
            'Upload nothing; the server guesses the change',
            'Email the file to the server',
          ],
          answer: 1,
          explanation:
            'Delta sync: only chunks whose hash changed are uploaded; the new version mostly references existing chunks. Other devices download only the chunks they lack. Variable/content-defined chunking further avoids re-uploading everything after an insertion shifts boundaries.',
        },
        {
          q: 'Because chunks are keyed by content hash, what happens when a million users upload the same popular file?',
          options: [
            'It’s stored a million times',
            'It’s stored roughly once — before uploading a chunk, the system checks whether that content hash already exists; if so it just adds a reference (no upload), so identical chunks across all users cost ~one copy of storage',
            'Each copy is compressed differently',
            'The file is rejected as a duplicate',
          ],
          answer: 1,
          explanation:
            'Content-addressed dedup means identical data — within a file, across a user’s files, or across users — is stored a single time and referenced. This is a massive storage win and also skips transferring already-present chunks. (Cross-user dedup has privacy nuances worth noting.)',
        },
        {
          q: 'Two of a user’s devices edit the same file while one is offline, then both sync. How do you handle it?',
          options: [
            'Keep whichever has the later device timestamp (last-write-wins)',
            'Detect concurrency with versioning/vector clocks (the incoming version isn’t a descendant of the stored one → conflict), and KEEP BOTH copies (e.g. "filename (conflicted copy from Laptop)") — never silently discard an edit, since arbitrary binaries can’t be safely auto-merged',
            'Randomly pick one and delete the other',
            'Refuse the sync until the user is online on both',
          ],
          answer: 1,
          explanation:
            'Device clocks can’t order genuinely concurrent edits (Phase 3 clocks), so LWW would silently destroy data. Versioning detects the conflict; keeping both copies (Dropbox’s conflicted-copy behavior) is loss-averse. Only mergeable formats can be auto-merged.',
        },
      ],
    },
    {
      type: 'design',
      id: 'design-1',
      title: 'Design exercise: file sync & storage',
      prompt: `
Design a file hosting and sync service (Dropbox/Google Drive): users store files in the cloud and have them automatically sync across all their devices, including large files that receive small edits, with durability as the top priority.

Cover the framework, but focus depth on: (1) how files are stored (chunking + metadata vs blobs), (2) how a small change to a large file syncs efficiently, (3) how deduplication works, (4) how multiple devices stay in sync, and (5) how you handle conflicting edits from two devices. Note durability measures and the trade-offs.
`,
      hints: [
        'The root decision is chunking into content-hashed blocks — everything follows from it.',
        'Delta sync = upload only changed chunks; dedup = identical chunks stored once.',
        'Conflicts: versioning/vector clocks + keep-both (a Phase 3 clocks callback).',
      ],
      modelAnswer: `
**Requirements** — Functional: upload/download, auto-sync across devices, sharing, version history, efficient large-file handling (de-scope real-time co-editing). Non-functional: **durability first** (never lose files), efficient sync (transfer only changes), availability, exabyte scale, seconds-level sync latency.

**Estimation** — 500M users × GBs → exabytes → tiered object storage; heavy duplication across users → dedup saves massively; large files + small edits → chunk + sync-only-changed-chunks.

**API** — begin-upload → per-chunk pre-signed URLs; update metadata (chunk list, version); download (metadata + chunks); \`GET /changes?cursor\` delta endpoint.

**Storage model (core)** — **chunk** files into ~4 MB **content-hashed blocks**; a file = ordered list of chunk hashes. **Metadata DB** (SQL, transactional): \`File{id, user, path, version, [chunk_hashes]}\`, \`Chunk{hash, location}\`. **Chunk bytes** in replicated **object storage** keyed by content hash.

**Deep dives:**
1. *Storage* — chunking + metadata-vs-blob split (as above).
2. *Efficient sync (delta)* — on edit, client re-chunks, hashes, diffs against prior hashes, and **uploads only changed chunks**, creating a new version mostly referencing existing chunks; other devices fetch only missing chunks. One-byte edit to 2 GB → one 4 MB chunk. (Content-defined chunking avoids boundary shifts.)
3. *Dedup* — content-hash keying stores identical chunks **once** (within file, across files, across users); check-hash-before-upload skips transfer of existing chunks. (Cross-user dedup privacy note.)
4. *Multi-device sync* — per-user **change journal** (monotonic cursor); a device that changes a file uploads chunks + updates metadata; the sync service **notifies other devices** via **long-poll/WebSocket** (or they poll \`/changes\`), which pull the delta incrementally and resumably.
5. *Conflicts* — concurrent offline edits detected via **versioning/vector clocks** (non-descendant version = conflict); resolve by **keeping both** ("conflicted copy from Laptop") — never LWW-discard, since binaries can’t be safely merged. (Phase 3 clocks callback.)

**Durability** — object storage replicates chunks across zones; **reference-count** chunks and GC only when unreferenced; version history is cheap via shared unchanged chunks. **Scale**: metadata sharded by user_id; CDN for popular shared downloads.

**Trade-offs** — chunk/hash overhead + metadata complexity, traded for huge bandwidth/storage savings; eventual consistency across devices; keep-both over risky auto-merge.

**One-line summary:** chunk files into content-hashed blocks (metadata in a transactional DB, bytes in replicated object storage) to unlock delta sync and cross-user dedup, propagate changes via a per-user change journal + push notifications so devices pull only missing chunks, and resolve concurrent offline edits with versioning + keep-both — all with durability as the top priority.
`,
    },
  ],
}
