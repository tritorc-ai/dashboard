import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { parseCsv } from "../csv";
import type {
  Account,
  AudienceRow,
  Campaign,
  Dataset,
  Format,
  FollowerPoint,
  Platform,
  Post,
  Target,
} from "../types";

/**
 * Builds the dashboard dataset from the files in /data (platform exports).
 * Server-only: it reads from disk. When the shared database and the API sync are
 * connected, they will produce the same `Dataset` and this file stops being used.
 */

const DATA_DIR = path.join(process.cwd(), "data");

interface AccountDef {
  platform: Platform;
  name: string;
  url: string;
}

const ACCOUNT_DEFS: Record<string, AccountDef> = {
  "li-main": { platform: "LinkedIn", name: "Tritorc (Main)", url: "https://www.linkedin.com/company/tritorc/" },
  "li-peru": { platform: "LinkedIn", name: "Tritorc Perú", url: "https://www.linkedin.com/company/tritorc-per%C3%BA/" },
  "li-africa": { platform: "LinkedIn", name: "Tritorc Africa Pipeline Solutions", url: "https://www.linkedin.com/company/tritorc-africa/" },
  "li-action": { platform: "LinkedIn", name: "Tritorc in Action", url: "https://www.linkedin.com/showcase/tritorc-in-action/" },
  "li-inc": { platform: "LinkedIn", name: "Tritorc INC", url: "https://www.linkedin.com/showcase/tritorc-inc/" },
  "li-precomtec": { platform: "LinkedIn", name: "Precomtec", url: "https://www.linkedin.com/company/precomtec-asia-pte-ltd/" },
  "li-ozat": { platform: "LinkedIn", name: "Ozat", url: "https://www.linkedin.com/company/ozat-2000-ug/" },
  "ig-group": { platform: "Instagram", name: "Tritorc Group", url: "https://www.instagram.com/tritorcgroup/" },
  "fb-group": { platform: "Facebook", name: "Tritorc Group", url: "https://www.facebook.com/profile.php?id=61580668880212" },
  "yt-main": { platform: "YouTube", name: "Tritorc Equipments", url: "https://www.youtube.com/@TritorcEquipments" },
};

/** File-name prefix of a LinkedIn export -> account */
const LINKEDIN_SLUGS: Record<string, string> = {
  "tritorc-main": "li-main",
  main: "li-main",
  peru: "li-peru",
  africa: "li-africa",
  "in-action": "li-action",
  inc: "li-inc",
  precomtec: "li-precomtec",
  ozat: "li-ozat",
};

/* ---------- small helpers ---------- */

const num = (v: unknown): number | null => {
  if (v === "" || v == null) return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};
const n0 = (v: unknown) => num(v) ?? 0;

/** mm/dd/yyyy[ hh:mm] (Meta reports Pacific time; treated as UTC) -> ISO */
function usDate(s: string): { iso: string; timeKnown: boolean } | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/.exec(String(s).trim());
  if (!m) return null;
  const [, mo, d, y, h, mi] = m;
  const pad = (x: string) => x.padStart(2, "0");
  const timeKnown = h != null;
  return {
    iso: `${y}-${pad(mo)}-${pad(d)}T${pad(h ?? "12")}:${mi ?? "00"}:00.000Z`,
    timeKnown,
  };
}

/** Platform titles use "bold" unicode letters; NFKC turns them into plain text (also better for screen readers). */
export const clean = (s: string) => s.normalize("NFKC").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();

export const hashtags = (text: string) => Array.from(new Set((text.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((t) => t.toLowerCase())));

/** Platform exports use "bold" unicode letters in titles; fold them to plain text for keyword matching. */
const plain = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "");

const ymdOf = (d: Date) => d.toISOString().slice(0, 10);

function listFiles(dir: string, test: (name: string) => boolean): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && test(e.name))
      .map((e) => path.join(dir, e.name));
  } catch {
    return [];
  }
}

/** Reads a CSV that may be UTF-8 or UTF-16 (Meta's audience exports are UTF-16). */
function readCsv(file: string): string[][] {
  const buf = fs.readFileSync(file);
  let text: string;
  if (buf[0] === 0xff && buf[1] === 0xfe) text = buf.toString("utf16le");
  else if (buf[0] === 0xfe && buf[1] === 0xff) text = Buffer.from(buf).swap16().toString("utf16le");
  else text = buf.toString("utf8");
  return parseCsv(text).filter((r) => !(r[0] ?? "").startsWith("sep="));
}

