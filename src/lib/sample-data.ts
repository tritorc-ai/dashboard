import type {
  Account,
  Campaign,
  Dataset,
  Format,
  FollowerPoint,
  Objective,
  Platform,
  Post,
  Target,
  WebRow,
} from "./types";

/**
 * Illustrative sample data so the dashboard works before real accounts are
 * connected. Everything here is generated — none of it is Tritorc's results.
 * Replace this adapter with the database/API adapter in `lib/data.ts`.
 */

export const PRODUCTS = [
  "General",
  "Hydraulic Torque Wrenches",
  "Bolt Tensioners",
  "Hot Tapping",
  "On-site Machining",
  "Tube Expanders",
  "Pneumatic Tools",
];
export const CATEGORIES = [
  "Educational",
  "Product",
  "Services",
  "Case study",
  "Event",
  "Corporate",
];
export const OBJECTIVES: Objective[] = [
  "Awareness",
  "Engagement",
  "Traffic",
  "Lead generation",
];

const ACCOUNTS: Account[] = [
  { id: "li-main", platform: "LinkedIn", name: "Tritorc (Main)", url: "https://www.linkedin.com/company/tritorc/" },
  { id: "li-peru", platform: "LinkedIn", name: "Tritorc Perú", url: "https://www.linkedin.com/company/tritorc-per%C3%BA/" },
  { id: "li-africa", platform: "LinkedIn", name: "Tritorc Africa Pipeline Solutions", url: "https://www.linkedin.com/company/tritorc-africa/" },
  { id: "li-action", platform: "LinkedIn", name: "Tritorc in Action", url: "https://www.linkedin.com/showcase/tritorc-in-action/" },
  { id: "li-inc", platform: "LinkedIn", name: "Tritorc INC", url: "https://www.linkedin.com/showcase/tritorc-inc/" },
  { id: "li-precomtec", platform: "LinkedIn", name: "Precomtec", url: "https://www.linkedin.com/company/precomtec-asia-pte-ltd/" },
  { id: "li-ozat", platform: "LinkedIn", name: "Ozat", url: "https://www.linkedin.com/company/ozat-2000-ug/" },
  { id: "ig-group", platform: "Instagram", name: "Tritorc Group", url: "https://www.instagram.com/tritorcgroup/" },
  { id: "fb-equip", platform: "Facebook", name: "Tritorc Equipments Pvt Ltd", url: "https://www.facebook.com/tritorcequipment/" },
  { id: "fb-group", platform: "Facebook", name: "Tritorc Group", url: "https://www.facebook.com/profile.php?id=61580668880212" },
  { id: "yt-main", platform: "YouTube", name: "Tritorc", url: "https://www.youtube.com/@TritorcEquipments" },
];

/** Illustrative size and posting frequency per account (sample data only). */
const ACCOUNT_CFG: Record<string, { followers: number; prob: number; reach: number }> = {
  "li-main": { followers: 17800, prob: 0.6, reach: 1 },
  "li-peru": { followers: 1400, prob: 0.18, reach: 0.8 },
  "li-africa": { followers: 1100, prob: 0.16, reach: 0.8 },
  "li-action": { followers: 2900, prob: 0.26, reach: 0.8 },
  "li-inc": { followers: 900, prob: 0.14, reach: 0.8 },
  "li-precomtec": { followers: 2300, prob: 0.18, reach: 0.9 },
  "li-ozat": { followers: 1200, prob: 0.12, reach: 0.8 },
  "ig-group": { followers: 4900, prob: 0.4, reach: 1 },
  "fb-equip": { followers: 3900, prob: 0.34, reach: 1 },
  "fb-group": { followers: 300, prob: 0.1, reach: 1 },
  "yt-main": { followers: 6200, prob: 0.08, reach: 1 },
};

