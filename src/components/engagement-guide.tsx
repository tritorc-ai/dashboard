import { Info } from "lucide-react";
import { PlatformTag } from "@/components/ui";
import type { Platform } from "@/lib/types";

/**
 * Every platform reports different numbers, so "engagement rate" is calculated
 * differently on each. Keep this in step with `engagementRate()` in lib/metrics.ts.
 */
const DEFINITIONS: { platform: Platform; formula: string; base: string; note: string }[] = [
  {
    platform: "LinkedIn",
    formula: "(reactions + comments + reposts) ÷ impressions",
    base: "Impressions",
    note: "LinkedIn doesn’t report reach, so impressions are the base. Clicks are not counted here (LinkedIn’s own rate includes clicks, so it shows a higher number).",
  },
  {
    platform: "Instagram",
    formula: "(likes + comments + shares + saves) ÷ reach",
    base: "Reach",
    note: "Reach is the number of unique accounts that saw the post.",
  },
  {
    platform: "Facebook",
    formula: "(reactions + comments + shares) ÷ viewers",
    base: "Viewers",
    note: "Meta retired Facebook reach on Oct 31, 2026. Viewers (unique accounts that saw the post) replaces it. Clicks are not counted.",
  },
  {
    platform: "YouTube",
    formula: "(likes + comments) ÷ views",
    base: "Views",
    note: "YouTube gives no reach or shares here, so views are the base. Only shown for videos with live like and comment counts.",
  },
];

export function EngagementGuide({ defaultOpen = false }: { defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group rounded-xl border border-line bg-surface shadow-[var(--shadow)]">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium sm:px-5 [&::-webkit-details-marker]:hidden">
        <Info className="size-4 text-brand" aria-hidden />
        How is engagement calculated?
        <span className="ml-auto text-xs font-normal text-muted group-open:hidden">Show</span>
        <span className="ml-auto hidden text-xs font-normal text-muted group-open:inline">Hide</span>
      </summary>
      <div className="border-t border-line px-4 py-4 sm:px-5">
        <p className="text-sm text-muted">
          Each platform reports different numbers, so engagement rate is worked out slightly differently on each. Compare a platform with its own past results first; comparing across platforms is only a rough guide.
        </p>
        <dl className="mt-3 divide-y divide-line">
          {DEFINITIONS.map((d) => (
            <div key={d.platform} className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr] sm:gap-4">
              <dt>
                <PlatformTag platform={d.platform} />
              </dt>
              <dd className="text-sm">
                <div className="font-medium">{d.formula}</div>
                <p className="mt-0.5 text-muted">{d.note}</p>
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-1 text-xs text-muted">
          <strong className="font-medium text-ink">Engagements</strong> on the Overview means likes + comments + shares + saves, and the rate is shown per post, then averaged.
        </p>
      </div>
    </details>
  );
}
