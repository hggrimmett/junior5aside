"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

export default function HomePage() {
  return (
    <div className="px-4 py-5 space-y-4">
      {/* Event banner */}
      <div className="rounded-2xl bg-cricket px-5 py-5 text-white shadow-md">
        <p className="text-xs font-bold uppercase tracking-widest text-white/50">
          Welcome to
        </p>
        <h2 className="mt-1 text-xl font-extrabold tracking-tight">
          Junior 5-a-Side Cricket
        </h2>
      </div>

      <div className="flex flex-col gap-3">
        {/* Competition Dashboard */}
        <Link href="/competitions">
          <Card className="rounded-2xl shadow-md cursor-pointer active:scale-[0.98] transition-transform border-l-[4px] border-l-amber-500">
            <CardContent className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-3">
                <svg className="h-6 w-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <div>
                  <p className="font-extrabold tracking-tight text-foreground leading-tight">
                    Competition Dashboard
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Scores, standings &amp; fixtures
                  </p>
                </div>
              </div>
              <span className="text-sm font-bold text-muted-foreground">→</span>
            </CardContent>
          </Card>
        </Link>

        {/* My Account */}
        <Link href="/dashboard">
          <Card className="rounded-2xl shadow-md cursor-pointer active:scale-[0.98] transition-transform border-l-[4px] border-l-blue-500">
            <CardContent className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-3">
                <svg className="h-6 w-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <div>
                  <p className="font-extrabold tracking-tight text-foreground leading-tight">
                    My Account
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Players, profile &amp; contact details
                  </p>
                </div>
              </div>
              <span className="text-sm font-bold text-muted-foreground">→</span>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
