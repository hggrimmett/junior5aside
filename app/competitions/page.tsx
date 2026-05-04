"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { Card, CardContent } from "@/components/ui/card";

interface Tournament {
  id: string;
  name: string;
  colour: "Green" | "Red" | "Blue";
}

const COLOUR_STYLE: Record<string, { border: string; dot: string; years: string }> = {
  Green: { border: "border-l-[4px] border-l-green-500", dot: "bg-green-500", years: "Y3 / Y4" },
  Red:   { border: "border-l-[4px] border-l-red-500",   dot: "bg-red-500",   years: "Y5 / Y6" },
  Blue:  { border: "border-l-[4px] border-l-blue-500",  dot: "bg-blue-500",  years: "Y7 / Y8" },
};

export default function CompetitionsPage() {
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
    <div className="px-4 py-5 space-y-4">
      <h2 className="text-xl font-extrabold tracking-tight text-foreground">
        Competitions
      </h2>

      {/* Fixtures & Schedule link */}
      <Link href="/fixtures">
        <Card className="rounded-2xl shadow-md cursor-pointer active:scale-[0.98] transition-transform border-l-[4px] border-l-cricket">
          <CardContent className="flex items-center justify-between px-5 py-4">
            <div className="flex items-center gap-3">
              <svg className="h-6 w-6 text-cricket" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <div>
                <p className="font-extrabold tracking-tight text-foreground leading-tight">
                  Fixtures &amp; Schedule
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  All matches by pitch
                </p>
              </div>
            </div>
            <span className="text-sm font-bold text-muted-foreground">→</span>
          </CardContent>
        </Card>
      </Link>

      {/* All standings link */}
      <Link href="/standings">
        <Card className="rounded-2xl shadow-md cursor-pointer active:scale-[0.98] transition-transform border-l-[4px] border-l-cricket">
          <CardContent className="flex items-center justify-between px-5 py-4">
            <div className="flex items-center gap-3">
              <svg className="h-6 w-6 text-cricket" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <div>
                <p className="font-extrabold tracking-tight text-foreground leading-tight">
                  Live Scores &amp; Standings
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  All age groups
                </p>
              </div>
            </div>
            <span className="text-sm font-bold text-muted-foreground">→</span>
          </CardContent>
        </Card>
      </Link>

      {/* Tournament tiles */}
      <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground pt-1">
        Age Groups
      </h3>

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <svg className="h-6 w-6 animate-spin text-muted-foreground" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : tournaments.length === 0 ? (
        <Card className="rounded-2xl shadow-md">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Sit tight — age group details will appear here soon.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {tournaments.map((t) => {
            const style = COLOUR_STYLE[t.colour] ?? COLOUR_STYLE.Green;
            return (
              <Link key={t.id} href={`/standings?tab=${t.colour}`}>
                <Card className={`rounded-2xl shadow-md cursor-pointer active:scale-[0.98] transition-transform ${style.border}`}>
                  <CardContent className="flex items-center justify-between px-5 py-4">
                    <div className="flex items-center gap-3">
                      <span className={`h-3 w-3 shrink-0 rounded-full ${style.dot}`} />
                      <div>
                        <p className="font-extrabold tracking-tight text-foreground leading-tight">
                          {t.name}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">{style.years}</p>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-muted-foreground">→</span>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
