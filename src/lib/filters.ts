import type { Dataset, Platform, Post } from "./types";
import { PLATFORMS } from "./types";
import { addDays, startOfDay } from "./metrics";

export interface Filters {
  /** 0 = all data */
  days: number;
  platform: Platform | "all";
  account: string; // "all" or account id
  campaign: string; // "all" | "none" | campaign id
  paid: "organic" | "paid" | "all";
}

export const DEFAULT_FILTERS: Filters = {
  days: 30,
  platform: "all",
  account: "all",
  campaign: "all",
  paid: "organic",
};

export const RANGE_OPTIONS = [
  { value: 7, label: "Last 7 days" },
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" },
  { value: 180, label: "Last 6 months" },
  { value: 365, label: "Last 12 months" },
];

export function parseFilters(sp: URLSearchParams): Filters {
  const days = Number(sp.get("days"));
  const platform = sp.get("platform");
  const paid = sp.get("paid");
  return {
    days: RANGE_OPTIONS.some((r) => r.value === days) ? days : DEFAULT_FILTERS.days,
    platform: PLATFORMS.includes(platform as Platform) ? (platform as Platform) : "all",
    account: sp.get("account") || "all",
    campaign: sp.get("campaign") || "all",
    paid: paid === "paid" || paid === "all" ? paid : "organic",
  };
}

/** Only non-default values are written to the URL so shared links stay short. */
export function filtersToParams(f: Filters, base?: URLSearchParams): URLSearchParams {
  const sp = new URLSearchParams(base);
  const set = (k: string, v: string, def: string) => (v === def ? sp.delete(k) : sp.set(k, v));
  set("days", String(f.days), String(DEFAULT_FILTERS.days));
  set("platform", f.platform, "all");
  set("account", f.account, "all");
  set("campaign", f.campaign, "all");
  set("paid", f.paid, DEFAULT_FILTERS.paid);
  return sp;
}

export interface DateRange {
  from: Date;
  to: Date;
  prevFrom: Date;
  prevTo: Date;
  days: number;
}

/** Range ends on the most recent day that has data (yesterday or today). */
export function getRange(f: Filters, today: Date, earliest: Date): DateRange {
  const to = startOfDay(today);
  const days = f.days || Math.round((to.getTime() - earliest.getTime()) / 86400000) + 1;
  const from = addDays(to, -(days - 1));
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(days - 1));
  return { from, to, prevFrom, prevTo, days };
}

export function accountIdsFor(ds: Dataset, f: Filters): string[] {
  return ds.accounts
    .filter(
      (a) =>
        (f.platform === "all" || a.platform === f.platform) &&
        (f.account === "all" || a.id === f.account),
    )
    .map((a) => a.id);
}

export function matchesFilters(p: Post, f: Filters, accountIds: Set<string>): boolean {
  if (!accountIds.has(p.accountId)) return false;
  if (f.paid === "organic" && p.paid) return false;
  if (f.paid === "paid" && !p.paid) return false;
  if (f.campaign === "none" && p.campaignId) return false;
  if (f.campaign !== "all" && f.campaign !== "none" && p.campaignId !== f.campaign) return false;
  return true;
}

export function inRange(p: Post, from: Date, to: Date) {
  const t = new Date(p.publishedAt).getTime();
  return t >= from.getTime() && t < addDays(to, 1).getTime();
}

export const PLATFORM_COLOR: Record<Platform, string> = {
  LinkedIn: "var(--c-linkedin)",
  Instagram: "var(--c-instagram)",
  Facebook: "var(--c-facebook)",
  YouTube: "var(--c-youtube)",
};
