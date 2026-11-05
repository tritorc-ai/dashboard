"use client";

import { useState } from "react";
import { CircleDot, FileUp, RefreshCw, Trash2 } from "lucide-react";
import { Badge, Button, Card, CardHeader, Empty, PageHeader, PlatformTag } from "@/components/ui";
import { PageLoading } from "@/components/loading";
import { useData } from "@/components/data-provider";
import { parseCsv } from "@/lib/csv";
import { fmtDate, fmtNum } from "@/lib/metrics";

const CONNECTIONS = [
  { name: "LinkedIn Pages", detail: "Community Management API (requires LinkedIn approval). Until then, import the Page analytics export as CSV." },
  { name: "YouTube private analytics", detail: "Watch time, impressions and click-through rate live: YouTube Analytics API with OAuth (the channel owner or a manager approves once). Until then they come from the Studio export." },
  { name: "Website analytics", detail: "Google Analytics 4 — adds website sessions per post using UTM links." },
];

export default function SettingsPage() {
  const { ds, setTarget, hasLocalChanges, resetLocalChanges, reload, syncing } = useData();
  const [preview, setPreview] = useState<{ name: string; header: string[]; rows: string[][]; total: number } | null>(null);
  const [error, setError] = useState("");

  if (!ds) return <PageLoading />;

  const onFile = async (f: File | undefined) => {
    setError("");
    setPreview(null);
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) return setError("File is larger than 10 MB.");
    try {
      const rows = parseCsv(await f.text());
      if (rows.length < 2) return setError("That file has no data rows.");
      setPreview({ name: f.name, header: rows[0], rows: rows.slice(1, 6), total: rows.length - 1 });
    } catch {
      setError("Couldn’t read that file as CSV.");
    }
  };

  return (
    <>
      <PageHeader title="Settings & imports" description="Data sources, targets and imports. Real platform data is connected here once access is provided." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Data source" />
          <div className="flex items-center gap-2 text-sm">
            <Badge tone={ds.source === "sample" ? "warn" : "good"}>{ds.source === "sample" ? "Sample data" : ds.source === "exports" ? "Platform exports" : "Live database"}</Badge>
            <span className="text-muted">Updated {fmtDate(ds.updatedAt)}</span>
          </div>
          <p className="mt-2 text-sm text-muted">
            {ds.source === "sample"
              ? `${ds.posts.length.toLocaleString("en-IN")} generated posts. None of these numbers are Tritorc’s real results.`
              : `${ds.posts.length.toLocaleString("en-IN")} posts and videos from ${ds.accounts.length} accounts, read from the export files in the project’s data folder. Replace or add files there and refresh to update.`}
          </p>
          <ul className="mt-3 space-y-1.5 text-sm">
            {ds.accounts.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2">
                {a.url ? (
                  <a href={a.url} target="_blank" rel="noreferrer" className="min-w-0 truncate hover:text-brand hover:underline">
                    {a.name}
                  </a>
                ) : (
                  <span className="truncate">{a.name}</span>
                )}
                <PlatformTag platform={a.platform} />
              </li>
            ))}
          </ul>
        </Card>

        {ds.source === "exports" && (
          <Card>
            <CardHeader title="Waiting for access" hint="Add their export files to the data folder when available" />
            <ul className="space-y-1.5 text-sm">
              {["Tritorc Perú", "Tritorc Africa Pipeline Solutions", "Tritorc in Action", "Tritorc INC", "Precomtec", "Ozat"]
                .filter((n) => !ds.accounts.some((a) => a.name === n))
                .map((n) => (
                  <li key={n} className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2">
                    <span>{n}</span>
                    <Badge>LinkedIn · no data yet</Badge>
                  </li>
                ))}
            </ul>
            <p className="mt-2 text-xs text-muted">Facebook is limited to one page (Tritorc Group); Tritorc Equipments Pvt Ltd is not tracked.</p>
          </Card>
        )}

        <Card>
          <CardHeader
            title="Live connections"
            hint="Refreshed automatically every 10 minutes while this page is open"
            action={
              <Button size="sm" onClick={() => void reload(true)} disabled={syncing} aria-label="Sync live data now">
                <RefreshCw className={syncing ? "size-3.5 animate-spin" : "size-3.5"} /> {syncing ? "Syncing…" : "Sync now"}
              </Button>
            }
          />
          <div className="space-y-4">
            {(
              [
                { key: "youtube", name: "YouTube", unit: "videos", detail: "Views, likes, comments and subscribers are live (subscribers are rounded by YouTube)." },
                { key: "facebook", name: "Facebook", unit: "posts", detail: "Reactions, comments, shares, views, viewers, clicks and followers are live. Metrics Meta refuses show as N/A." },
                { key: "instagram", name: "Instagram", unit: "posts", detail: "Likes, comments, shares, saves, views, reach, followers and audience demographics are live. Metrics Meta refuses show as N/A." },
              ] as const
            ).map(({ key, name, unit, detail }) => {
              const l = ds.live?.[key];
              return (
                <div key={key} className="flex gap-3 text-sm">
                  <CircleDot className={l?.syncedAt && !l.error ? "mt-0.5 size-4 shrink-0 text-good" : "mt-0.5 size-4 shrink-0 text-muted"} />
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 font-medium">
                      {name}
                      <Badge tone={l?.error ? "bad" : l?.syncedAt ? "good" : "neutral"}>{l?.error ? "Error" : l?.syncedAt ? "Connected" : "Not connected"}</Badge>
                    </div>
                    {l?.syncedAt && (
                      <p className="text-muted">
                        {l.items} {unit} · last synced {new Date(l.syncedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}. {detail}
                      </p>
                    )}
                    {l?.error && <p role="alert" className="text-bad">{l.error}</p>}
                    {l?.warnings?.length ? (
                      <details className="text-muted">
                        <summary className="cursor-pointer">{l.warnings.length} metric{l.warnings.length > 1 ? "s" : ""} unavailable</summary>
                        <ul className="mt-1 list-disc pl-5">
                          {l.warnings.map((w) => (
                            <li key={w}>{w}</li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                    {l?.note && <p className="text-muted">{l.note}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <CardHeader title="Connections" hint="Not connected yet" />
          <ul className="space-y-3">
            {CONNECTIONS.map((c) => (
              <li key={c.name} className="flex gap-3 text-sm">
                <CircleDot className="mt-0.5 size-4 shrink-0 text-muted" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 font-medium">
                    {c.name} <Badge>Not connected</Badge>
                  </div>
                  <p className="text-muted">{c.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Import CSV" hint="Meta Business Suite and LinkedIn exports" />
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm hover:bg-surface-2">
            <FileUp className="size-5 text-muted" />
            <span className="font-medium">Choose a CSV file</span>
            <span className="text-xs text-muted">Previewed here only — nothing is imported yet</span>
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          {error && <p role="alert" className="mt-2 text-sm text-bad">{error}</p>}
          {preview && (
            <div className="mt-3">
              <p className="text-sm">
                <span className="font-medium">{preview.name}</span> — {fmtNum(preview.total)} rows, {preview.header.length} columns
              </p>
              <div className="mt-2 overflow-x-auto rounded-lg border border-line">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-surface-2 text-left">
                      {preview.header.map((h, i) => (
                        <th key={i} className="whitespace-nowrap px-2 py-1.5 font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((r, i) => (
                      <tr key={i} className="border-t border-line">
                        {preview.header.map((_, j) => (
                          <td key={j} className="max-w-48 truncate whitespace-nowrap px-2 py-1.5">
                            {r[j]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-muted">Column mapping to the dashboard’s fields will be added once real export files are available.</p>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Monthly targets" hint="Shown as progress on the Overview" />
          <ul className="space-y-2.5">
            {ds.targets.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 text-sm">
                <label htmlFor={t.id}>{t.label}</label>
                <input
                  id={t.id}
                  type="number"
                  min={0}
                  value={t.monthly}
                  onChange={(e) => setTarget(t.id, Math.max(0, Number(e.target.value) || 0))}
                  className="h-9 w-28 rounded-lg border border-line bg-surface px-2.5 text-right tabular"
                />
              </li>
            ))}
          </ul>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Team access & saved changes" />
          <p className="text-sm text-muted">
            Tags, enquiries, notes, campaigns, targets and planned posts you enter are stored in this browser for now. After the shared database and team login are set up (admins edit and import, viewers read), they will be shared with everyone.
          </p>
          <div className="mt-3">
            {hasLocalChanges ? (
              <Button
                onClick={() => {
                  if (confirm("Remove all tags, notes, campaigns, targets and planned posts saved in this browser?")) resetLocalChanges();
                }}
              >
                <Trash2 className="size-4" /> Clear changes saved in this browser
              </Button>
            ) : (
              <Empty>No local changes saved.</Empty>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
