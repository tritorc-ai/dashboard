"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { Badge, Button, Drawer, PlatformTag, Select } from "@/components/ui";
import { useData } from "@/components/data-provider";
import { CATEGORIES, OBJECTIVES, PRODUCTS } from "@/lib/sample-data";
import {
  avg,
  engagementRate,
  engagements,
  fmtDate,
  fmtNum,
  fmtPct,
} from "@/lib/metrics";

const Ctx = createContext<{ open: (id: string) => void } | null>(null);

export function usePostDrawer() {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePostDrawer needs <PostDrawerProvider>");
  return c;
}

export function PostDrawerProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState<string | null>(null);
  const open = useCallback((x: string) => setId(x), []);
  const value = useMemo(() => ({ open }), [open]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <PostPanel id={id} onClose={() => setId(null)} />
    </Ctx.Provider>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className="tabular mt-0.5 text-lg font-semibold">{value}</div>
    </div>
  );
}

function PostPanel({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { ds, updatePost } = useData();
  const post = ds?.posts.find((p) => p.id === id);

  const stats = useMemo(() => {
    if (!ds || !post) return null;
    const same = ds.posts.filter((p) => p.accountId === post.accountId);
    return { avgEr: avg(same, engagementRate), avgReach: avg(same, (p) => p.reach), n: same.length };
  }, [ds, post]);

  const er = post ? engagementRate(post) : null;
  const vsAvg = er != null && stats?.avgEr ? (er / stats.avgEr - 1) * 100 : null;
  const account = ds?.accounts.find((a) => a.id === post?.accountId);

  const num = (v: string) => (v === "" ? null : Math.max(0, Number(v)));

  return (
    <Drawer open={!!post} onClose={onClose} title="Post details">
      {post && ds && (
        <div className="space-y-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <PlatformTag platform={post.platform} />
              <span className="text-sm text-muted">{account?.name}</span>
              <Badge>{post.format}</Badge>
              {post.paid && <Badge tone="warn">Paid</Badge>}
            </div>
            <p className="mt-2 text-base font-medium leading-snug">{post.caption}</p>
            <p className="mt-1 text-xs text-muted">
              Published {fmtDate(post.publishedAt)} ·{" "}
              {new Date(post.publishedAt).toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "UTC",
              })}{" "}
              UTC
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {post.hashtags.map((h) => (
                <Badge key={h}>{h}</Badge>
              ))}
            </div>
            {post.url && post.url !== "#" && (
              <a
                href={post.url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-sm text-brand hover:underline"
              >
                Open original post <ExternalLink className="size-3.5" />
              </a>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <Metric label="Reach" value={fmtNum(post.reach)} />
            <Metric label="Impressions" value={fmtNum(post.impressions)} />
            <Metric label="Eng. rate" value={fmtPct(er)} />
            <Metric label="Likes" value={fmtNum(post.likes)} />
            <Metric label="Comments" value={fmtNum(post.comments)} />
            <Metric label="Shares" value={fmtNum(post.shares)} />
            <Metric label="Saves" value={fmtNum(post.saves)} />
            <Metric label="Link clicks" value={fmtNum(post.clicks)} />
            <Metric label="Video views" value={fmtNum(post.videoViews)} />
            {post.platform === "YouTube" && (
              <>
                <Metric label="Watch hours" value={post.watchHours == null ? "N/A" : post.watchHours.toFixed(1)} />
                <Metric label="Subscribers gained" value={fmtNum(post.subscribersGained ?? null)} />
              </>
            )}
          </div>
          {post.platform === "Facebook" && (
            <p className="-mt-2 text-xs text-muted">Facebook “Reach” is the viewers count — Meta retired Facebook reach on Oct 31, 2026.</p>
          )}
          {post.platform === "LinkedIn" && (
            <p className="-mt-2 text-xs text-muted">LinkedIn doesn’t report reach, so engagement rate uses impressions. Only the post date is exported, not the time.</p>
          )}
          {post.platform === "YouTube" && (
            <p className="-mt-2 text-xs text-muted">Lifetime numbers since publishing. Engagement rate is (likes + comments) ÷ views, with live counts from the YouTube API.</p>
          )}

          <div className="rounded-lg border border-line bg-surface p-3 text-sm">
            <div className="font-medium">Versus this account’s average</div>
            <p className="mt-1 text-muted">
              {vsAvg == null
                ? "Not enough data to compare."
                : `Engagement rate is ${Math.abs(vsAvg).toFixed(0)}% ${vsAvg >= 0 ? "above" : "below"} the ${
                    account?.name
                  } average of ${fmtPct(stats?.avgEr ?? null)} (${stats?.n} posts).`}
            </p>
            <p className="mt-1 text-xs text-muted">
              Total engagements: {fmtNum(engagements(post))}
            </p>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Tags &amp; outcomes</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <label className="space-y-1">
                <span className="text-xs text-muted">Product</span>
                <Select className="w-full" value={post.product} onChange={(e) => updatePost(post.id, { product: e.target.value })}>
                  {PRODUCTS.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted">Category</span>
                <Select className="w-full" value={post.category} onChange={(e) => updatePost(post.id, { category: e.target.value })}>
                  {CATEGORIES.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted">Objective</span>
                <Select
                  className="w-full"
                  value={post.objective}
                  onChange={(e) => updatePost(post.id, { objective: e.target.value as typeof post.objective })}
                >
                  {OBJECTIVES.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted">Campaign</span>
                <Select
                  className="w-full"
                  value={post.campaignId ?? ""}
                  onChange={(e) => updatePost(post.id, { campaignId: e.target.value || null })}
                >
                  <option value="">None</option>
                  {ds.campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted">Enquiries</span>
                <input
                  type="number"
                  min={0}
                  className="h-9 w-full rounded-lg border border-line bg-surface px-2.5"
                  value={post.enquiries ?? ""}
                  placeholder="N/A"
                  onChange={(e) => updatePost(post.id, { enquiries: num(e.target.value) })}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted">Qualified leads</span>
                <input
                  type="number"
                  min={0}
                  className="h-9 w-full rounded-lg border border-line bg-surface px-2.5"
                  value={post.leads ?? ""}
                  placeholder="N/A"
                  onChange={(e) => updatePost(post.id, { leads: num(e.target.value) })}
                />
              </label>
            </div>
            <label className="block space-y-1 text-sm">
              <span className="text-xs text-muted">Notes</span>
              <textarea
                rows={3}
                className="w-full rounded-lg border border-line bg-surface p-2.5"
                value={post.notes}
                placeholder="What worked, what to repeat…"
                onChange={(e) => updatePost(post.id, { notes: e.target.value })}
              />
            </label>
            <p className="text-xs text-muted">
              Changes are saved in this browser for now. They will be shared with the team once the database is connected.
            </p>
          </div>
          <Button onClick={onClose} className="w-full">
            Done
          </Button>
        </div>
      )}
    </Drawer>
  );
}
