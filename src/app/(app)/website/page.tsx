"use client";

import { useMemo, useRef, useState } from "react";
import { Download, FileUp, Trash2 } from "lucide-react";
import { Badge, BarList, Button, Card, CardHeader, Delta, Empty, PageHeader, PlatformTag, Segmented } from "@/components/ui";
import { TrendChart } from "@/components/charts";
import { PageLoading } from "@/components/loading";
import { usePostDrawer } from "@/components/post-drawer";
import { useData } from "@/components/data-provider";
import { useDashboard } from "@/lib/use-dashboard";
import { downloadCsv, toCsv } from "@/lib/csv";
import { parseGaCsv, type GaParseResult } from "@/lib/import/ga";
import { delta, fmtCompact, fmtDate, fmtNum, fmtPct, groupBy, sum, timeBuckets, ymd } from "@/lib/metrics";
import { CHANNELS, classifyChannel, GA_COLUMNS, GA_TEMPLATE_ROWS, isSocial, socialPlatform } from "@/lib/web";
import { PLATFORM_COLOR } from "@/lib/filters";
import type { WebRow } from "@/lib/types";

const sessionsOf = (r: WebRow[]) => sum(r, (x) => x.sessions);
const rate = (r: WebRow[]) => (sessionsOf(r) ? (sum(r, (x) => x.engagedSessions) / sessionsOf(r)) * 100 : null);
const avgSecs = (r: WebRow[]) => (sessionsOf(r) ? sum(r, (x) => x.engagementSeconds) / sessionsOf(r) : null);
const fmtSecs = (n: number | null) => (n == null ? "N/A" : n >= 60 ? `${Math.floor(n / 60)}m ${Math.round(n % 60)}s` : `${Math.round(n)}s`);

function Kpi({ label, value, change, note }: { label: string; value: string; change: number | null; note?: string }) {
  return (
    <Card>
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="tabular text-2xl font-semibold tracking-tight">{value}</span>
        <Delta value={change} />
      </div>
      {note && <div className="mt-1 text-[11px] text-muted">{note}</div>}
    </Card>
  );
}

