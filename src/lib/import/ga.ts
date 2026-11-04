import { parseCsv } from "../csv";
import type { WebRow } from "../types";

/** Header spellings accepted for each field (lower-cased). Covers our template and GA4's own export names. */
const ALIASES: Record<string, string[]> = {
  date: ["date"],
  source: ["source", "session source", "first user source"],
  medium: ["medium", "session medium", "first user medium"],
  sourceMedium: ["session source / medium", "source / medium", "session source/medium"],
  campaign: ["campaign", "session campaign", "session campaign name", "utm_campaign"],
  content: ["content", "utm_content", "session manual ad content", "ad content"],
  landing_page: ["landing_page", "landing page", "landing page + query string", "landing page path"],
  sessions: ["sessions"],
  new_users: ["new_users", "new users"],
  engaged_sessions: ["engaged_sessions", "engaged sessions"],
  avg_engagement_seconds: [
    "avg_engagement_seconds",
    "average engagement time per session",
    "average engagement time",
    "average session duration",
  ],
  key_events: ["key_events", "key events", "conversions"],
};

export interface GaParseResult {
  rows: WebRow[];
  skipped: number;
  errors: string[];
  from: string | null;
  to: string | null;
}

const clean = (v: string | undefined) => {
  const s = (v ?? "").trim();
  return s === "(not set)" ? "" : s;
};

function toNumber(v: string | undefined): number | null {
  const s = (v ?? "").trim().replace(/,/g, "");
  if (s === "") return 0;
  if (/^\d+:\d{2}(:\d{2})?$/.test(s)) {
    const p = s.split(":").map(Number);
    return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
  }
  const n = Number(s.replace(/%$/, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function toDate(v: string | undefined): string | null {
  const s = (v ?? "").trim();
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

/** Parses the one GA4 CSV (our template or a GA4 Explore/report export). */
export function parseGaCsv(text: string): GaParseResult {
  const result: GaParseResult = { rows: [], skipped: 0, errors: [], from: null, to: null };
  // GA4 exports start with "# ..." comment lines
  const body = text
    .split(/\r?\n/)
    .filter((l) => !l.startsWith("#"))
    .join("\n");
  const table = parseCsv(body);
  if (table.length < 2) {
    result.errors.push("The file has no data rows.");
    return result;
  }

  const header = table[0].map((h) => h.trim().toLowerCase());
  const col = (key: string) => {
    for (const a of ALIASES[key]) {
      const i = header.indexOf(a);
      if (i >= 0) return i;
    }
    return -1;
  };
  const idx = Object.fromEntries(Object.keys(ALIASES).map((k) => [k, col(k)]));

  const missing: string[] = [];
  if (idx.date < 0) missing.push("date");
  if (idx.sessions < 0) missing.push("sessions");
  if (idx.source < 0 && idx.sourceMedium < 0) missing.push("source (or “Session source / medium”)");
  if (missing.length) {
    result.errors.push(`Missing required column(s): ${missing.join(", ")}.`);
    return result;
  }

  const get = (r: string[], k: string) => (idx[k] >= 0 ? r[idx[k]] : undefined);

  for (let i = 1; i < table.length; i++) {
    const r = table[i];
    const date = toDate(get(r, "date"));
    const sessions = toNumber(get(r, "sessions"));
    let source = (get(r, "source") ?? "").trim();
    let medium = (get(r, "medium") ?? "").trim();
    if (idx.sourceMedium >= 0 && !source) {
      const [s, m] = (r[idx.sourceMedium] ?? "").split(" / ");
      source = (s ?? "").trim();
      medium = (m ?? "").trim();
    }
    if (!date || sessions == null || !source) {
      result.skipped++;
      if (result.errors.length < 5) result.errors.push(`Row ${i + 1}: needs a valid date (YYYY-MM-DD or YYYYMMDD), source and sessions.`);
      continue;
    }
    const engagedSessions = toNumber(get(r, "engaged_sessions"));
    const avgSeconds = toNumber(get(r, "avg_engagement_seconds"));
    const newUsers = toNumber(get(r, "new_users"));
    const keyEvents = toNumber(get(r, "key_events"));
    if ([engagedSessions, avgSeconds, newUsers, keyEvents].some((x) => x == null)) {
      result.skipped++;
      if (result.errors.length < 5) result.errors.push(`Row ${i + 1}: a numeric column has an invalid value.`);
      continue;
    }
    result.rows.push({
      date,
      source: source.toLowerCase(),
      medium: medium.toLowerCase(),
      campaign: clean(get(r, "campaign")),
      content: clean(get(r, "content")),
      landingPage: (get(r, "landing_page") ?? "").trim() || "/",
      sessions,
      newUsers: newUsers ?? 0,
      engagedSessions: engagedSessions ?? 0,
      engagementSeconds: Math.round((avgSeconds ?? 0) * sessions),
      keyEvents: keyEvents ?? 0,
    });
    if (!result.from || date < result.from) result.from = date;
    if (!result.to || date > result.to) result.to = date;
  }
  return result;
}
