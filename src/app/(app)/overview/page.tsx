"use client";

import { useMemo } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Info } from "lucide-react";
import Link from "next/link";
import { Badge, Card, CardHeader, Delta, Empty, PageHeader, PlatformTag } from "@/components/ui";
import { Donut, Sparkline, TrendChart } from "@/components/charts";
import { PageLoading } from "@/components/loading";
import { EngagementGuide } from "@/components/engagement-guide";
import { usePostDrawer } from "@/components/post-drawer";
import { useDashboard } from "@/lib/use-dashboard";
import { buildHighlights, buildKpis, fmtKpi, monthActual } from "@/lib/analytics";
import {
  addDays,
  engagementRate,
  engagements,
  fmtCompact,
  fmtDate,
  fmtNum,
  fmtPct,
  postsInBucket,
  sum,
  timeBuckets,
} from "@/lib/metrics";
import { PLATFORM_COLOR } from "@/lib/filters";
import { PLATFORMS } from "@/lib/types";
import { cn } from "@/lib/cn";

export default function OverviewPage() {
  const { ds, d, filters } = useDashboard();
  const drawer = usePostDrawer();

  const view = useMemo(() => {
    if (!ds || !d) return null;
    const kpis = buildKpis(d);
    const buckets = timeBuckets(d.range.from, d.range.to);
    const platforms = PLATFORMS.filter((p) => d.inPeriod.some((x) => x.platform === p && engagements(x) > 0));
    const trend = buckets.map((b) => {
      const ps = postsInBucket(d.inPeriod, b);
      const row: Record<string, string | number | null> = { label: b.label };
      for (const p of platforms) row[p] = sum(ps.filter((x) => x.platform === p), engagements);
      return row;
    });
    const split = platforms
      .map((p) => ({
      name: p,
      value: sum(d.inPeriod.filter((x) => x.platform === p), engagements),
      color: PLATFORM_COLOR[p],
    }))
      .filter((s) => s.value > 0);
    const top =[...d.inPeriod]
      .filter((p) => engagementRate(p) != null && (p.reach ?? p.impressions ?? 0) > 500)
      .sort((a, b) => (engagementRate(b) ?? 0) - (engagementRate(a) ?? 0))
      .slice(0, 5);

    // targets are for the current calendar month, using the active platform/account filters
    const now = d.today;
    const mStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const mEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
    const daysInMonth = mEnd.getUTCDate();
    const elapsed = now.getUTCDate() / daysInMonth;
    const targets = ds.targets.map((t) => {
      const actual = monthActual(t.metric, d.matching, d.followerIndex, d.accountIds, mStart, addDays(now, 0));
      return { ...t, actual, pct: t.monthly ? actual / t.monthly : 0 };
    });
    return {
      kpis,
      platforms,
      trend,
      split,
      top,
      targets,
      elapsed,
      monthLabel: mStart.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }),
      highlights: buildHighlights(d, ds),
    };
  }, [ds, d]);

  if (!ds || !d || !view) return <PageLoading />;

  return (
    <>
      <PageHeader
        title="Overview"
        description={`${fmtDate(d.range.from.toISOString())} – ${fmtDate(d.range.to.toISOString())}${
          filters.days && d.prevAvailable ? ", compared with the previous " + d.range.days + " days" : filters.days ? " (no earlier period in the reports to compare with)" : ""
        }.`}
      />

      <div className="mb-4">
        <EngagementGuide />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {view.kpis.map((k) => (
          <Card key={k.id} className="flex flex-col">
            <div className="text-xs font-medium uppercase tracking-wide text-muted">{k.label}</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="tabular text-2xl font-semibold tracking-tight">{fmtKpi(k, k.value)}</span>
              {filters.days > 0 && <Delta value={k.prev && k.value != null ? ((k.value - k.prev) / Math.abs(k.prev)) * 100 : null} />}
            </div>
            <Sparkline values={k.spark} className="mt-2" />
            {k.note && <div className="mt-1 text-[11px] text-muted">{k.note}</div>}
          </Card>
        ))}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Engagements over time" hint="Likes, comments, shares and saves, by platform" />
          <TrendChart
            data={view.trend}
            series={view.platforms.map((p) => ({ key: p, label: p, color: PLATFORM_COLOR[p] }))}
            area
          />
        </Card>
        <Card>
          <CardHeader title="Engagement share" hint="By platform, selected period" />
          <Donut data={view.split} />
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title={`Targets · ${view.monthLabel}`} hint="Pace compares progress with how much of the month has passed" />
          <ul className="space-y-4">
            {view.targets.map((t) => {
              const onTrack = t.pct >= view.elapsed * 0.95;
              return (
                <li key={t.id}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{t.label}</span>
                    <span className="tabular text-muted">
                      {fmtNum(t.actual)} / {fmtNum(t.monthly)}
                    </span>
                  </div>
                  <div
                    className="relative mt-1.5 h-2 rounded-full bg-surface-2"
                    role="progressbar"
                    aria-label={t.label}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.min(100, Math.round(t.pct * 100))}
                  >
                    <div className={cn("h-full rounded-full", onTrack ? "bg-good" : "bg-brand")} style={{ width: `${Math.min(100, t.pct * 100)}%` }} />
                    <div className="absolute -top-0.5 h-3 w-0.5 bg-ink/50" style={{ left: `${view.elapsed * 100}%` }} title="Where you should be today" />
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-muted">
                    <span>{Math.round(t.pct * 100)}% of target</span>
                    <Badge tone={onTrack ? "good" : "warn"}>{onTrack ? "On pace" : "Behind pace"}</Badge>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-muted">Edit targets under Settings.</p>
        </Card>

        <Card>
          <CardHeader title="Highlights" hint="Automatic callouts from simple rules" />
          {view.highlights.length ? (
            <ul className="space-y-3">
              {view.highlights.map((h, i) => {
                const Icon = h.tone === "good" ? CheckCircle2 : h.tone === "warn" ? AlertTriangle : Info;
                return (
                  <li key={i} className="flex gap-2.5 text-sm">
                    <Icon className={cn("mt-0.5 size-4 shrink-0", h.tone === "good" && "text-good", h.tone === "warn" && "text-warn", h.tone === "neutral" && "text-muted")} />
                    <div>
                      <div className="font-medium">
                        {h.postId ? (
                          <button className="text-left hover:underline" onClick={() => drawer.open(h.postId!)}>
                            {h.title}
                          </button>
                        ) : (
                          h.title
                        )}
                      </div>
                      <div className="text-muted">{h.detail}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty>Not enough posts in this selection to highlight anything yet.</Empty>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Top posts"
            hint="By engagement rate"
            action={
              <Link href="/posts" className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
                All posts <ArrowRight className="size-3" />
              </Link>
            }
          />
          {view.top.length ? (
            <ol className="space-y-3">
              {view.top.map((p, i) => (
                <li key={p.id}>
                  <button className="flex w-full gap-3 rounded-lg p-1.5 text-left hover:bg-surface-2" onClick={() => drawer.open(p.id)}>
                    <span className="tabular w-4 pt-0.5 text-sm text-muted">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-sm font-medium">{p.caption}</span>
                      <span className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                        <PlatformTag platform={p.platform} />· {fmtDate(p.publishedAt, { year: undefined })}
                      </span>
                    </span>
                    <span className="tabular pt-0.5 text-sm font-semibold">{fmtPct(engagementRate(p))}</span>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <Empty>No posts in this selection.</Empty>
          )}
          <p className="mt-3 text-xs text-muted">Total reach is not summed across posts: audiences overlap, so “unique people” would be overstated. Impressions total {fmtCompact(view.kpis.find((k) => k.id === "impressions")?.value ?? null)}.</p>
        </Card>
      </div>
    </>
  );
}
