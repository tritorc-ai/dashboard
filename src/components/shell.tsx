"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import {
  BarChart3,
  CalendarDays,
  FileText,
  Globe,
  Layers,
  LayoutDashboard,
  Lightbulb,
  Megaphone,
  Menu,
  Moon,
  RotateCcw,
  Settings,
  Sun,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Button, Select } from "@/components/ui";
import { PostDrawerProvider } from "@/components/post-drawer";
import { useDashboard } from "@/lib/use-dashboard";
import { DEFAULT_FILTERS, RANGE_OPTIONS } from "@/lib/filters";
import { PLATFORMS } from "@/lib/types";

const NAV = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/platforms", label: "Platforms", icon: Layers },
  { href: "/audience", label: "Audience", icon: Users },
  { href: "/posts", label: "Posts", icon: FileText },
  { href: "/insights", label: "Content insights", icon: Lightbulb },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/website", label: "Website (GA4)", icon: Globe },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings & imports", icon: Settings },
];

const subscribeTheme = (cb: () => void) => {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => obs.disconnect();
};

function useTheme() {
  // the <html> class is the source of truth (set before paint by the script in layout.tsx)
  const dark = useSyncExternalStore(
    subscribeTheme,
    () => document.documentElement.classList.contains("dark"),
    () => false,
  );
  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("tritorc_theme", next ? "dark" : "light");
    } catch {
      /* ignore */
    }
  };
  return { dark, toggle };
}

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  // carry the current filters between pages so a shared view stays consistent
  const { filters } = useDashboard();
  const qs = new URLSearchParams();
  if (filters.days !== DEFAULT_FILTERS.days) qs.set("days", String(filters.days));
  if (filters.platform !== "all") qs.set("platform", filters.platform);
  if (filters.account !== "all") qs.set("account", filters.account);
  if (filters.campaign !== "all") qs.set("campaign", filters.campaign);
  if (filters.paid !== DEFAULT_FILTERS.paid) qs.set("paid", filters.paid);
  const q = qs.toString();

  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5 px-3">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = path === href;
        return (
          <Link
            key={href}
            href={q ? `${href}?${q}` : href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-brand-soft text-brand" : "text-muted hover:bg-surface-2 hover:text-ink",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="px-6 pb-5 pt-6">
      <Image src="/brand/tritorc-logo.png" alt="TRITORC" width={120} height={16} priority />
      <p className="mt-2 text-xs text-muted">Social media analytics</p>
    </div>
  );
}

function FilterBar() {
  const { ds, filters, setFilters, resetFilters } = useDashboard();
  const accounts = ds?.accounts.filter((a) => filters.platform === "all" || a.platform === filters.platform) ?? [];
  const dirty = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);

  return (
    <div className="flex flex-wrap items-center gap-2" role="search" aria-label="Dashboard filters">
      <Select aria-label="Date range" value={filters.days} onChange={(e) => setFilters({ days: Number(e.target.value) })}>
        {RANGE_OPTIONS.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </Select>
      <Select aria-label="Platform" value={filters.platform} onChange={(e) => setFilters({ platform: e.target.value as typeof filters.platform })}>
        <option value="all">All platforms</option>
        {PLATFORMS.map((p) => (
          <option key={p}>{p}</option>
        ))}
      </Select>
      <Select aria-label="Account" value={filters.account} onChange={(e) => setFilters({ account: e.target.value })}>
        <option value="all">All accounts</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} · {a.platform}
          </option>
        ))}
      </Select>
      <Select aria-label="Campaign" value={filters.campaign} onChange={(e) => setFilters({ campaign: e.target.value })}>
        <option value="all">All campaigns</option>
        <option value="none">No campaign</option>
        {ds?.campaigns.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      <Select aria-label="Paid or organic" value={filters.paid} onChange={(e) => setFilters({ paid: e.target.value as typeof filters.paid })}>
        <option value="organic">Organic only</option>
        <option value="paid">Paid only</option>
        <option value="all">Organic + paid</option>
      </Select>
      {dirty && (
        <Button variant="ghost" size="sm" onClick={resetFilters} title="Reset filters">
          <RotateCcw className="size-3.5" /> Reset
        </Button>
      )}
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState(false);
  const { dark, toggle } = useTheme();
  const { ds } = useDashboard();
  const path = usePathname();
  const hideFilters = path === "/settings";

  return (
    <PostDrawerProvider>
      <div className="min-h-screen lg:grid lg:grid-cols-[15rem_1fr]">
        {/* desktop sidebar */}
        <aside className="no-print sticky top-0 hidden h-screen flex-col border-r border-line bg-surface lg:flex">
          <Brand />
          <Nav />
          <div className="mt-auto p-4 text-xs text-muted">
            {ds?.source === "sample" && (
              <span className="rounded-md bg-warn/15 px-2 py-1 font-medium text-warn">Sample data</span>
            )}
            {ds?.source === "exports" && (
              <span className="rounded-md bg-good/15 px-2 py-1 font-medium text-good">Real data · exports</span>
            )}
          </div>
        </aside>

        {/* mobile menu */}
        {menu && (
          <div className="no-print fixed inset-0 z-40 lg:hidden">
            <button aria-label="Close menu" className="absolute inset-0 bg-black/40" onClick={() => setMenu(false)} />
            <div className="relative h-full w-64 bg-surface shadow-xl">
              <button aria-label="Close menu" className="absolute right-3 top-3 p-1 text-muted" onClick={() => setMenu(false)}>
                <X className="size-5" />
              </button>
              <Brand />
              <Nav onNavigate={() => setMenu(false)} />
            </div>
          </div>
        )}

        <div className="min-w-0">
          <header className="no-print sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
            <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
              <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setMenu(true)} aria-label="Open menu">
                <Menu className="size-4" />
              </Button>
              <div className="min-w-0 flex-1">{!hideFilters && <FilterBar />}</div>
              <Button variant="outline" size="sm" onClick={toggle} aria-label="Toggle dark mode" title="Toggle theme">
                {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </Button>
            </div>
          </header>
          <main className="print-page mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6">{children}</main>
        </div>
      </div>
    </PostDrawerProvider>
  );
}
