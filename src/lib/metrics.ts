import type { Dataset, Post } from "./types";

/* ---------- per-post metrics ---------- */

/** Engagements = likes + comments + shares + saves (saves only exist on Instagram). */
export const engagements = (p: Post) =>
  p.likes + p.comments + p.shares + (p.saves ?? 0);

/**
 * Engagement rate in % = engagements ÷ reach. LinkedIn doesn't report reach, so
 * impressions are the base there. YouTube uses (likes + comments) ÷ views, and only for
 * videos whose like/comment counts came from the live API.
 */
export const engagementRate = (p: Post) => {
  if (p.platform === "YouTube") {
    if (!p.engagementKnown) return null;
    return p.videoViews ? (engagements(p) / p.videoViews) * 100 : null;
  }
  const base = p.reach ?? p.impressions;
  return base ? (engagements(p) / base) * 100 : null;
};

/* ---------- aggregation (null-safe: missing metrics are N/A, never 0) ---------- */

export function sum<T>(arr: T[], f: (x: T) => number | null | undefined): number {
  return arr.reduce((s, x) => s + (f(x) ?? 0), 0);
}

/** Sum that returns null when no item has the metric at all. */
export function sumOrNull<T>(arr: T[], f: (x: T) => number | null | undefined): number | null {
  let seen = false;
  let total = 0;
  for (const x of arr) {
    const v = f(x);
    if (v != null) {
      seen = true;
      total += v;
    }
  }
  return seen ? total : null;
}

export function avg<T>(arr: T[], f: (x: T) => number | null | undefined): number | null {
  let n = 0;
  let total = 0;
  for (const x of arr) {
    const v = f(x);
    if (v != null) {
      n++;
      total += v;
    }
  }
  return n ? total / n : null;
}

export function median(values: (number | null | undefined)[]): number | null {
  const v = values.filter((x): x is number => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export function groupBy<T>(arr: T[], key: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of arr) {
    const k = key(x);
    const g = m.get(k);
    if (g) g.push(x);
    else m.set(k, [x]);
  }
  return m;
}

/** Percentage change vs previous period; null when there is nothing to compare. */
export function delta(cur: number | null, prev: number | null): number | null {
  if (cur == null || prev == null || prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}

/* ---------- formatting ---------- */

const NA = "N/A";
export const fmtNum = (n: number | null | undefined) =>
  n == null ? NA : Math.round(n).toLocaleString("en-IN");

export function fmtCompact(n: number | null | undefined) {
  if (n == null) return NA;
  const a = Math.abs(n);
  if (a >= 1e7) return `${(n / 1e7).toFixed(1)}Cr`;
  if (a >= 1e5) return `${(n / 1e5).toFixed(1)}L`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(Math.round(n));
}

export const fmtPct = (n: number | null | undefined, digits = 2) =>
  n == null ? NA : `${n.toFixed(digits)}%`;

export const fmtMoney = (n: number | null | undefined) =>
  n == null ? NA : `₹${Math.round(n).toLocaleString("en-IN")}`;

export function fmtDate(iso: string, opts?: Intl.DateTimeFormatOptions) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
    ...opts,
  });
}

/* ---------- dates & time buckets ---------- */

export const ymd = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
};
export const startOfDay = (d: Date) => new Date(`${ymd(d)}T00:00:00Z`);

export interface Bucket {
  key: string;
  label: string;
  start: Date;
  end: Date; // inclusive end-of-bucket (start of next day - 1ms)
}

/** Daily buckets for short ranges, weekly for medium, monthly for long. */
export function timeBuckets(from: Date, to: Date): Bucket[] {
  const days = Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
  const out: Bucket[] = [];
  if (days <= 45) {
    for (let d = new Date(from); d <= to; d = addDays(d, 1)) {
      out.push({
        key: ymd(d),
        label: d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }),
        start: d,
        end: new Date(addDays(d, 1).getTime() - 1),
      });
    }
  } else if (days <= 150) {
    const dow = (from.getUTCDay() + 6) % 7; // Monday start
    for (let d = addDays(from, -dow); d <= to; d = addDays(d, 7)) {
      out.push({
        key: ymd(d),
        label: d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }),
        start: d,
        end: new Date(addDays(d, 7).getTime() - 1),
      });
    }
  } else {
    for (
      let d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
      d <= to;
      d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
    ) {
      const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
      out.push({
        key: ymd(d),
        label: d.toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" }),
        start: d,
        end: new Date(next.getTime() - 1),
      });
    }
  }
  return out;
}

export function postsInBucket(posts: Post[], b: Bucket) {
  const s = b.start.getTime();
  const e = b.end.getTime();
  return posts.filter((p) => {
    const t = new Date(p.publishedAt).getTime();
    return t >= s && t <= e;
  });
}

/* ---------- followers ---------- */

export interface FollowerIndex {
  /** accountId -> (date -> followers) */
  byAccount: Map<string, Map<string, number>>;
  /** accountId -> its oldest snapshot, used before an account's history begins */
  earliest: Map<string, { date: string; value: number }>;
  firstDate: string;
  lastDate: string;
}

export function indexFollowers(ds: Dataset): FollowerIndex {
  const byAccount = new Map<string, Map<string, number>>();
  const earliest = new Map<string, { date: string; value: number }>();
  let first = "9999";
  let last = "0000";
  for (const f of ds.followers) {
    let m = byAccount.get(f.accountId);
    if (!m) byAccount.set(f.accountId, (m = new Map()));
    m.set(f.date, f.followers);
    const e = earliest.get(f.accountId);
    if (!e || f.date < e.date) earliest.set(f.accountId, { date: f.date, value: f.followers });
    if (f.date < first) first = f.date;
    if (f.date > last) last = f.date;
  }
  return { byAccount, earliest, firstDate: first, lastDate: last };
}

/** Total followers across accounts on (or just before) a date. */
export function followersOn(idx: FollowerIndex, accountIds: string[], date: Date): number {
  let d = ymd(date);
  if (d > idx.lastDate) d = idx.lastDate;
  let total = 0;
  for (const id of accountIds) {
    const m = idx.byAccount.get(id);
    if (!m) continue;
    // before an account's history starts, assume its first known count (no growth is invented)
    const first = idx.earliest.get(id);
    if (first && d < first.date) {
      total += first.value;
      continue;
    }
    let cursor = new Date(`${d}T00:00:00Z`);
    for (let i = 0; i < 800; i++) {
      const v = m.get(ymd(cursor));
      if (v != null) {
        total += v;
        break;
      }
      cursor = addDays(cursor, -1);
    }
  }
  return total;
}
