import type { AudienceRow, Format, Post } from "../types";
import { BASE_POST, clean, hashtags, tag } from "./load-exports";

/**
 * Live Facebook + Instagram data from the Meta Graph API.
 * Server-only: the token is read from the environment and never sent to the browser.
 *
 * Every insight metric is requested on its own and is optional: Meta renames and retires
 * metrics often, and a token may lack the scope for some of them. A metric that fails stays
 * `null` (shown as N/A) and the reason is collected in `warnings`, so one bad metric never
 * breaks the sync. See README -> "Handover: Meta" for the permissions the token needs.
 */

const VERSION = process.env.META_GRAPH_VERSION?.trim() || "v23.0";
const API = `https://graph.facebook.com/${VERSION}`;
const TTL_MS = 10 * 60 * 1000;
const MAX_POSTS = 150; // per platform, newest first
const CONCURRENCY = 5;

export interface MetaLive {
  syncedAt: string;
  facebook?: { followers: number | null; posts: Post[] };
  instagram?: { followers: number | null; posts: Post[] };
  audience: AudienceRow[];
  /** Non-fatal problems (a metric or breakdown Meta refused) */
  warnings: string[];
}

export interface MetaResult {
  configured: boolean;
  data?: MetaLive;
  error?: string;
}

let cache: { at: number; data: MetaLive; error?: string } | null = null;

interface GraphError {
  error?: { message?: string; code?: number };
}

class Redactor {
  constructor(private secrets: string[]) {}
  clean(s: string) {
    return this.secrets.filter(Boolean).reduce((acc, x) => acc.split(x).join("***"), s);
  }
}

