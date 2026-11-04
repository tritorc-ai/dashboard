"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/cn";
import { fmtCompact } from "@/lib/metrics";
import { Empty } from "@/components/ui";

export interface Series {
  key: string;
  label: string;
  color: string;
}

const axisProps = {
  tickLine: false,
  axisLine: false,
  tick: { fontSize: 11 },
} as const;

function TooltipBox({
  active,
  payload,
  label,
  format,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number | null; color?: string }[];
  label?: string;
  format: (n: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-muted">
            <span className="size-2 rounded-full" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="tabular font-medium">{p.value == null ? "N/A" : format(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function TrendChart({
  data,
  series,
  format = fmtCompact,
  height = 240,
  area,
}: {
  data: Record<string, string | number | null>[];
  series: Series[];
  format?: (n: number) => string;
  height?: number;
  area?: boolean;
}) {
  if (!data.length) return <Empty>No data for this selection</Empty>;
  const common = (
    <>
      <CartesianGrid vertical={false} stroke="var(--line)" />
      <XAxis dataKey="label" {...axisProps} minTickGap={24} />
      <YAxis {...axisProps} width={44} tickFormatter={(v) => format(v)} />
      <Tooltip content={<TooltipBox format={format} />} cursor={{ stroke: "var(--line)" }} />
      {series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />}
    </>
  );
  return (
    <div style={{ height }} role="img" aria-label={`Trend chart: ${series.map((s) => s.label).join(", ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        {area ? (
          <AreaChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
            {common}
            {series.map((s) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                fill={s.color}
                fillOpacity={0.12}
                strokeWidth={2}
                connectNulls
              />
            ))}
          </AreaChart>
        ) : (
          <LineChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
            {common}
            {series.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

export function Sparkline({
  values,
  color = "var(--brand)",
  className,
}: {
  values: (number | null)[];
  color?: string;
  className?: string;
}) {
  const data = values.map((v, i) => ({ i, v }));
  if (data.filter((d) => d.v != null).length < 2) return <div className={cn("h-9", className)} />;
  return (
    <div className={cn("h-9", className)} aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Area type="monotone" dataKey="v" stroke={color} fill={color} fillOpacity={0.14} strokeWidth={1.75} connectNulls isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Donut({
  data,
  format = fmtCompact,
}: {
  data: { name: string; value: number; color: string }[];
  format?: (n: number) => string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return <Empty>No data for this selection</Empty>;
  return (
    <div className="flex items-center gap-5">
      <div className="size-36 shrink-0" role="img" aria-label="Share by platform">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="100%" paddingAngle={2} stroke="none">
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
            <Tooltip content={<TooltipBox format={format} />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="min-w-0 flex-1 space-y-2.5 text-sm">
        {data.map((d) => (
          <li key={d.name}>
            <span className="inline-flex items-center gap-2 font-medium">
              <span className="size-2.5 rounded-full" style={{ background: d.color }} />
              {d.name}
            </span>
            <div className="tabular pl-[18px] text-xs text-muted">
              {format(d.value)} · {Math.round((d.value / total) * 100)}%
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ColumnChart({
  data,
  dataKey,
  color = "var(--brand)",
  format = fmtCompact,
  height = 220,
}: {
  data: Record<string, string | number | null>[];
  dataKey: string;
  color?: string;
  format?: (n: number) => string;
  height?: number;
}) {
  if (!data.length) return <Empty>No data for this selection</Empty>;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="label" {...axisProps} minTickGap={16} />
          <YAxis {...axisProps} width={44} tickFormatter={(v) => format(v)} />
          <Tooltip content={<TooltipBox format={format} />} cursor={{ fill: "var(--surface-2)" }} />
          <Bar dataKey={dataKey} name={dataKey} fill={color} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PostsVsRateChart({
  data,
  height = 240,
}: {
  data: { label: string; posts: number; rate: number | null }[];
  height?: number;
}) {
  if (!data.length) return <Empty>No data for this selection</Empty>;
  return (
    <div style={{ height }} role="img" aria-label="Posts published versus engagement rate">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ left: 0, right: 0, top: 8 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="label" {...axisProps} minTickGap={24} />
          <YAxis yAxisId="l" {...axisProps} width={32} />
          <YAxis yAxisId="r" orientation="right" {...axisProps} width={40} tickFormatter={(v) => `${v}%`} />
          <Tooltip
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg">
                  <div className="mb-1 font-medium">{label}</div>
                  <div>Posts: {payload[0]?.payload.posts}</div>
                  <div>Avg engagement rate: {payload[0]?.payload.rate == null ? "N/A" : `${payload[0].payload.rate.toFixed(2)}%`}</div>
                </div>
              ) : null
            }
          />
          <Bar yAxisId="l" dataKey="posts" name="Posts" fill="var(--surface-2)" stroke="var(--line)" radius={[4, 4, 0, 0]} />
          <Line yAxisId="r" dataKey="rate" name="Engagement rate" stroke="var(--brand)" strokeWidth={2} dot={false} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Day-of-week × hour grid coloured by a value (e.g. average engagement rate). */
export function Heatmap({
  cells,
  format,
}: {
  cells: { day: number; hour: number; value: number | null; n: number }[];
  format: (n: number) => string;
}) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const hours = Array.from({ length: 11 }, (_, i) => 8 + i);
  const vals = cells.filter((c) => c.value != null).map((c) => c.value as number);
  if (!vals.length) return <Empty>No data for this selection</Empty>;
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const get = (day: number, hour: number) => cells.find((c) => c.day === day && c.hour === hour);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] border-separate border-spacing-1 text-xs" aria-label="Best day and hour to post">
        <thead>
          <tr>
            <th />
            {hours.map((h) => (
              <th key={h} className="font-normal text-muted">
                {h}:00
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((d, di) => (
            <tr key={d}>
              <th className="pr-1 text-left font-normal text-muted">{d}</th>
              {hours.map((h) => {
                const c = get(di, h);
                const t = c?.value == null ? 0 : max === min ? 0.6 : (c.value - min) / (max - min);
                return (
                  <td
                    key={h}
                    title={c?.value == null ? "No posts" : `${d} ${h}:00 — ${format(c.value)} (${c.n} posts)`}
                    className="h-7 rounded text-center tabular"
                    style={{
                      background: c?.value == null ? "var(--surface-2)" : `color-mix(in srgb, var(--brand) ${Math.round(15 + t * 75)}%, var(--surface))`,
                      color: t > 0.6 ? "#fff" : "var(--text)",
                    }}
                  >
                    {c?.value == null ? "" : format(c.value)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted">Darker = higher. Based on posts in the selected period; hover for the post count.</p>
    </div>
  );
}
