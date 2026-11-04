import type { Dataset, Post, Target } from "./types";
import {
  addDays,
  avg,
  engagementRate,
  engagements,
  followersOn,
  fmtPct,
  groupBy,
  median,
  postsInBucket,
  sum,
  sumOrNull,
  timeBuckets,
  type FollowerIndex,
} from "./metrics";
import type { DateRange } from "./filters";

export interface Derived {
  today: Date;
  range: DateRange;
  accountIds: string[];
  matching: Post[];
  inPeriod: Post[];
  prevPeriod: Post[];
  /** false when the previous period starts before the reports do, so a comparison would be meaningless */
  prevAvailable: boolean;
  followerIndex: FollowerIndex;
}

export interface Kpi {
  id: string;
  label: string;
  value: number | null;
  prev: number | null;
  kind: "num" | "pct" | "compact";
  spark: (number | null)[];
  note?: string;
}

export function buildKpis(d: Derived): Kpi[] {
  const { range, accountIds, followerIndex: fi, inPeriod: cur, prevPeriod: prev } = d;
  const buckets = timeBuckets(range.from, range.to);
  const per = <T,>(fn: (ps: Post[]) => T) => buckets.map((b) => fn(postsInBucket(cur, b)));

  const folEnd = followersOn(fi, accountIds, range.to);
  const folStart = followersOn(fi, accountIds, addDays(range.from, -1));
  const folPrevEnd = followersOn(fi, accountIds, range.prevTo);
  const folPrevStart = followersOn(fi, accountIds, addDays(range.prevFrom, -1));
  const hasPrev = d.prevAvailable && range.days > 0;

  const followerSpark = buckets.map((b) => followersOn(fi, accountIds, b.end > range.to ? range.to : b.end));
  const netSpark = buckets.map((b) => {
    const s = followersOn(fi, accountIds, addDays(b.start < range.from ? range.from : b.start, -1));
    const e = followersOn(fi, accountIds, b.end > range.to ? range.to : b.end);
    return e - s;
  });

  return [
    { id: "followers", label: "Followers", value: folEnd, prev: hasPrev ? folPrevEnd : null, kind: "num", spark: followerSpark, note: "end of period" },
    { id: "netNew", label: "Net new followers", value: folEnd - folStart, prev: hasPrev ? folPrevEnd - folPrevStart : null, kind: "num", spark: netSpark },
    { id: "posts", label: "Posts published", value: cur.length, prev: hasPrev ? prev.length : null, kind: "num", spark: per((p) => p.length) },
    { id: "impressions", label: "Impressions / views", value: sumOrNull(cur, (p) => p.impressions), prev: hasPrev ? sumOrNull(prev, (p) => p.impressions) : null, kind: "compact", spark: per((p) => sumOrNull(p, (x) => x.impressions)), note: "definitions differ by platform" },
    { id: "engagements", label: "Engagements", value: sum(cur, engagements), prev: hasPrev ? sum(prev, engagements) : null, kind: "num", spark: per((p) => sum(p, engagements)), note: "likes + comments + shares + saves" },
    { id: "er", label: "Avg engagement rate", value: avg(cur, engagementRate), prev: hasPrev ? avg(prev, engagementRate) : null, kind: "pct", spark: per((p) => avg(p, engagementRate)), note: "engagements ÷ reach (impressions on LinkedIn)" },
    { id: "clicks", label: "Clicks", value: sumOrNull(cur, (p) => p.clicks), prev: hasPrev ? sumOrNull(prev, (p) => p.clicks) : null, kind: "num", spark: per((p) => sumOrNull(p, (x) => x.clicks)), note: "all clicks on LinkedIn · link clicks on Facebook · not on Instagram/YouTube" },
    { id: "leads", label: "Qualified leads", value: sumOrNull(cur, (p) => p.leads), prev: hasPrev ? sumOrNull(prev, (p) => p.leads) : null, kind: "num", spark: per((p) => sumOrNull(p, (x) => x.leads)), note: "entered per post" },
  ];
}

/** Value of a monthly-target metric for a calendar month (filters apply except date). */
export function monthActual(
  metric: Target["metric"],
  matching: Post[],
  fi: FollowerIndex,
  accountIds: string[],
  monthStart: Date,
  monthEnd: Date,
): number {
  const inMonth = matching.filter((p) => {
    const t = new Date(p.publishedAt).getTime();
    return t >= monthStart.getTime() && t < addDays(monthEnd, 1).getTime();
  });
  switch (metric) {
    case "posts":
      return inMonth.length;
    case "engagements":
      return sum(inMonth, engagements);
    case "leads":
      return sum(inMonth, (p) => p.leads);
    case "newFollowers":
      return followersOn(fi, accountIds, monthEnd) - followersOn(fi, accountIds, addDays(monthStart, -1));
  }
}

export interface Highlight {
  tone: "good" | "warn" | "neutral";
  title: string;
  detail: string;
  postId?: string;
}

