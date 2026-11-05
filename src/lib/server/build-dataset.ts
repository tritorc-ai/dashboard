import type { Account, Dataset, FollowerPoint, Post } from "../types";
import { loadFromExports } from "./load-exports";
import { fetchMeta, type MetaLive } from "./meta-api";
import { fetchYouTube } from "./youtube-api";

/**
 * Dataset = platform exports (history, private analytics) + live API data (fresh numbers).
 * Live sources override the numbers they cover; everything else comes from the exports.
 */
export async function buildDataset(opts: { force?: boolean } = {}): Promise<Dataset | null> {
  const base = loadFromExports();
  if (!base) return null;

  const live: NonNullable<Dataset["live"]> = {};
  const [yt, meta] = await Promise.all([fetchYouTube(opts.force), fetchMeta(opts.force)]);

  if (!yt.configured) {
    live.youtube = { note: "Not connected — add YOUTUBE_API_KEY to .env.local" };
  } else {
    live.youtube = { syncedAt: yt.data?.syncedAt, error: yt.error, items: yt.data?.videos.length };
    if (yt.data) mergeYouTube(base, yt.data.videos, yt.data.subscribers, yt.data.syncedAt);
  }

  if (!meta.configured) {
    const note = "Not connected — add META_ACCESS_TOKEN and META_PAGE_ID / META_IG_USER_ID to .env.local";
    live.facebook = { note };
    live.instagram = { note };
  } else {
    const d = meta.data;
    const errs = meta.error?.split(" · ") ?? [];
    const general = d ? undefined : meta.error;
    live.facebook = { syncedAt: d?.facebook ? d.syncedAt : undefined, items: d?.facebook?.posts.length, error: errs.find((e) => e.startsWith("Facebook")) ?? general, warnings: d?.warnings.filter((w) => w.startsWith("Facebook ")) };
    live.instagram = { syncedAt: d?.instagram ? d.syncedAt : undefined, items: d?.instagram?.posts.length, error: errs.find((e) => e.startsWith("Instagram")) ?? general, warnings: d?.warnings.filter((w) => w.startsWith("Instagram ")) };
    if (d) mergeMeta(base, d);
  }

  const syncTimes = [yt.data?.syncedAt, meta.data?.syncedAt].filter((x): x is string => !!x).sort();
  if (syncTimes.length) base.updatedAt = syncTimes[syncTimes.length - 1];
  base.live = live;
  return base;
}

function mergeYouTube(ds: Dataset, videos: Post[], subscribers: number | null, syncedAt: string) {
  const existing = new Map(ds.posts.filter((p) => p.platform === "YouTube").map((p) => [p.id, p]));

  for (const v of videos) {
    const old = existing.get(v.id);
    if (!old) {
      ds.posts.push(v); // a video newer than the last Studio export
      continue;
    }
    // fresh numbers + exact publish time from the API; Studio-only metrics stay from the export
    old.videoViews = v.videoViews;
    old.likes = v.likes;
    old.comments = v.comments;
    old.publishedAt = v.publishedAt;
    old.timeKnown = true;
    old.engagementKnown = true;
    old.caption = v.caption || old.caption;
    old.format = v.format;
    old.hashtags = v.hashtags.length ? v.hashtags : old.hashtags;
  }
  ds.posts.sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));

  if (!ds.accounts.some((a) => a.id === "yt-main")) {
    const acc: Account = { id: "yt-main", platform: "YouTube", name: "Tritorc Equipments", url: "https://www.youtube.com/@TritorcEquipments" };
    ds.accounts.push(acc);
  }
  if (subscribers != null) {
    const today = syncedAt.slice(0, 10);
    const rest: FollowerPoint[] = ds.followers.filter((f) => f.accountId !== "yt-main");
    ds.followers = [...rest, { accountId: "yt-main", date: today, followers: subscribers }];
  }
  if (ds.coverage) {
    const last = videos.map((v) => v.publishedAt.slice(0, 10)).sort().at(-1);
    ds.coverage["yt-main"] = { from: ds.coverage["yt-main"]?.from ?? "2019-10-22", to: last ?? ds.coverage["yt-main"]?.to ?? "" };
  }
}

/** Export post IDs and live Graph IDs differ in shape (`<pageId>_<postId>` vs `<postId>`): compare the last segment, then the permalink. */
const idKey = (id: string) => id.replace(/^(fb|ig)-/, "").split("_").at(-1) ?? id;
const linkKey = (u: string) => u.split("?")[0].replace(/\/+$/, "").toLowerCase();

function mergeMetaPosts(ds: Dataset, platform: "Facebook" | "Instagram", live: Post[]) {
  const existing = ds.posts.filter((p) => p.platform === platform);
  const byId = new Map(existing.map((p) => [idKey(p.id), p]));
  const byLink = new Map(existing.filter((p) => p.url && p.url !== "#").map((p) => [linkKey(p.url), p]));

  for (const v of live) {
    const old = byId.get(idKey(v.id)) ?? byLink.get(linkKey(v.url));
    if (!old) {
      ds.posts.push(v); // newer than the last export
      continue;
    }
    // live numbers win where Meta returned them; otherwise keep what the export had
    old.likes = v.likes;
    old.comments = v.comments;
    old.shares = v.shares || old.shares;
    old.engagementKnown = true;
    old.impressions = v.impressions ?? old.impressions;
    old.reach = v.reach ?? old.reach;
    old.saves = v.saves ?? old.saves;
    old.clicks = v.clicks ?? old.clicks;
    old.videoViews = v.videoViews ?? old.videoViews;
    if (v.url !== "#") old.url = v.url;
  }
}

function mergeMeta(ds: Dataset, meta: MetaLive) {
  const parts = [
    { id: "fb-group", platform: "Facebook" as const, name: "Tritorc Group", url: "https://www.facebook.com/profile.php?id=61580668880212", data: meta.facebook },
    { id: "ig-group", platform: "Instagram" as const, name: "Tritorc Group", url: "https://www.instagram.com/tritorcgroup/", data: meta.instagram },
  ];
  for (const { id, platform, name, url, data } of parts) {
    if (!data) continue;
    // the account may exist only live (no export loaded for it)
    if (!ds.accounts.some((a) => a.id === id)) ds.accounts.push({ id, platform, name, url });
    if (ds.coverage && !ds.coverage[id]) {
      const first = data.posts.map((p) => p.publishedAt.slice(0, 10)).sort()[0];
      ds.coverage[id] = { from: first ?? "1970-01-01", to: first ?? "" };
    }
    mergeMetaPosts(ds, platform, data.posts);
    if (data.followers != null) {
      const today = meta.syncedAt.slice(0, 10);
      ds.followers = [...ds.followers.filter((f) => !(f.accountId === id && f.date === today)), { accountId: id, date: today, followers: data.followers }];
    }
    const last = data.posts.map((p) => p.publishedAt.slice(0, 10)).sort().at(-1);
    const cur = ds.coverage?.[id];
    if (cur && last && last > cur.to) cur.to = last;
  }
  ds.posts.sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));

  // live follower demographics replace the exported ones for Instagram
  if (meta.audience.length) ds.audience = [...ds.audience.filter((a) => a.accountId !== "ig-group"), ...meta.audience];
}
