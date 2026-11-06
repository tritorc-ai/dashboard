export type Platform = "LinkedIn" | "Instagram" | "Facebook" | "YouTube";
export const PLATFORMS: Platform[] = ["LinkedIn", "Instagram", "Facebook", "YouTube"];

export type Format =
  | "Image"
  | "Carousel"
  | "Document"
  | "Video"
  | "Reel"
  | "Poll"
  | "Text"
  | "Short"
  | "Post";

export type Objective = "Awareness" | "Engagement" | "Traffic" | "Lead generation";

export interface Account {
  id: string;
  platform: Platform;
  name: string;
  /** Public page / channel link */
  url?: string;
}

export interface Post {
  id: string;
  platform: Platform;
  accountId: string;
  url: string;
  /** ISO timestamp (UTC) */
  publishedAt: string;
  caption: string;
  format: Format;
  hashtags: string[];
  // tags (editable by marketing)
  product: string;
  category: string;
  objective: Objective;
  campaignId: string | null;
  paid: boolean;
  spend: number;
  // platform metrics — null means the platform doesn't expose it (shown as N/A)
  impressions: number | null;
  reach: number | null;
  likes: number;
  comments: number;
  shares: number;
  saves: number | null;
  clicks: number | null;
  videoViews: number | null;
  // outcomes
  sessions: number | null;
  enquiries: number | null;
  leads: number | null;
  notes: string;
  /** false when the platform only reports a date (no time of day) */
  timeKnown?: boolean;
  /** true when likes/comments are real (live API) rather than defaulted to 0 */
  engagementKnown?: boolean;
  /** YouTube only */
  watchHours?: number | null;
  subscribersGained?: number | null;
}

export interface FollowerPoint {
  accountId: string;
  /** YYYY-MM-DD */
  date: string;
  followers: number;
}

export interface Campaign {
  id: string;
  name: string;
  product: string;
}

export interface Target {
  id: string;
  label: string;
  metric: "posts" | "engagements" | "newFollowers" | "leads";
  monthly: number;
}

export interface PlannedPost {
  id: string;
  date: string; // YYYY-MM-DD
  platform: Platform;
  title: string;
}

/**
 * One row of Google Analytics (GA4) traffic: a day × source × medium × campaign ×
 * content × landing page combination. This single shape serves both the overall
 * website numbers (all rows) and traffic from posts (social rows whose `content`
 * is the post's ID, set through the UTM link).
 */
export interface WebRow {
  /** YYYY-MM-DD */
  date: string;
  source: string;
  medium: string;
  /** utm_campaign ("" when not set) */
  campaign: string;
  /** utm_content — the post ID when the link was tagged ("" when not set) */
  content: string;
  landingPage: string;
  sessions: number;
  newUsers: number;
  engagedSessions: number;
  /** Sum of engagement time across the row's sessions, in seconds */
  engagementSeconds: number;
  /** GA4 key events (e.g. enquiry form submissions) */
  keyEvents: number;
}

/** One bar in an audience breakdown (e.g. followers by country). */
export interface AudienceRow {
  accountId: string;
  /** e.g. "Location", "Job function", "Age & gender", "Top countries" */
  dimension: string;
  label: string;
  value: number;
  /** second series, e.g. women in an age & gender row */
  secondary?: number;
  unit: "count" | "percent";
}

export interface Dataset {
  accounts: Account[];
  posts: Post[];
  followers: FollowerPoint[];
  campaigns: Campaign[];
  targets: Target[];
  web: WebRow[];
  audience: AudienceRow[];
  /** First/last day each account's reports cover (absent for sample data) */
  coverage?: Record<string, { from: string; to: string }>;
  /** Status of live API connections, by source */
  live?: Record<string, { syncedAt?: string; error?: string; note?: string; items?: number; warnings?: string[] }>;
  /** Last time the dataset was refreshed from its source */
  updatedAt: string;
  source: "sample" | "exports" | "database";
}

export type PostEdit = Partial<
  Pick<
    Post,
    | "product"
    | "category"
    | "objective"
    | "campaignId"
    | "enquiries"
    | "leads"
    | "notes"
    | "sessions"
  >
>;
