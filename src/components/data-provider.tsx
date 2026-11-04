"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { loadDataset } from "@/lib/data";
import type { Campaign, Dataset, PlannedPost, PostEdit, WebRow } from "@/lib/types";
import { isSocial } from "@/lib/web";

/**
 * Holds the dataset plus the changes marketing makes in the UI (tags, leads,
 * notes, campaigns, targets, planned posts). For now those changes are kept in
 * this browser's localStorage; once the database is connected they are written
 * to it instead, so the whole team shares them.
 */
interface Overlay {
  edits: Record<string, PostEdit>;
  planned: PlannedPost[];
  campaigns: Campaign[];
  targets: Record<string, number>;
}

const EMPTY: Overlay = { edits: {}, planned: [], campaigns: [], targets: {} };
const KEY = "tritorc_dashboard_overlay_v1";
const WEB_KEY = "tritorc_dashboard_web_v1";

interface Ctx {
  ds: Dataset | null;
  updatePost: (id: string, edit: PostEdit) => void;
  planned: PlannedPost[];
  addPlanned: (p: Omit<PlannedPost, "id">) => void;
  removePlanned: (id: string) => void;
  addCampaign: (name: string, product: string) => string;
  setTarget: (id: string, monthly: number) => void;
  resetLocalChanges: () => void;
  hasLocalChanges: boolean;
  /** Merge a GA4 CSV import: its dates replace existing rows for those dates. */
  importWeb: (rows: WebRow[], from: string, to: string) => void;
  clearWebImport: () => void;
  webImported: boolean;
  /** false when the browser refused to store the imported rows (too large) */
  webPersisted: boolean;
  /** Re-read the dataset; `force` also bypasses the server's 10-minute live-data cache. */
  reload: (force?: boolean) => Promise<void>;
  syncing: boolean;
}

const DataCtx = createContext<Ctx | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [base, setBase] = useState<Dataset | null>(null);
  const [overlay, setOverlay] = useState<Overlay>(EMPTY);
  const [ready, setReady] = useState(false);
  const [webOverride, setWebOverride] = useState<WebRow[] | null>(null);
  const [webPersisted, setWebPersisted] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const reload = useCallback(async (force = false) => {
    setSyncing(true);
    try {
      setBase(await loadDataset({ refresh: force }));
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    loadDataset().then((d) => {
      if (!alive) return;
      let saved: Overlay = EMPTY;
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) saved = { ...EMPTY, ...JSON.parse(raw) };
      } catch {
        /* storage unavailable — run without persistence */
      }
      try {
        const rawWeb = localStorage.getItem(WEB_KEY);
        if (rawWeb) setWebOverride(JSON.parse(rawWeb));
      } catch {
        /* ignore */
      }
      setOverlay(saved);
      setBase(d);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  // keep the page fresh while it is open (the server caches live data for 10 minutes)
  useEffect(() => {
    if (!ready) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void reload(false);
    }, 10 * 60 * 1000);
    return () => clearInterval(id);
  }, [ready, reload]);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(overlay));
    } catch {
      /* ignore */
    }
  }, [overlay, ready]);

  const ds = useMemo<Dataset | null>(() => {
    if (!base) return null;
    const web = webOverride ?? base.web;
    // sessions per post come from GA4: social rows whose utm_content is the post ID
    const sessionsByPost = new Map<string, number>();
    for (const r of web) {
      if (r.content && isSocial(r)) sessionsByPost.set(r.content, (sessionsByPost.get(r.content) ?? 0) + r.sessions);
    }
    const posts = base.posts.map((p) => {
      const e = overlay.edits[p.id];
      const q = e ? { ...p, ...e } : p;
      if (webOverride) return { ...q, sessions: sessionsByPost.get(q.id) ?? null };
      return sessionsByPost.has(q.id) ? { ...q, sessions: sessionsByPost.get(q.id)! } : q;
    });
    return {
      ...base,
      web,
      posts,
      campaigns: [...base.campaigns, ...overlay.campaigns],
      targets: base.targets.map((t) =>
        overlay.targets[t.id] != null ? { ...t, monthly: overlay.targets[t.id] } : t,
      ),
    };
  }, [base, overlay, webOverride]);

  const updatePost = useCallback((id: string, edit: PostEdit) => {
    setOverlay((o) => ({ ...o, edits: { ...o.edits, [id]: { ...o.edits[id], ...edit } } }));
  }, []);

  const addPlanned = useCallback((p: Omit<PlannedPost, "id">) => {
    setOverlay((o) => ({ ...o, planned: [...o.planned, { ...p, id: `pl${Date.now()}` }] }));
  }, []);

  const removePlanned = useCallback((id: string) => {
    setOverlay((o) => ({ ...o, planned: o.planned.filter((x) => x.id !== id) }));
  }, []);

  const addCampaign = useCallback((name: string, product: string) => {
    const id = `c${Date.now()}`;
    setOverlay((o) => ({ ...o, campaigns: [...o.campaigns, { id, name, product }] }));
    return id;
  }, []);

  const setTarget = useCallback((id: string, monthly: number) => {
    setOverlay((o) => ({ ...o, targets: { ...o.targets, [id]: monthly } }));
  }, []);

  const resetLocalChanges = useCallback(() => setOverlay(EMPTY), []);

  const importWeb = useCallback(
    (rows: WebRow[], from: string, to: string) => {
      const kept = webOverride ? webOverride.filter((r) => r.date < from || r.date > to) : [];
      const next = [...kept, ...rows];
      setWebOverride(next);
      try {
        localStorage.setItem(WEB_KEY, JSON.stringify(next));
        setWebPersisted(true);
      } catch {
        setWebPersisted(false); // works for this session, lost on reload
      }
    },
    [webOverride],
  );

  const clearWebImport = useCallback(() => {
    setWebOverride(null);
    setWebPersisted(true);
    try {
      localStorage.removeItem(WEB_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const hasLocalChanges =
    Object.keys(overlay.edits).length +
      overlay.planned.length +
      overlay.campaigns.length +
      Object.keys(overlay.targets).length >
    0;

  const value: Ctx = {
    ds,
    updatePost,
    planned: overlay.planned,
    addPlanned,
    removePlanned,
    addCampaign,
    setTarget,
    resetLocalChanges,
    hasLocalChanges,
    importWeb,
    clearWebImport,
    webImported: webOverride != null,
    webPersisted,
    reload,
    syncing,
  };

  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

export function useData() {
  const c = useContext(DataCtx);
  if (!c) throw new Error("useData must be used inside <DataProvider>");
  return c;
}