const CAMPAIGNS: Campaign[] = [
  { id: "c-torque", name: "Torque Wrench Range 2026", product: "Hydraulic Torque Wrenches" },
  { id: "c-bolt", name: "Bolt Tensioning Safety Month", product: "Bolt Tensioners" },
  { id: "c-hot", name: "Hot Tapping Case Studies", product: "Hot Tapping" },
  { id: "c-expo", name: "Industry Expo Season", product: "On-site Machining" },
];

const CAPTIONS: Record<string, string[]> = {
  Educational: [
    "Why torque accuracy matters in flange bolting",
    "3 common mistakes in bolt tensioning — and how to avoid them",
    "How a hydraulic torque wrench works, in 60 seconds",
    "Checklist: preparing a joint for a shutdown job",
  ],
  Product: [
    "Meet the new low-profile hydraulic torque wrench",
    "Built for tight spaces: compact tube expander range",
    "Now shipping: next-generation pneumatic torque tools",
    "Calibrated, certified, ready: our wrench lineup",
  ],
  Services: [
    "On-site machining crews, deployed in 24 hours",
    "Hot tapping without shutdown — how it works",
    "Our field team at a refinery turnaround",
    "Bolting services for wind and power projects",
  ],
  "Case study": [
    "Case study: cutting turnaround time by 30% at a refinery",
    "How we restored a heat exchanger on site",
    "Case study: hot tapping a live pipeline safely",
    "Client story: bolt tensioning for a wind farm",
  ],
  Event: [
    "Visit us at the upcoming industrial expo — Hall 4",
    "Recap: live demo day with our engineering team",
    "We're hiring for field engineers — join the team",
    "Webinar invite: safe bolting practices",
  ],
  Corporate: [
    "Celebrating safety milestones across our crews",
    "Meet the team behind the tools",
    "TRITORC at 20+ years of precision engineering",
    "Thank you to our customers and partners",
  ],
};

const HASHTAGS = [
  "#torque",
  "#boltedjoints",
  "#industrialsafety",
  "#hottapping",
  "#maintenance",
  "#oilandgas",
  "#engineering",
  "#tritorc",
  "#turnaround",
  "#manufacturing",
  "#windenergy",
  "#powerplant",
];

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

const FORMATS: Record<Platform, Format[]> = {
  LinkedIn: ["Image", "Carousel", "Document", "Video", "Poll", "Text"],
  Instagram: ["Image", "Carousel", "Reel"],
  Facebook: ["Image", "Video", "Reel", "Text"],
  YouTube: ["Video", "Short"],
};

const FORMAT_REACH: Record<Format, number> = {
  Image: 1,
  Carousel: 1.3,
  Document: 1.2,
  Video: 1.45,
  Reel: 2.2,
  Poll: 1.1,
  Text: 0.8,
  Short: 1.8,
  Post: 1,
};

const CATEGORY_ER: Record<string, number> = {
  Educational: 1.45,
  Product: 0.9,
  Services: 0.95,
  "Case study": 1.3,
  Event: 1.0,
  Corporate: 0.7,
};
const CATEGORY_CLICK: Record<string, number> = {
  Educational: 0.8,
  Product: 1.6,
  Services: 1.2,
  "Case study": 1.4,
  Event: 0.5,
  Corporate: 0.3,
};

const BASE_ER: Record<Platform, number> = {
  LinkedIn: 0.036,
  Instagram: 0.052,
  Facebook: 0.021,
  YouTube: 0.045,
};

