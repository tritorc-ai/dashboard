import crypto from "node:crypto";
import fs from "node:fs";
import { gaBlank } from "../import/ga";
import type { WebRow } from "../types";
import { isSocial } from "../web";

/**
 * Live Google Analytics (GA4) traffic from the Google Analytics Data API.
 * Server-only. Uses a read-only service account (Viewer on the property); the key never reaches the browser.
 *
 * Environment:
 *   GA4_PROPERTY_ID                      e.g. 299470332
 *   GA4_KEY_FILE                         path to the service-account JSON key (local development), or
 *   GA4_CLIENT_EMAIL + GA4_PRIVATE_KEY   the same two fields as environment variables (hosting)
 *
 * Only social traffic is kept (see isSocial). "Enquiries" (the key_events column) are sessions that viewed a
 * thank-you page, so they exist for past days too — GA4's own key events only count from the day they are created.
 */

const TTL_MS = 10 * 60 * 1000;
const DAYS = 90;
const THANK_YOU = "thank-you";
const SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

export interface Ga4Live {
  syncedAt: string;
  rows: WebRow[];
  from: string;
  to: string;
}

export interface Ga4Result {
  configured: boolean;
  data?: Ga4Live;
  error?: string;
}

let cache: { at: number; data: Ga4Live } | null = null;
let tokenCache: { at: number; value: string } | null = null;

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

function credentials(): ServiceAccount | null {
  const file = process.env.GA4_KEY_FILE?.trim();
  if (file) {
    const k = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<ServiceAccount>;
    if (k.client_email && k.private_key) return { client_email: k.client_email, private_key: k.private_key };
    throw new Error("GA4_KEY_FILE is not a service-account key file");
  }
  const email = process.env.GA4_CLIENT_EMAIL?.trim();
  const key = process.env.GA4_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  return email && key ? { client_email: email, private_key: key } : null;
}

const b64 = (v: object) => Buffer.from(JSON.stringify(v)).toString("base64url");

async function accessToken(sa: ServiceAccount): Promise<string> {
  if (tokenCache && Date.now() - tokenCache.at < 50 * 60 * 1000) return tokenCache.value;
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: "RS256", typ: "JWT" });
  const claim = b64({ iss: sa.client_email, scope: SCOPE, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 });
  const sig = crypto.createSign("RSA-SHA256").update(`${head}.${claim}`).sign(sa.private_key, "base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claim}.${sig}` }),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string; error_description?: string };
  if (!body.access_token) throw new Error(`Google sign-in failed: ${body.error_description ?? body.error ?? res.status}`);
  tokenCache = { at: Date.now(), value: body.access_token };
  return body.access_token;
}

interface ReportResponse {
  rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[];
  rowCount?: number;
  error?: { message?: string; status?: string };
}

const DIMENSIONS = ["date", "sessionSource", "sessionMedium", "sessionCampaignName", "sessionManualAdContent", "landingPage"];

/** Runs one report and follows pagination. */
async function report(token: string, property: string, body: object): Promise<NonNullable<ReportResponse["rows"]>> {
  const out: NonNullable<ReportResponse["rows"]> = [];
  const limit = 50000;
  for (let offset = 0; offset < 500000; offset += limit) {
    const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${property}:runReport`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ ...body, limit, offset }),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as ReportResponse;
    if (!res.ok) throw new Error(`GA4 API ${res.status}${json.error?.message ? `: ${json.error.message}` : ""}`);
    out.push(...(json.rows ?? []));
    if (out.length >= (json.rowCount ?? 0)) break;
  }
  return out;
}

const keyOf = (v: string[]) => v.join("\u0001");

export async function fetchGa4(force = false): Promise<Ga4Result> {
  const property = process.env.GA4_PROPERTY_ID?.trim();
  if (!property) return { configured: false };
  if (!force && cache && Date.now() - cache.at < TTL_MS) return { configured: true, data: cache.data };

  try {
    const sa = credentials();
    if (!sa) return { configured: false };
    const token = await accessToken(sa);
    const dateRanges = [{ startDate: `${DAYS}daysAgo`, endDate: "today" }];
    const dimensions = DIMENSIONS.map((name) => ({ name }));

    const [traffic, enquiries] = await Promise.all([
      report(token, property, {
        dateRanges,
        dimensions,
        metrics: ["sessions", "newUsers", "engagedSessions", "userEngagementDuration"].map((name) => ({ name })),
      }),
      // sessions that viewed a thank-you page = enquiries, same dimensions so they join row by row
      report(token, property, {
        dateRanges,
        dimensions,
        metrics: [{ name: "sessions" }],
        dimensionFilter: { filter: { fieldName: "pagePath", stringFilter: { matchType: "CONTAINS", value: THANK_YOU } } },
      }),
    ]);

    const enquiryByKey = new Map<string, number>();
    for (const r of enquiries) enquiryByKey.set(keyOf(r.dimensionValues.map((d) => d.value)), Number(r.metricValues[0].value));

    const rows: WebRow[] = [];
    for (const r of traffic) {
      const d = r.dimensionValues.map((x) => x.value);
      const [date, source, medium, campaign, content, landing] = d;
      const sessions = Number(r.metricValues[0].value);
      const row: WebRow = {
        date: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`,
        source: source.toLowerCase(),
        medium: medium.toLowerCase(),
        campaign: gaBlank(campaign),
        content: gaBlank(content),
        landingPage: !landing || landing === "(not set)" ? "/" : landing,
        sessions,
        newUsers: Number(r.metricValues[1].value),
        engagedSessions: Number(r.metricValues[2].value),
        engagementSeconds: Math.round(Number(r.metricValues[3].value)),
        keyEvents: Math.min(enquiryByKey.get(keyOf(d)) ?? 0, sessions),
      };
      if (isSocial(row)) rows.push(row);
    }
    rows.sort((a, b) => a.date.localeCompare(b.date));

    const data: Ga4Live = {
      syncedAt: new Date().toISOString(),
      rows,
      from: rows[0]?.date ?? "",
      to: rows.at(-1)?.date ?? "",
    };
    cache = { at: Date.now(), data };
    return { configured: true, data };
  } catch (e) {
    // keep serving the last good data if a refresh fails
    const msg = (e as Error).message;
    return { configured: true, data: cache?.data, error: msg };
  }
}
