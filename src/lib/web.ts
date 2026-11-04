import type { Platform, WebRow } from "./types";

export type Channel =
  | "Social"
  | "Organic search"
  | "Paid search"
  | "Email"
  | "Referral"
  | "Direct"
  | "Other";

export const CHANNELS: Channel[] = ["Social", "Organic search", "Paid search", "Email", "Referral", "Direct", "Other"];

const SOCIAL_MEDIUMS = new Set(["organic_social", "social", "paid_social", "social-network", "sm"]);

/** Which social platform a GA source belongs to (null when it isn't social). */
export function socialPlatform(source: string): Platform | null {
  const s = source.toLowerCase();
  if (s.includes("linkedin") || s === "lnkd.in") return "LinkedIn";
  if (s.includes("instagram") || s === "ig") return "Instagram";
  if (s.includes("facebook") || s === "fb") return "Facebook";
  if (s.includes("youtube")) return "YouTube";
  return null;
}

export function classifyChannel(r: Pick<WebRow, "source" | "medium">): Channel {
  const m = r.medium.toLowerCase();
  const s = r.source.toLowerCase();
  if (socialPlatform(s) || SOCIAL_MEDIUMS.has(m)) return "Social";
  if (/cpc|ppc|paid/.test(m)) return "Paid search";
  if (m === "organic") return "Organic search";
  if (m === "email" || s === "email" || s === "newsletter") return "Email";
  if (m === "referral") return "Referral";
  if (s === "(direct)" || m === "(none)") return "Direct";
  return "Other";
}

export const isSocial = (r: Pick<WebRow, "source" | "medium">) => classifyChannel(r) === "Social";

/** Column order of the single GA4 CSV — also the downloadable template. */
export const GA_COLUMNS = [
  "date",
  "source",
  "medium",
  "campaign",
  "content",
  "landing_page",
  "sessions",
  "new_users",
  "engaged_sessions",
  "avg_engagement_seconds",
  "key_events",
] as const;

export const GA_TEMPLATE_ROWS: (string | number)[][] = [
  ["2026-10-01", "linkedin", "organic_social", "torque_wrench_range_2026", "p123", "/products/hydraulic-torque-wrenches", 14, 11, 9, 52, 1],
  ["2026-10-01", "google", "organic", "(not set)", "", "/", 86, 61, 49, 41, 2],
  ["2026-10-01", "google", "cpc", "brand_search", "", "/contact", 22, 17, 15, 63, 3],
  ["2026-10-01", "(direct)", "(none)", "", "", "/", 55, 30, 31, 38, 0],
];
