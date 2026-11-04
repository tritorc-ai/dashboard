"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Plus } from "lucide-react";
import { BarList, Button, Card, CardHeader, Empty, PageHeader, Segmented, Select } from "@/components/ui";
import { PageLoading } from "@/components/loading";
import { useData } from "@/components/data-provider";
import { useDashboard } from "@/lib/use-dashboard";
import { PRODUCTS } from "@/lib/sample-data";
import { engagements, fmtMoney, fmtNum, groupBy, sum, sumOrNull } from "@/lib/metrics";
import type { Post } from "@/lib/types";

type Metric = "engagements" | "leads" | "clicks";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

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
