"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";

const NO_BACK = ["/", "/dashboard"];

export default function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  const showBack = !NO_BACK.includes(pathname);
  const isHome = pathname === "/" || pathname === "/dashboard";

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-border bg-card/95 px-3 backdrop-blur-lg">
      {/* Left: Back button */}
      <div className="flex items-center gap-1">
        {showBack && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
            className="gap-1 px-2 text-muted-foreground"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </Button>
        )}
        {!isHome && (
          <Link
            href="/dashboard"
            className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" />
            </svg>
            Home
          </Link>
        )}
      </div>

      {/* Right: Logout */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleLogout}
        className="gap-1 px-2 text-muted-foreground"
      >
        Log out
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
      </Button>
    </header>
  );
}
