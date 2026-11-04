"use client";

import { useMemo, useState } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Columns3, Download, Search } from "lucide-react";
import { Badge, Button, Card, Empty, PageHeader, PlatformTag } from "@/components/ui";
import { PageLoading } from "@/components/loading";
import { usePostDrawer } from "@/components/post-drawer";
import { useDashboard } from "@/lib/use-dashboard";
import { downloadCsv, toCsv } from "@/lib/csv";
import { engagementRate, engagements, fmtDate, fmtNum, fmtPct, ymd } from "@/lib/metrics";
import type { Post } from "@/lib/types";

const col = createColumnHelper<Post>();

export default function PostsPage() {
  const { ds, d } = useDashboard();
  const drawer = usePostDrawer();
  const [sorting, setSorting] = useState<SortingState>([{ id: "date", desc: true }]);
  const [search, setSearch] = useState("");
  const [visibility, setVisibility] = useState<VisibilityState>({
    impressions: false,
    saves: false,
    campaign: false,
    objective: false,
  });
  const [colMenu, setColMenu] = useState(false);

  const columns = useMemo(
    () => [
      col.accessor((p) => p.publishedAt, {
        id: "date",
        header: "Date",
        cell: (c) => <span className="whitespace-nowrap">{fmtDate(c.getValue(), { year: "2-digit" })}</span>,
      }),
      col.accessor("platform", { header: "Platform", cell: (c) => <PlatformTag platform={c.getValue()} /> }),
      col.accessor("caption", {
        header: "Post",
        cell: (c) => (
          <div className="flex max-w-[22rem] items-center gap-2">
            <span className="truncate" title={c.getValue()}>
              {c.getValue()}
            </span>
            {c.row.original.paid && <Badge tone="warn">Paid</Badge>}
          </div>
        ),
      }),
      col.accessor("format", { header: "Format", cell: (c) => <Badge>{c.getValue()}</Badge> }),
      col.accessor("category", { header: "Category" }),
      col.accessor("product", { header: "Product" }),
      col.accessor("objective", { header: "Objective" }),
      col.accessor((p) => d?.campaignsById.get(p.campaignId ?? "")?.name ?? "—", { id: "campaign", header: "Campaign" }),
      col.accessor((p) => p.reach ?? undefined, { id: "reach", header: "Reach", sortUndefined: "last", meta: { num: true }, cell: (c) => fmtNum(c.row.original.reach) }),
      col.accessor((p) => p.impressions ?? undefined, { id: "impressions", header: "Impressions", sortUndefined: "last", meta: { num: true }, cell: (c) => fmtNum(c.row.original.impressions) }),
      col.accessor((p) => engagementRate(p) ?? undefined, { id: "er", header: "Eng. rate", sortUndefined: "last", meta: { num: true }, cell: (c) => <span className="font-semibold">{fmtPct(engagementRate(c.row.original))}</span> }),
      col.accessor("likes", { header: "Likes", meta: { num: true }, cell: (c) => fmtNum(c.getValue()) }),
      col.accessor("comments", { header: "Comments", meta: { num: true }, cell: (c) => fmtNum(c.getValue()) }),
      col.accessor("shares", { header: "Shares", meta: { num: true }, cell: (c) => fmtNum(c.getValue()) }),
      col.accessor((p) => p.saves ?? undefined, { id: "saves", header: "Saves", sortUndefined: "last", meta: { num: true }, cell: (c) => fmtNum(c.row.original.saves) }),
      col.accessor((p) => p.clicks ?? undefined, { id: "clicks", header: "Clicks", sortUndefined: "last", meta: { num: true }, cell: (c) => fmtNum(c.row.original.clicks) }),
      col.accessor((p) => p.leads ?? undefined, { id: "leads", header: "Leads", sortUndefined: "last", meta: { num: true }, cell: (c) => fmtNum(c.row.original.leads) }),
    ],
    [d?.campaignsById],
  );

  const data = d?.inPeriod ?? [];
  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnVisibility: visibility, globalFilter: search },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setVisibility,
    onGlobalFilterChange: setSearch,
    globalFilterFn: (row, _id, q: string) => {
      const p = row.original;
      return `${p.caption} ${p.hashtags.join(" ")} ${p.product} ${p.category} ${p.platform} ${p.format}`.toLowerCase().includes(q.toLowerCase());
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
  });

  if (!ds || !d) return <PageLoading />;

  const rows = table.getFilteredRowModel().rows.map((r) => r.original);
  const exportCsv = () =>
    downloadCsv(
      `tritorc-posts-${ymd(new Date())}.csv`,
      toCsv(
        ["Date", "Platform", "Account", "Caption", "Format", "Category", "Product", "Objective", "Campaign", "Paid", "Reach", "Impressions", "Likes", "Comments", "Shares", "Saves", "Clicks", "Engagement rate %", "Enquiries", "Leads"],
        rows.map((p) => [
          p.publishedAt.slice(0, 10),
          p.platform,
          d.accountsById.get(p.accountId)?.name,
          p.caption,
          p.format,
          p.category,
          p.product,
          p.objective,
          d.campaignsById.get(p.campaignId ?? "")?.name,
          p.paid ? "Yes" : "No",
          p.reach,
          p.impressions,
          p.likes,
          p.comments,
          p.shares,
          p.saves,
          p.clicks,
          engagementRate(p)?.toFixed(2),
          p.enquiries,
          p.leads,
        ]),
      ),
    );

  const pg = table.getState().pagination;
  const total = table.getFilteredRowModel().rows.length;

  return (
    <>
      <PageHeader
        title="Posts"
        description="One row per publication in the selected period. Click a row for details, tags, enquiries and notes."
        actions={
          <Button onClick={exportCsv} disabled={!rows.length}>
            <Download className="size-4" /> Export CSV
          </Button>
        }
      />
      <Card className="p-0 sm:p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <div className="relative min-w-52 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search caption, hashtag, product…"
              aria-label="Search posts"
              className="h-9 w-full rounded-lg border border-line bg-surface pl-8 pr-3 text-sm outline-none focus-visible:border-brand"
            />
          </div>
          <div className="relative">
            <Button onClick={() => setColMenu((v) => !v)} aria-expanded={colMenu}>
              <Columns3 className="size-4" /> Columns
            </Button>
            {colMenu && (
              <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-line bg-surface p-2 shadow-lg">
                {table.getAllLeafColumns().map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-surface-2">
                    <input type="checkbox" checked={c.getIsVisible()} onChange={c.getToggleVisibilityHandler()} />
                    {typeof c.columnDef.header === "string" ? c.columnDef.header : c.id}
                  </label>
                ))}
              </div>
            )}
          </div>
          <span className="text-xs text-muted">{total.toLocaleString("en-IN")} posts</span>
        </div>

        {total ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id} className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                    {hg.headers.map((h) => {
                      const num = (h.column.columnDef.meta as { num?: boolean } | undefined)?.num;
                      const dir = h.column.getIsSorted();
                      return (
                        <th key={h.id} className={`whitespace-nowrap px-3 py-2 font-medium ${num ? "text-right" : ""}`} aria-sort={dir ? (dir === "asc" ? "ascending" : "descending") : "none"}>
                          <button className="inline-flex items-center gap-1 uppercase hover:text-ink" onClick={h.column.getToggleSortingHandler()}>
                            {flexRender(h.column.columnDef.header, h.getContext())}
                            {dir === "asc" ? <ArrowUp className="size-3" /> : dir === "desc" ? <ArrowDown className="size-3" /> : null}
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                ))}
              </thead>
              <tbody className="tabular">
                {table.getRowModel().rows.map((r) => (
                  <tr
                    key={r.id}
                    tabIndex={0}
                    onClick={() => drawer.open(r.original.id)}
                    onKeyDown={(e) => e.key === "Enter" && drawer.open(r.original.id)}
                    className="cursor-pointer border-b border-line last:border-0 hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
                  >
                    {r.getVisibleCells().map((c) => {
                      const num = (c.column.columnDef.meta as { num?: boolean } | undefined)?.num;
                      return (
                        <td key={c.id} className={`px-3 py-2.5 ${num ? "text-right" : ""}`}>
                          {flexRender(c.column.columnDef.cell ?? ((x) => String(x.getValue() ?? "")), c.getContext())}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-4">
            <Empty>No posts match these filters.</Empty>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-line p-3 text-sm">
          <span className="text-muted">
            {total ? `${pg.pageIndex * pg.pageSize + 1}–${Math.min(total, (pg.pageIndex + 1) * pg.pageSize)} of ${total.toLocaleString("en-IN")}` : "0 posts"}
          </span>
          <div className="flex gap-1">
            <Button size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label="Previous page">
              <ChevronLeft className="size-4" />
            </Button>
            <Button size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label="Next page">
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </Card>
      <p className="mt-3 text-xs text-muted">
        Engagements = likes + comments + shares + saves. Total engagements in this table: {fmtNum(rows.reduce((s, p) => s + engagements(p), 0))}.
      </p>
    </>
  );
}
