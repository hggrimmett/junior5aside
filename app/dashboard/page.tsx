"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import {
  Card,
  CardContent,
} from "@/components/ui/card";

interface Tournament {
  id: string;
  name: string;
  colour: "Green" | "Red" | "Blue";
}

const COLOUR_STYLE: Record<
  string,
  { border: string; badge: string; years: string; dot: string }
> = {
  Green: {
    border: "border-l-[4px] border-l-green-500",
    badge:  "bg-green-100 text-green-800",
    years:  "Y3 / Y4",
    dot:    "bg-green-500",
  },
  Red: {
    border: "border-l-[4px] border-l-red-500",
    badge:  "bg-red-100 text-red-800",
    years:  "Y5 / Y6",
    dot:    "bg-red-500",
  },
  Blue: {
    border: "border-l-[4px] border-l-blue-500",
    badge:  "bg-blue-100 text-blue-800",
    years:  "Y7 / Y8",
    dot:    "bg-blue-500",
  },
};

export default function DashboardPage() {
  const supabase = getSupabaseBrowserClient();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("tournaments")
      .select("id, name, colour")
      .returns<Tournament[]>()
      .then(({ data }) => {
        setTournaments(data ?? []);
        setLoading(false);
      });
  }, [supabase]);

  return (
    <div className="px-4 py-5 space-y-5">
      {/* Section title */}
      <h2 className="text-xl font-extrabold tracking-tight text-foreground">
        Competitions
      </h2>

      {/* Tournament cards */}
      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <svg
            className="h-6 w-6 animate-spin text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        </div>
      ) : tournaments.length === 0 ? (
        <Card className="rounded-2xl shadow-md">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No competitions have been created yet.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {tournaments.map((t) => {
            const style = COLOUR_STYLE[t.colour] ?? COLOUR_STYLE.Green;
            return (
              <Link key={t.id} href={`/standings?tab=${t.colour}`}>
                <Card
                  className={`
                    rounded-2xl shadow-md overflow-hidden cursor-pointer
                    active:scale-[0.98] transition-transform
                    ${style.border}
                  `}
                >
                  <CardContent className="flex items-center justify-between px-5 py-4">
                    <div className="flex items-center gap-3">
                      <span
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${style.dot}`}
                      />
                      <div>
                        <p className="font-extrabold tracking-tight text-foreground leading-tight">
                          {t.name}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {style.years}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-muted-foreground">
                      View →
                    </span>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {/* Quick-link tiles */}
      <div className="grid grid-cols-2 gap-3 pt-1">
        <Link href="/profile">
          <Card className="rounded-2xl shadow-md cursor-pointer active:scale-[0.98] transition-transform">
            <CardContent className="flex flex-col items-center justify-center gap-2 py-5 px-4 h-12 min-h-[5rem]">
              <svg
                className="h-6 w-6 text-muted-foreground"
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
              <span className="text-sm font-extrabold tracking-tight">
                My Profile
              </span>
            </CardContent>
          </Card>
        </Link>

        <Link href="/standings">
          <Card className="rounded-2xl shadow-md cursor-pointer active:scale-[0.98] transition-transform">
            <CardContent className="flex flex-col items-center justify-center gap-2 py-5 px-4 h-12 min-h-[5rem]">
              <svg
                className="h-6 w-6 text-muted-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.75}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
              <span className="text-sm font-extrabold tracking-tight">
                All Standings
              </span>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
