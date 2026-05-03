"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface Tournament {
  id: string;
  name: string;
  colour: "Green" | "Red" | "Blue";
}

const COLOUR_STYLE: Record<string, { gradient: string; badge: string; years: string }> = {
  Green: {
    gradient: "from-green-600 to-green-500",
    badge: "bg-green-100 text-green-800",
    years: "Y3 / Y4",
  },
  Red: {
    gradient: "from-red-600 to-red-500",
    badge: "bg-red-100 text-red-800",
    years: "Y5 / Y6",
  },
  Blue: {
    gradient: "from-blue-600 to-blue-500",
    badge: "bg-blue-100 text-blue-800",
    years: "Y7 / Y8",
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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header
        className="px-6 py-12 text-center"
        style={{
          background: "linear-gradient(135deg, var(--cricket) 0%, var(--midnight) 100%)",
        }}
      >
        <p className="text-xs font-semibold uppercase tracking-widest text-white/50">
          Youth Cricket
        </p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-white">
          Competitions
        </h1>
      </header>

      <main className="mx-auto max-w-lg px-4 py-8 space-y-6">
        {/* Tournament cards */}
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <svg className="h-6 w-6 animate-spin text-muted-foreground" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : tournaments.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No competitions have been created yet.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {tournaments.map((t) => {
              const style = COLOUR_STYLE[t.colour] ?? COLOUR_STYLE.Green;
              return (
                <Link key={t.id} href={`/standings?tab=${t.colour}`}>
                  <Card className="overflow-hidden transition-shadow hover:shadow-md cursor-pointer">
                    <div className={`bg-gradient-to-r ${style.gradient} px-6 py-5 text-white`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <h2 className="text-xl font-black">{t.name}</h2>
                          <p className="mt-0.5 text-sm text-white/70">{style.years}</p>
                        </div>
                        <Badge className={`${style.badge} font-bold`}>
                          {t.colour}
                        </Badge>
                      </div>
                    </div>
                    <CardContent className="py-3">
                      <p className="text-sm text-muted-foreground">
                        View standings, fixtures &amp; results →
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}

        <Separator />

        {/* Quick links */}
        <div className="grid grid-cols-2 gap-3">
          <Link href="/profile">
            <Card className="transition-shadow hover:shadow-md cursor-pointer">
              <CardContent className="flex flex-col items-center py-6 gap-2">
                <svg className="h-6 w-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span className="text-sm font-semibold">My Profile</span>
              </CardContent>
            </Card>
          </Link>
          <Link href="/standings">
            <Card className="transition-shadow hover:shadow-md cursor-pointer">
              <CardContent className="flex flex-col items-center py-6 gap-2">
                <svg className="h-6 w-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <span className="text-sm font-semibold">All Standings</span>
              </CardContent>
            </Card>
          </Link>
        </div>
      </main>
    </div>
  );
}
