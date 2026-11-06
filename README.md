# TRITORC Social Analytics

Dashboard for the marketing team: Instagram, LinkedIn, Facebook and YouTube performance, plus Google Analytics (GA4) website traffic.
No AI features, free to run.

```bash
npm install
cp .env.example .env.local   # then fill in the keys you have (never commit .env.local)
npm run dev      # http://localhost:3000
npm run build    # production build
```

## Status
| Source | State |
|---|---|
| LinkedIn (7 pages) | Real data from Page analytics exports (`data/linkedin-exports/`). Only the main page's export has been loaded so far; the other six are waiting for admin access. LinkedIn has no free API, so this stays export-based. |
| YouTube | **Live** via the YouTube Data API v3 (views, likes, comments, subscribers, new videos). Watch time / impressions / CTR still come from the Studio export. |
| Facebook (Tritorc Group) | Export data works. **Live sync built** (`src/lib/server/meta-api.ts`), activates when `META_ACCESS_TOKEN` + `META_PAGE_ID` are set; needs the token scopes listed in the Handover section. Tested 6 Nov 2026: the API is reached, but the current Page token is refused (see below). |
| Instagram (`tritorcgroup`) | Export data works. **Live sync built** (posts, insights, followers, audience demographics); activates when `META_IG_USER_ID` is set (not set yet). |
| Google Analytics (GA4) | **Live** via the GA4 Data API (read-only service account, last 90 days, social traffic only, enquiries = sessions that viewed a `thank-you` page). Falls back to the CSV files in `data/ga4-exports/` or a CSV uploaded on the Website page. Code: `src/lib/server/ga4-api.ts`. |

- With an empty `data/` folder every page falls back to **generated sample data** (`src/lib/sample-data.ts`).
- Tags, enquiries, notes, campaigns, targets and planned posts are saved in the browser's localStorage until a shared database (Supabase) is added.
- Not built yet: shared database, scheduled sync, team login, hosting.

## Where to plug in real data
- `src/lib/data.ts` → `loadDataset()` is the single entry point. Return the same `Dataset` shape (see `src/lib/types.ts`) from the database / platform APIs and no page needs to change.
- CSV importers (Meta Business Suite, LinkedIn) go in `src/lib/import/` and use the parser in `src/lib/csv.ts`; the upload UI is in Settings & imports.

## Metric definitions (`src/lib/metrics.ts`)
- Engagements = likes + comments + shares + saves
- Engagement rate = engagements ÷ reach, per post
- Metrics a platform doesn't expose are `null` and shown as N/A, never 0
- Reach is never summed across posts or accounts (audiences overlap)

## Stack
Next.js (App Router), TypeScript, Tailwind CSS 4, Recharts, TanStack Table v8, lucide-react.

## Website traffic (Google Analytics) — one CSV
The Website (GA4) page is fed by a single CSV (template download on that page). One row per
day × source × medium × campaign × content × landing page:

`date, source, medium, campaign, content, landing_page, sessions, new_users, engaged_sessions, avg_engagement_seconds, key_events`

- **Only social traffic is analysed** (Facebook, Instagram, LinkedIn, YouTube — organic posts and paid ads, e.g. `meta / facebook-lead-gen`). Direct, search, referral and email rows are loaded but ignored by the page (`isSocial` in `src/lib/web.ts`). A row is tied to a post when `content` (utm_content) equals the post ID.
- GA4's own export names are accepted (`Session source / medium`, `YYYYMMDD` dates, `m:ss` durations, `#` comment lines) — see `src/lib/import/ga.ts`.
- Importing replaces existing rows for the dates in the file, so a newer export can be uploaded over an older one.

## Real data (platform exports)
The app reads the export files in `data/` on every request (`/api/dataset` → `src/lib/server/load-exports.ts`).
Drop in newer exports and refresh — nothing else to change. If `data/` is empty it falls back to sample data.

