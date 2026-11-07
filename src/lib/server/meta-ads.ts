import type { AdRow } from "../types";

/**
 * Live Meta (Facebook + Instagram) ad performance from the Marketing API.
 * Server-only: the token comes from the environment and is sent in a header, never to the browser.
 *
 * Environment:
 *   META_ADS_ACCESS_TOKEN a token with the `ads_read` permission (System User token, never expires);
 *                         falls back to META_ACCESS_TOKEN when not set
 *   META_AD_ACCOUNT_ID    the ad account, with or without the `act_` prefix
 *   META_GRAPH_VERSION    optional, default v23.0
 *
 * One row per day x campaign. Reach is a daily number: never add it up across days or campaigns (audiences overlap).
 * See README -> "Handover: Meta" for how to get the token and the ad account ID.
 */

const VERSION = process.env.META_GRAPH_VERSION?.trim() || "v23.0";
const API = `https://graph.facebook.com/${VERSION}`;
const TTL_MS = 10 * 60 * 1000;
const DAYS = 90;

export interface MetaAdsLive {
  syncedAt: string;
  accountName: string;
  currency: string;
  rows: AdRow[];
  from: string;
  to: string;
}

export interface MetaAdsResult {
  configured: boolean;
  data?: MetaAdsLive;
  error?: string;
}

let cache: { at: number; data: MetaAdsLive } | null = null;

interface GraphError {
  error?: { message?: string; code?: number };
}

async function graph<T>(url: string, params: Record<string, string>, token: string): Promise<T> {
  const u = new URL(url.startsWith("http") ? url : `${API}/${url}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const res = await fetch(u, { cache: "no-store", headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    let detail = "";
    try {
      const e = ((await res.json()) as GraphError).error;
      detail = e?.message ? `${e.message}${e.code ? ` (code ${e.code})` : ""}` : "";
    } catch {
      /* no body */
    }
    throw new Error(`Meta Ads API ${res.status}${detail ? `: ${detail}` : ""}`);
  }
  return (await res.json()) as T;
}

interface InsightRow {
  date_start: string;
  campaign_id?: string;
  campaign_name?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  inline_link_clicks?: string;
  actions?: { action_type: string; value: string }[];
}

interface Paged<T> {
  data?: T[];
  paging?: { next?: string };
}

const num = (v: string | undefined) => (v == null || v === "" ? 0 : Number(v) || 0);

/** Leads: Meta reports the same lead under several action types, so take one, never a sum. */
function leadsOf(actions: InsightRow["actions"]): number {
  if (!actions) return 0;
  const by = new Map(actions.map((a) => [a.action_type, num(a.value)]));
  return by.get("lead") ?? by.get("onsite_conversion.lead_grouped") ?? by.get("offsite_conversion.fb_pixel_lead") ?? 0;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function fetchMetaAds(force = false): Promise<MetaAdsResult> {
  const token = process.env.META_ADS_ACCESS_TOKEN?.trim() || process.env.META_ACCESS_TOKEN?.trim();
  const rawId = process.env.META_AD_ACCOUNT_ID?.trim();
  if (!token || !rawId) return { configured: false };
  const account = rawId.startsWith("act_") ? rawId : `act_${rawId}`;

  if (!force && cache && Date.now() - cache.at < TTL_MS) return { configured: true, data: cache.data };

  try {
    const until = new Date();
    const since = new Date(until.getTime() - DAYS * 86400000);

    const info = await graph<{ name?: string; currency?: string }>(account, { fields: "name,currency" }, token);

    const rows: AdRow[] = [];
    let page = await graph<Paged<InsightRow>>(`${account}/insights`, {
      level: "campaign",
      time_increment: "1",
      time_range: JSON.stringify({ since: iso(since), until: iso(until) }),
      fields: "campaign_id,campaign_name,spend,impressions,reach,clicks,inline_link_clicks,actions",
      limit: "500",
    }, token);
    for (let i = 0; i < 40; i++) {
      for (const r of page.data ?? []) {
        rows.push({
          date: r.date_start,
          campaignId: r.campaign_id ?? "",
          campaignName: r.campaign_name ?? "(unnamed campaign)",
          spend: num(r.spend),
          impressions: num(r.impressions),
          reach: num(r.reach),
          clicks: num(r.clicks),
          linkClicks: num(r.inline_link_clicks),
          leads: leadsOf(r.actions),
        });
      }
      if (!page.paging?.next) break;
      page = await graph<Paged<InsightRow>>(page.paging.next, {}, token);
    }
    rows.sort((a, b) => a.date.localeCompare(b.date) || a.campaignName.localeCompare(b.campaignName));

    const data: MetaAdsLive = {
      syncedAt: new Date().toISOString(),
      accountName: info.name ?? account,
      currency: info.currency ?? "INR",
      rows,
      from: rows[0]?.date ?? iso(since),
      to: rows.at(-1)?.date ?? iso(until),
    };
    cache = { at: Date.now(), data };
    return { configured: true, data };
  } catch (e) {
    // keep serving the last good data if a refresh fails; make sure the token can never leak into the message
    const msg = (e as Error).message.split(token).join("***");
    return { configured: true, data: cache?.data, error: msg };
  }
}
