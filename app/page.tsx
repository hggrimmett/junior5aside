import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

// ── Icons ──────────────────────────────────────────────────

function ClipboardIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-6 w-6"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
      />
    </svg>
  );
}

function TableIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-6 w-6"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 10h18M3 14h18M10 4v16M3 4h18a1 1 0 011 1v14a1 1 0 01-1 1H3a1 1 0 01-1-1V5a1 1 0 011-1z"
      />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-6 w-6"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
      />
    </svg>
  );
}

function CricketBallIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-10 w-10 opacity-80"
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <circle cx="32" cy="32" r="28" strokeWidth={2} />
      {/* seam arcs */}
      <path d="M18 10 Q32 28 18 54" strokeLinecap="round" fill="none" />
      <path d="M46 10 Q32 28 46 54" strokeLinecap="round" fill="none" />
      <path d="M10 20 Q28 32 10 44" strokeLinecap="round" fill="none" />
      <path d="M54 20 Q36 32 54 44" strokeLinecap="round" fill="none" />
    </svg>
  );
}

// ── Page ───────────────────────────────────────────────────

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* ── Hero ────────────────────────────────────────── */}
      <header
        className="relative flex flex-col items-center justify-center px-6 py-20 text-center"
        style={{
          background:
            "linear-gradient(135deg, var(--cricket) 0%, var(--midnight) 100%)",
        }}
      >
        {/* subtle radial glow */}
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            background:
              "radial-gradient(ellipse 60% 50% at 50% 0%, white, transparent)",
          }}
        />

        <div className="relative z-10 flex flex-col items-center gap-5">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/10 text-white ring-2 ring-white/20">
            <CricketBallIcon />
          </div>

          <div>
            <p className="mb-1 text-sm font-semibold uppercase tracking-widest text-white/60">
              Youth Cricket Tournament
            </p>
            <h1 className="text-4xl font-black tracking-tight text-white sm:text-5xl">
              Junior 5-a-Side
            </h1>
          </div>

          <Separator className="w-16 bg-white/20" />

          <p className="max-w-xs text-sm leading-relaxed text-white/70">
            Register your team, track standings, and manage your profile — all
            in one place.
          </p>
        </div>
      </header>

      {/* ── Action cards ────────────────────────────────── */}
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-12">
        <div className="grid gap-4">
          {/* Register */}
          <Card className="bg-card shadow-sm transition-shadow hover:shadow-md">
            <CardHeader className="flex flex-row items-center gap-4 pb-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cricket text-cricket-foreground">
                <ClipboardIcon />
              </div>
              <div className="flex-1">
                <CardTitle className="text-base font-bold">Register</CardTitle>
                <CardDescription className="text-sm">
                  Sign up as a parent or mentor to join the tournament.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <Link href="/register" className="inline-flex h-11 w-full items-center justify-center rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90">
                Register Now
              </Link>
            </CardContent>
          </Card>

          {/* View Standings */}
          <Card className="bg-card shadow-sm transition-shadow hover:shadow-md">
            <CardHeader className="flex flex-row items-center gap-4 pb-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-midnight text-midnight-foreground">
                <TableIcon />
              </div>
              <div className="flex-1">
                <CardTitle className="text-base font-bold">
                  View Standings
                </CardTitle>
                <CardDescription className="text-sm">
                  Check the current league table and match results.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <Link href="/standings" className="inline-flex h-11 w-full items-center justify-center rounded-md border border-input bg-background px-8 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground">
                View Standings
              </Link>
            </CardContent>
          </Card>

          {/* My Profile */}
          <Card className="bg-card shadow-sm transition-shadow hover:shadow-md">
            <CardHeader className="flex flex-row items-center gap-4 pb-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                <UserIcon />
              </div>
              <div className="flex-1">
                <CardTitle className="text-base font-bold">
                  My Profile
                </CardTitle>
                <CardDescription className="text-sm">
                  View and update your account details and player roster.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <Link href="/profile" className="inline-flex h-11 w-full items-center justify-center rounded-md border border-input bg-background px-8 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground">
                Go to Profile
              </Link>
            </CardContent>
          </Card>
          {/* Sign In */}
          <Card className="bg-card shadow-sm transition-shadow hover:shadow-md">
            <CardHeader className="flex flex-row items-center gap-4 pb-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cricket/10 text-cricket">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                </svg>
              </div>
              <div className="flex-1">
                <CardTitle className="text-base font-bold">Sign In</CardTitle>
                <CardDescription className="text-sm">
                  Already registered? Sign in to your account.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <Link href="/login" className="inline-flex h-11 w-full items-center justify-center rounded-md border border-input bg-background px-8 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground">
                Sign In
              </Link>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* ── Footer ──────────────────────────────────────── */}
      <footer className="py-6 text-center text-xs text-muted-foreground">
        Junior 5-a-Side &mdash; Youth Cricket Tournament
      </footer>
    </div>
  );
}
