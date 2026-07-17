export default {
  id: 'google-docs',
  title: 'Design a Collaborative Editor (Google Docs)',
  subtitle: 'Real-time multi-user editing: how concurrent edits to the same document converge without conflicts — OT vs CRDT, WebSockets, and presence',
  days: 2,
  content: `
## The problem

Design a document editor where **many people edit the same document simultaneously** and everyone sees everyone else's changes in near-real-time, with no lost edits and no divergence — every client eventually shows an **identical document**. The heart of the problem is **conflict resolution**: if two people type at the same position at the same instant, how do their edits merge deterministically?

## Step 1 — Requirements

**Functional:** (1) multiple users edit one document concurrently, (2) edits propagate to all collaborators in real time, (3) all clients **converge** to the same final state, (4) presence/cursors (see who's editing and where), (5) persistence (document survives, history/undo).

*De-scope but mention:* rich formatting, comments, offline editing, access control.

**Non-functional:** **low latency** (edits feel instant), **convergence/consistency** (no two clients end up different — the defining correctness property), **high availability**, and **durability** (never lose a keystroke). Scale is per-document modest (a handful to dozens of active editors) but there are millions of documents.

## Step 2 — Estimation

- A doc has maybe **2–50 concurrent editors**; each generates a few ops/sec while actively typing → tens of small ops/sec **per document**.
- Ops are tiny (insert 'a' at pos 42 — a few dozen bytes). The system is **many independent low-traffic real-time sessions**, not one giant firehose. This shapes the design toward **per-document routing**: all collaborators on a doc must land on the **same server/session** so their ops can be ordered together.
- Millions of docs × small each → storage is manageable; the interesting scaling axis is **connection management** (millions of persistent WebSockets) and **routing users of the same doc together**.

## Step 3 — API / transport

Editing is **not** request/response — it's a **persistent bidirectional connection** so the server can push others' edits to you. Use **WebSockets** (fallback: SSE/long-poll).

\`\`\`
WS connect  /docs/{id}/session
  client → server: { op: insert, pos, char, client_id, base_version }
  server → clients: { op, transformed_pos, version }   // broadcast to all collaborators
  server → clients: { presence: {user, cursor_pos} }
REST:
  GET  /docs/{id}        → snapshot + current version
  POST /docs             → create
\`\`\`

## Step 4 — Data model & the ordering problem

A document is a sequence of characters. Naively storing "the current text" and having clients overwrite it loses concurrent edits. Instead model the document as an **ordered log of operations** applied to a base snapshot:

\`\`\`
Document { doc_id, snapshot, version }
Op       { doc_id, seq, type(insert/delete), position, char, client_id }
\`\`\`
The server assigns a **monotonic version/sequence** to each accepted op, giving a **total order**. Periodically compact the op log into a new snapshot (so you don't replay from the beginning of time). This log is also your **history/undo**.

## Step 5 — High-level design

\`\`\`
 clients ⇄ WebSocket ⇄ Doc-session server (per document) ─▶ ordered op log ─▶ storage
                              │                                    │
                        transform/merge ops                 snapshot + compaction
                              │
                        broadcast to all collaborators (+ presence)
\`\`\`
All editors of doc X connect (via a gateway that routes by doc_id, using **consistent hashing**) to the **same session server**, which is the single point that **orders and merges** ops, then broadcasts the transformed result to everyone. Presence (cursors, who's online) rides the same channel, kept in memory (Redis) with a short TTL.

\`\`\`mermaid
sequenceDiagram
  autonumber
  participant A as Alice
  participant S as Doc-session server
  participant B as Bob
  A->>S: insert "H" at pos 0 (base v5)
  S->>S: assign v6, transform vs concurrent ops
  S-->>A: ack v6
  S-->>B: apply insert "H" at pos 0 (v6)
  B->>S: insert "i" at pos 0 (base v5, concurrent)
  S->>S: transform against v6 → pos 1
  S-->>B: ack v7
  S-->>A: apply insert "i" at pos 1 (v7)
  Note over A,B: both converge to "Hi"
\`\`\`

## Step 6 — Deep dive: conflict resolution (OT vs CRDT)

Two users edit concurrently against the same base version. Their raw positions are now stale — if Alice inserts at 0 and Bob also inserts at 0, blindly applying both corrupts the text. Two industry approaches make edits **commutative/convergent**:

**Operational Transformation (OT)** — what Google Docs uses.
- The server keeps the authoritative op order. When a new op arrives that was based on an older version, the server **transforms** it against the ops that happened since, adjusting its position. (Bob's "insert at 0" becomes "insert at 1" because Alice already inserted a char at 0.)
- ✅ Compact ops, no per-character metadata overhead, proven at scale.
- ❌ Transformation functions are **notoriously hard to get right** (every op-pair combination), and OT typically **needs a central server** to define the canonical order.

**CRDTs (Conflict-free Replicated Data Types)** — used by Figma, Yjs, Automerge.
- Each character gets a **unique, globally-ordered identifier** (e.g., a fractional index or a (site_id, counter) pair) instead of a mutable integer position. Because identifiers are stable and totally orderable, concurrent inserts/deletes **merge deterministically with no transformation** — order of arrival doesn't matter.
- ✅ Commutative by construction, works **peer-to-peer / offline** (no central authority needed), simpler correctness argument.
- ❌ **Metadata overhead** (each char carries an id; tombstones for deletes accumulate), historically more memory. Modern CRDTs mitigate this.

**Which to pick?** Say it depends: **OT** if you're fine with a central server and want minimal per-op payload (Google Docs' choice); **CRDT** if you want offline-first, P2P, or want to avoid writing transformation functions (the modern default for new collaborative apps). Naming both, with the *stable-identifier vs transform-against-history* distinction, is the strong answer.

**Why not "last write wins"?** LWW (a simple conflict rule from Phase 3) would **silently drop** one user's concurrent edit — unacceptable for a text editor where every keystroke must survive. OT/CRDT preserve *both* edits by merging, not choosing.

**Durability & recovery:** ack an op only after it's durably in the op log; on reconnect, a client sends its last-known version and the server replays the ops it missed. Snapshots + compaction bound replay cost.

## Step 7 — Wrap-up

A collaborative editor is a **convergence** problem: concurrent edits to shared text must merge so every client ends identical. Model the document as an **ordered op log** over a snapshot; route all editors of a document to the **same session server** (consistent hashing by doc_id) over **WebSockets** so one place assigns a total order and broadcasts. Resolve concurrent edits with **OT** (transform stale ops against newer ones — Google Docs) or **CRDTs** (stable per-character identifiers that merge commutatively — Figma/Yjs); reject naive last-write-wins because it drops edits. Persist ops durably for history/undo and replay-on-reconnect, compacting into snapshots to bound cost. Presence/cursors ride the same channel in memory with a TTL. With more time: access control, rich text/formatting as ops, and offline editing (which pushes you toward CRDTs).

## How this shows up in interviews

- The premier **real-time collaboration** question. The signal is whether you know **concurrent edits need OT or CRDT** — and can explain *why* naive approaches (LWW, overwriting) lose data.
- Expect **"two people type at the same position at once — what happens?"** → transform (OT) or stable identifiers (CRDT), converging to the same result with both edits preserved.
- Expect **"why WebSockets instead of polling?"** → the server must **push** other people's edits with low latency; a persistent bidirectional connection is the natural fit.
- Expect **"how do you make sure all collaborators' edits are ordered together?"** → route by doc_id to one session server (consistent hashing), which owns the total order.
`,
  resources: [
    {
      title: 'Design Google Docs — collaborative editing',
      url: 'https://www.hellointerview.com/learn/system-design/problem-breakdowns/google-docs',
      type: 'article',
      source: 'Hello Interview',
    },
    {
      title: 'Operational Transformation explained',
      url: 'https://www.youtube.com/watch?v=2Zv_S1AdgpU',
      type: 'video',
      source: 'system design walkthrough',
    },
    {
      title: 'CRDTs: the hard parts (Martin Kleppmann)',
      url: 'https://www.youtube.com/watch?v=x7drE24geUw',
      type: 'video',
      source: 'Martin Kleppmann',
    },
    {
      title: 'An Introduction to Conflict-Free Replicated Data Types',
      url: 'https://lars.hupel.info/topics/crdt/01-intro/',
      type: 'article',
      source: 'Lars Hupel',
    },
  ],
  challenges: [
    {
      type: 'quiz',
      id: 'quiz-1',
      title: 'Collaborative editor check',
      questions: [
        {
          q: 'Alice and Bob both insert a character at position 0 of the same document at the same instant. Why can\'t the server just apply both raw operations, and what fixes it?',
          options: [
            'It can apply both as-is; positions never conflict',
            'Both ops assume position 0, but after the first is applied the second\'s position is stale — applying it raw corrupts the text. Operational Transformation (adjust the second op\'s position) or CRDTs (stable per-character identifiers) merge them so both edits survive and all clients converge',
            'The server should pick one edit and drop the other (last-write-wins)',
            'You must lock the document so only one person edits at a time',
          ],
          answer: 1,
          explanation:
            'Concurrent edits invalidate each other\'s positions. OT transforms the later op against ops that landed in between; CRDTs give each character a stable global identifier so merges are commutative. Both preserve every keystroke — unlike last-write-wins, which silently loses an edit.',
        },
        {
          q: 'Why are WebSockets (a persistent bidirectional connection) preferred over regular HTTP polling for a collaborative editor?',
          options: [
            'WebSockets are more secure',
            'The server must PUSH other collaborators\' edits to each client with low latency; a persistent bidirectional connection delivers updates instantly, whereas polling adds latency and wasted requests',
            'HTTP cannot send JSON',
            'Polling loses data',
          ],
          answer: 1,
          explanation:
            'Editing is server-push, not request/response — you need to receive other people\'s keystrokes the moment they happen. WebSockets keep an open channel for the server to broadcast transformed ops and presence; polling would be laggy and inefficient.',
        },
        {
          q: 'Why must all editors of the same document be routed to the same session server (e.g., via consistent hashing on doc_id)?',
          options: [
            'To save memory',
            'One server must own the authoritative total ordering of that document\'s operations so it can transform/merge concurrent edits consistently and broadcast the result; splitting a doc\'s editors across servers would create competing orderings',
            'Because WebSockets require it',
            'It has no real benefit',
          ],
          answer: 1,
          explanation:
            'Convergence depends on a single authoritative order per document. Routing all of a doc\'s collaborators to one session server (consistent hashing by doc_id) gives one place to sequence and merge ops, then fan out. Different servers ordering the same doc independently would diverge.',
        },
      ],
    },
    {
      type: 'design',
      id: 'design-1',
      title: 'Design exercise: the full collaborative editor',
      prompt: `
Design a real-time collaborative document editor (like Google Docs) end to end using the 7-step framework. Support dozens of simultaneous editors per document across millions of documents, with all clients converging to an identical document.

Cover: requirements (emphasize convergence/consistency), estimation, the transport/API choice (why not request-response?), the data model (how you represent the document and its edits), the high-level design (how collaborators of one doc are grouped), and — as your deep dive — conflict resolution: compare OT and CRDTs and explain why naive approaches lose edits. Then extend: how does a client that briefly disconnects catch back up without losing or duplicating edits?
`,
      hints: [
        'Represent the document as an ordered op log over a snapshot, not just "current text".',
        'Editing is server-push — which transport lets the server send you others\' keystrokes instantly?',
        'For conflicts, contrast transforming stale ops (OT) vs stable per-character identifiers (CRDT); say why last-write-wins is wrong here.',
        'On reconnect, the client knows its last version — how does the server bring it current?',
      ],
      modelAnswer: `
**Requirements** — Functional: concurrent multi-user editing, real-time propagation, convergence to identical state, presence/cursors, persistence + history/undo. Non-functional: low latency (instant feel), convergence (the defining correctness property), high availability, durability (never lose a keystroke). Per-doc concurrency is modest; there are millions of docs.

**Estimation** — 2–50 editors/doc, tens of tiny ops/sec/doc. Many independent low-traffic real-time sessions. Key scaling axes: managing millions of persistent connections and routing same-doc users together — not raw storage.

**Transport/API** — WebSockets (persistent bidirectional) so the server pushes others' transformed ops and presence in real time; REST for snapshot fetch and doc creation. Request/response can't deliver other people's live keystrokes.

**Data model** — Document{snapshot, version} + an ordered Op log{seq, type, position, char, client_id}. The server assigns a monotonic version to each accepted op (a total order); compact the log into periodic snapshots; the log doubles as history/undo.

**High-level** — Clients connect via a gateway that routes by doc_id (consistent hashing) so all editors of a document reach the SAME session server. That server owns the total order: it transforms/merges incoming ops, assigns versions, broadcasts results, and manages presence (Redis, TTL). Ops are persisted durably; snapshots + compaction bound replay.

**Deep dive — conflict resolution:** concurrent edits against the same base make positions stale. OT: server transforms a stale op against ops that landed since (Bob's insert-at-0 becomes insert-at-1); compact ops, but transform functions are hard and need a central authority — Google Docs' approach. CRDT: each character carries a stable global identifier (fractional index or (site_id, counter)) so concurrent inserts/deletes merge commutatively with no transformation, enabling offline/P2P — Figma/Yjs, at the cost of per-char metadata and tombstones. Reject last-write-wins: it silently drops a concurrent edit, unacceptable for text. Pick based on constraints: OT for central-server + minimal payload; CRDT for offline-first / avoiding transform functions.

**Extension — reconnect:** ack an op only once it's durably logged. On reconnect the client sends its last-known version; the server replays the ops it missed (in order) and the client applies them, then resumes. Client-side op IDs make replay idempotent so a re-sent op isn't applied twice. Snapshots bound how far back replay can go.

**Trade-offs:** central session server per doc simplifies ordering but is a routing/availability concern (need failover to a replica that has the op log); OT vs CRDT trades transform-complexity for per-char metadata; presence is best-effort (in-memory, TTL).

**One-line summary:** an ordered op-log-over-snapshot document, with all of a doc's editors routed by consistent hashing to one WebSocket session server that assigns a total order and resolves concurrent edits via OT or CRDTs (never last-write-wins), persisting ops for durable history and replay-on-reconnect.
`,
    },
  ],
}