function rowsByHeader(rows: string[][], headerFirstCell: string) {
  const hi = rows.findIndex((r) => (r[0] ?? "").replace(/^﻿/, "") === headerFirstCell);
  if (hi < 0) return { header: [] as string[], body: [] as string[][] };
  return { header: rows[hi], body: rows.slice(hi + 1) };
}

function sheetRows(wb: XLSX.WorkBook, name: string): unknown[][] {
  const ws = wb.Sheets[name];
  return ws ? (XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true }) as unknown[][]) : [];
}

function sheetTable(wb: XLSX.WorkBook, name: string, firstHeaderCell: string) {
  const rows = sheetRows(wb, name);
  const hi = rows.findIndex((r) => String(r[0]) === firstHeaderCell);
  if (hi < 0) return { header: [] as string[], body: [] as unknown[][] };
  return { header: rows[hi].map(String), body: rows.slice(hi + 1).filter((r) => r.some((c) => c !== "")) };
}

/* ---------- auto-tagging (rule based; editable later in the Posts drawer) ---------- */

const PRODUCT_RULES: [RegExp, string][] = [
  [/torque|wrench/i, "Hydraulic Torque Wrenches"],
  [/tension/i, "Bolt Tensioners"],
  [/hot ?tap|line ?stop/i, "Hot Tapping"],
  [/pipe cutting|bevel|machining|milling|flange facing/i, "On-site Machining"],
  [/tube|expander/i, "Tube Expanders"],
  [/pneumatic/i, "Pneumatic Tools"],
];
const CATEGORY_RULES: [RegExp, string][] = [
  [/case study|success story|client story/i, "Case study"],
  [/adipec|expo|exhibition|webinar|booth|stand \d|hall \d|conference|event/i, "Event"],
  [/hiring|career|join (the|our) team|anniversary|celebrat|thank you|diwali|festival|happy |congratulat|award/i, "Corporate"],
  [/introduc|meet the|launch|series|now shipping|new range|unveil/i, "Product"],
  [/how |why |tips|guide|learn|what is|mistakes|checklist|\?/i, "Educational"],
  [/on-?site|service|machining|hot ?tap|bolting/i, "Services"],
];

export function tag(caption: string) {
  const t = plain(caption);
  const product = PRODUCT_RULES.find(([re]) => re.test(t))?.[1] ?? "General";
  const category = CATEGORY_RULES.find(([re]) => re.test(t))?.[1] ?? "Corporate";
  const campaignId = /adipec/i.test(t) ? "c-adipec" : null;
  return { product, category, campaignId };
}

export const BASE_POST = {
  objective: "Awareness" as const,
  paid: false,
  spend: 0,
  sessions: null,
  enquiries: null,
  leads: null,
  notes: "",
};

/* ---------- LinkedIn (.xls) ---------- */

function loadLinkedIn(file: string, accountId: string): Post[] {
  const wb = XLSX.read(fs.readFileSync(file));
  const { header, body } = sheetTable(wb, "All posts", "Post title");
  const col = (n: string) => header.indexOf(n);
  const c = {
    title: col("Post title"),
    link: col("Post link"),
    created: col("Created date"),
    impressions: col("Impressions"),
    views: col("Views"),
    clicks: col("Clicks"),
    likes: col("Likes"),
    comments: col("Comments"),
    reposts: col("Reposts"),
    type: col("Post type"),
  };
  const posts: Post[] = [];
  body.forEach((r, i) => {
    const d = usDate(String(r[c.created]));
    if (!d) return;
    const title = String(r[c.title] ?? "");
    const link = String(r[c.link] ?? "");
    const digits = /(\d{12,})/.exec(link)?.[1];
    const views = num(r[c.views]);
    posts.push({
      ...BASE_POST,
      id: `li-${digits ?? `${accountId}-${i}`}`,
      platform: "LinkedIn",
      accountId,
      url: link || "#",
      publishedAt: d.iso,
      timeKnown: false,
      caption: clean(title).slice(0, 300),
      // the export doesn't say image/document/text; only posts with video views are known to be videos
      format: (views != null ? "Video" : "Post") as Format,
      hashtags: hashtags(clean(title)),
      ...tag(clean(title)),
      paid: /sponsored|paid/i.test(String(r[c.type] ?? "")),
      impressions: num(r[c.impressions]),
      reach: null,
      likes: n0(r[c.likes]),
      comments: n0(r[c.comments]),
      shares: n0(r[c.reposts]),
      saves: null,
      clicks: num(r[c.clicks]),
      videoViews: views,
    });
  });

  return posts;
}