| Folder | Files | Notes |
|---|---|---|
| `data/linkedin-exports/` | `<page>-content_…xls`, `<page>-followers_…xls` | page slugs: `tritorc-main`, `peru`, `africa`, `in-action`, `inc`, `precomtec`, `ozat` |
| `data/meta-exports/` | `instagram-…posts_….csv`, `facebook-…posts_….csv`, `…-audience-demographics_….csv` | one Facebook page only (Tritorc Group) |
| `data/youtube-exports/<export>/` | the unzipped YouTube Studio export (`Table data.csv`, `Chart data.csv`) | |
| `data/ga4-exports/` | `*.csv` from GA4 Explore (Free form) | Dimensions: Date, Session campaign, Session source / medium, Session manual ad content (Landing page optional). Metrics: Sessions, New users, Engaged sessions, Avg engagement time per session, Key events. Set **Nested rows = No** and keep each file under 500 rows (export in 14-day chunks); a later file replaces the dates it covers. |
| `data/accounts.json` | current follower counts | edit when they change; replaced by the APIs later |

Rules applied: LinkedIn has no reach, so its engagement rate uses impressions; Facebook "reach" is Meta's *viewers*
(Facebook reach was retired Oct 31, 2026); YouTube engagement rate = (likes + comments) ÷ views, from the live API.
Product / category / campaign tags are auto-assigned from caption keywords and can be edited per post.
The `data/` folder is git-ignored (business data).

## Handover: Meta (Facebook + Instagram) automation

> For the teammate taking over Meta, and for whichever AI assistant (Claude or another) you work with.
> Read this section first, then `src/lib/server/youtube-api.ts` and `src/lib/server/build-dataset.ts`:
> YouTube is already wired live and Meta should follow exactly the same pattern.

### Goal
When the marketing team posts on Facebook or Instagram, the post and its numbers should appear on the dashboard
without anyone downloading a Business Suite export. The Settings → *Live connections* card should show
"last synced" and an error message if the token stops working, and its **Sync now** button should refresh Meta too.

### What already works (verified)
- A **Page access token** for the Tritorc Group Facebook page was created and tested. Page ID: `1001402296395171`.
  It never expires (checked with `/debug_token`).
- With that token the API can read the page name, the follower count, posts, and the `shares` count.

### What is blocked, and why
- **Reactions / comments / likes counts and all Insights (reach, views, clicks)** are refused. The token only has
  `pages_show_list` and `pages_read_engagement`. It also needs `pages_read_user_content` and `read_insights`
  (and the Page use case *Manage everything on your Page* in the Meta app).
- **Instagram is not connected at all.** It needs `instagram_basic` and `instagram_manage_insights`, and the Instagram
  account must be a professional account linked to the Facebook page.
- **Root cause:** the page and the Instagram account live inside a Meta **business portfolio**. The Facebook login
  used so far belongs to someone outside the organisation, so Meta's "Verify your session" step cannot be completed
  and the portfolio-level permissions cannot be granted. `/me/accounts` is empty for the same reason; the page only
  worked by requesting it directly by ID (`GET /{page-id}?fields=access_token`).

