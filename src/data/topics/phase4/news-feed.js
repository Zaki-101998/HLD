export default {
  id: 'news-feed',
  title: 'Design a News Feed (Instagram / Facebook Feed)',
  subtitle: 'The fan-out problem: push vs pull, the celebrity problem, and the hybrid that real systems use',
  days: 2,
  content: `
## The problem

Design the home feed for a social app: each user sees a stream of recent posts from the people they follow, newest-ish first. This is *the* canonical system design problem because it forces the **fan-out on write vs fan-out on read** trade-off and the famous **celebrity problem** — the single most important pattern in the whole gauntlet. Master this and you can reason about Twitter, LinkedIn, TikTok, and half the other problems.

## Step 1 — Requirements

**Functional:** users **post** content (photo + caption); users **follow** others; a user's **feed** shows recent posts from people they follow. *De-scope but mention:* ranking/ML (assume reverse-chronological for now), comments, likes, stories, ads.

**Non-functional:** **extremely read-heavy** (people scroll far more than they post — ~100:1); **feed load must be fast** (< ~200ms — it's the app's front door); high availability; **eventual consistency is fine** (it's OK if your feed shows a post a few seconds late). Massive scale (100Ms–1B users).

## Step 2 — Estimation

- Say **500M DAU**, each posting ~twice/day → **1B posts/day** (~12k writes/sec, peak ~30k). Each user reads their feed ~10×/day → **5B feed reads/day** (~60k reads/sec, peak far higher).
- The **~100:1 read:write ratio** is the defining fact: **optimize reads, even at the cost of more write-time work.** That's what pushes us toward precomputing feeds.

## Step 3 — API

\`\`\`
POST /post          { user_id, content }        → creates a post
GET  /feed?user_id=&cursor=                       → paginated feed (cursor-based)
POST /follow        { follower_id, followee_id }
\`\`\`
**Cursor-based pagination** (not offset) — feeds are infinite and change constantly; a cursor (timestamp/post_id) is stable and efficient.

## Step 4 — Data model

- \`User\`, \`Post { post_id, author_id, content_ref, created_at }\` (media in object storage + CDN), \`Follow { follower_id, followee_id }\` (a huge graph; a wide-column/graph store).
- \`Feed / Timeline { user_id, [ordered post_ids] }\` — the **precomputed feed cache** (often in Redis), the key structure that makes reads fast.

## Step 5 & 6 — High-level design + the deep dive that IS this problem

The whole problem is: **when a user opens the app, how do we produce their feed fast?** Two strategies:

### Fan-out on READ (pull model)
At feed-request time, **query the recent posts of everyone the user follows**, merge, sort by time, return.
- ✅ **Cheap writes** — posting just stores one row. No precomputation. Always fresh.
- ❌ **Expensive, slow reads** — every feed load fans out to (say) 500 followees' post lists and merges them, *on the hot path*, for every one of billions of reads. At 100:1 read-heavy, this is backwards — you do the expensive work on the most frequent operation.

### Fan-out on WRITE (push model)
When a user **posts**, immediately **push that post's id into the precomputed feed cache of every follower**. Reads just fetch a ready-made list.
- ✅ **Fast reads** — a feed load is a single lookup of a precomputed list (O(1)-ish). Perfect for a 100:1 read-heavy system.
- ❌ **Expensive writes / write amplification** — one post by someone with 1M followers = **1M cache writes**. And here's the killer:

### The celebrity problem (the crux)
A user with **100M followers** (Cristiano Ronaldo, a Kardashian) posting means **100M feed writes** in a burst — a "fan-out storm" that hammers the system, delays the post, and wastes work on inactive followers. Pure fan-out-on-write breaks for celebrities.

### The hybrid (what real systems actually do) — the winning answer
Combine both, choosing per-author:
- **For normal users** (thousands of followers): **fan-out on write.** Push posts into followers' precomputed feeds. Reads are instant.
- **For celebrities / very-high-follower accounts**: **do NOT fan out on write.** Their posts are stored once; at **read time**, a user's feed = their precomputed feed (from normal followees) **merged with a live pull of the few celebrities they follow.** Since a user follows only a handful of celebrities, this read-time merge is cheap.
- **Result:** avoid the 100M-write storm (pull for the few celebrities) while keeping reads fast for the common case (push for normal users). This author-based split is the canonical, expected answer.

Additional refinements to mention:
- **Only fan out to active users** — don't push to accounts that haven't opened the app in months; regenerate their feed lazily on return. Cuts write amplification hugely.
- **Feed cache in Redis**, storing post_ids (not full posts) — hydrate post content from a post store/cache at read time; media via CDN.
- **Ranking** (real feeds aren't chronological): after assembling candidate posts, a ranking service scores them (engagement prediction). Mention it as a layer on top; the fan-out mechanics are what the interview is testing.

\`\`\`
Post by normal user ─▶ fan-out workers ─▶ push post_id into each active follower's Redis feed
Post by celebrity   ─▶ store once (no fan-out)
Feed read ─▶ precomputed Redis feed  ⊕  live-pull recent posts of followed celebrities
           ─▶ merge + rank ─▶ hydrate post content (CDN for media) ─▶ return page
\`\`\`

\`\`\`mermaid
flowchart TD
  NP["Normal user posts"] --> FO["Fan-out workers"]
  FO --> RF["Push post_id into each active follower's Redis feed"]
  CP["Celebrity posts"] --> Store["Stored once — no fan-out"]
  RF --> Merge["Merge at read time"]
  Store -->|"pull the few celebrities this user follows"| Merge
  Merge --> Rank["Rank + hydrate content"] --> Page["Feed page"]
\`\`\`

## Step 7 — Wrap-up

A news feed is a **read-optimization problem** dictated by a ~100:1 read:write ratio. Pure **fan-out on read** makes reads too slow; pure **fan-out on write** precomputes feeds for fast reads but suffers **write amplification** and the **celebrity problem**. The production answer is a **hybrid**: fan-out on write for normal users (into a Redis feed cache of post_ids), and read-time pull-and-merge for the handful of celebrities each user follows — plus only fanning out to active users. Media lives in object storage behind a CDN; a ranking layer sits on top of the chronological candidates. Trade-offs: eventual consistency (feeds update within seconds), extra write work and storage for precomputed feeds, and hybrid complexity — all bought in exchange for fast reads at the scale that matters.

## How this shows up in interviews

- This is the **most important pattern in the gauntlet.** The interviewer is listening for **fan-out on write vs read**, the **celebrity problem**, and the **hybrid** resolution. Nail these three and you've passed.
- Lead with the **read:write ratio** to justify precomputing feeds; then introduce write amplification and the celebrity edge case; then resolve with the hybrid. That narrative arc is exactly what they want.
- Expect **"what about someone with 100M followers?"** — the celebrity problem; answer with pull-at-read-time for celebrities merged into the precomputed feed.
- Bonus: active-user-only fan-out, storing post_ids not posts, media via CDN, and ranking as a separable layer.
`,
  resources: [
    {
      title: 'Design a News Feed / Instagram feed (fan-out explained)',
      url: 'https://www.youtube.com/watch?v=QmX2NPkJTKg',
      type: 'video',
      source: 'ByteByteGo',
    },
    {
      title: 'System Design: Facebook News Feed (push vs pull, celebrity)',
      url: 'https://www.hellointerview.com/learn/system-design/problem-breakdowns/fb-news-feed',
      type: 'article',
      source: 'Hello Interview',
    },
    {
      title: 'Gaurav Sen — Design a News Feed system',
      url: 'https://www.youtube.com/watch?v=1KRX8kFTAiU',
      type: 'video',
      source: 'Gaurav Sen',
    },
    {
      title: 'Design Instagram',
      url: 'https://algomaster.io/learn/system-design-interviews/design-instagram',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
    {
      title: 'Design Facebook',
      url: 'https://www.youtube.com/watch?v=9-hjBGxuiEs',
      type: 'video',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
    {
      title: 'Push vs Pull Architecture',
      url: 'https://blog.algomaster.io/p/af5fe2fe-9a4f-4708-af43-184945a243af',
      type: 'article',
      source: 'AlgoMaster (Ashish Pratap Singh)',
    },
  ],
  challenges: [
    {
      type: 'quiz',
      id: 'quiz-1',
      title: 'News feed / fan-out check',
      questions: [
        {
          q: 'Why does the ~100:1 read:write ratio push a news feed toward PRECOMPUTING feeds (fan-out on write)?',
          options: [
            'Because writes are more important than reads',
            'Because reads vastly outnumber writes, it pays to do extra work at write time (push posts into followers’ feeds) so the far-more-frequent read becomes a cheap lookup of a ready-made list',
            'Because it saves storage',
            'Because writes must be strongly consistent',
          ],
          answer: 1,
          explanation:
            'When reads dominate 100:1, you optimize the read path even at the cost of heavier writes. Precomputing each user’s feed on write turns feed loads into a single lookup, instead of fanning out to hundreds of followees’ posts on every read.',
        },
        {
          q: 'What is the "celebrity problem" in fan-out on write, and how is it solved?',
          options: [
            'Celebrities post too much spam; you rate-limit them',
            'A user with 100M followers posting triggers 100M feed writes (a fan-out storm). Solve it with a HYBRID: don’t fan out celebrity posts; instead pull their recent posts at read time and merge into each user’s precomputed feed',
            'Celebrities need stronger consistency; use 2PC',
            'There is no problem — just add more workers',
          ],
          answer: 1,
          explanation:
            'Pure fan-out-on-write explodes for high-follower accounts (write amplification storm). The canonical fix is the hybrid: fan-out-on-write for normal users, but store celebrity posts once and pull-and-merge them at read time — cheap because each user follows only a few celebrities.',
        },
        {
          q: 'In the hybrid model, how is a user’s feed assembled at read time?',
          options: [
            'Purely by querying all followees live',
            'Their precomputed feed (post_ids pushed by normal followees) is MERGED with a live pull of recent posts from the few celebrities they follow, then ranked and hydrated with content',
            'Purely from a single precomputed list including celebrities',
            'By scanning the entire posts table',
          ],
          answer: 1,
          explanation:
            'The precomputed part handles the many normal followees (fast lookup); the live-pull part handles the handful of celebrities (avoiding the write storm). Merging the two, then ranking and hydrating post content (media via CDN), yields the feed page.',
        },
        {
          q: 'Which refinement most reduces write amplification in fan-out on write?',
          options: [
            'Storing full post content in every feed',
            'Only fanning out to ACTIVE users (skip accounts that haven’t opened the app in months; regenerate their feed lazily on return), and storing post_ids rather than full posts',
            'Fanning out synchronously in the posting request',
            'Using SQL joins at read time',
          ],
          answer: 1,
          explanation:
            'Pushing a post to tens of millions of inactive followers is wasted work. Fanning out only to active users (and lazily rebuilding a dormant user’s feed when they return) slashes write amplification. Storing post_ids (not copies of the post) keeps feed caches small.',
        },
      ],
    },
    {
      type: 'design',
      id: 'design-1',
      title: 'Design exercise: the Instagram home feed',
      prompt: `
Design the home feed for a photo-sharing app at large scale (say 500M DAU): users post photos, follow others, and open the app to a feed of recent posts from people they follow. Feed loads must be fast (<200ms).

Drive the framework, but make the fan-out analysis the centerpiece: present fan-out on read vs fan-out on write with their trade-offs, explain the celebrity problem, and land on the hybrid approach real systems use. Cover where media is stored, what’s cached, and how a feed read is assembled. Address consistency and note the trade-offs. Bonus: where does ML ranking fit?
`,
      hints: [
        'Start from the read:write ratio — it justifies precomputing feeds.',
        'Fan-out on write breaks for celebrities — how, and what’s the fix?',
        'Feed cache stores post_ids; media goes to object storage + CDN; ranking is a layer on top.',
      ],
      modelAnswer: `
**Requirements** — Functional: post, follow, chronological feed of followees’ recent posts (de-scope ranking/comments/stories/ads initially). Non-functional: ~100:1 read-heavy, <200ms feed load, high availability, eventual consistency OK, ~500M DAU scale.

**Estimation** — ~1B posts/day (~12k writes/s) vs ~5B feed reads/day (~60k+ reads/s). The **100:1 ratio ⇒ optimize reads, precompute feeds**.

**API** — \`POST /post\`, \`GET /feed?user_id=&cursor=\` (cursor pagination), \`POST /follow\`.

**Data model** — \`Post{post_id, author_id, content_ref, created_at}\` (media in object storage), \`Follow{follower, followee}\` (huge graph), \`Feed{user_id → [post_ids]}\` precomputed in Redis.

**The fan-out deep dive (centerpiece):**
- *Fan-out on read (pull):* cheap writes, but every feed load merges hundreds of followees’ posts on the hot path → too slow at 100:1. Backwards for read-heavy.
- *Fan-out on write (push):* on posting, push post_id into every follower’s precomputed Redis feed → reads are a single lookup (fast). But **write amplification**, and the **celebrity problem**: 100M followers = 100M writes per post — a fan-out storm.
- *Hybrid (the answer):* **fan-out on write for normal users**; **for celebrities, don’t fan out** — store the post once and **pull their recent posts at read time**, merging into the user’s precomputed feed (cheap since each user follows few celebrities). Plus **fan out only to active users** and store **post_ids, not posts**.

**Feed read assembly** — precomputed Redis feed ⊕ live-pull of followed celebrities → merge → **rank** → hydrate post content (post cache; **media via CDN**) → return a cursor page.

**Consistency** — eventual: a post appears in feeds within seconds (fan-out is async via workers/queue). Acceptable for a social feed.

**Ranking (bonus)** — after gathering chronological candidates, a **ranking service** scores them (engagement-prediction ML) to reorder. It’s a layer on top; the fan-out mechanics are the core being tested.

**Trade-offs** — eventual consistency, extra write work + storage for precomputed feeds, and hybrid complexity — all traded for fast reads at scale. Pure push or pure pull each fail (celebrity storm / slow reads); the hybrid balances them.

**One-line summary:** a read-optimized feed driven by the 100:1 ratio — precompute feeds via fan-out-on-write for normal users, pull-and-merge celebrity posts at read time to dodge the fan-out storm, fan out only to active users, keep post_ids in a Redis feed cache with media on a CDN, and layer ranking on top — accepting eventual consistency and extra write work for sub-200ms reads.
`,
    },
  ],
}