/* ---------- Meta (.csv) ---------- */

function loadInstagram(file: string): Post[] {
  const { header, body } = rowsByHeader(readCsv(file), "Post ID");
  const col = (n: string) => header.indexOf(n);
  const g = (r: string[], n: string) => r[col(n)] ?? "";
  const out: Post[] = [];
  for (const r of body) {
    const d = usDate(g(r, "Publish time"));
    if (!d || !g(r, "Post ID")) continue;
    const type = g(r, "Post type").toLowerCase();
    const format: Format = type.includes("reel") ? "Reel" : type.includes("carousel") ? "Carousel" : "Image";
    const caption = g(r, "Description");
    out.push({
      ...BASE_POST,
      id: `ig-${g(r, "Post ID")}`,
      platform: "Instagram",
      accountId: "ig-group",
      url: g(r, "Permalink") || "#",
      publishedAt: d.iso,
      timeKnown: true,
      caption: clean(caption).slice(0, 300) || "(no caption)",
      format,
      hashtags: hashtags(clean(caption)),
      ...tag(clean(caption)),
      impressions: num(g(r, "Views")),
      reach: num(g(r, "Reach")),
      likes: n0(g(r, "Likes")),
      comments: n0(g(r, "Comments")),
      shares: n0(g(r, "Shares")),
      saves: num(g(r, "Saves")),
      clicks: null,
      videoViews: format === "Reel" ? num(g(r, "Views")) : null,
    });
  }
  return out;
}

function loadFacebook(file: string): Post[] {
  const { header, body } = rowsByHeader(readCsv(file), "Post ID");
  const col = (n: string) => header.indexOf(n);
  const g = (r: string[], n: string) => r[col(n)] ?? "";
  const out: Post[] = [];
  for (const r of body) {
    const d = usDate(g(r, "Publish time"));
    if (!d || !g(r, "Post ID")) continue;
    const type = g(r, "Post type").toLowerCase();
    const format: Format = type.includes("reel") ? "Reel" : type.includes("video") ? "Video" : type.includes("photo") ? "Image" : "Text";
    const caption = g(r, "Title") || g(r, "Description");
    out.push({
      ...BASE_POST,
      id: `fb-${g(r, "Post ID")}`,
      platform: "Facebook",
      accountId: "fb-group",
      url: g(r, "Permalink") || "#",
      publishedAt: d.iso,
      timeKnown: true,
      caption: clean(caption).slice(0, 300) || "(no caption)",
      format,
      hashtags: hashtags(clean(g(r, "Description") + " " + caption)),
      ...tag(clean(caption + " " + g(r, "Description"))),
      impressions: num(g(r, "Views")),
      // Meta retired Facebook reach (Oct 31, 2026); "Viewers" is its replacement
      reach: num(g(r, "Viewers")),
      likes: n0(g(r, "Reactions")),
      comments: n0(g(r, "Comments")),
      shares: n0(g(r, "Shares")),
      saves: null,
      clicks: num(g(r, "Total clicks")),
      videoViews: format === "Video" || format === "Reel" ? num(g(r, "Views")) : null,
    });
  }
  return out;
}

/** Meta audience export: titled sections; age/gender is a table, cities/countries are a row of names over a row of percentages. */
function loadMetaAudience(file: string, accountId: string): AudienceRow[] {
  const rows = readCsv(file);
  const out: AudienceRow[] = [];
  let i = 0;
  while (i < rows.length) {
    const title = (rows[i][0] ?? "").trim();
    const isTitle = rows[i].filter((c) => c !== "").length === 1 && title !== "";
    if (!isTitle) {
      i++;
      continue;
    }
    if (title === "Age & gender") {
      i += 2; // skip header ("", Men, Women)
      while (i < rows.length && (rows[i][0] ?? "") !== "" && rows[i].length >= 3) {
        out.push({ accountId, dimension: title, label: rows[i][0], value: n0(rows[i][1]), secondary: n0(rows[i][2]), unit: "percent" });
        i++;
      }
    } else if (title === "Top towns/cities" || title === "Top countries") {
      const names = rows[i + 1] ?? [];
      const vals = rows[i + 2] ?? [];
      names.forEach((n, k) => n && out.push({ accountId, dimension: title, label: n, value: n0(vals[k]), unit: "percent" }));
      i += 3;
    } else {
      i++;
    }
  }
  return out;
}

