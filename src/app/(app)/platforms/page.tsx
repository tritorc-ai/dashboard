"use client";

import { useMemo } from "react";
import { Card, CardHeader, BarList, Empty, PageHeader, PlatformTag } from "@/components/ui";
import { ColumnChart, TrendChart } from "@/components/charts";
import { PageLoading } from "@/components/loading";
import { EngagementGuide } from "@/components/engagement-guide";
import { useDashboard } from "@/lib/use-dashboard";
import {
  addDays,
  ymd,
  avg,
  engagementRate,
  engagements,
  fmtCompact,
  fmtNum,
  fmtPct,
  followersOn,
  groupBy,
  postsInBucket,
  sum,
  sumOrNull,
  timeBuckets,
} from "@/lib/metrics";
import { PLATFORM_COLOR } from "@/lib/filters";
import { PLATFORMS } from "@/lib/types";

export default function PlatformsPage() {
  const { ds, d } = useDashboard();

  const view = useMemo(() => {
    if (!ds || !d) return null;
    const { range, followerIndex: fi, inPeriod: current } = d;
    const rows = ds.accounts
      .filter((a) => d.accountIds.includes(a.id))
      .map((a) => {
        const ps = current.filter((p) => p.accountId === a.id);
        const end = followersOn(fi, [a.id], range.to);
        const start = followersOn(fi, [a.id], addDays(range.from, -1));
        const first = fi.earliest.get(a.id);
        const hasHistory = !!first && first.date <= ymd(addDays(range.from, -1));
        return {
          account: a,
          followers: end,
          // growth is only known when the follower history reaches back to the start of the range
          net: hasHistory ? end - start : null,
          growth: hasHistory && start ? ((end - start) / start) * 100 : null,
          posts: ps.length,
          reach: avg(ps, (p) => p.reach),
          er: avg(ps, engagementRate),
          engagements: sum(ps, engagements),
          clicks: sumOrNull(ps, (p) => p.clicks),
          leads: sumOrNull(ps, (p) => p.leads),
        };
      })
      .sort((a, b) => (b.er ?? -1) - (a.er ?? -1));

    const platforms = PLATFORMS.filter((p) => rows.some((r) => r.account.platform === p));
    const buckets = timeBuckets(range.from, range.to);
    const growth = buckets.map((b) => {
      const row: Record<string, string | number | null> = { label: b.label };
      for (const p of platforms) {
        const ids = d.accountIds.filter((id) => ds.accounts.find((a) => a.id === id)?.platform === p);
        row[p] = followersOn(fi, ids, b.end > range.to ? range.to : b.end);
      }
      return row;
    });
    const perf = buckets.map((b) => {
      const row: Record<string, string | number | null> = { label: b.label };
      for (const p of platforms) {
        row[p] = avg(postsInBucket(current, b).filter((x) => x.platform === p), engagementRate);
      }
      return row;
    });
    const byPlatform = [...groupBy(current, (p) => p.platform)].map(([label, ps]) => ({
      label,
      er: avg(ps, engagementRate),
      posts: ps.length,
      reach: avg(ps, (p) => p.reach),
    }));
    const cadence = buckets.map((b) => ({ label: b.label, posts: postsInBucket(current, b).length }));
    return { rows, platforms, growth, perf, byPlatform, cadence };
  }, [ds, d]);

  if (!ds || !d || !view) return <PageLoading />;

  return (
    <>
      <PageHeader
        title="Platforms & accounts"
        description="Accounts are compared on per-post averages, so a bigger or busier account isn’t automatically ranked higher. “N/A” means the platform doesn’t expose that metric — it is not zero."
      />

      <div className="mb-4">
        <EngagementGuide />
      </div>

      <Card className="overflow-x-auto">
        <CardHeader title="Account comparison" hint="Sorted by average engagement rate" />
        {view.rows.length ? (
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-3 font-medium">Account</th>
                <th className="py-2 pr-3 text-right font-medium">Followers</th>
                <th className="py-2 pr-3 text-right font-medium">Net new</th>
                <th className="py-2 pr-3 text-right font-medium">Posts</th>
                <th className="py-2 pr-3 text-right font-medium">Avg reach</th>
                <th className="py-2 pr-3 text-right font-medium">Eng. rate</th>
                <th className="py-2 pr-3 text-right font-medium">Clicks</th>
                <th className="py-2 text-right font-medium">Leads</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {view.rows.map((r) => (
                <tr key={r.account.id} className="border-b border-line last:border-0 hover:bg-surface-2">
                  <td className="py-2.5 pr-3">
                    <div className="font-medium">{r.account.name}</div>
                    <PlatformTag platform={r.account.platform} />
                  </td>
                  <td className="py-2.5 pr-3 text-right">{fmtNum(r.followers)}</td>
                  <td className="py-2.5 pr-3 text-right">
                    {r.net == null ? (
                      <span className="text-muted" title="Follower history starts when the data was first collected">N/A</span>
                    ) : (
                      <>
                        {r.net >= 0 ? "+" : ""}
                        {fmtNum(r.net)} <span className="text-xs text-muted">({fmtPct(r.growth, 1)})</span>
                      </>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-right">{r.posts}</td>
                  <td className="py-2.5 pr-3 text-right">{fmtNum(r.reach)}</td>
                  <td className="py-2.5 pr-3 text-right font-semibold">{fmtPct(r.er)}</td>
                  <td className="py-2.5 pr-3 text-right">{fmtNum(r.clicks)}</td>
                  <td className="py-2.5 text-right">{fmtNum(r.leads)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>No accounts match these filters.</Empty>
        )}
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Follower growth" hint="Total followers by platform" />
          <TrendChart
            data={view.growth}
            series={view.platforms.map((p) => ({ key: p, label: p, color: PLATFORM_COLOR[p] }))}
            format={fmtCompact}
          />
        </Card>
        <Card>
          <CardHeader title="Engagement rate trend" hint="Average per post, by platform" />
          <TrendChart
            data={view.perf}
            series={view.platforms.map((p) => ({ key: p, label: p, color: PLATFORM_COLOR[p] }))}
            format={(n) => `${n.toFixed(1)}%`}
          />
        </Card>
        <Card>
          <CardHeader title="Average engagement rate" hint="Per post, selected period" />
          <BarList items={view.byPlatform.map((b) => ({ label: b.label, value: b.er, sub: `${b.posts} post${b.posts === 1 ? "" : "s"}` }))} format={(n) => `${n.toFixed(2)}%`} />
        </Card>
        <Card>
          <CardHeader title="Posting cadence" hint="Posts published per period, all selected platforms" />
          <ColumnChart data={view.cadence} dataKey="posts" format={(n) => String(Math.round(n))} />
        </Card>
      </div>
    </>
  );
}