export default function WebsitePage() {
  const { ds, d, filters } = useDashboard();
  const { importWeb, clearWebImport, webImported, webPersisted } = useData();
  const drawer = usePostDrawer();
  const [pagesScope, setPagesScope] = useState<"all" | "social">("all");
  const [parsed, setParsed] = useState<{ name: string; result: GaParseResult } | null>(null);
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const view = useMemo(() => {
    if (!ds || !d) return null;
    const { from, to, prevFrom, prevTo } = d.range;
    const inRange = (r: WebRow, a: Date, b: Date) => r.date >= ymd(a) && r.date <= ymd(b);
    // the platform filter narrows to that platform's social traffic; other filters don't apply to website data
    const scoped = ds.web.filter((r) => filters.platform === "all" || socialPlatform(r.source) === filters.platform);
    const cur = scoped.filter((r) => inRange(r, from, to));
    const prev = filters.days ? scoped.filter((r) => inRange(r, prevFrom, prevTo)) : [];
    const social = cur.filter(isSocial);
    const prevSocial = prev.filter(isSocial);

    const buckets = timeBuckets(from, to);
    const trend = buckets.map((b) => {
      const a = ymd(b.start);
      const z = ymd(b.end);
      const rows = cur.filter((r) => r.date >= a && r.date <= z);
      return { label: b.label, All: sessionsOf(rows), Social: sessionsOf(rows.filter(isSocial)) };
    });

    const byChannel = CHANNELS.map((c) => {
      const rows = cur.filter((r) => classifyChannel(r) === c);
      return { channel: c, sessions: sessionsOf(rows), rate: rate(rows), keys: sum(rows, (x) => x.keyEvents) };
    }).filter((x) => x.sessions > 0);

    const byPlatform = [...groupBy(social, (r) => socialPlatform(r.source) ?? r.source)].map(([name, rows]) => ({
      name,
      sessions: sessionsOf(rows),
      rate: rate(rows),
      keys: sum(rows, (x) => x.keyEvents),
      convRate: sessionsOf(rows) ? (sum(rows, (x) => x.keyEvents) / sessionsOf(rows)) * 100 : null,
    })).sort((a, b) => b.sessions - a.sessions);

    // post-level traffic: social rows whose utm_content is a known post ID
    const postsById = new Map(ds.posts.map((p) => [p.id, p]));
    const byPost = [...groupBy(social.filter((r) => r.content), (r) => r.content)]
      .map(([id, rows]) => ({ post: postsById.get(id), id, sessions: sessionsOf(rows), keys: sum(rows, (x) => x.keyEvents), rate: rate(rows) }))
      .sort((a, b) => b.sessions - a.sessions);
    const matched = byPost.filter((x) => x.post);
    const taggedSessions = sessionsOf(social.filter((r) => r.content));
    const matchedSessions = sum(matched, (x) => x.sessions);

    const pageRows = pagesScope === "social" ? social : cur;
    const pages = [...groupBy(pageRows, (r) => r.landingPage)]
      .map(([page, rows]) => ({ page, sessions: sessionsOf(rows), rate: rate(rows), keys: sum(rows, (x) => x.keyEvents) }))
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 10);

    const campaigns = [...groupBy(cur.filter((r) => r.campaign), (r) => r.campaign)]
      .map(([c, rows]) => ({ c, sessions: sessionsOf(rows), keys: sum(rows, (x) => x.keyEvents), social: sessionsOf(rows.filter(isSocial)) }))
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 8);

    return { cur, prev, social, prevSocial, trend, byChannel, byPlatform, matched, taggedSessions, matchedSessions, pages, campaigns };
  }, [ds, d, filters.platform, filters.days, pagesScope]);

  if (!ds || !d || !view) return <PageLoading />;

  const { cur, prev, social, prevSocial } = view;
  const total = sessionsOf(cur);
  const dates = ds.web.length ? [ds.web.reduce((m, r) => (r.date < m ? r.date : m), "9999"), ds.web.reduce((m, r) => (r.date > m ? r.date : m), "0000")] : null;

  const onFile = async (f: File | undefined) => {
    setMsg("");
    setParsed(null);
    if (!f) return;
    if (f.size > 25 * 1024 * 1024) return setMsg("File is larger than 25 MB — export a shorter date range.");
    setParsed({ name: f.name, result: parseGaCsv(await f.text()) });
  };

  const confirmImport = () => {
    if (!parsed?.result.rows.length || !parsed.result.from || !parsed.result.to) return;
    importWeb(parsed.result.rows, parsed.result.from, parsed.result.to);
    setMsg(`Imported ${parsed.result.rows.length.toLocaleString("en-IN")} rows (${parsed.result.from} to ${parsed.result.to}).`);
    setParsed(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const sp = parsed?.result;
  const spSocial = sp ? sum(sp.rows.filter(isSocial), (r) => r.sessions) : 0;
  const spTotal = sp ? sum(sp.rows, (r) => r.sessions) : 0;

  return (
    <>
      <PageHeader
        title="Website traffic (Google Analytics)"
        description="Website visits and enquiries, and how much of it comes from your posts. Posts are matched through the utm_content value in their links."
        actions={
          <Button onClick={() => downloadCsv("tritorc-ga4-template.csv", toCsv([...GA_COLUMNS], GA_TEMPLATE_ROWS))}>
            <Download className="size-4" /> CSV template
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted">
        <Badge tone={webImported ? "good" : ds.web.length ? "warn" : "neutral"}>{webImported ? "Imported GA4 data" : ds.web.length ? "Sample data" : "No GA4 data yet"}</Badge>
        {dates && (
          <span>
            Data covers {fmtDate(dates[0])} – {fmtDate(dates[1])}
          </span>
        )}
        {filters.platform !== "all" && <span>· Showing {filters.platform} social traffic only (platform filter)</span>}
      </div>

      {total === 0 ? (
        <Empty>No website traffic in this period. Import a GA4 CSV below, or widen the date range.</Empty>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <Kpi label="Sessions" value={fmtNum(total)} change={delta(total, filters.days ? sessionsOf(prev) : null)} />
            <Kpi label="From social" value={fmtNum(sessionsOf(social))} change={delta(sessionsOf(social), filters.days ? sessionsOf(prevSocial) : null)} note={`${fmtPct(total ? (sessionsOf(social) / total) * 100 : null, 1)} of all sessions`} />
            <Kpi label="New users" value={fmtNum(sum(cur, (r) => r.newUsers))} change={delta(sum(cur, (r) => r.newUsers), filters.days ? sum(prev, (r) => r.newUsers) : null)} />
            <Kpi label="Engagement rate" value={fmtPct(rate(cur), 1)} change={delta(rate(cur), filters.days ? rate(prev) : null)} note="engaged sessions ÷ sessions" />
            <Kpi label="Avg engagement time" value={fmtSecs(avgSecs(cur))} change={delta(avgSecs(cur), filters.days ? avgSecs(prev) : null)} note="per session" />
            <Kpi label="Key events (enquiries)" value={fmtNum(sum(cur, (r) => r.keyEvents))} change={delta(sum(cur, (r) => r.keyEvents), filters.days ? sum(prev, (r) => r.keyEvents) : null)} note={`${fmtNum(sum(social, (r) => r.keyEvents))} from social`} />
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader title="Sessions over time" hint="All traffic vs traffic from social posts" />
              <TrendChart
                data={view.trend}
                series={[
                  { key: "All", label: "All traffic", color: "var(--muted)" },
                  { key: "Social", label: "From social", color: "var(--brand)" },
                ]}
                area
              />
            </Card>
            <Card>
              <CardHeader title="Sessions by channel" />
              <BarList items={view.byChannel.map((c) => ({ label: c.channel, value: c.sessions }))} format={fmtCompact} />
            </Card>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card className="overflow-x-auto">
              <CardHeader title="Traffic by channel" />
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                    <th className="py-1.5 font-medium">Channel</th>
                    <th className="py-1.5 text-right font-medium">Sessions</th>
                    <th className="py-1.5 text-right font-medium">Share</th>
                    <th className="py-1.5 text-right font-medium">Eng. rate</th>
                    <th className="py-1.5 text-right font-medium">Key events</th>
                  </tr>
                </thead>
                <tbody className="tabular">
                  {view.byChannel.map((c) => (
                    <tr key={c.channel} className="border-b border-line last:border-0">
                      <td className="py-2 font-medium">{c.channel}</td>
                      <td className="py-2 text-right">{fmtNum(c.sessions)}</td>
                      <td className="py-2 text-right">{fmtPct(total ? (c.sessions / total) * 100 : null, 1)}</td>
                      <td className="py-2 text-right">{fmtPct(c.rate, 1)}</td>
                      <td className="py-2 text-right">{fmtNum(c.keys)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <Card className="overflow-x-auto">
              <CardHeader title="Social traffic by platform" hint="Sessions that arrived from each platform’s links" />
              {view.byPlatform.length ? (
                <table className="w-full min-w-[420px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                      <th className="py-1.5 font-medium">Platform</th>
                      <th className="py-1.5 text-right font-medium">Sessions</th>
                      <th className="py-1.5 text-right font-medium">Eng. rate</th>
                      <th className="py-1.5 text-right font-medium">Key events</th>
                      <th className="py-1.5 text-right font-medium">Conv. rate</th>
                    </tr>
                  </thead>
                  <tbody className="tabular">
                    {view.byPlatform.map((p) => (
                      <tr key={p.name} className="border-b border-line last:border-0">
                        <td className="py-2">
                          {p.name in PLATFORM_COLOR ? <PlatformTag platform={p.name as keyof typeof PLATFORM_COLOR} /> : p.name}
                        </td>
                        <td className="py-2 text-right">{fmtNum(p.sessions)}</td>
                        <td className="py-2 text-right">{fmtPct(p.rate, 1)}</td>
                        <td className="py-2 text-right">{fmtNum(p.keys)}</td>
                        <td className="py-2 text-right">{fmtPct(p.convRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <Empty>No social traffic in this period.</Empty>
              )}
            </Card>

            <Card className="overflow-x-auto lg:col-span-2">
              <CardHeader
                title="Top posts by website visits"
                hint="Matched from utm_content = post ID"
                action={<Badge tone={view.taggedSessions && view.matchedSessions / view.taggedSessions > 0.8 ? "good" : "warn"}>{sessionsOf(social) ? `${Math.round((view.taggedSessions / sessionsOf(social)) * 100)}% of social visits are post-tagged` : "No social visits"}</Badge>}
              />
              {view.matched.length ? (
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                      <th className="py-1.5 font-medium">Post</th>
                      <th className="py-1.5 font-medium">Platform</th>
                      <th className="py-1.5 text-right font-medium">Sessions</th>
                      <th className="py-1.5 text-right font-medium">Eng. rate</th>
                      <th className="py-1.5 text-right font-medium">Key events</th>
                    </tr>
                  </thead>
                  <tbody className="tabular">
                    {view.matched.slice(0, 10).map((x) => (
                      <tr key={x.id} className="cursor-pointer border-b border-line last:border-0 hover:bg-surface-2" onClick={() => drawer.open(x.id)}>
                        <td className="max-w-[24rem] truncate py-2 font-medium" title={x.post!.caption}>
                          {x.post!.caption}
                        </td>
                        <td className="py-2">
                          <PlatformTag platform={x.post!.platform} />
                        </td>
                        <td className="py-2 text-right">{fmtNum(x.sessions)}</td>
                        <td className="py-2 text-right">{fmtPct(x.rate, 1)}</td>
                        <td className="py-2 text-right">{fmtNum(x.keys)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <Empty>No visits matched to posts yet. Tag post links with the UTM builder (Campaigns page), using the post ID as the content value.</Empty>
              )}
              <p className="mt-2 text-xs text-muted">
                Visits from social links without a post-level tag still count in the totals above, but can’t be tied to a single post.
              </p>
            </Card>

            <Card className="overflow-x-auto">
              <CardHeader
                title="Top landing pages"
                action={
                  <Segmented
                    label="Landing page scope"
                    value={pagesScope}
                    onChange={setPagesScope}
                    options={[
                      { value: "all", label: "All traffic" },
                      { value: "social", label: "Social only" },
                    ]}
                  />
                }
              />
              <table className="w-full min-w-[380px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                    <th className="py-1.5 font-medium">Page</th>
                    <th className="py-1.5 text-right font-medium">Sessions</th>
                    <th className="py-1.5 text-right font-medium">Eng. rate</th>
                    <th className="py-1.5 text-right font-medium">Key events</th>
                  </tr>
                </thead>
                <tbody className="tabular">
                  {view.pages.map((p) => (
                    <tr key={p.page} className="border-b border-line last:border-0">
                      <td className="max-w-[16rem] truncate py-2" title={p.page}>
                        {p.page}
                      </td>
                      <td className="py-2 text-right">{fmtNum(p.sessions)}</td>
                      <td className="py-2 text-right">{fmtPct(p.rate, 1)}</td>
                      <td className="py-2 text-right">{fmtNum(p.keys)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <Card className="overflow-x-auto">
              <CardHeader title="Campaigns (utm_campaign)" hint="All sources" />
              {view.campaigns.length ? (
                <table className="w-full min-w-[380px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                      <th className="py-1.5 font-medium">Campaign</th>
                      <th className="py-1.5 text-right font-medium">Sessions</th>
                      <th className="py-1.5 text-right font-medium">From social</th>
                      <th className="py-1.5 text-right font-medium">Key events</th>
                    </tr>
                  </thead>
                  <tbody className="tabular">
                    {view.campaigns.map((c) => (
                      <tr key={c.c} className="border-b border-line last:border-0">
                        <td className="max-w-[14rem] truncate py-2" title={c.c}>
                          {c.c}
                        </td>
                        <td className="py-2 text-right">{fmtNum(c.sessions)}</td>
                        <td className="py-2 text-right">{fmtNum(c.social)}</td>
                        <td className="py-2 text-right">{fmtNum(c.keys)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <Empty>No tagged campaigns in this period.</Empty>
              )}
            </Card>
          </div>
        </>
      )}

      <Card className="mt-4">
        <CardHeader title="Import GA4 data" hint="One CSV covers everything on this page" />
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm hover:bg-surface-2">
              <FileUp className="size-5 text-muted" />
              <span className="font-medium">Choose the GA4 CSV</span>
              <span className="text-xs text-muted">Our template, or a GA4 export with the same columns</span>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
            {sp && (
              <div className="mt-3 rounded-lg border border-line p-3 text-sm">
                <div className="font-medium">{parsed.name}</div>
                {sp.rows.length ? (
                  <p className="mt-1 text-muted">
                    {sp.rows.length.toLocaleString("en-IN")} rows · {sp.from} to {sp.to} · {fmtNum(spTotal)} sessions, {fmtPct(spTotal ? (spSocial / spTotal) * 100 : null, 1)} from social
                    {sp.skipped > 0 && ` · ${sp.skipped} rows skipped`}
                  </p>
                ) : null}
                {sp.errors.map((e) => (
                  <p key={e} role="alert" className="mt-1 text-bad">
                    {e}
                  </p>
                ))}
                {sp.rows.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Button variant="primary" onClick={confirmImport}>
                      Import {sp.rows.length.toLocaleString("en-IN")} rows
                    </Button>
                    <span className="text-xs text-muted">
                      {webImported ? "Replaces existing rows for these dates; other dates are kept." : ds.web.length ? "Replaces the sample data." : "First import."}
                    </span>
                  </div>
                )}
              </div>
            )}
            {msg && <p className="mt-2 text-sm text-good">{msg}</p>}
            {!webPersisted && <p role="alert" className="mt-2 text-sm text-warn">This file is too large to keep in the browser, so it will be lost on reload. It will be stored properly once the shared database is connected.</p>}
            {webImported && (
              <Button className="mt-3" onClick={() => confirm("Remove the imported GA4 data and go back to sample data?") && clearWebImport()}>
                <Trash2 className="size-4" /> Remove imported data
              </Button>
            )}
          </div>
          <div className="text-sm">
            <h4 className="font-semibold">The single CSV</h4>
            <p className="mt-1 text-muted">
              One row per day × source × medium × campaign × content × landing page. Website totals are all rows; traffic from posts is the rows from social sources, tied to a post by <code className="font-mono text-xs">content</code> = the post’s ID.
            </p>
            <div className="mt-2 overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-xs">
                <tbody>
                  {[
                    ["date", "YYYY-MM-DD (GA4’s YYYYMMDD also works)"],
                    ["source, medium", "e.g. linkedin / organic_social, google / organic"],
                    ["campaign", "utm_campaign, blank if none"],
                    ["content", "utm_content — put the post ID here on social links"],
                    ["landing_page", "page path, e.g. /products/bolt-tensioners"],
                    ["sessions, new_users, engaged_sessions", "counts"],
                    ["avg_engagement_seconds", "average engagement time per session"],
                    ["key_events", "enquiries / form submissions"],
                  ].map(([k, v]) => (
                    <tr key={k} className="border-b border-line last:border-0">
                      <td className="whitespace-nowrap bg-surface-2 px-2 py-1.5 font-mono">{k}</td>
                      <td className="px-2 py-1.5 text-muted">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Card>
    </>
  );
}
