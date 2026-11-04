import type { Account, Dataset, FollowerPoint, Post } from "../types";
import { loadFromExports } from "./load-exports";
import { fetchYouTube } from "./youtube-api";

/**
 * Dataset = platform exports (history, private analytics) + live API data (fresh numbers).
 * Live sources override the numbers they cover; everything else comes from the exports.
 */
export async function buildDataset(opts: { force?: boolean } = {}): Promise<Dataset | null> {
  const base = loadFromExports();
  if (!base) return null;

  const live: NonNullable<Dataset["live"]> = {};
  const yt = await fetchYouTube(opts.force);

  if (!yt.configured) {
    live.youtube = { note: "Not connected — add YOUTUBE_API_KEY to .env.local" };
  } else {
    live.youtube = { syncedAt: yt.data?.syncedAt, error: yt.error, items: yt.data?.videos.length };
    if (yt.data) mergeYouTube(base, yt.data.videos, yt.data.subscribers, yt.data.syncedAt);
  }

  if (yt.data) base.updatedAt = yt.data.syncedAt;
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
