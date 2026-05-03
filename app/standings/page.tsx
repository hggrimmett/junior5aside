"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { getLeagueTable, TeamStanding } from "@/lib/tournament-logic";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

// ── Types ──────────────────────────────────────────────────

type TournamentColour = "Green" | "Red" | "Blue";

interface Tournament {
  id: string;
  name: string;
  colour: TournamentColour;
}

interface TeamRow {
  id: string;
  name: string;
}

interface TabConfig {
  key: TournamentColour;
  label: string;
}

const TABS: TabConfig[] = [
  { key: "Green", label: "Green (Y3/4)" },
  { key: "Red",   label: "Red (Y5/6)"  },
  { key: "Blue",  label: "Blue (Y7/8)" },
];

// Per-tournament colour tokens — all expressed as Tailwind utility classes
const TAB_STYLE: Record<
  TournamentColour,
  {
    triggerActive: string;
    dot: string;
    gradientFrom: string;
    gradientTo: string;
    rankBadge: string;
    rankBadgeInactive: string;
    finalistBorder: string;
    rowTopBorder: string;
    rowTopBg: string;
  }
> = {
  Green: {
    triggerActive:      "data-active:bg-cricket data-active:text-cricket-foreground",
    dot:                "bg-green-500",
    gradientFrom:       "from-cricket",
    gradientTo:         "to-cricket/80",
    rankBadge:          "bg-cricket text-cricket-foreground",
    rankBadgeInactive:  "bg-muted text-muted-foreground",
    finalistBorder:     "border-cricket/30",
    rowTopBorder:       "border-l-4 border-l-cricket",
    rowTopBg:           "bg-cricket-light/40",
  },
  Red: {
    triggerActive:      "data-active:bg-red-600 data-active:text-white",
    dot:                "bg-red-500",
    gradientFrom:       "from-red-700",
    gradientTo:         "to-red-600/80",
    rankBadge:          "bg-red-600 text-white",
    rankBadgeInactive:  "bg-muted text-muted-foreground",
    finalistBorder:     "border-red-200",
    rowTopBorder:       "border-l-4 border-l-red-500",
    rowTopBg:           "bg-red-50/60",
  },
  Blue: {
    triggerActive:      "data-active:bg-midnight data-active:text-midnight-foreground",
    dot:                "bg-blue-500",
    gradientFrom:       "from-midnight",
    gradientTo:         "to-midnight/80",
    rankBadge:          "bg-midnight text-midnight-foreground",
    rankBadgeInactive:  "bg-muted text-muted-foreground",
    finalistBorder:     "border-midnight/30",
    rowTopBorder:       "border-l-4 border-l-midnight",
    rowTopBg:           "bg-midnight/5",
  },
};

// ── Page ───────────────────────────────────────────────────

