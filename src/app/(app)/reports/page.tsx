"use client";

import { useMemo, useState } from "react";
import { Download, Printer } from "lucide-react";
import { Button, Card, CardHeader, Delta, Empty, PageHeader, PlatformTag, Select } from "@/components/ui";
import { PageLoading } from "@/components/loading";
import { useDashboard } from "@/lib/use-dashboard";
import { buildHighlights, buildKpis, fmtKpi, prevCovered, type Derived } from "@/lib/analytics";
import { downloadCsv, toCsv } from "@/lib/csv";
import { addDays, avg, engagementRate, engagements, fmtDate, fmtNum, fmtPct, startOfDay, sum, sumOrNull, ymd } from "@/lib/metrics";
import { PLATFORMS } from "@/lib/types";
import { inRange } from "@/lib/filters";

export default function ReportsPage() {
  const { ds, d } = useDashboard();
  const [offset, setOffset] = useState(1); // months back; default = last full month

  const months = useMemo(() => {
    const t = d?.today ?? startOfDay(new Date());
    return Array.from({ length: 12 }, (_, i) => {
      const start = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - i, 1));
      return { i, start, label: start.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }) };
    });
  }, [d?.today]);

  const report = useMemo(() => {
    if (!ds || !d) return null;
    const m = months[offset];
    const from = m.start;
    const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0));
    const prevTo = addDays(from, -1);
    const prevFrom = new Date(Date.UTC(prevTo.getUTCFullYear(), prevTo.getUTCMonth(), 1));
    const current = d.matching.filter((p) => inRange(p, from, to));
    const previous = d.matching.filter((p) => inRange(p, prevFrom, prevTo));
    const days = Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
    const fake: Derived = {
      today: d.today,
      range: { from, to, prevFrom, prevTo, days },
      accountIds: d.accountIds,
      matching: d.matching,
      inPeriod: current,
      prevPeriod: previous,
      prevAvailable: prevCovered(ds, d.accountIds, prevFrom),
      followerIndex: d.followerIndex,
    };
    return {
      label: m.label,
      inPeriod: current,
      kpis: buildKpis(fake),
      highlights: buildHighlights({ ...fake, today: to }, ds),
      byPlatform: PLATFORMS.map((p) => {
        const ps = current.filter((x) => x.platform === p);
        return { p, posts: ps.length, eng: sum(ps, engagements), er: avg(ps, engagementRate), clicks: sumOrNull(ps, (x) => x.clicks), leads: sumOrNull(ps, (x) => x.leads) };
      }).filter((r) => r.posts),
      top: [...current].filter((p) => engagementRate(p) != null && (p.reach ?? p.impressions ?? 0) > 500).sort((a, b) => (engagementRate(b) ?? 0) - (engagementRate(a) ?? 0)).slice(0, 5),
    };
  }, [ds, d, months, offset]);

  if (!ds || !d || !report) return <PageLoading />;

  const exportCsv = () =>
    downloadCsv(
      `tritorc-report-${report.label.replace(/\s/g, "-").toLowerCase()}.csv`,
      toCsv(
        ["Metric", "Value", "Previous month"],
        report.kpis.map((k) => [k.label, fmtKpi(k, k.value), fmtKpi(k, k.prev)]),
      ),
    );

  return (
    <>
      <PageHeader
        title="Monthly report"
        description="A print-friendly summary for management meetings. Respects the platform, account and campaign filters; the date range is the month you pick here."
        actions={
          <>
            <Select aria-label="Report month" value={offset} onChange={(e) => setOffset(Number(e.target.value))}>
              {months.map((m) => (
                <option key={m.i} value={m.i}>
                  {m.label}
                </option>
              ))}
            </Select>
            <Button onClick={exportCsv}>
              <Download className="size-4" /> CSV
            </Button>
            <Button variant="primary" onClick={() => window.print()}>
              <Printer className="size-4" /> Print / save PDF
            </Button>
          </>
        }
      />

      <div className="mb-4 hidden print:block">
        <div className="text-xl font-semibold">TRITORC — Social media report, {report.label}</div>
        <div className="text-xs text-muted">Generated {fmtDate(ymd(new Date()))}</div>
      </div>

      {!report.inPeriod.length ? (
        <Empty>No posts in {report.label} for the current filters.</Empty>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader title={`${report.label} at a glance`} hint="Change is versus the previous month" />
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
              {report.kpis.map((k) => (
                <div key={k.id}>
                  <dt className="text-xs uppercase tracking-wide text-muted">{k.label}</dt>
                  <dd className="tabular mt-0.5 flex items-baseline gap-2 text-xl font-semibold">
                    {fmtKpi(k, k.value)}
                    <Delta value={k.prev && k.value != null ? ((k.value - k.prev) / Math.abs(k.prev)) * 100 : null} />
                  </dd>
                </div>
              ))}
            </dl>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="By platform" />
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                    <th className="py-1.5 font-medium">Platform</th>
                    <th className="py-1.5 text-right font-medium">Posts</th>
                    <th className="py-1.5 text-right font-medium">Engagements</th>
                    <th className="py-1.5 text-right font-medium">Eng. rate</th>
                    <th className="py-1.5 text-right font-medium">Leads</th>
                  </tr>
                </thead>
                <tbody className="tabular">
                  {report.byPlatform.map((r) => (
                    <tr key={r.p} className="border-b border-line last:border-0">
                      <td className="py-2">
                        <PlatformTag platform={r.p} />
                      </td>
                      <td className="py-2 text-right">{r.posts}</td>
                      <td className="py-2 text-right">{fmtNum(r.eng)}</td>
                      <td className="py-2 text-right font-medium">{fmtPct(r.er)}</td>
                      <td className="py-2 text-right">{fmtNum(r.leads)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <Card>
              <CardHeader title="Top posts of the month" hint="By engagement rate" />
              <ol className="space-y-2.5 text-sm">
                {report.top.map((p, i) => (
                  <li key={p.id} className="flex gap-3">
                    <span className="tabular w-4 text-muted">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 font-medium">{p.caption}</span>
                      <span className="text-xs text-muted">
                        {p.platform} · {fmtDate(p.publishedAt, { year: undefined })}
                      </span>
                    </span>
                    <span className="tabular font-semibold">{fmtPct(engagementRate(p))}</span>
                  </li>
                ))}
              </ol>
            </Card>
          </div>

          <Card>
            <CardHeader title="Notes for the meeting" hint="Generated from simple rules on this month’s data" />
            {report.highlights.length ? (
              <ul className="list-disc space-y-1.5 pl-5 text-sm">
                {report.highlights.map((h, i) => (
                  <li key={i}>
                    <span className="font-medium">{h.title}.</span> <span className="text-muted">{h.detail}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Not enough data this month to highlight anything.</p>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
