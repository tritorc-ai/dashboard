import { buildSampleDataset } from "./sample-data";
import type { Dataset } from "./types";

/**
 * Single entry point for loading dashboard data.
 *
 * 1. Real data: /api/dataset builds it from the platform exports in /data.
 *    (When the shared database and API sync are connected, that route reads the
 *    database instead — pages don't change.)
 * 2. If no exports exist, fall back to generated sample data so the app still opens.
 */
export async function loadDataset(opts: { refresh?: boolean } = {}): Promise<Dataset> {
  try {
    const res = await fetch(opts.refresh ? "/api/dataset?refresh=1" : "/api/dataset", { cache: "no-store" });
    if (res.ok) {
      const ds = (await res.json()) as Dataset;
      if (ds?.posts?.length) return ds;
    }
  } catch {
    /* fall through to sample data */
  }
  return buildSampleDataset();
}
