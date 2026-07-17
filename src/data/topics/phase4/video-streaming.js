export default {
  id: 'video-streaming',
  title: 'Design Video Streaming (YouTube / Netflix)',
  subtitle: 'Upload → transcode → CDN delivery, adaptive bitrate, and serving petabytes of video',
  days: 2,
  content: `
## The problem

Design a video platform: users (or a studio) **upload** videos, which are **processed** and then **streamed** to millions of viewers on any device and network. YouTube (user-generated, huge catalog) or Netflix (curated, pre-loaded). The distinguishing pieces are the **transcoding pipeline** (one upload → many formats/resolutions), **adaptive bitrate streaming**, and above all **CDN delivery at massive scale** — video is ~majority of internet traffic, so this problem is really about moving petabytes of bytes efficiently.

## Step 1 — Requirements

**Functional:** upload a video; **process/transcode** it into multiple resolutions/formats; **stream** with smooth playback (seek, adaptive quality); store metadata (title, views); search/recommend (de-scope — that's other topics). *De-scope:* comments, live streaming (mention as a variant).

**Non-functional:** **massive read/streaming scale** (billions of watch-hours), **low startup latency + no buffering** (playback QoE), **high availability**, **global** (viewers everywhere), **storage-efficient** (video is huge), and support **heterogeneous devices/networks** (a phone on 3G vs a TV on fiber).

## Step 2 — Estimation

- ~**1B watch-hours/day**; average bitrate ~**5 Mbps** → aggregate egress is on the order of **hundreds of Tbps** at peak. This number screams one thing: **you cannot serve this from origin servers — CDN is mandatory and central.**
- **Storage:** millions of hours of video × multiple encoded versions × ~GBs/hour → **exabytes** → object storage, tiered (hot/cold). Uploads are comparatively rare vs views (extreme read-heavy).

## Step 3 — API

\`\`\`
POST /videos (initiate upload)         → pre-signed URL for direct upload to object storage
POST /videos/{id}/complete             → triggers transcoding pipeline
GET  /videos/{id}/manifest             → adaptive-streaming manifest (HLS/DASH)
GET  /watch?video_id=                  → metadata + manifest URL
\`\`\`
Large uploads go **directly to object storage via pre-signed URLs** (chunked/resumable), bypassing app servers — the Pastebin pattern at video scale.

## Step 4 — Data model

- **Video metadata** DB: \`Video { id, uploader, title, description, status, duration, thumbnails, created_at, view_count }\` — structured, queried → SQL or a document store; counts (views) handled separately (high-write).
- **Raw + encoded video files:** in **object storage** (S3/GCS), keyed by video_id + resolution/format; delivered via CDN.
- **Manifest** (HLS/DASH) describing the available quality levels and segment URLs.

## Step 5 & 6 — The pipeline and deep dives

\`\`\`
UPLOAD:  client ─pre-signed─▶ Object Storage (raw) ─▶ [message queue] ─▶ Transcoding workers
                                                                         │ (split → encode →
                                                                         │  segment → package)
                                                                         ▼
                                        Encoded renditions + manifest ─▶ Object Storage ─▶ CDN (push/pull)
WATCH:   client ─▶ get manifest ─▶ player picks bitrate ─▶ fetch segments from nearest CDN edge
                                        (adapts quality per segment to bandwidth)
\`\`\`

### Deep dive 1 — Transcoding pipeline (one upload → many outputs)
A raw upload is one giant file in one format. Viewers need **many resolutions** (240p…4K) and **codecs/formats** for different devices. An **async pipeline** (triggered via a queue after upload):
- **Split** the video into chunks/segments (enables parallelism and, later, adaptive streaming).
- **Transcode** each chunk into every target resolution/bitrate/codec — massively parallel across a worker fleet (this is compute-heavy; chunking lets thousands of workers share the job).
- **Package** into streaming formats (**HLS** / **MPEG-DASH**): each rendition is cut into short **segments** (2–10s) with a **manifest** listing them.
- Store all renditions + manifest in object storage; distribute to the CDN.
- It's async because encoding a movie takes minutes-to-hours — the uploader gets "processing," and the video goes live when done. A DAG/workflow engine orchestrates the steps with retries.

### Deep dive 2 — Adaptive Bitrate Streaming (ABR) — smooth playback
The key to "no buffering across a phone-to-TV range of networks." The video is pre-encoded at multiple bitrates, each **segmented**. The **client player** downloads a manifest, then **chooses which quality to fetch for each short segment based on current bandwidth/buffer**: network drops → next segment at lower resolution (quality dips but no stall); network recovers → step back up. Adaptation lives in the **player**, not the server — the server just offers all the segment options. HLS/DASH are the protocols. This is why you see quality shift mid-video instead of buffering.

### Deep dive 3 — CDN delivery (the heart of scale)
Video bytes must be served from **edge servers close to viewers**, not origin — otherwise latency is bad and origin bandwidth is impossible.
- **Cache popular content at the CDN edge**; the long tail is fetched from origin on demand (pull) — **80/20**: a small fraction of videos gets most views, so edge caching is hugely effective.
- **Netflix** goes further with **Open Connect** — placing its own caching appliances **inside ISPs**, pre-**pushing** popular titles overnight so peak-time streaming never leaves the ISP. (Push for predictable catalogs like Netflix; pull for unpredictable UGC like YouTube.)
- Segmented delivery means each little segment is an independently cacheable object; seeking just fetches different segments.

### Deep dive 4 — Metadata, views, and reliability
- **View counts / analytics** are high-write and don't need strong consistency → aggregate asynchronously via a stream (approximate counts fine), not a synchronous DB increment per view.
- **Thumbnails** generated during processing, served via CDN.
- **Resumable/chunked uploads** so a dropped connection doesn't restart a 4 GB upload.

## Step 7 — Wrap-up

Video streaming is an **upload → transcode → CDN-deliver** pipeline. Uploads go **directly to object storage** (pre-signed, resumable); an **async transcoding pipeline** turns one raw file into **many resolutions/formats**, **segmented** and packaged as **HLS/DASH** with a manifest. Playback uses **adaptive bitrate** — the *player* picks each segment's quality by current bandwidth, so quality flexes instead of buffering. The dominating concern is **CDN delivery**: serve segments from edge caches near viewers (pull for UGC's long tail, push like Netflix Open Connect for predictable catalogs), exploiting the 80/20 popularity skew. Metadata sits in a DB; view counts aggregate async. Trade-offs: huge storage for many renditions and processing compute, traded for smooth cross-device playback and feasible bandwidth; async processing means videos aren't instantly live. The signal: **it's a CDN + transcoding problem, not a database problem.**

## How this shows up in interviews

- Lead with the realization that **the challenge is moving bytes: CDN delivery is central**, justified by the enormous egress estimate — not the database.
- Expect **"how do you handle different devices and networks?"** — transcode to multiple renditions + **adaptive bitrate streaming** (player-side segment quality selection via HLS/DASH). This is the must-mention.
- Expect **"how does uploading/processing work?"** — direct-to-object-storage upload + **async, parallel, chunked transcoding pipeline** off a queue.
- Bonus: Netflix Open Connect (push into ISPs) vs YouTube pull-caching, 80/20 edge caching, resumable uploads, async view-count aggregation.
`,
  resources: [
    {
      title: 'Design YouTube / a video streaming service',
      url: 'https://www.youtube.com/watch?v=jPKTo1iGQiE',
      type: 'video',
      source: 'ByteByteGo',
    },
    {
      title: 'System Design: YouTube (upload, transcode, CDN)',
      url: 'https://www.hellointerview.com/learn/system-design/problem-breakdowns/youtube',
      type: 'article',
      source: 'Hello Interview',
    },
    {
      title: 'Netflix Open Connect — CDN inside ISPs',
      url: 'https://openconnect.netflix.com/en/',
      type: 'doc',
      source: 'Netflix Open Connect',
    },
    {
      title: 'Design Netflix',
      url: 'https://www.youtube.com/watch?v=psQzyFfsUGU',
      type: 'video',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
    {
      title: 'Building In-Video Search at Netflix',
      url: 'https://netflixtechblog.com/building-in-video-search-936766f0017c',
      type: 'article',
      source: 'Netflix Tech Blog',
    },
    {
      title: 'Design Spotify',
      url: 'https://algomaster.io/learn/system-design-interviews/design-spotify',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
  ],
  challenges: [
    {
      type: 'quiz',
      id: 'quiz-1',
      title: 'Video streaming check',
      questions: [
        {
          q: 'The estimation shows peak egress on the order of hundreds of Tbps. What is the central design conclusion?',
          options: [
            'Use a bigger database',
            'You cannot serve this from origin servers — a CDN that caches and serves video segments from edge locations close to viewers is mandatory and central to the design',
            'Compress the video more',
            'Use strong consistency for playback',
          ],
          answer: 1,
          explanation:
            'Video is mostly about moving enormous byte volumes. Origin servers can’t supply hundreds of Tbps globally at low latency, so edge CDN delivery (exploiting the 80/20 popularity skew) is the heart of the design — not the metadata database.',
        },
        {
          q: 'How does adaptive bitrate streaming (ABR) prevent buffering across varying networks/devices?',
          options: [
            'The server detects your speed and picks one quality for the whole video',
            'The video is pre-encoded at multiple bitrates and segmented; the CLIENT player chooses which quality to fetch for each short segment based on current bandwidth/buffer — dropping resolution instead of stalling, and stepping back up when the network recovers',
            'It buffers the whole video before playing',
            'It only works on Wi-Fi',
          ],
          answer: 1,
          explanation:
            'ABR (HLS/DASH) puts adaptation in the player: it picks per-segment quality from the manifest’s options according to real-time conditions. That’s why you see quality shift mid-playback rather than a buffering spinner. The server just offers all renditions.',
        },
        {
          q: 'Why is video transcoding done as an async, chunked, parallel pipeline rather than synchronously on upload?',
          options: [
            'To save database space',
            'One raw upload must become many resolutions/formats, and encoding a long video takes minutes-to-hours; splitting it into chunks lets a large worker fleet transcode in parallel off a queue, while the uploader immediately sees "processing" and the video goes live when done',
            'Because HTTP uploads are slow',
            'Synchronous transcoding is actually preferred',
          ],
          answer: 1,
          explanation:
            'Transcoding is compute-heavy and slow. An async pipeline (triggered via a queue) splits the video into chunks so thousands of workers encode renditions in parallel, then packages HLS/DASH segments. The upload response returns immediately; the video publishes when processing completes.',
        },
        {
          q: 'How does Netflix’s CDN strategy (Open Connect) differ from YouTube-style caching, and why?',
          options: [
            'They are identical',
            'Netflix has a predictable catalog, so it PUSHES popular titles into caching appliances inside ISPs overnight (pre-positioned before peak); YouTube’s unpredictable user-generated content is better served by PULL caching (fetch to the edge on demand)',
            'Netflix uses no CDN',
            'YouTube pushes everything to every edge',
          ],
          answer: 1,
          explanation:
            'Push vs pull depends on predictability. A curated catalog can be pre-pushed to the edge (even into ISPs via Open Connect) so peak streaming stays local. Unpredictable UGC (YouTube) can’t pre-push everything, so it pulls popular items to the edge on demand.',
        },
      ],
    },
    {
      type: 'design',
      id: 'design-1',
      title: 'Design exercise: a video streaming platform',
      prompt: `
Design a video streaming service (YouTube-style): users upload videos that are processed and then streamed to millions of viewers on phones, laptops, and TVs across varying networks, worldwide, with smooth playback.

Cover the framework, but focus depth on: (1) the upload + transcoding pipeline (one upload → many outputs), (2) how playback stays smooth across devices/networks (adaptive bitrate), and (3) how you deliver video at massive scale (CDN). Include storage choices and view-count handling. Note the trade-offs, and contrast a YouTube-style vs Netflix-style CDN approach.
`,
      hints: [
        'The egress estimate points to one dominant component — which?',
        'One raw file must serve every device — transcode to many renditions, delivered how (ABR)?',
        'Uploads go direct-to-object-storage; transcoding is async/parallel/chunked off a queue.',
      ],
      modelAnswer: `
**Requirements** — Functional: upload, transcode to multiple resolutions/formats, stream smoothly with seek, store metadata (de-scope comments/live). Non-functional: massive streaming scale, low startup + no buffering, global, storage-efficient, heterogeneous devices/networks, read-heavy.

**Estimation** — ~1B watch-hours/day, ~5 Mbps → **hundreds of Tbps** peak egress → **CDN is mandatory and central**; exabytes of storage (multiple renditions) → tiered object storage.

**API** — pre-signed upload URL, complete→transcode trigger, manifest (HLS/DASH), watch metadata.

**Data model** — metadata in a DB (SQL/document); raw + encoded files in **object storage** keyed by video_id+rendition, served via CDN; HLS/DASH manifests.

**Deep dives:**
1. *Upload + transcoding* — client uploads **directly to object storage via pre-signed, resumable/chunked URLs** (bypassing app servers). Completion enqueues a job; an **async pipeline** **splits** the video into chunks, **transcodes** each into many resolutions/bitrates/codecs in parallel across a worker fleet, **packages** HLS/DASH **segments + manifest**, stores renditions, and distributes to the CDN. Async because encoding takes minutes-to-hours; uploader sees "processing."
2. *Smooth playback (ABR)* — pre-encode multiple bitrates, each **segmented**; the **player** picks each segment’s quality from the manifest based on live bandwidth/buffer — drops resolution instead of stalling, recovers upward. Adaptation is client-side (HLS/DASH).
3. *CDN delivery (heart of scale)* — serve segments from **edge caches near viewers**; exploit **80/20** popularity (cache hot content at the edge, pull the long tail from origin). **YouTube-style**: pull popular UGC to edges on demand. **Netflix-style**: **push** the predictable catalog into ISP-embedded appliances (**Open Connect**) overnight so peak streaming stays local. Segmented objects are independently cacheable; seeking fetches other segments.

**Storage + views** — tiered object storage (hot/cold); **view counts aggregated asynchronously via a stream** (approximate, high-write, no strong consistency needed); thumbnails generated in processing, served via CDN.

**Trade-offs** — large storage for many renditions + heavy transcoding compute, traded for smooth cross-device playback and feasible bandwidth; async processing delays go-live; push vs pull CDN chosen by catalog predictability.

**One-line summary:** an upload→transcode→CDN-deliver pipeline — direct-to-object-storage resumable uploads, an async chunked parallel transcoding pipeline producing HLS/DASH renditions, client-side adaptive bitrate for smooth playback, and edge CDN delivery (pull for UGC, push/Open Connect for curated catalogs) exploiting 80/20 — recognizing that this is a CDN + transcoding problem, not a database one.
`,
    },
  ],
}