/** Rule-based callouts (no AI): simple, explainable comparisons. */
export function buildHighlights(d: Derived, ds: Dataset): Highlight[] {
  const out: Highlight[] = [];
  const { inPeriod: current, matching, today, accountIds, followerIndex: fi, range } = d;

  // best post of the last 7 days
  const weekAgo = addDays(today, -6).getTime();
  const lastWeek = matching.filter((p) => new Date(p.publishedAt).getTime() >= weekAgo);
  const best = [...lastWeek].filter((p) => engagementRate(p) != null).sort((a, b) => (engagementRate(b) ?? 0) - (engagementRate(a) ?? 0))[0];
  if (best)
    out.push({
      tone: "good",
      title: "Best post this week",
      detail: `“${best.caption}” on ${best.platform} — ${fmtPct(engagementRate(best))} engagement rate.`,
      postId: best.id,
    });

  // posts well above their own account's typical rate
  const medians = new Map<string, number | null>();
  for (const [acc, ps] of groupBy(matching, (p) => p.accountId)) medians.set(acc, median(ps.map(engagementRate)));
  const strong = current.filter((p) => {
    const m = medians.get(p.accountId);
    const er = engagementRate(p);
    return m && er != null && er >= m * 2;
  });
  if (strong.length)
    out.push({
      tone: "good",
      title: `${strong.length} post${strong.length > 1 ? "s" : ""} at 2× their account’s typical engagement`,
      detail: `Open Posts and sort by engagement rate to see what they have in common.`,
    });

  // best format
  const byFormat = [...groupBy(current, (p) => p.format)]
    .filter(([, ps]) => ps.length >= 3)
    .map(([f, ps]) => ({ f, er: avg(ps, engagementRate), n: ps.length }))
    .filter((x) => x.er != null)
    .sort((a, b) => (b.er ?? 0) - (a.er ?? 0));
  if (byFormat[0])
    out.push({
      tone: "neutral",
      title: `${byFormat[0].f} posts lead on engagement`,
      detail: `${fmtPct(byFormat[0].er)} average across ${byFormat[0].n} posts in this period.`,
    });

  // follower movement
  const net = followersOn(fi, accountIds, range.to) - followersOn(fi, accountIds, addDays(range.from, -1));
  const prevNet = followersOn(fi, accountIds, range.prevTo) - followersOn(fi, accountIds, addDays(range.prevFrom, -1));
  if (d.prevAvailable && range.days && prevNet > 0 && net < prevNet * 0.6)
    out.push({
      tone: "warn",
      title: "Follower growth has slowed",
      detail: `+${net.toLocaleString("en-IN")} this period vs +${prevNet.toLocaleString("en-IN")} in the previous one.`,
    });
  else if (d.prevAvailable && range.days && prevNet > 0 && net > prevNet * 1.4)
    out.push({
      tone: "good",
      title: "Follower growth is accelerating",
      detail: `+${net.toLocaleString("en-IN")} this period vs +${prevNet.toLocaleString("en-IN")} in the previous one.`,
    });

  // posting gaps per account
  for (const id of accountIds) {
    const last = matching.filter((p) => p.accountId === id).at(-1);
    if (!last) continue;
    const gap = Math.floor((today.getTime() - new Date(last.publishedAt).getTime()) / 86400000);
    if (gap >= 7) {
      const name = ds.accounts.find((a) => a.id === id)?.name;
      out.push({ tone: "warn", title: `No post on ${name} (${ds.accounts.find((a) => a.id === id)?.platform}) for ${gap} days`, detail: "Check the content calendar for a gap." });
    }
  }

  // weakest category
  const byCat = [...groupBy(current, (p) => p.category)]
    .filter(([, ps]) => ps.length >= 3)
    .map(([c, ps]) => ({ c, er: avg(ps, engagementRate) }))
    .filter((x) => x.er != null)
    .sort((a, b) => (a.er ?? 0) - (b.er ?? 0));
  if (byCat.length > 1)
    out.push({
      tone: "neutral",
      title: `${byCat[0].c} posts have the lowest engagement`,
      detail: `${fmtPct(byCat[0].er)} average. Check they match their purpose (e.g. corporate posts serve awareness) before cutting back.`,
    });

  return out.slice(0, 6);
}

export function fmtKpi(k: Kpi, v: number | null) {
  if (v == null) return "N/A";
  if (k.kind === "pct") return `${v.toFixed(2)}%`;
  if (k.kind === "compact") {
    const a = Math.abs(v);
    if (a >= 1e7) return `${(v / 1e7).toFixed(2)}Cr`;
    if (a >= 1e5) return `${(v / 1e5).toFixed(2)}L`;
    if (a >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
    return String(Math.round(v));
  }
  return Math.round(v).toLocaleString("en-IN");
}

/** True when every selected account's reports reach back to the start of the previous period. */
export function prevCovered(ds: Dataset, accountIds: string[], prevFrom: Date): boolean {
  if (!ds.coverage) return true;
  const start = prevFrom.toISOString().slice(0, 10);
  return accountIds.every((id) => !ds.coverage![id] || ds.coverage![id].from <= start);
}