/* ---------- YouTube (.csv in a folder per export) ---------- */

/** Videos without a publish date (unlisted/private) are dated by the first day they got views. */
function firstViewDates(chartFile: string): Map<string, string> {
  const first = new Map<string, string>();
  if (!fs.existsSync(chartFile)) return first;
  const lines = fs.readFileSync(chartFile, "utf8").split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const a = line.indexOf(",");
    const b = line.indexOf(",", a + 1);
    const last = line.lastIndexOf(",");
    if (a < 0 || b < 0 || last <= b) continue;
    if (Number(line.slice(last + 1).trim()) > 0) {
      const id = line.slice(a + 1, b).trim();
      if (!first.has(id)) first.set(id, line.slice(0, a)); // rows are in date order
    }
  }
  return first;
}

function loadYouTube(file: string): Post[] {
  const firstSeen = firstViewDates(path.join(path.dirname(file), "Chart data.csv"));
  const { header, body } = rowsByHeader(readCsv(file), "Content");
  const col = (n: string) => header.indexOf(n);
  const g = (r: string[], n: string) => r[col(n)] ?? "";
  const out: Post[] = [];
  for (const r of body) {
    const id = g(r, "Content").trim();
    if (!id || id === "Total") continue;
    const published = g(r, "Video publish time");
    const t = Date.parse(`${published || firstSeen.get(id) || ""} 12:00:00 UTC`);
    if (Number.isNaN(t)) continue;
    const title = g(r, "Video title");
    const dur = n0(g(r, "Duration"));
    out.push({
      ...BASE_POST,
      id: `yt-${id}`,
      platform: "YouTube",
      accountId: "yt-main",
      url: `https://www.youtube.com/watch?v=${id}`,
      publishedAt: new Date(t).toISOString(),
      timeKnown: false,
      caption: clean(title),
      format: dur > 0 && dur <= 60 ? "Short" : "Video",
      hashtags: hashtags(title),
      ...tag(title),
      impressions: num(g(r, "Thumbnail impressions")),
      reach: null,
      // the export has no like/comment/share counts, so these stay 0 and no engagement rate is shown
      likes: 0,
      comments: 0,
      shares: 0,
      saves: null,
      clicks: null,
      videoViews: num(g(r, "Views")),
      watchHours: num(g(r, "Watch time (hours)")),
      subscribersGained: num(g(r, "Subscribers")),
    });
  }
  return out;
}

/* ---------- assemble ---------- */

