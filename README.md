# TRITORC Social Analytics

Dashboard for the marketing team: Instagram, LinkedIn and Facebook performance.

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
```

## Status
- All pages run on **generated sample data** (`src/lib/sample-data.ts`) — not real results.
- Tags, enquiries, notes, campaigns, targets and planned posts are saved in the browser's localStorage until a shared database is connected.

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

- Website totals = all rows. Traffic from posts = rows from social sources (`src/lib/web.ts`), tied to a post when `content` (utm_content) equals the post ID.
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
| `data/accounts.json` | current follower counts | edit when they change; replaced by the APIs later |

Rules applied: LinkedIn has no reach, so its engagement rate uses impressions; Facebook "reach" is Meta's *viewers*
(Facebook reach was retired Oct 31, 2026); YouTube engagement rate = (likes + comments) ÷ views, from the live API.
Product / category / campaign tags are auto-assigned from caption keywords and can be edited per post.
The `data/` folder is git-ignored (business data).