export default function StandingsPage() {
  const supabase = getSupabaseBrowserClient();

  const [activeTab, setActiveTab] = useState<TournamentColour>("Green");
  const [tournaments, setTournaments] = useState<Record<TournamentColour, Tournament | null>>({
    Green: null,
    Red:   null,
    Blue:  null,
  });
  const [standings, setStandings] = useState<Record<TournamentColour, TeamStanding[]>>({
    Green: [],
    Red:   [],
    Blue:  [],
  });
  const [teamNames, setTeamNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // ── Fetch tournaments + teams (once) ─────────────────────

  useEffect(() => {
    async function init() {
      const [tournamentsRes, teamsRes] = await Promise.all([
        supabase.from("tournaments").select("*").returns<Tournament[]>(),
        supabase.from("teams").select("id, name").returns<TeamRow[]>(),
      ]);

      const map: Record<TournamentColour, Tournament | null> = { Green: null, Red: null, Blue: null };
      for (const t of tournamentsRes.data ?? []) {
        if (!map[t.colour]) {
          map[t.colour] = t;
        }
      }
      setTournaments(map);

      const names: Record<string, string> = {};
      for (const t of teamsRes.data ?? []) {
        names[t.id] = t.name;
      }
      setTeamNames(names);
    }

    init();
  }, [supabase]);

  // ── Fetch standings for all groups ───────────────────────

  const refreshAll = useCallback(async () => {
    setLoading(true);
    const next: Record<TournamentColour, TeamStanding[]> = { Green: [], Red: [], Blue: [] };

    await Promise.all(
      (["Green", "Red", "Blue"] as TournamentColour[]).map(async (group) => {
        const t = tournaments[group];
        if (!t) return;
        try {
          next[group] = await getLeagueTable(supabase, t.id);
        } catch {
          // leave empty on error
        }
      })
    );

    setStandings(next);
    setLastUpdated(new Date());
    setLoading(false);
  }, [supabase, tournaments]);

  useEffect(() => {
    if (tournaments.Green || tournaments.Red || tournaments.Blue) {
      refreshAll();
    }
  }, [tournaments, refreshAll]);

  // ── Real-time subscription ───────────────────────────────

  useEffect(() => {
    const channel = supabase
      .channel("standings-live")
      .on(
        "postgres_changes",
        {
          event:  "UPDATE",
          schema: "public",
          table:  "matches",
          filter: "status=eq.true",
        },
        () => {
          refreshAll();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, refreshAll]);

  // ── Current tab data ─────────────────────────────────────

  const table    = standings[activeTab];
  const finalists = useMemo(() => table.slice(0, 2), [table]);
  const style    = TAB_STYLE[activeTab];

  // Detect total ties: teams sharing identical points AND runs
  const tiedTeamIds = useMemo(() => {
    const tied = new Set<string>();
    for (let i = 0; i < table.length; i++) {
      for (let j = i + 1; j < table.length; j++) {
        if (
          table[i].totalPoints === table[j].totalPoints &&
          table[i].totalRuns   === table[j].totalRuns
        ) {
          tied.add(table[i].teamId);
          tied.add(table[j].teamId);
        }
      }
    }
    return tied;
  }, [table]);

  // ── Render ───────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#f8f7f4]">
      <div className="mx-auto max-w-2xl px-4 py-10">

        {/* ── Page header ──────────────────────────────── */}
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-black tracking-tight text-foreground">
            Standings
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Live league tables &mdash; updates automatically
          </p>
        </header>

        {/* ── Tournament tabs ───────────────────────────── */}
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as TournamentColour)}
          className="w-full"
        >
          <div className="mb-6 flex justify-center">
            <TabsList className="h-auto gap-1 rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-foreground/10">
              {TABS.map((t) => (
                <TabsTrigger
                  key={t.key}
                  value={t.key}
                  className={`
                    flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold
                    transition-all duration-200
                    text-muted-foreground hover:text-foreground
                    ${TAB_STYLE[t.key].triggerActive}
                  `}
                >
                  <span
                    className={`h-2 w-2 rounded-full transition-opacity ${
                      activeTab === t.key
                        ? "bg-current opacity-50"
                        : TAB_STYLE[t.key].dot
                    }`}
                  />
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {TABS.map((t) => (
            <TabsContent key={t.key} value={t.key} className="outline-none">

              {/* ── Loading ───────────────────────────── */}
              {loading ? (
                <div className="flex h-56 items-center justify-center">
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <svg
                      className="h-5 w-5 animate-spin"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12" cy="12" r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    <span className="text-sm font-medium">Loading standings&hellip;</span>
                  </div>
                </div>

              ) : standings[t.key].length === 0 ? (

                /* ── Empty state ──────────────────────── */
                <Card className="py-20 text-center">
                  <CardContent className="flex flex-col items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                      <svg
                        className="h-6 w-6 text-muted-foreground"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-foreground">
                      No completed matches yet for{" "}
                      {TABS.find((tab) => tab.key === t.key)?.label ?? t.key}.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Results will appear here once matches are finalised.
                    </p>
                  </CardContent>
                </Card>

              ) : (
                <>
                  {/* ── Finalists card ───────────────── */}
                  {standings[t.key].slice(0, 2).length >= 2 && (
                    <Card className={`mb-5 overflow-hidden border ${style.finalistBorder}`}>
                      {/* Gradient header */}
                      <CardHeader
                        className={`
                          bg-gradient-to-r ${style.gradientFrom} ${style.gradientTo}
                          border-b border-white/10 px-5 py-4
                        `}
                      >
                        <div className="flex items-center gap-2.5">
                          <svg
                            className="h-4 w-4 text-amber-300"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                          >
                            <path
                              fillRule="evenodd"
                              d="M10 1l2.928 6.856L20 8.59l-5.072 4.572L16.18 20 10 16.284 3.82 20l1.252-6.838L0 8.59l7.072-.734L10 1z"
                              clipRule="evenodd"
                            />
                          </svg>
                          <CardTitle className="text-sm font-black uppercase tracking-widest text-white/90">
                            Finalists
                          </CardTitle>
                        </div>
                        <CardDescription className="text-white/60 text-xs mt-0.5">
                          Top 2 teams advance to the final
                        </CardDescription>
                      </CardHeader>

                      <CardContent className="px-5 py-4">
                        <div className="grid grid-cols-2 gap-3">
                          {standings[t.key].slice(0, 2).map((team, i) => (
                            <div
                              key={team.teamId}
                              className="flex items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-3.5 shadow-sm"
                            >
                              {/* Rank badge */}
                              <span
                                className={`
                                  flex h-9 w-9 shrink-0 items-center justify-center
                                  rounded-full text-sm font-black
                                  ${TAB_STYLE[t.key].rankBadge}
                                `}
                              >
                                {i + 1}
                              </span>

                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-bold text-foreground">
                                  {teamNames[team.teamId] ?? team.teamId}
                                  {tiedTeamIds.has(team.teamId) && <WineAlert />}
                                </p>
                                <div className="mt-1.5 flex items-center gap-1.5">
                                  <Badge
                                    className={`${TAB_STYLE[t.key].rankBadge} text-[10px] font-bold px-1.5`}
                                  >
                                    {team.totalPoints} pts
                                  </Badge>
                                  <Badge variant="outline" className="text-[10px] px-1.5">
                                    {team.totalRuns} runs
                                  </Badge>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* ── League table card ────────────── */}
                  <Card className="overflow-hidden p-0 gap-0">
                    {/* Table header */}
                    <div className="border-b border-border bg-muted/40 px-5 py-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                          League Table
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {standings[t.key].length} teams
                        </span>
                      </div>
                    </div>

                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/60 bg-muted/20">
                          <th className="w-14 py-2.5 pl-4 pr-1 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            #
                          </th>
                          <th className="py-2.5 px-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            Team
                          </th>
                          <th className="w-12 py-2.5 px-2 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            P
                          </th>
                          <th className="w-16 py-2.5 px-2 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            Pts
                          </th>
                          <th className="w-20 py-2.5 pl-2 pr-5 text-right text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            Runs
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {standings[t.key].map((row, i) => {
                          const isFinalist = i < 2;
                          return (
                            <tr
                              key={row.teamId}
                              className={`
                                border-b border-border/40 transition-colors last:border-0
                                ${isFinalist
                                  ? `${TAB_STYLE[t.key].rowTopBg} ${TAB_STYLE[t.key].rowTopBorder}`
                                  : i % 2 === 0
                                    ? "bg-card hover:bg-muted/30"
                                    : "bg-muted/10 hover:bg-muted/30"
                                }
                              `}
                            >
                              {/* Rank */}
                              <td className="py-3.5 pl-4 pr-1">
                                <Badge
                                  className={`
                                    h-6 w-6 rounded-full p-0 text-xs font-black
                                    ${isFinalist
                                      ? TAB_STYLE[t.key].rankBadge
                                      : TAB_STYLE[t.key].rankBadgeInactive
                                    }
                                  `}
                                >
                                  {i + 1}
                                </Badge>
                              </td>

                              {/* Team */}
                              <td className="py-3.5 px-3">
                                <span className={`font-semibold ${isFinalist ? "text-foreground" : "text-foreground/80"}`}>
                                  {teamNames[row.teamId] ?? row.teamId}
                                </span>
                                {tiedTeamIds.has(row.teamId) && <WineAlert />}
                              </td>

                              {/* Played */}
                              <td className="py-3.5 px-2 text-center tabular-nums text-muted-foreground">
                                {row.gamesPlayed}
                              </td>

                              {/* Points — bold + larger for prominence */}
                              <td className="py-3.5 px-2 text-center">
                                <span className={`text-base font-black tabular-nums ${isFinalist ? "text-foreground" : "text-foreground/70"}`}>
                                  {row.totalPoints}
                                </span>
                              </td>

                              {/* Runs */}
                              <td className="py-3.5 pl-2 pr-5 text-right tabular-nums text-muted-foreground">
                                {row.totalRuns}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {/* Last updated footer */}
                    {lastUpdated && (
                      <>
                        <Separator />
                        <div className="px-5 py-3 text-center">
                          <p className="text-[11px] text-muted-foreground">
                            Last updated{" "}
                            <time
                              dateTime={lastUpdated.toISOString()}
                              className="font-medium text-foreground/60"
                            >
                              {lastUpdated.toLocaleTimeString(undefined, {
                                hour:   "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                              })}
                            </time>
                          </p>
                        </div>
                      </>
                    )}
                  </Card>
                </>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}

// ── Wine Alert (total tie) ─────────────────────────────────

function WineAlert() {
  return (
    <span className="group relative ml-1.5 inline-block cursor-help align-middle">
      <span className="text-base" role="img" aria-label="Tie-breaker needed">
        🍷
      </span>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-64 -translate-x-1/2 rounded-xl bg-gray-900 px-4 py-3 text-center text-xs font-medium leading-relaxed text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
        The algorithm has given up. Please find the Organiser; he is currently
        pouring a large glass of red to decide your fate.
        <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
      </span>
    </span>
  );
}