export function buildSampleDataset(now: Date = new Date()): Dataset {
  const rand = mulberry32(20260);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(rand() * a.length)];
  const today = new Date(`${ymd(now)}T00:00:00Z`);
  const DAYS = 400;

  const posts: Post[] = [];
  const followers: FollowerPoint[] = [];
  let n = 0;

  ACCOUNTS.forEach((acc) => {
    const cfg = ACCOUNT_CFG[acc.id];
    const base = cfg.followers;
    // followers grow slowly with noise
    let f = base;
    for (let d = DAYS; d >= 0; d--) {
      const day = new Date(today);
      day.setUTCDate(day.getUTCDate() - d);
      f += Math.round(base * (0.0004 + rand() * 0.0006) - (rand() < 0.08 ? base * 0.0005 : 0));
      followers.push({ accountId: acc.id, date: ymd(day), followers: f });
    }

    const postProb = cfg.prob;
    for (let d = DAYS; d >= 1; d--) {
      const day = new Date(today);
      day.setUTCDate(day.getUTCDate() - d);
      const dow = day.getUTCDay();
      const weekend = dow === 0 || dow === 6;
      if (rand() > postProb * (weekend ? 0.25 : 1)) continue;

      const category = pick(CATEGORIES);
      const format = pick(FORMATS[acc.platform]);
      const product = pick(PRODUCTS);
      const campaign = rand() < 0.4 ? CAMPAIGNS.find((c) => c.product === product) ?? null : null;
      const paid = rand() < 0.07;
      const hour = 8 + Math.floor(rand() * 11);
      const minute = Math.floor(rand() * 60);
      const published = new Date(day);
      published.setUTCHours(hour, minute, 0, 0);

      const followersNow = base * (1 + (DAYS - d) * 0.0004 * 1.2);
      const reachRaw =
        followersNow *
        (0.05 + rand() * 0.08) *
        FORMAT_REACH[format] *
        (paid ? 2.6 : 1) *
        cfg.reach;
      const reach = Math.round(reachRaw);
      const er =
        BASE_ER[acc.platform] * CATEGORY_ER[category] * (0.55 + rand() * 0.95) * (hour >= 9 && hour <= 11 ? 1.12 : 1);
      const engagements = reach * er;

      const clicks =
        acc.platform === "Instagram"
          ? null
          : Math.round(reach * 0.011 * CATEGORY_CLICK[category] * (format === "Reel" ? 0.35 : 1) * (0.5 + rand()));
      const sessions = clicks == null ? null : Math.round(clicks * (0.55 + rand() * 0.15));
      const enquiries = sessions == null ? null : Math.round(sessions * 0.08 * rand() * 2);
      const leads = enquiries == null ? null : Math.round(enquiries * (0.3 + rand() * 0.25));
      const isVideo = format === "Video" || format === "Reel";

      const caption = pick(CAPTIONS[category]);
      const tags = Array.from(new Set([pick(HASHTAGS), pick(HASHTAGS), "#tritorc"]));

      posts.push({
        id: `p${++n}`,
        platform: acc.platform,
        accountId: acc.id,
        url: "#",
        publishedAt: published.toISOString(),
        caption,
        format,
        hashtags: tags,
        product,
        category,
        objective: pick(OBJECTIVES),
        campaignId: campaign?.id ?? null,
        paid,
        spend: paid ? Math.round(2000 + rand() * 7000) : 0,
        impressions: Math.round(reach * (1.1 + rand() * 0.45)),
        reach,
        likes: Math.round(engagements * 0.72),
        comments: Math.round(engagements * 0.08),
        shares: Math.round(engagements * 0.09),
        saves: acc.platform === "Instagram" ? Math.round(engagements * 0.11) : null,
        clicks,
        videoViews: isVideo ? Math.round(reach * (0.35 + rand() * 0.4)) : null,
        sessions,
        enquiries,
        leads,
        notes: "",
      });
    }
  });

  const targets: Target[] = [
    { id: "t-posts", label: "Posts published", metric: "posts", monthly: 40 },
    { id: "t-eng", label: "Engagements", metric: "engagements", monthly: 1800 },
    { id: "t-fol", label: "Net new followers", metric: "newFollowers", monthly: 500 },
    { id: "t-leads", label: "Qualified leads", metric: "leads", monthly: 8 },
  ];

  const web = buildWeb(posts, rand, today, DAYS);

  return {
    accounts: ACCOUNTS,
    posts: posts.sort((a, b) => a.publishedAt.localeCompare(b.publishedAt)),
    followers,
    campaigns: CAMPAIGNS,
    targets,
    web,
    audience: [],
    updatedAt: now.toISOString(),
    source: "sample",
  };
}

