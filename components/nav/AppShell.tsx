"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { cn } from "@/lib/utils";

// ── Bottom nav items ───────────────────────────────────────

const NAV = [
  {
    href: "/home",
    label: "Home",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" />
      </svg>
    ),
  },
  {
    href: "/standings",
    label: "Scores",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    href: "/dashboard",
    label: "Profile",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
];

// No chrome at all — landing page only
const CHROMELESS_PAGES = ["/"];

// Slim Back/Home bar only, no bottom nav (unauthenticated flows)
const LIGHT_NAV_PAGES = ["/login", "/register", "/register-mentor", "/forgot-password", "/reset-password"];

// ── Component ──────────────────────────────────────────────

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const isChromeless = CHROMELESS_PAGES.includes(pathname);
  const isLightNav = LIGHT_NAV_PAGES.includes(pathname);

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  if (isChromeless) {
    return (
      <div className="mx-auto max-w-md min-h-screen bg-background">
        {children}
      </div>
    );
  }

  if (isLightNav) {
    return (
      <div className="mx-auto flex max-w-md min-h-screen flex-col bg-background">
        <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center justify-between border-b border-border bg-background/95 px-2 backdrop-blur">
          <button
            onClick={() => router.back()}
            aria-label="Back"
            className="flex h-9 items-center gap-1 rounded-full px-3 text-sm font-semibold text-muted-foreground transition-colors active:bg-muted"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <Link
            href="/"
            aria-label="Home"
            className="flex h-9 items-center gap-1 rounded-full px-3 text-sm font-semibold text-muted-foreground transition-colors active:bg-muted"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" />
            </svg>
            Home
          </Link>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md min-h-screen flex-col bg-background shadow-xl">
      {/* ── Fixed header ──────────────────────────────── */}
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-border bg-cricket px-4">
        <div className="flex items-center gap-2">
          {/* Back */}
          <button
            onClick={() => router.back()}
            className="flex h-9 w-9 items-center justify-center rounded-full text-white/70 transition-colors active:bg-white/10"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {/* Logo / Title */}
          <Link href="/home" className="text-base font-extrabold text-white tracking-tight">
            Junior 5s
          </Link>
        </div>

        <div className="flex items-center gap-1">
          {/* Admin link */}
          <Link
            href="/admin/settings"
            className="flex h-9 items-center gap-1 rounded-full bg-white/10 px-3 text-xs font-semibold text-white/80 transition-colors active:bg-white/20"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Admin
          </Link>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="flex h-9 w-9 items-center justify-center rounded-full text-white/70 transition-colors active:bg-white/10"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </header>

      {/* ── Scrollable content ────────────────────────── */}
      <main className="flex-1 overflow-y-auto pb-20">
        {children}
      </main>

      {/* ── Fixed bottom nav ──────────────────────────── */}
      <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-md -translate-x-1/2 border-t border-border bg-background">
        <div className="flex items-center justify-around py-1.5">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-xl px-5 py-1.5 text-[11px] font-semibold transition-colors active:scale-95",
                  active
                    ? "text-cricket"
                    : "text-muted-foreground"
                )}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
