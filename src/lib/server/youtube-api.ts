import type { Post } from "../types";
import { BASE_POST, clean, hashtags, tag } from "./load-exports";

/**
 * Live YouTube data from the YouTube Data API v3 (public statistics, API key only).
 * Server-only: the key is read from the environment and never sent to the browser.
 * Gives views, likes, comments and subscriber count; private analytics (watch time,
 * impressions, CTR) still come from the Studio export until OAuth is added.
 */

const API = "https://www.googleapis.com/youtube/v3";
const TTL_MS = 10 * 60 * 1000;

export interface YouTubeLive {
  syncedAt: string;
  /** Rounded by YouTube (3 significant figures) */
  subscribers: number | null;
  channelViews: number | null;
  videos: Post[];
}

export interface YouTubeResult {
  configured: boolean;
  data?: YouTubeLive;
  error?: string;
}

let cache: { at: number; data: YouTubeLive } | null = null;

interface YtError {
  error?: { message?: string };
}

async function call<T>(path: string, params: Record<string, string>, key: string): Promise<T> {
  const url = new URL(`${API}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("key", key);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    let detail = "";
    try {
      detail = ((await res.json()) as YtError).error?.message ?? "";
    } catch {
      /* no body */
    }
    // never let the key leak into an error message
    throw new Error(`YouTube API ${res.status}${detail ? `: ${detail}` : ""}`.split(key).join("***"));
  }
  return (await res.json()) as T;
}

/** ISO 8601 duration (PT1M30S) -> seconds */
function seconds(iso: string): number {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0;
}

interface ChannelsResponse {
  items?: {
    statistics?: { subscriberCount?: string; viewCount?: string; hiddenSubscriberCount?: boolean };
    contentDetails?: { relatedPlaylists?: { uploads?: string } };
  }[];
}
interface PlaylistResponse {
  items?: { contentDetails?: { videoId?: string } }[];
  nextPageToken?: string;
}
interface VideosResponse {
  items?: {
    id: string;
    snippet?: { title?: string; description?: string; publishedAt?: string };
    contentDetails?: { duration?: string };
    statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
  }[];
}

export async function fetchYouTube(force = false): Promise<YouTubeResult> {
  const key = process.env.YOUTUBE_API_KEY?.trim();
  const channelId = process.env.YOUTUBE_CHANNEL_ID?.trim();
  if (!key || !channelId) return { configured: false };

  if (!force && cache && Date.now() - cache.at < TTL_MS) return { configured: true, data: cache.data };

  try {
    const ch = await call<ChannelsResponse>("channels", { part: "statistics,contentDetails", id: channelId }, key);
    const channel = ch.items?.[0];
    if (!channel) throw new Error("Channel not found — check YOUTUBE_CHANNEL_ID");
    const uploads = channel.contentDetails?.relatedPlaylists?.uploads;
    if (!uploads) throw new Error("The channel has no uploads playlist");

    // all uploaded video ids (50 per page)
    const ids: string[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < 20; page++) {
      const pl = await call<PlaylistResponse>(
        "playlistItems",
        { part: "contentDetails", playlistId: uploads, maxResults: "50", ...(pageToken ? { pageToken } : {}) },
        key,
      );
      for (const it of pl.items ?? []) if (it.contentDetails?.videoId) ids.push(it.contentDetails.videoId);
      pageToken = pl.nextPageToken;
      if (!pageToken) break;
    }

    const videos: Post[] = [];
    for (let i = 0; i < ids.length; i += 50) {
      const v = await call<VideosResponse>("videos", { part: "snippet,statistics,contentDetails", id: ids.slice(i, i + 50).join(",") }, key);
      for (const it of v.items ?? []) {
        const title = clean(it.snippet?.title ?? "");
        const desc = it.snippet?.description ?? "";
        const dur = seconds(it.contentDetails?.duration ?? "");
        const views = Number(it.statistics?.viewCount ?? 0);
        videos.push({
          ...BASE_POST,
          id: `yt-${it.id}`,
          platform: "YouTube",
          accountId: "yt-main",
          url: `https://www.youtube.com/watch?v=${it.id}`,
          publishedAt: it.snippet?.publishedAt ?? new Date().toISOString(),
          timeKnown: true,
          engagementKnown: true,
          caption: title,
          format: dur > 0 && dur <= 60 ? "Short" : "Video",
          hashtags: hashtags(clean(`${title} ${desc}`)),
          ...tag(clean(`${title} ${desc.slice(0, 400)}`)),
          impressions: null,
          reach: null,
          // hidden like counts / disabled comments come back as missing -> 0
          likes: Number(it.statistics?.likeCount ?? 0),
          comments: Number(it.statistics?.commentCount ?? 0),
          shares: 0,
          saves: null,
          clicks: null,
          videoViews: views,
        });
      }
    }

    const stats = channel.statistics;
    const data: YouTubeLive = {
      syncedAt: new Date().toISOString(),
      subscribers: stats?.hiddenSubscriberCount ? null : stats?.subscriberCount != null ? Number(stats.subscriberCount) : null,
      channelViews: stats?.viewCount != null ? Number(stats.viewCount) : null,
      videos,
    };
    cache = { at: Date.now(), data };
    return { configured: true, data };
  } catch (e) {
    const message = e instanceof Error ? e.message : "YouTube sync failed";
    // keep serving the last good copy if there is one
    return { configured: true, data: cache?.data, error: message.split(key).join("***") };
  }
}
