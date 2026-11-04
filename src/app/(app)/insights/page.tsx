"use client";

import { useMemo } from "react";
import { BarList, Card, CardHeader, Empty, PageHeader, PlatformTag } from "@/components/ui";
import { Heatmap, PostsVsRateChart } from "@/components/charts";
import { PageLoading } from "@/components/loading";
import { usePostDrawer } from "@/components/post-drawer";
import { useDashboard } from "@/lib/use-dashboard";
import { addDays, avg, engagementRate, fmtNum, fmtPct, groupBy, sumOrNull } from "@/lib/metrics";
import type { Post } from "@/lib/types";

const pct1 = (n: number) => `${n.toFixed(2)}%`;

function PostList({ posts, onOpen }: { posts: Post[]; onOpen: (id: string) => void }) {
  return (
    <ol className="space-y-2">
      {posts.map((p, i) => (
        <li key={p.id}>
          <button className="flex w-full items-start gap-3 rounded-lg p-1.5 text-left hover:bg-surface-2" onClick={() => onOpen(p.id)}>
            <span className="tabular w-4 pt-0.5 text-sm text-muted">{i + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="line-clamp-1 text-sm font-medium">{p.caption}</span>
              <span className="flex items-center gap-2 text-xs text-muted">
                <PlatformTag platform={p.platform} />· {p.format} · reach {fmtNum(p.reach)}
              </span>
            </span>
            <span className="tabular text-sm font-semibold">{fmtPct(engagementRate(p))}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

export default function InsightsPage() {
  const { ds, d } = useDashboard();
  const drawer = usePostDrawer();

  const v = useMemo(() => {
    if (!ds || !d) return null;
    const P = d.inPeriod;
    const by = (key: (p: Post) => string, f: (ps: Post[]) => number | null) =>
      [...groupBy(P, key)].map(([label, ps]) => ({ label, value: f(ps), sub: `${ps.length} post${ps.length === 1 ? "" : "s"}` }));

    // hours are as exported (Meta reports Pacific time)
    const cells: { day: number; hour: number; value: number | null; n: number }[] = [];
    // platforms that only report a date (LinkedIn, YouTube) have no hour, so they stay out of the heatmap
    const slots = groupBy(P.filter((p) => p.timeKnown !== false), (p) => {
      const dt = new Date(p.publishedAt);
      return `${(dt.getUTCDay() + 6) % 7}-${dt.getUTCHours()}`;
    });
    for (const [k, ps] of slots) {
      const [day, hour] = k.split("-").map(Number);
      cells.push({ day, hour, value: avg(ps, engagementRate), n: ps.length });
    }

    const tags = [...groupBy(P.flatMap((p) => p.hashtags.map((h) => ({ h, p }))), (x) => x.h)]
      .map(([tag, xs]) => ({ tag, n: xs.length, er: avg(xs, (x) => engagementRate(x.p)) }))
      .filter((t) => t.n >= 2 && t.tag !== "#tritorc")
      .sort((a, b) => (b.er ?? 0) - (a.er ?? 0))
      .slice(0, 8);

    // posts per week vs average engagement rate
    const weeks: { label: string; posts: number; rate: number | null }[] = [];
    const dow = (d.range.from.getUTCDay() + 6) % 7;
    for (let s = addDays(d.range.from, -dow); s <= d.range.to; s = addDays(s, 7)) {
      const e = addDays(s, 7).getTime();
      const ps = P.filter((p) => {
        const t = new Date(p.publishedAt).getTime();
        return t >= s.getTime() && t < e;
      });
      weeks.push({
        label: s.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }),
        posts: ps.length,
        rate: avg(ps, engagementRate),
      });
    }

    const ranked = [...P].filter((p) => engagementRate(p) != null && (p.reach ?? p.impressions ?? 0) > 500).sort((a, b) => (engagementRate(b) ?? 0) - (engagementRate(a) ?? 0));

    return {
      formatEr: by((p) => p.format, (ps) => avg(ps, engagementRate)),
      formatReach: by((p) => p.format, (ps) => avg(ps, (p) => p.reach)),
      categoryEr: by((p) => p.category, (ps) => avg(ps, engagementRate)),
      productClicks: by((p) => p.product, (ps) => (sumOrNull(ps, (p) => p.clicks) == null ? null : (sumOrNull(ps, (p) => p.clicks) ?? 0) / ps.filter((p) => p.clicks != null).length)),
      objectiveEr: by((p) => p.objective, (ps) => avg(ps, engagementRate)),
      cells,
      tags,
      weeks,
      top: ranked.slice(0, 5),
      bottom: ranked.slice(-5).reverse(),
    };
  }, [ds, d]);

  if (!ds || !d || !v) return <PageLoading />;
  if (!d.inPeriod.length)
    return (
      <>
        <PageHeader title="Content insights" />
        <Empty>No posts in this selection. Widen the date range or clear a filter.</Empty>
      </>
    );

  return (
    <>
      <PageHeader title="Content insights" description="What to publish more of, what to improve, and when to post. Based on posts in the selected period — treat small samples (under ~10 posts) as hints, not conclusions." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Engagement rate by format" />
          <BarList items={v.formatEr} format={pct1} />
        </Card>
        <Card>
          <CardHeader title="Average reach by format" />
          <BarList items={v.formatReach} format={fmtNum} color="var(--c-linkedin)" />
        </Card>
        <Card>
          <CardHeader title="Engagement rate by content category" />
          <BarList items={v.categoryEr} format={pct1} />
        </Card>
        <Card>
          <CardHeader title="Average link clicks by product" hint="Instagram has no link-click metric, so it is excluded" />
          <BarList items={v.productClicks} format={fmtNum} color="var(--c-facebook)" />
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Best day and hour to post" hint="Average engagement rate per slot" />
          <Heatmap cells={v.cells} format={(n) => n.toFixed(1)} />
        </Card>
        <Card>
          <CardHeader title="Posting frequency vs engagement" hint="Bars: posts per week · Line: average engagement rate" />
          <PostsVsRateChart data={v.weeks} />
        </Card>
        <Card>
          <CardHeader title="Hashtag leaderboard" hint="Hashtags used on 2+ posts, by average engagement rate" />
          {v.tags.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-1.5 font-medium">Hashtag</th>
                  <th className="py-1.5 text-right font-medium">Posts</th>
                  <th className="py-1.5 text-right font-medium">Avg eng. rate</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {v.tags.map((t) => (
                  <tr key={t.tag} className="border-b border-line last:border-0">
                    <td className="py-2">{t.tag}</td>
                    <td className="py-2 text-right">{t.n}</td>
                    <td className="py-2 text-right font-medium">{fmtPct(t.er)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty>Not enough repeated hashtags yet.</Empty>
          )}
        </Card>
        <Card>
          <CardHeader title="Top 5 posts" hint="By engagement rate (reach over 500)" />
          <PostList posts={v.top} onOpen={drawer.open} />
        </Card>
        <Card>
          <CardHeader title="Bottom 5 posts" hint="Lowest engagement rate — check them against their purpose" />
          <PostList posts={v.bottom} onOpen={drawer.open} />
        </Card>
      </div>
    </>
  );
}
