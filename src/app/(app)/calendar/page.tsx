"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { Button, Card, CardHeader, PageHeader, PlatformDot, Select } from "@/components/ui";
import { PageLoading } from "@/components/loading";
import { usePostDrawer } from "@/components/post-drawer";
import { useData } from "@/components/data-provider";
import { useDashboard } from "@/lib/use-dashboard";
import { addDays, ymd } from "@/lib/metrics";
import { PLATFORMS, type Platform } from "@/lib/types";
import { cn } from "@/lib/cn";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function CalendarPage() {
  const { ds, d } = useDashboard();
  const { planned, addPlanned, removePlanned } = useData();
  const drawer = usePostDrawer();

  const today = useMemo(() => d?.today ?? new Date(), [d?.today]);
  const [cursor, setCursor] = useState(() => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)));
  const [form, setForm] = useState<{ date: string; platform: Platform; title: string }>({
    date: ymd(today),
    platform: "LinkedIn",
    title: "",
  });

  const view = useMemo(() => {
    if (!ds || !d) return null;
    const first = cursor;
    const monthEnd = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
    const lead = (first.getUTCDay() + 6) % 7;
    const start = addDays(first, -lead);
    const weeks = Math.ceil((lead + monthEnd.getUTCDate()) / 7);
    const byDay = new Map<string, typeof d.matching>();
    for (const p of d.matching) {
      const k = p.publishedAt.slice(0, 10);
      const arr = byDay.get(k);
      if (arr) arr.push(p);
      else byDay.set(k, [p]);
    }
    const plannedByDay = new Map<string, typeof planned>();
    for (const p of planned) {
      const arr = plannedByDay.get(p.date);
      if (arr) arr.push(p);
      else plannedByDay.set(p.date, [p]);
    }
    const grid = Array.from({ length: weeks }, (_, w) =>
      Array.from({ length: 7 }, (_, i) => {
        const day = addDays(start, w * 7 + i);
        const k = ymd(day);
        return {
          day,
          key: k,
          inMonth: day.getUTCMonth() === first.getUTCMonth(),
          posts: byDay.get(k) ?? [],
          planned: plannedByDay.get(k) ?? [],
        };
      }),
    );
    const emptyWeeks = grid.filter((w) => w.filter((x) => x.inMonth && x.day <= today).length >= 4 && w.every((x) => !x.posts.length && !x.planned.length)).length;
    const total = grid.flat().filter((x) => x.inMonth).reduce((s, x) => s + x.posts.length, 0);
    return { grid, emptyWeeks, total };
  }, [ds, d, cursor, planned, today]);

  if (!ds || !d || !view) return <PageLoading />;
  const label = cursor.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
  const shift = (n: number) => setCursor(new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + n, 1)));

  return (
    <>
      <PageHeader
        title="Content calendar"
        description="Published posts for the selected platform and account, plus posts you plan. Use it to spot gaps and clusters."
      />

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button size="sm" onClick={() => shift(-1)} aria-label="Previous month">
              <ChevronLeft className="size-4" />
            </Button>
            <h2 className="min-w-40 text-center text-base font-semibold">{label}</h2>
            <Button size="sm" onClick={() => shift(1)} aria-label="Next month">
              <ChevronRight className="size-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCursor(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)))}>
              Today
            </Button>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted">
            {PLATFORMS.map((p) => (
              <span key={p} className="inline-flex items-center gap-1.5">
                <PlatformDot platform={p} />
                {p}
              </span>
            ))}
            <span>{view.total} published</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="grid min-w-[720px] grid-cols-7 gap-px overflow-hidden rounded-lg border border-line bg-line">
            {DAYS.map((x) => (
              <div key={x} className="bg-surface-2 px-2 py-1.5 text-xs font-medium text-muted">
                {x}
              </div>
            ))}
            {view.grid.flat().map((c) => (
              <div key={c.key} className={cn("min-h-28 bg-surface p-1.5", !c.inMonth && "bg-surface-2/60 opacity-60")}>
                <div className={cn("mb-1 text-xs", c.key === ymd(today) ? "inline-grid size-5 place-items-center rounded-full bg-brand font-semibold text-white" : "text-muted")}>{c.day.getUTCDate()}</div>
                <div className="space-y-1">
                  {c.posts.slice(0, 3).map((p) => (
                    <button key={p.id} onClick={() => drawer.open(p.id)} className="flex w-full items-center gap-1.5 rounded bg-surface-2 px-1.5 py-1 text-left text-[11px] leading-tight hover:bg-brand-soft" title={p.caption}>
                      <PlatformDot platform={p.platform} className="size-2" />
                      <span className="truncate">{p.caption}</span>
                    </button>
                  ))}
                  {c.posts.length > 3 && <div className="px-1 text-[11px] text-muted">+{c.posts.length - 3} more</div>}
                  {c.planned.map((p) => (
                    <div key={p.id} className="flex items-center gap-1.5 rounded border border-dashed border-muted/60 px-1.5 py-1 text-[11px] leading-tight">
                      <PlatformDot platform={p.platform} className="size-2" />
                      <span className="flex-1 truncate" title={p.title}>
                        {p.title}
                      </span>
                      <button onClick={() => removePlanned(p.id)} aria-label={`Remove planned post ${p.title}`} className="text-muted hover:text-bad">
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        {view.emptyWeeks > 0 && <p className="mt-3 text-sm text-warn">{view.emptyWeeks} week{view.emptyWeeks > 1 ? "s" : ""} this month had no posts for the selected accounts.</p>}
      </Card>

      <Card className="mt-4">
        <CardHeader title="Plan a post" hint="Dashed entries on the calendar. Saved in this browser until the database is connected." />
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.title.trim() || !form.date) return;
            addPlanned({ date: form.date, platform: form.platform, title: form.title.trim() });
            setForm({ ...form, title: "" });
          }}
        >
          <label className="space-y-1 text-sm">
            <span className="text-xs text-muted">Date</span>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="block h-9 rounded-lg border border-line bg-surface px-2.5" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs text-muted">Platform</span>
            <Select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value as Platform })} className="block">
              {PLATFORMS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </Select>
          </label>
          <label className="min-w-56 flex-1 space-y-1 text-sm">
            <span className="text-xs text-muted">Title / idea</span>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Hot tapping case study carousel" className="h-9 w-full rounded-lg border border-line bg-surface px-2.5" />
          </label>
          <Button type="submit" variant="primary">
            <Plus className="size-4" /> Add
          </Button>
        </form>
      </Card>
    </>
  );
}
