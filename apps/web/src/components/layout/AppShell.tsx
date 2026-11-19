"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Coffee,
  Compass,
  GitCompareArrows,
  MapPin,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";

import { usePlatform } from "@/components/layout/PlatformContext";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Home", shortLabel: "Home", icon: Sparkles },
  { href: "/explore", label: "Explore Market", shortLabel: "Explore", icon: Compass },
  { href: "/discover", label: "Discover Locations", shortLabel: "Discover", icon: SlidersHorizontal },
  { href: "/compare", label: "Compare", shortLabel: "Compare", icon: GitCompareArrows },
  { href: "/methodology", label: "Methodology", shortLabel: "Method", icon: BookOpen },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const {
    connectionState,
    metadata,
    selectedCitySlug,
    selectedCategorySlug,
    setSelectedCitySlug,
    setSelectedCategorySlug,
    refreshConnection,
  } = usePlatform();

  const cities = metadata?.cities ?? [
    { slug: "hyderabad", name: "Hyderabad", state: "Telangana" },
  ];
  const categories = metadata?.categories ?? [
    { slug: "cafes-coffee-shops", name: "Cafes & Coffee Shops" },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink-primary overflow-x-hidden">
      {/* Top editorial navigation bar */}
      <header className="sticky top-0 z-30 border-b border-borderSubtle bg-canvas/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between gap-2 px-3 sm:gap-4 sm:px-6">
          {/* Brand + Primary Nav */}
          <div className="flex items-center gap-2 sm:gap-6 min-w-0">
            <Link href="/" className="flex shrink-0 items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cobalt text-xs font-bold tracking-tight text-white">
                In
              </span>
              <div className="leading-none hidden md:block">
                <span className="block text-sm font-semibold tracking-tight text-ink-primary">
                  Intelis
                </span>
                <span className="text-[11px] text-ink-secondary">
                  The Market, Understood.
                </span>
              </div>
            </Link>

            <nav
              aria-label="Primary navigation"
              className="flex items-center gap-0.5 sm:gap-1 overflow-x-auto scrollbar-none py-1"
            >
              {NAV_ITEMS.map(({ href, label, shortLabel, icon: Icon }) => {
                const isActive =
                  href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1 rounded-lg px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium transition-colors",
                      isActive
                        ? "bg-cobalt-soft text-cobalt"
                        : "text-ink-secondary hover:bg-surface hover:text-ink-primary"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                    <span className="hidden lg:inline">{label}</span>
                    <span className="lg:hidden">{shortLabel}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right Context Controls: City, Category & API Status */}
          <div className="flex shrink-0 items-center gap-2">
            <div className="hidden items-center gap-2 xl:flex">
              <label className="flex items-center gap-1.5 rounded-lg border border-borderSubtle bg-elevated px-2.5 py-1 text-xs text-ink-secondary">
                <MapPin className="h-3.5 w-3.5 text-coral" />
                <select
                  aria-label="Select city"
                  value={selectedCitySlug}
                  onChange={(e) => setSelectedCitySlug(e.target.value)}
                  className="bg-transparent font-medium text-ink-primary focus:outline-none"
                >
                  {cities.map((city) => (
                    <option key={city.slug} value={city.slug}>
                      {city.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-1.5 rounded-lg border border-borderSubtle bg-elevated px-2.5 py-1 text-xs text-ink-secondary">
                <Coffee className="h-3.5 w-3.5 text-orange" />
                <select
                  aria-label="Select business category"
                  value={selectedCategorySlug}
                  onChange={(e) => setSelectedCategorySlug(e.target.value)}
                  className="bg-transparent font-medium text-ink-primary focus:outline-none"
                >
                  {categories.map((cat) => (
                    <option key={cat.slug} value={cat.slug}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* Live Backend Connection Status */}
            <button
              type="button"
              onClick={refreshConnection}
              title="Check FastAPI backend connection"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2 sm:px-2.5 py-1 text-xs font-medium transition-colors shrink-0",
                connectionState === "connected" &&
                  "border-emeraldBrand/25 bg-emeraldBrand-soft text-emeraldBrand",
                connectionState === "checking" &&
                  "border-borderSubtle bg-surface text-ink-secondary",
                connectionState === "offline" &&
                  "border-coral/30 bg-coral-soft text-coral hover:bg-coral-soft/80"
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  connectionState === "connected" && "bg-emeraldBrand",
                  connectionState === "checking" &&
                    "animate-pulse bg-ink-muted",
                  connectionState === "offline" && "bg-coral"
                )}
              />
              <span className="hidden sm:inline">
                {connectionState === "connected" && "API Connected"}
                {connectionState === "checking" && "Checking"}
                {connectionState === "offline" && "Offline"}
              </span>
              {connectionState === "offline" && (
                <RefreshCw className="h-3 w-3" />
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