async function graph<T>(path: string, params: Record<string, string>, token: string, r: Redactor): Promise<T> {
  const url = new URL(path.startsWith("http") ? path : `${API}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  // the token goes in a header, not the URL, so it can't end up in logs or paging links
  const res = await fetch(url, { cache: "no-store", headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    let detail = "";
    try {
      const e = ((await res.json()) as GraphError).error;
      detail = e?.message ? `${e.message}${e.code ? ` (code ${e.code})` : ""}` : "";
    } catch {
      /* no body */
    }
    throw new Error(r.clean(`Meta API ${res.status}${detail ? `: ${detail}` : ""}`));
  }
  return (await res.json()) as T;
}

/** Runs `fn` over `items` with a small concurrency limit (keeps within Meta's rate limits). */
async function pool<T, R>(items: T[], fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

interface Paged<T> {
  data?: T[];
  paging?: { next?: string };
}

async function paginate<T>(first: string, params: Record<string, string>, token: string, r: Redactor, max: number): Promise<T[]> {
  const items: T[] = [];
  let page = await graph<Paged<T>>(first, params, token, r);
  for (let i = 0; i < 20; i++) {
    items.push(...(page.data ?? []));
    if (items.length >= max || !page.paging?.next) break;
    page = await graph<Paged<T>>(page.paging.next, {}, token, r);
  }
  return items.slice(0, max);
}

interface InsightsResponse {
  data?: { name: string; values?: { value: number | Record<string, number> }[]; total_value?: { value: number } }[];
}

/** One insight metric for one object. Returns null when Meta refuses it. */
async function insight(id: string, metric: string, token: string, r: Redactor, warnings: Set<string>, extra: Record<string, string> = {}): Promise<number | null> {
  try {
    const res = await graph<InsightsResponse>(`${id}/insights`, { metric, ...extra }, token, r);
    const d = res.data?.[0];
    const v = d?.total_value?.value ?? d?.values?.[0]?.value;
    return typeof v === "number" ? v : null;
  } catch (e) {
    warnings.add(`${metric}: ${e instanceof Error ? e.message : "failed"}`);
    return null;
  }
}

/* ---------- Facebook ---------- */

interface FbPost {
  id: string;
  message?: string;
  created_time: string;
  permalink_url?: string;
  shares?: { count?: number };
  status_type?: string;
  attachments?: { data?: { media_type?: string }[] };
  reactions?: { summary?: { total_count?: number } };
  comments?: { summary?: { total_count?: number } };
}

function fbFormat(p: FbPost): Format {
  const t = `${p.attachments?.data?.[0]?.media_type ?? ""} ${p.status_type ?? ""}`.toLowerCase();
  if (t.includes("reel")) return "Reel";
  if (t.includes("video")) return "Video";
  if (t.includes("photo") || t.includes("album")) return "Image";
  return "Text";
}

async function fetchFacebook(pageId: string, userToken: string, r: Redactor, warnings: Set<string>) {
  // Page endpoints (posts, insights) want a Page token. With a user token that has access to the
  // page, Meta hands one out here; if that fails (the token already is a Page token) keep using it.
  let token = userToken;
  try {
    const t = await graph<{ access_token?: string }>(pageId, { fields: "access_token" }, userToken, r);
    if (t.access_token) token = t.access_token;
  } catch {
    /* fall back to the token as given */
  }
  const followersP = graph<{ followers_count?: number; fan_count?: number }>(pageId, { fields: "followers_count,fan_count" }, token, r)
    .then((x) => x.followers_count ?? x.fan_count ?? null)
    .catch((e) => {
      warnings.add(`followers: ${e instanceof Error ? e.message : "failed"}`);
      return null;
    });

  const raw = await paginate<FbPost>(
    `${pageId}/posts`,
    {
      fields: "id,message,created_time,permalink_url,shares,status_type,attachments{media_type},reactions.summary(true).limit(0),comments.summary(true).limit(0)",
      limit: "50",
    },
    token,
    r,
    MAX_POSTS,
  );

  const posts = await pool(raw, async (p): Promise<Post> => {
    const [views, viewers, clicks] = await Promise.all([
      insight(p.id, "post_media_view", token, r, warnings),
      insight(p.id, "post_total_media_view_unique", token, r, warnings),
      insight(p.id, "post_clicks", token, r, warnings),
    ]);
    const caption = clean(p.message ?? "");
    const format = fbFormat(p);
    return {
      ...BASE_POST,
      id: `fb-${p.id}`,
      platform: "Facebook",
      accountId: "fb-group",
      url: p.permalink_url || "#",
      publishedAt: new Date(p.created_time).toISOString(),
      timeKnown: true,
      engagementKnown: p.reactions != null && p.comments != null,
      caption: caption.slice(0, 300) || "(no caption)",
      format,
      hashtags: hashtags(caption),
      ...tag(caption),
      impressions: views,
      // Meta retired Facebook reach (31 Oct 2026); unique viewers is its replacement
      reach: viewers,
      likes: p.reactions?.summary?.total_count ?? 0,
      comments: p.comments?.summary?.total_count ?? 0,
      shares: p.shares?.count ?? 0,
      saves: null,
      clicks,
      videoViews: format === "Video" || format === "Reel" ? views : null,
    };
  });

  return { followers: await followersP, posts };
}

/* ---------- Instagram ---------- */

interface IgMedia {
  id: string;
  caption?: string;
  timestamp: string;
  media_type?: string;
  media_product_type?: string;
  permalink?: string;
  like_count?: number;
  comments_count?: number;
}

function igFormat(m: IgMedia): Format {
  if (m.media_product_type === "REELS") return "Reel";
  if (m.media_type === "CAROUSEL_ALBUM") return "Carousel";
  if (m.media_type === "VIDEO") return "Video";
  return "Image";
}

async function fetchInstagram(igId: string, token: string, r: Redactor, warnings: Set<string>) {
  const followersP = graph<{ followers_count?: number }>(igId, { fields: "followers_count" }, token, r)
    .then((x) => x.followers_count ?? null)
    .catch((e) => {
      warnings.add(`followers: ${e instanceof Error ? e.message : "failed"}`);
      return null;
    });

  const raw = await paginate<IgMedia>(
    `${igId}/media`,
    { fields: "id,caption,timestamp,media_type,media_product_type,permalink,like_count,comments_count", limit: "50" },
    token,
    r,
    MAX_POSTS,
  );

  const posts = await pool(raw, async (m): Promise<Post> => {
    const [views, reach, saved, shares] = await Promise.all([
      insight(m.id, "views", token, r, warnings),
      insight(m.id, "reach", token, r, warnings),
      insight(m.id, "saved", token, r, warnings),
      insight(m.id, "shares", token, r, warnings),
    ]);
    const caption = clean(m.caption ?? "");
    const format = igFormat(m);
    return {
      ...BASE_POST,
      id: `ig-${m.id}`,
      platform: "Instagram",
      accountId: "ig-group",
      url: m.permalink || "#",
      publishedAt: new Date(m.timestamp).toISOString(),
      timeKnown: true,
      engagementKnown: m.like_count != null,
      caption: caption.slice(0, 300) || "(no caption)",
      format,
      hashtags: hashtags(caption),
      ...tag(caption),
      impressions: views,
      reach,
      likes: m.like_count ?? 0,
      comments: m.comments_count ?? 0,
      shares: shares ?? 0,
      saves: saved,
      clicks: null,
      videoViews: format === "Reel" || format === "Video" ? views : null,
    };
  });

  return { followers: await followersP, posts };
}

/** Instagram follower demographics -> the same rows the Audience page already draws. */
async function fetchIgAudience(igId: string, token: string, r: Redactor, warnings: Set<string>): Promise<AudienceRow[]> {
  const out: AudienceRow[] = [];
  const base = { metric: "follower_demographics", period: "lifetime", metric_type: "total_value" };

  interface Breakdown {
    data?: { total_value?: { breakdowns?: { results?: { dimension_values: string[]; value: number }[] }[] } }[];
  }
  const get = async (breakdown: string) => {
    try {
      const res = await graph<Breakdown>(`${igId}/insights`, { ...base, breakdown }, token, r);
      return res.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? [];
    } catch (e) {
      warnings.add(`follower_demographics (${breakdown}): ${e instanceof Error ? e.message : "failed"}`);
      return [];
    }
  };

  const [country, city, age] = await Promise.all([get("country"), get("city"), get("age,gender")]);
  const top = (rows: { dimension_values: string[]; value: number }[], n: number) =>
    [...rows].sort((a, b) => b.value - a.value).slice(0, n);
  const pct = <T extends { value: number }>(rows: T[]) => {
    const total = rows.reduce((s, x) => s + x.value, 0);
    return (v: number) => (total ? (v / total) * 100 : 0);
  };

  const pc = pct(country);
  for (const x of top(country, 10)) out.push({ accountId: "ig-group", dimension: "Top countries", label: x.dimension_values[0], value: pc(x.value), unit: "percent" });
  const pt = pct(city);
  for (const x of top(city, 10)) out.push({ accountId: "ig-group", dimension: "Top towns/cities", label: x.dimension_values[0], value: pt(x.value), unit: "percent" });

  // age,gender rows come as ["18-24","F"]; fold into one row per age band: value = men, secondary = women
  const pa = pct(age);
  const bands = new Map<string, { men: number; women: number }>();
  for (const x of age) {
    const [band, g] = x.dimension_values;
    const b = bands.get(band) ?? { men: 0, women: 0 };
    if (g === "M") b.men += x.value;
    else if (g === "F") b.women += x.value;
    bands.set(band, b);
  }
  for (const [band, b] of [...bands].sort((a, z) => a[0].localeCompare(z[0], undefined, { numeric: true }))) {
    out.push({ accountId: "ig-group", dimension: "Age & gender", label: band, value: pa(b.men), secondary: pa(b.women), unit: "percent" });
  }
  return out;
}

/* ---------- entry point ---------- */

export async function fetchMeta(force = false): Promise<MetaResult> {
  const token = process.env.META_ACCESS_TOKEN?.trim();
  const pageId = process.env.META_PAGE_ID?.trim();
  const igId = process.env.META_IG_USER_ID?.trim();
  if (!token || (!pageId && !igId)) return { configured: false };

  if (!force && cache && Date.now() - cache.at < TTL_MS) return { configured: true, data: cache.data, error: cache.error };

  const r = new Redactor([token, process.env.META_APP_SECRET?.trim() ?? ""]);
  const fbWarnings = new Set<string>();
  const igWarnings = new Set<string>();
  const errors: string[] = [];
  const fail = (label: string) => (e: unknown) => {
    errors.push(`${label}: ${e instanceof Error ? r.clean(e.message) : "sync failed"}`);
    return undefined;
  };

  const [facebook, instagram, audience] = await Promise.all([
    pageId ? fetchFacebook(pageId, token, r, fbWarnings).catch(fail("Facebook")) : undefined,
    igId ? fetchInstagram(igId, token, r, igWarnings).catch(fail("Instagram")) : undefined,
    igId ? fetchIgAudience(igId, token, r, igWarnings).catch(() => [] as AudienceRow[]) : ([] as AudienceRow[]),
  ]);

  if (!facebook && !instagram) {
    // keep serving the last good copy if there is one
    return { configured: true, data: cache?.data, error: errors.join(" · ") || "Meta sync failed" };
  }

  const data: MetaLive = {
    syncedAt: new Date().toISOString(),
    facebook,
    instagram,
    audience,
    warnings: [
      ...[...fbWarnings].slice(0, 5).map((w) => `Facebook ${r.clean(w)}`),
      ...[...igWarnings].slice(0, 5).map((w) => `Instagram ${r.clean(w)}`),
    ],
  };
  const error = errors.length ? errors.join(" · ") : undefined;
  cache = { at: Date.now(), data, error };
  return { configured: true, data, error };
}