### Status check, 6 Nov 2026
The sync code is merged and runs, but the token in use is still the old Page token. `debug_token` shows it is valid and never
expires, but its scopes are only `pages_show_list` and `pages_read_engagement`, so posts fail with
*(#10) This endpoint requires the 'pages_read_user_content' permission*. `META_IG_USER_ID` is also empty.
The only thing left for Meta is the access steps below: a System User token with the full scope list, then the Instagram ID.
No code change should be needed; the dashboard keeps working from the exports until then.

### What you need to do first (access, not code)
1. Someone who is already **admin of the Tritorc Group business portfolio** adds you, using your own real Facebook
   account and work email: *business.facebook.com/settings → Users → People → Add* → **Admin access**, and assign the
   Tritorc Group page and the `tritorcgroup` Instagram account with full control. One personal account per real person;
   do not create a shared "marketing" profile, Meta bans those.
2. In the Meta app (developers.facebook.com → the dashboard app), add yourself under *App roles*, or create a fresh app
   owned by your account. Add the *Facebook Login for Business* / Pages and Instagram use cases.
3. In *Business settings → Users → System users*, create a **System User** (Admin), give it the page and the
   Instagram account, and **Generate token** for the app with these permissions:
   `pages_show_list`, `pages_read_engagement`, `pages_read_user_content`, `read_insights`,
   `instagram_basic`, `instagram_manage_insights`, `business_management`. Choose **Never expire**.
4. Put the values in `.env.local` (see `.env.example`). **Never commit tokens, and never paste them into a chat or the README.**

```
META_PAGE_ID=1001402296395171
META_IG_USER_ID=<Instagram business account id>   # GET /{page-id}?fields=instagram_business_account
META_ACCESS_TOKEN=<system-user token>
META_APP_ID=<only needed for token debugging/exchange>
META_APP_SECRET=<only needed for token debugging/exchange>
```

Sanity check before writing any code: `GET https://graph.facebook.com/debug_token?input_token=<token>&access_token=<app-id>|<app-secret>`
should show `is_valid: true`, `expires_at: 0` and all the scopes above.

### What to build (mirror the YouTube integration)
1. **`src/lib/server/meta-api.ts`**: copy the structure of `youtube-api.ts`:
   - `fetchMeta(force)` returns `{ configured, data?, error? }`; in-memory cache of about 10 minutes, bypassed by `force`.
   - Strip the token from every error message before it is returned or logged.
   - Facebook: `/{page}/posts` (paginate) with `message, created_time, permalink_url, shares, reactions.summary(true), comments.summary(true)`,
     plus per-post insights; page followers from `followers_count`.
   - Instagram: `/{ig-user}/media` (`caption, timestamp, media_type, permalink, like_count, comments_count`),
     per-media insights (`reach`, `saved`, `shares`, `views`), and `followers_count` from `/{ig-user}`.
   - Metric names change often (Meta retired Facebook *reach* on 31 Oct 2026, replaced by views/viewers). Test each metric
     once against the live API and keep only the ones that return data; unsupported ones stay `null`.
2. **Merge in `src/lib/server/build-dataset.ts`** next to `mergeYouTube`: update posts that already exist from the exports
   (match by post ID), add posts newer than the last export, and replace the follower snapshot for `fb-group` / `ig-group`.
   Export post IDs are `fb-<Post ID>` and `ig-<Post ID>` (the Business Suite *Post ID* column) — confirm the live IDs line up
   (Facebook's live IDs look like `<pageId>_<postId>`) or match on the permalink instead, otherwise every post will appear twice.
3. **Set `live.facebook` and `live.instagram`** (`{ syncedAt, items, error, note }`, type in `src/lib/types.ts`) and render them in
   `src/app/(app)/settings/page.tsx` the same way the YouTube row is rendered; remove them from the "Waiting for access" list.
4. Keep the exports as the fallback. If the token is missing or fails, the dashboard must still load from `data/`.

### Metric rules to keep (`src/lib/metrics.ts`, the *How is engagement calculated?* panel)
| Platform | Engagement rate |
|---|---|
| Instagram | (likes + comments + shares + saves) ÷ reach |
| Facebook | (reactions + comments + shares) ÷ viewers |
| LinkedIn | (likes + comments + reposts) ÷ impressions |
| YouTube | (likes + comments) ÷ views |

A metric the API does not return must be `null` (shown as N/A), never `0`. Reach is never summed across posts or accounts.
Set `engagementKnown: true` on a post only when likes/comments are real API values.

### Automation after the live sync works
Today the browser calls `/api/dataset`, which fetches live data on demand (10-minute cache). The next steps, in order:
1. Add a **Supabase** (free) database so everyone sees the same data and edits (tags, leads, campaigns).
2. Run the sync on a schedule (GitHub Actions cron or the host's cron calling a protected route) and write into the database.
3. Add team login restricted to `@tritorc.com`, then host for free (Netlify or Cloudflare; Vercel Hobby is non-commercial).
4. Swap the `xlsx@0.18.5` package (known vulnerabilities) before the site is public.

### Rules of the road
- `.env.local` and `data/` are git-ignored. Do not commit, print, or share tokens or exported business data.
- Do not log in to, or change anything on, the company's Meta accounts beyond reading analytics.
- This repo is public: nothing sensitive goes in code, comments, README or commit messages.
