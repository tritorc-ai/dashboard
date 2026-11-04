"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useData } from "@/components/data-provider";
import {
  accountIdsFor,
  DEFAULT_FILTERS,
  filtersToParams,
  getRange,
  inRange,
  matchesFilters,
  parseFilters,
  type Filters,
} from "./filters";
import { indexFollowers, startOfDay } from "./metrics";
import { prevCovered } from "./analytics";

/**
 * Everything a page needs: the URL-synced filters, the posts that match them
 * for the current and previous period, and helpers to look things up.
 */
export function useDashboard() {
  const { ds, ...actions } = useData();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const spKey = sp.toString();

  const filters = useMemo(() => parseFilters(new URLSearchParams(spKey)), [spKey]);

  const setFilters = useCallback(
    (patch: Partial<Filters>) => {
      const next = { ...filters, ...patch };
      // switching platform invalidates a now-hidden account
      if (patch.platform && patch.account == null) next.account = "all";
      const params = filtersToParams(next, new URLSearchParams(spKey));
      const q = params.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [filters, pathname, router, spKey],
  );

  const derived = useMemo(() => {
    if (!ds) return null;
    const today = startOfDay(new Date());
    const earliest = ds.posts.length ? startOfDay(new Date(ds.posts[0].publishedAt)) : today;
    const range = getRange(filters, today, earliest);
    const accountIds = accountIdsFor(ds, filters);
    const idSet = new Set(accountIds);
    const matching = ds.posts.filter((p) => matchesFilters(p, filters, idSet));
    const current = matching.filter((p) => inRange(p, range.from, range.to));
    const previous = filters.days
      ? matching.filter((p) => inRange(p, range.prevFrom, range.prevTo))
      : [];
    const followerIndex = indexFollowers(ds);
    const accountsById = new Map(ds.accounts.map((a) => [a.id, a]));
    const campaignsById = new Map(ds.campaigns.map((c) => [c.id, c]));
    return {
      today,
      range,
      accountIds,
      matching,
      inPeriod: current,
      prevPeriod: previous,
      prevAvailable: filters.days > 0 && prevCovered(ds, accountIds, range.prevFrom),
      followerIndex,
      accountsById,
      campaignsById,
    };
  }, [ds, filters]);

  return {
    ds,
    ...actions,
    filters,
    setFilters,
    resetFilters: () => setFilters(DEFAULT_FILTERS),
    d: derived,
  };
}
