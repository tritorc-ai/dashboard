"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Plus } from "lucide-react";
import { BarList, Button, Card, CardHeader, Empty, PageHeader, Segmented, Select } from "@/components/ui";
import { PageLoading } from "@/components/loading";
import { useData } from "@/components/data-provider";
import { useDashboard } from "@/lib/use-dashboard";
import { PRODUCTS } from "@/lib/sample-data";
import { engagements, fmtMoney, fmtNum, fmtPct, groupBy, sum, sumOrNull, ymd } from "@/lib/metrics";
import type { Dataset, Post } from "@/lib/types";

type Metric = "engagements" | "leads" | "clicks";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

/** Meta ads (Marketing API): spend, clicks, leads and cost per lead for the selected period. */
function MetaAdsCard({ ds, from, to }: { ds: Dataset; from: string; to: string }) {
  const money = (n: number | null) => {
    if (n == null) return "—";
    const cur = ds.adsCurrency ?? "INR";
    try {
      return new Intl.NumberFormat("en-IN", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(n);
    } catch {
      return `${cur} ${Math.round(n).toLocaleString("en-IN")}`;
    }
  };

  const rows = (ds.ads ?? []).filter((r) => r.date >= from && r.date <= to);
  const status = ds.live?.metaAds;

  const byCampaign = new Map<string, { name: string; spend: number; impressions: number; linkClicks: number; leads: number; days: Set<string> }>();
  for (const r of rows) {
    const c = byCampaign.get(r.campaignId) ?? { name: r.campaignName, spend: 0, impressions: 0, linkClicks: 0, leads: 0, days: new Set<string>() };
    c.spend += r.spend;
    c.impressions += r.impressions;
    c.linkClicks += r.linkClicks;
    c.leads += r.leads;
    if (r.spend > 0) c.days.add(r.date);
    byCampaign.set(r.campaignId, c);
  }
  const list = [...byCampaign.values()].sort((a, b) => b.spend - a.spend);
  const total = list.reduce(
    (t, c) => ({ spend: t.spend + c.spend, impressions: t.impressions + c.impressions, linkClicks: t.linkClicks + c.linkClicks, leads: t.leads + c.leads }),
    { spend: 0, impressions: 0, linkClicks: 0, leads: 0 },
  );
  const ctr = (c: { impressions: number; linkClicks: number }) => (c.impressions ? (c.linkClicks / c.impressions) * 100 : null);
  const cpl = (c: { spend: number; leads: number }) => (c.leads ? c.spend / c.leads : null);
  const cpc = (c: { spend: number; linkClicks: number }) => (c.linkClicks ? c.spend / c.linkClicks : null);

  const kpis = [
    { label: "Ad spend", value: money(total.spend) },
    { label: "Impressions", value: fmtNum(total.impressions) },
    { label: "Link clicks", value: fmtNum(total.linkClicks) },
    { label: "CTR", value: fmtPct(ctr(total)) },
    { label: "Leads", value: fmtNum(total.leads) },
    { label: "Cost per lead", value: money(cpl(total)) },
  ];

  return (
    <Card className="mb-4 overflow-x-auto">
      <CardHeader title="Meta ads" hint="Facebook + Instagram ads, live from Meta, for the selected period" />
      {!ds.ads ? (
        <Empty>
          {status?.error ? (
            <>Meta Ads could not load: {status.error}</>
          ) : (
            <>Meta Ads is not connected yet. Add META_AD_ACCOUNT_ID and an ads_read token in .env.local (see Settings).</>
          )}
        </Empty>
      ) : (
        <>
          {status?.error && <p className="mb-3 rounded-lg bg-warn/15 px-3 py-2 text-xs text-warn">Showing the last good data. Latest refresh failed: {status.error}</p>}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {kpis.map((k) => (
              <div key={k.label} className="rounded-lg bg-surface-2 p-3">
                <div className="text-xs text-muted">{k.label}</div>
                <div className="tabular mt-1 text-lg font-semibold">{k.value}</div>
              </div>
            ))}
          </div>
          {list.length ? (
            <table className="mt-4 w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3 font-medium">Ad campaign</th>
                  <th className="py-2 pr-3 text-right font-medium">Spend</th>
                  <th className="py-2 pr-3 text-right font-medium">Impressions</th>
                  <th className="py-2 pr-3 text-right font-medium">Link clicks</th>
                  <th className="py-2 pr-3 text-right font-medium">CTR</th>
                  <th className="py-2 pr-3 text-right font-medium">Cost / click</th>
                  <th className="py-2 pr-3 text-right font-medium">Leads</th>
                  <th className="py-2 text-right font-medium">Cost / lead</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {list.map((c) => (
                  <tr key={c.name} className="border-b border-line last:border-0 hover:bg-surface-2">
                    <td className="py-2.5 pr-3 font-medium">{c.name}</td>
                    <td className="py-2.5 pr-3 text-right">{money(c.spend)}</td>
                    <td className="py-2.5 pr-3 text-right">{fmtNum(c.impressions)}</td>
                    <td className="py-2.5 pr-3 text-right">{fmtNum(c.linkClicks)}</td>
                    <td className="py-2.5 pr-3 text-right">{fmtPct(ctr(c))}</td>
                    <td className="py-2.5 pr-3 text-right">{money(cpc(c))}</td>
                    <td className="py-2.5 pr-3 text-right">{fmtNum(c.leads)}</td>
                    <td className="py-2.5 text-right">{money(cpl(c))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-3 text-sm text-muted">No ad spend in this period.</p>
          )}
          <p className="mt-2 text-xs text-muted">Reach is left out on purpose: it is counted per day and cannot be added across days or campaigns. Leads are Meta-reported (lead forms), separate from website enquiries in Google Analytics.</p>
        </>
      )}
    </Card>
  );
}

export default function CampaignsPage() {
  const { ds, d } = useDashboard();
  const { addCampaign } = useData();
  const [metric, setMetric] = useState<Metric>("engagements");
  const [selected, setSelected] = useState("__all");
  const [name, setName] = useState("");
  const [product, setProduct] = useState(PRODUCTS[0]);

  const rows = useMemo(() => {
    if (!ds || !d) return [];
    const g = groupBy(d.inPeriod, (p) => p.campaignId ?? "__none");
    return [...g].map(([id, ps]) => {
      const c = ds.campaigns.find((x) => x.id === id);
      const spend = sum(ps, (p) => p.spend);
      const leads = sumOrNull(ps, (p) => p.leads);
      return {
        id,
        name: c?.name ?? "No campaign",
        product: c?.product ?? "—",
        posts: ps,
        impressions: sumOrNull(ps, (p) => p.impressions),
        engagements: sum(ps, engagements),
        clicks: sumOrNull(ps, (p) => p.clicks),
        sessions: sumOrNull(ps, (p) => p.sessions),
        enquiries: sumOrNull(ps, (p) => p.enquiries),
        leads,
        spend,
        cpl: spend && leads ? spend / leads : null,
      };
    });
  }, [ds, d]);

  // UTM builder state
  const [url, setUrl] = useState("https://www.tritorc.com/");
  const [source, setSource] = useState("linkedin");
  const [utmCampaign, setUtmCampaign] = useState("");
  const [content, setContent] = useState("");
  const [copied, setCopied] = useState(false);

  if (!ds || !d) return <PageLoading />;

  const funnelPosts: Post[] = selected === "__all" ? d.inPeriod : d.inPeriod.filter((p) => (selected === "__none" ? !p.campaignId : p.campaignId === selected));
  const stages = [
    { label: "Impressions", value: sumOrNull(funnelPosts, (p) => p.impressions) },
    { label: "Clicks", value: sumOrNull(funnelPosts, (p) => p.clicks) },
    { label: "Website sessions", value: sumOrNull(funnelPosts, (p) => p.sessions) },
    { label: "Enquiries", value: sumOrNull(funnelPosts, (p) => p.enquiries) },
    { label: "Qualified leads", value: sumOrNull(funnelPosts, (p) => p.leads) },
  ];
  const top = stages[0].value ?? 0;

  const compare = rows
    .filter((r) => r.id !== "__none")
    .map((r) => ({ label: r.name, value: metric === "engagements" ? r.engagements : (r[metric] as number | null) }));

  let tagged = "Enter a page URL";
  try {
    const u = new URL(url);
    u.searchParams.set("utm_source", source);
    u.searchParams.set("utm_medium", "organic_social");
    if (utmCampaign) u.searchParams.set("utm_campaign", utmCampaign);
    if (content) u.searchParams.set("utm_content", content);
    tagged = u.toString();
  } catch {
    /* invalid URL — keep the hint text */
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(tagged);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <>
      <PageHeader title="Campaigns" description="Group posts into campaigns to see what a push actually delivered — from impressions down to qualified leads." />

      <MetaAdsCard ds={ds} from={ymd(d.range.from)} to={ymd(d.range.to)} />

      <Card className="overflow-x-auto">
        <CardHeader title="Campaign performance" hint="Posts in the selected period" />
        {rows.length ? (
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-3 font-medium">Campaign</th>
                <th className="py-2 pr-3 text-right font-medium">Posts</th>
                <th className="py-2 pr-3 text-right font-medium">Impressions</th>
                <th className="py-2 pr-3 text-right font-medium">Engagements</th>
                <th className="py-2 pr-3 text-right font-medium">Clicks</th>
                <th className="py-2 pr-3 text-right font-medium">Sessions</th>
                <th className="py-2 pr-3 text-right font-medium">Enquiries</th>
                <th className="py-2 pr-3 text-right font-medium">Leads</th>
                <th className="py-2 text-right font-medium">Cost / lead</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {[...rows]
                .sort((a, b) => b.engagements - a.engagements)
                .map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-0 hover:bg-surface-2">
                    <td className="py-2.5 pr-3">
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-muted">{r.product}</div>
                    </td>
                    <td className="py-2.5 pr-3 text-right">{r.posts.length}</td>
                    <td className="py-2.5 pr-3 text-right">{fmtNum(r.impressions)}</td>
                    <td className="py-2.5 pr-3 text-right">{fmtNum(r.engagements)}</td>
                    <td className="py-2.5 pr-3 text-right">{fmtNum(r.clicks)}</td>
                    <td className="py-2.5 pr-3 text-right">{fmtNum(r.sessions)}</td>
                    <td className="py-2.5 pr-3 text-right">{fmtNum(r.enquiries)}</td>
                    <td className="py-2.5 pr-3 text-right">{fmtNum(r.leads)}</td>
                    <td className="py-2.5 text-right">{r.cpl == null ? "—" : fmtMoney(r.cpl)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        ) : (
          <Empty>No posts in this selection.</Empty>
        )}
        <p className="mt-2 text-xs text-muted">Cost per lead only appears for campaigns with paid posts.</p>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Funnel"
            hint="Impressions → clicks → sessions → enquiries → leads"
            action={
              <Select aria-label="Funnel campaign" value={selected} onChange={(e) => setSelected(e.target.value)} className="max-w-48">
                <option value="__all">All shown posts</option>
                <option value="__none">No campaign</option>
                {ds.campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            }
          />
          <ul className="space-y-3">
            {stages.map((s, i) => {
              const prev = i ? stages[i - 1].value : null;
              const step = prev && s.value != null ? (s.value / prev) * 100 : null;
              return (
                <li key={s.label}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium">{s.label}</span>
                    <span className="tabular">
                      {fmtNum(s.value)}
                      {step != null && <span className="ml-2 text-xs text-muted">{step.toFixed(step < 10 ? 1 : 0)}% of previous step</span>}
                    </span>
                  </div>
                  <div className="mt-1 h-3 rounded bg-surface-2">
                    <div className="h-full rounded bg-brand" style={{ width: s.value && top ? `${Math.max(2, (s.value / top) * 100)}%` : "0%", opacity: 1 - i * 0.14 }} />
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-muted">Sessions come from website analytics (UTM-matched) and enquiries/leads are entered per post, so lower stages fill in as that data arrives.</p>
        </Card>

        <Card>
          <CardHeader
            title="Compare campaigns"
            action={
              <Segmented<Metric>
                label="Metric"
                value={metric}
                onChange={setMetric}
                options={[
                  { value: "engagements", label: "Engagements" },
                  { value: "clicks", label: "Clicks" },
                  { value: "leads", label: "Leads" },
                ]}
              />
            }
          />
          <BarList items={compare} format={fmtNum} />
        </Card>

        <Card>
          <CardHeader title="New campaign" hint="Then tag posts with it from the Posts page" />
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              addCampaign(name.trim(), product);
              setName("");
            }}
          >
            <label className="min-w-48 flex-1 space-y-1 text-sm">
              <span className="text-xs text-muted">Campaign name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Winter shutdown season" className="h-9 w-full rounded-lg border border-line bg-surface px-2.5" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs text-muted">Product</span>
              <Select value={product} onChange={(e) => setProduct(e.target.value)} className="block">
                {PRODUCTS.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </Select>
            </label>
            <Button type="submit" variant="primary">
              <Plus className="size-4" /> Add
            </Button>
          </form>
        </Card>

        <Card>
          <CardHeader title="UTM link builder" hint="Tag links in posts so website visits can be matched back to them" />
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1 text-sm sm:col-span-2">
              <span className="text-xs text-muted">Page URL</span>
              <input value={url} onChange={(e) => setUrl(e.target.value)} className="h-9 w-full rounded-lg border border-line bg-surface px-2.5" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs text-muted">Source</span>
              <Select value={source} onChange={(e) => setSource(e.target.value)} className="w-full">
                <option>linkedin</option>
                <option>instagram</option>
                <option>facebook</option>
              </Select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs text-muted">Campaign</span>
              <Select value={utmCampaign} onChange={(e) => setUtmCampaign(e.target.value)} className="w-full">
                <option value="">—</option>
                {ds.campaigns.map((c) => (
                  <option key={c.id} value={slug(c.name)}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="space-y-1 text-sm sm:col-span-2">
              <span className="text-xs text-muted">Content (post ID or short label)</span>
              <input value={content} onChange={(e) => setContent(e.target.value)} placeholder="post_001" className="h-9 w-full rounded-lg border border-line bg-surface px-2.5" />
            </label>
          </div>
          <div className="mt-3 flex items-start gap-2">
            <code className="min-w-0 flex-1 break-all rounded-lg bg-surface-2 p-2.5 font-mono text-xs">{tagged}</code>
            <Button onClick={copy} aria-label="Copy link">
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            </Button>
          </div>
        </Card>
      </div>
    </>
  );
}
