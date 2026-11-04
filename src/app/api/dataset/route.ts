import { connection } from "next/server";
import { buildDataset } from "@/lib/server/build-dataset";

/**
 * The dashboard dataset: platform exports in /data plus live API data (YouTube).
 * Read on every request. `?refresh=1` bypasses the 10-minute live-data cache ("Sync now").
 */
export async function GET(request: Request) {
  await connection();
  const force = new URL(request.url).searchParams.get("refresh") === "1";
  try {
    const ds = await buildDataset({ force });
    if (!ds) return Response.json({ error: "No export files found in /data" }, { status: 404 });
    return Response.json(ds, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed to build the dataset" }, { status: 500 });
  }
}
