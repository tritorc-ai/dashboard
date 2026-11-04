"use client";

import { useMemo } from "react";
import { BarList, Card, CardHeader, Empty, PageHeader, PlatformTag } from "@/components/ui";
import { PageLoading } from "@/components/loading";
import { useDashboard } from "@/lib/use-dashboard";
import { fmtNum } from "@/lib/metrics";
import type { AudienceRow } from "@/lib/types";

const pct = (n: number) => `${n.toFixed(1)}%`;

function AgeGender({ rows }: { rows: AudienceRow[] }) {
  const max = Math.max(...rows.map((r) => Math.max(r.value, r.secondary ?? 0)), 1);
  return (
    <div>
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.label} className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-3 text-sm">
            <span className="text-muted">{r.label}</span>
            <span className="space-y-1">
              <span className="block h-2 rounded-full bg-surface-2" aria-hidden>
                <span className="block h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: "var(--c-linkedin)" }} />
              </span>
              <span className="block h-2 rounded-full bg-surface-2" aria-hidden>
                <span className="block h-full rounded-full" style={{ width: `${((r.secondary ?? 0) / max) * 100}%`, background: "var(--c-instagram)" }} />
              </span>
            </span>
            <span className="tabular w-24 text-right text-xs text-muted">
              M {pct(r.value)} · W {pct(r.secondary ?? 0)}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: "var(--c-linkedin)" }} /> Men
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: "var(--c-instagram)" }} /> Women
        </span>
      </div>
    </div>
  );
}

export default function AudiencePage() {
  const { ds, d } = useDashboard();

  const groups = useMemo(() => {
    if (!ds || !d) return [];
    return d.accountIds
      .map((id) => {
        const rows = ds.audience.filter((r) => r.accountId === id);
        const dims = [...new Set(rows.map((r) => r.dimension))];
        return { account: ds.accounts.find((a) => a.id === id)!, rows, dims };
      })
      .filter((g) => g.rows.length && g.account);
  }, [ds, d]);

  if (!ds || !d) return <PageLoading />;

  return (
    <>
      <PageHeader
        title="Audience"
        description="Who follows each account, from the platforms’ own demographic reports. These are lifetime snapshots, so the date filter doesn’t apply."
      />

      {!groups.length ? (
        <Empty>No audience reports for the selected accounts. YouTube has no demographic export loaded yet.</Empty>
      ) : (
        <div className="space-y-8">
          {groups.map(({ account, rows, dims }) => (
            <section key={account.id} aria-label={`${account.name} audience`}>
              <h2 className="mb-3 flex items-center gap-3 text-lg font-semibold tracking-tight">
                {account.name} <PlatformTag platform={account.platform} />
              </h2>
              <div className="grid gap-4 lg:grid-cols-2">
                {dims.map((dim) => {
                  const r = rows.filter((x) => x.dimension === dim);
                  const isPercent = r[0]?.unit === "percent";
                  return (
                    <Card key={dim}>
                      <CardHeader
                        title={dim === "Age & gender" ? "Age & gender" : dim.replace("Top towns/cities", "Top cities")}
                        hint={
                          account.platform === "LinkedIn"
                            ? "Followers with this attribute (members who list it on their profile)"
                            : "Share of followers"
                        }
                      />
                      {dim === "Age & gender" ? (
                        <AgeGender rows={r} />
                      ) : (
                        <BarList items={r.map((x) => ({ label: x.label, value: x.value }))} format={isPercent ? pct : fmtNum} />
                      )}
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