export function loadFromExports(): Dataset | null {
  if (!fs.existsSync(DATA_DIR)) return null;

  const posts: Post[] = [];
  const audience: AudienceRow[] = [];
  const followers: FollowerPoint[] = [];
  const used = new Set<string>();
  const files: string[] = [];

  const cfgPath = path.join(DATA_DIR, "accounts.json");
  const cfg: Record<string, { followers?: number; asOf?: string }> = fs.existsSync(cfgPath)
    ? JSON.parse(fs.readFileSync(cfgPath, "utf8"))
    : {};

  // LinkedIn
  const liDir = path.join(DATA_DIR, "linkedin-exports");
  for (const f of listFiles(liDir, (n) => /-content_.*\.xls$/i.test(n))) {
    const slug = path.basename(f).split("-content_")[0].toLowerCase();
    const accountId = LINKEDIN_SLUGS[slug];
    if (!accountId) continue;
    used.add(accountId);
    files.push(f);
    posts.push(...loadLinkedIn(f, accountId));

    // audience + follower history come from the matching "followers" file
    const fol = listFiles(liDir, (n) => n.toLowerCase().startsWith(`${slug}-followers_`))[0];
    if (fol) {
      files.push(fol);
      const wb = XLSX.read(fs.readFileSync(fol));
      const dayNew = new Map<string, number>();
      sheetTable(wb, "New followers", "Date").body.forEach((r) => {
        const d = usDate(String(r[0]));
        if (d) dayNew.set(d.iso.slice(0, 10), n0(r[4]));
      });
      for (const dim of ["Location", "Job function", "Seniority", "Industry", "Company size"]) {
        sheetTable(wb, dim, dim)
          .body.map((r) => ({ label: String(r[0]), value: n0(r[1]) }))
          .filter((x) => x.label && x.value > 0)
          .sort((a, b) => b.value - a.value)
          .slice(0, 12)
          .forEach((x) => audience.push({ accountId, dimension: dim, label: x.label, value: x.value, unit: "count" }));
      }
      // history is estimated: today's count minus later daily gains (unfollows aren't in the export)
      const total = cfg[accountId]?.followers;
      const asOf = cfg[accountId]?.asOf ?? ymdOf(new Date());
      if (total != null && dayNew.size) {
        const dates = [...dayNew.keys()].sort();
        let running = total;
        const pts: FollowerPoint[] = [{ accountId, date: asOf, followers: total }];
        for (let k = dates.length - 1; k >= 0; k--) {
          if (dates[k] > asOf) continue;
          pts.push({ accountId, date: dates[k], followers: running });
          running -= dayNew.get(dates[k]) ?? 0;
        }
        followers.push(...pts);
      }
    }
  }

  // Meta
  const metaDir = path.join(DATA_DIR, "meta-exports");
  for (const f of listFiles(metaDir, (n) => /^instagram-.*posts_.*\.csv$/i.test(n))) {
    files.push(f);
    used.add("ig-group");
    posts.push(...loadInstagram(f));
  }
  for (const f of listFiles(metaDir, (n) => /^facebook-.*posts_.*\.csv$/i.test(n))) {
    files.push(f);
    used.add("fb-group");
    posts.push(...loadFacebook(f));
  }
  for (const f of listFiles(metaDir, (n) => /^instagram-audience-demographics.*\.csv$/i.test(n))) {
    files.push(f);
    audience.push(...loadMetaAudience(f, "ig-group"));
  }
  for (const f of listFiles(metaDir, (n) => /^facebook-audience-demographics.*\.csv$/i.test(n))) {
    files.push(f);
    audience.push(...loadMetaAudience(f, "fb-group"));
  }

  // YouTube
  const ytDir = path.join(DATA_DIR, "youtube-exports");
  try {
    for (const d of fs.readdirSync(ytDir, { withFileTypes: true }).filter((e) => e.isDirectory())) {
      const f = path.join(ytDir, d.name, "Table data.csv");
      if (!fs.existsSync(f)) continue;
      files.push(f);
      used.add("yt-main");
      posts.push(...loadYouTube(f));
    }
  } catch {
    /* no youtube exports yet */
  }

  if (!posts.length) return null;

  // single-snapshot follower counts for accounts without a history
  for (const id of used) {
    if (followers.some((p) => p.accountId === id)) continue;
    const c = cfg[id];
    if (c?.followers != null) followers.push({ accountId: id, date: c.asOf ?? ymdOf(new Date()), followers: c.followers });
  }

  const accounts: Account[] = [...used].map((id) => ({ id, platform: ACCOUNT_DEFS[id].platform, name: ACCOUNT_DEFS[id].name, url: ACCOUNT_DEFS[id].url }));
  const campaigns: Campaign[] = posts.some((p) => p.campaignId === "c-adipec")
    ? [{ id: "c-adipec", name: "ADIPEC 2026", product: "General" }]
    : [];
  const targets: Target[] = [
    { id: "t-posts", label: "Posts published", metric: "posts", monthly: 20 },
    { id: "t-eng", label: "Engagements", metric: "engagements", monthly: 1500 },
    { id: "t-fol", label: "Net new followers", metric: "newFollowers", monthly: 250 },
    { id: "t-leads", label: "Qualified leads", metric: "leads", monthly: 5 },
  ];

  // the date span each account's reports cover (used to avoid meaningless period comparisons)
  const REPORT_START: Record<string, string> = { "li-main": "2025-11-03", "ig-group": "2026-01-01", "fb-group": "2026-01-01" };
  const coverage: Record<string, { from: string; to: string }> = {};
  for (const id of used) {
    const own = posts
      .filter((p) => p.accountId === id)
      .map((p) => p.publishedAt.slice(0, 10))
      .sort();
    coverage[id] = { from: REPORT_START[id] ?? own[0] ?? "1970-01-01", to: own.at(-1) ?? "" };
  }

  const mtime = Math.max(...files.map((f) => fs.statSync(f).mtimeMs), fs.statSync(cfgPath).mtimeMs);
  return {
    accounts,
    posts: posts.sort((a, b) => a.publishedAt.localeCompare(b.publishedAt)),
    followers,
    campaigns,
    targets,
    web: [],
    audience,
    coverage,
    updatedAt: new Date(mtime).toISOString(),
    source: "exports",
  };
}