const LANDING = [
  "/",
  "/products/hydraulic-torque-wrenches",
  "/products/bolt-tensioners",
  "/products/tube-expanders",
  "/services/hot-tapping",
  "/services/on-site-machining",
  "/contact",
  "/about",
];

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

/**
 * Sample GA4 traffic in the same shape as the real CSV: social rows come from the
 * posts (utm_content = post ID) and everything else is background website traffic.
 */
function buildWeb(posts: Post[], rand: () => number, today: Date, days: number): WebRow[] {
  const rows: WebRow[] = [];
  const pickOf = <T,>(a: readonly T[]) => a[Math.floor(rand() * a.length)];
  const mk = (
    date: string,
    source: string,
    medium: string,
    campaign: string,
    content: string,
    landingPage: string,
    sessions: number,
    rate: number,
    keyRate: number,
  ): WebRow => {
    const engaged = Math.round(sessions * rate);
    return {
      date,
      source,
      medium,
      campaign,
      content,
      landingPage,
      sessions,
      newUsers: Math.round(sessions * (0.55 + rand() * 0.25)),
      engagedSessions: engaged,
      engagementSeconds: Math.round(sessions * (30 + rand() * 60)),
      keyEvents: Math.round(sessions * keyRate * (0.5 + rand())),
    };
  };

  // background traffic, one row per channel per day
  const channels: { source: string; medium: string; campaign: string; base: number; rate: number; key: number }[] = [
    { source: "google", medium: "organic", campaign: "", base: 85, rate: 0.62, key: 0.025 },
    { source: "google", medium: "cpc", campaign: "brand_search", base: 24, rate: 0.55, key: 0.06 },
    { source: "(direct)", medium: "(none)", campaign: "", base: 52, rate: 0.5, key: 0.015 },
    { source: "bing", medium: "organic", campaign: "", base: 7, rate: 0.58, key: 0.02 },
    { source: "indiamart.com", medium: "referral", campaign: "", base: 14, rate: 0.6, key: 0.04 },
    { source: "newsletter", medium: "email", campaign: "monthly_update", base: 6, rate: 0.7, key: 0.05 },
  ];
  for (let d = days; d >= 1; d--) {
    const day = new Date(today);
    day.setUTCDate(day.getUTCDate() - d);
    const date = day.toISOString().slice(0, 10);
    const weekend = day.getUTCDay() === 0 || day.getUTCDay() === 6;
    const growth = 1 + (days - d) * 0.0008;
    for (const c of channels) {
      const sessions = Math.round(c.base * growth * (weekend ? 0.55 : 1) * (0.7 + rand() * 0.6));
      if (sessions > 0) rows.push(mk(date, c.source, c.medium, c.campaign, "", pickOf(LANDING), sessions, c.rate, c.key));
    }
  }

  // social traffic from posts (what the UTM links would report)
  for (const p of posts) {
    if (!p.sessions) continue;
    const campaign = p.campaignId ? slugify(CAMPAIGNS.find((c) => c.id === p.campaignId)?.name ?? "") : "";
    const medium = p.paid ? "paid_social" : "organic_social";
    const source = p.platform.toLowerCase();
    const page = pickOf(LANDING.slice(1));
    const day0 = new Date(p.publishedAt);
    let left = p.sessions;
    [0.6, 0.3, 0.1].forEach((share, i) => {
      const s = i === 2 ? left : Math.round(p.sessions! * share);
      left -= s;
      if (s <= 0) return;
      const dt = new Date(day0);
      dt.setUTCDate(dt.getUTCDate() + i);
      rows.push(mk(dt.toISOString().slice(0, 10), source, medium, campaign, p.id, page, s, 0.66, 0.035));
    });
  }
  return rows;
}
