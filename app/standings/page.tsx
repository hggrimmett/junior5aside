"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { usePublishGate } from "@/lib/use-publish-gate";
import {
  getLeagueTable,
  TeamStanding,
} from "@/lib/tournament-logic";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

interface PlayerStat {
  playerId: string;
  name: string;
  value: number;
}

interface TabConfig {
  key: TournamentColour;
  label: string;
}

const TABS: TabConfig[] = [
  { key: "Green", label: "Green" },
  { key: "Red",   label: "Red"   },
  { key: "Blue",  label: "Blue"  },
];

const TAB_STYLE: Record<
  TournamentColour,
  {
    triggerActive:     string;
    dot:               string;
    rankBadge:         string;
    rankBadgeInactive: string;
    finalistBorder:    string;
    rowTopBorder:      string;
    finalistRankBg:    string;
  }
> = {
  Green: {
    triggerActive:     "data-[state=active]:bg-[#114232] data-[state=active]:text-white",
    dot:               "bg-green-500",
    rankBadge:         "bg-[#114232] text-white",
    rankBadgeInactive: "bg-muted text-muted-foreground",
    finalistBorder:    "border-l-[4px] border-l-green-500",
    rowTopBorder:      "border-l-[4px] border-l-green-500",
    finalistRankBg:    "bg-[#114232] text-white",
  },
  Red: {
    triggerActive:     "data-[state=active]:bg-red-600 data-[state=active]:text-white",
    dot:               "bg-red-500",
    rankBadge:         "bg-red-600 text-white",
    rankBadgeInactive: "bg-muted text-muted-foreground",
    finalistBorder:    "border-l-[4px] border-l-red-500",
    rowTopBorder:      "border-l-[4px] border-l-red-500",
    finalistRankBg:    "bg-red-600 text-white",
  },
  Blue: {
    triggerActive:     "data-[state=active]:bg-blue-700 data-[state=active]:text-white",
    dot:               "bg-blue-500",
    rankBadge:         "bg-blue-700 text-white",
    rankBadgeInactive: "bg-muted text-muted-foreground",
    finalistBorder:    "border-l-[4px] border-l-blue-500",
    rowTopBorder:      "border-l-[4px] border-l-blue-500",
    finalistRankBg:    "bg-blue-700 text-white",
  },
};

// ── Page ───────────────────────────────────────────────────

export default function StandingsPage() {
  const supabase = getSupabaseBrowserClient();
  const gate = usePublishGate();

  const [activeTab, setActiveTab] = useState<TournamentColour>("Green");
  const [tournaments, setTournaments] = useState<
    Record<TournamentColour, Tournament | null>
  >({ Green: null, Red: null, Blue: null });
  const [standings, setStandings] = useState<
    Record<TournamentColour, TeamStanding[]>
  >({ Green: [], Red: [], Blue: [] });
  const [teamNames, setTeamNames] = useState<Record<string, string>>({});
  const [topBatters, setTopBatters] = useState<Record<TournamentColour, PlayerStat[]>>({ Green: [], Red: [], Blue: [] });
  const [topBowlers, setTopBowlers] = useState<Record<TournamentColour, PlayerStat[]>>({ Green: [], Red: [], Blue: [] });
  const [allMatchesComplete, setAllMatchesComplete] = useState<Record<TournamentColour, boolean>>({ Green: false, Red: false, Blue: false });
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // ── Fetch tournaments + teams (once) ─────────────────────

  useEffect(() => {
    async function init() {
      const [tournamentsRes, teamsRes] = await Promise.all([
        supabase.from("tournaments").select("*").returns<Tournament[]>(),
        supabase.from("teams").select("id, name").returns<TeamRow[]>(),
      ]);

      const map: Record<TournamentColour, Tournament | null> = {
        Green: null,
        Red:   null,
        Blue:  null,
      };
      for (const t of tournamentsRes.data ?? []) {
        if (!map[t.colour]) map[t.colour] = t;
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
    const next: Record<TournamentColour, TeamStanding[]> = {
      Green: [],
      Red:   [],
      Blue:  [],
    };
    const nextBatters: Record<TournamentColour, PlayerStat[]> = {
      Green: [],
      Red:   [],
      Blue:  [],
    };
    const nextBowlers: Record<TournamentColour, PlayerStat[]> = {
      Green: [],
      Red:   [],
      Blue:  [],
    };
    const nextAllComplete: Record<TournamentColour, boolean> = {
      Green: false,
      Red:   false,
      Blue:  false,
    };

    await Promise.all(
      (["Green", "Red", "Blue"] as TournamentColour[]).map(async (group) => {
        const t = tournaments[group];
        if (!t) return;
        try {
          // Fetch league table and all match statuses in parallel
          const [table, matchesRes] = await Promise.all([
            getLeagueTable(supabase, t.id),
            supabase.from("matches").select("id, status").eq("tournament_id", t.id),
          ]);
          next[group] = table;

          const allMatches = matchesRes.data ?? [];
          const total = allMatches.length;
          const completed = allMatches.filter((m) => m.status).length;
          nextAllComplete[group] = total > 0 && completed === total;

          // Fetch player stats from completed matches
          const completedMatchIds = allMatches
            .filter((m) => m.status)
            .map((m) => m.id);

          if (completedMatchIds.length > 0) {
            const eventsRes = await supabase
              .from("match_events")
              .select("batter_id, bowler_id, runs, is_wicket, extra_type")
              .in("match_id", completedMatchIds);

            const events = eventsRes.data ?? [];

            // Top run scorers: sum runs where extra_type IS NULL (bat runs only)
            const runMap: Record<string, number> = {};
            for (const ev of events) {
              if (ev.extra_type == null && ev.batter_id) {
                runMap[ev.batter_id] = (runMap[ev.batter_id] ?? 0) + (ev.runs ?? 0);
              }
            }

            // Top wicket takers: count is_wicket = true per bowler
            const wicketMap: Record<string, number> = {};
            for (const ev of events) {
              if (ev.is_wicket && ev.bowler_id) {
                wicketMap[ev.bowler_id] = (wicketMap[ev.bowler_id] ?? 0) + 1;
              }
            }

            // Collect all relevant player IDs
            const allPlayerIds = Array.from(
              new Set([...Object.keys(runMap), ...Object.keys(wicketMap)])
            );

            // Fetch player names
            const playersRes = await supabase
              .from("players")
              .select("id, first_name, last_name")
              .in("id", allPlayerIds);

            const playerNameMap: Record<string, string> = {};
            for (const p of playersRes.data ?? []) {
              playerNameMap[p.id] = `${p.first_name} ${p.last_name}`.trim();
            }

            // Build sorted top-3 batters
            nextBatters[group] = Object.entries(runMap)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)
              .map(([playerId, value]) => ({
                playerId,
                name: playerNameMap[playerId] ?? playerId,
                value,
              }));

            // Build sorted top-3 bowlers
            nextBowlers[group] = Object.entries(wicketMap)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)
              .map(([playerId, value]) => ({
                playerId,
                name: playerNameMap[playerId] ?? playerId,
                value,
              }));
          }
        } catch {
          // leave empty on error
        }
      })
    );

    setStandings(next);
    setTopBatters(nextBatters);
    setTopBowlers(nextBowlers);
    setAllMatchesComplete(nextAllComplete);
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
  const style    = TAB_STYLE[activeTab];

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

  if (!gate.visible) {
    return (
      <div className="px-4 py-5 space-y-4">
        <h2 className="text-xl font-extrabold tracking-tight text-foreground">Live Scores &amp; Standings</h2>
        <Card className="rounded-2xl shadow-md">
          <CardContent className="py-10 text-center space-y-1">
            <p className="text-base font-extrabold text-foreground">Standings appear once matches begin</p>
            <p className="text-xs text-muted-foreground">
              Live scores and league tables will be published when play starts.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="px-4 py-5 space-y-4">

      {/* ── Tournament tabs ─────────────────────────────── */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as TournamentColour)}
        className="w-full"
      >
        {/* Tab strip */}
        <TabsList className="w-full h-11 rounded-2xl bg-muted p-1 gap-1">
          {TABS.map((t) => (
            <TabsTrigger
              key={t.key}
              value={t.key}
              className={`
                flex-1 flex items-center justify-center gap-1.5
                rounded-xl text-sm font-extrabold tracking-tight
                transition-all duration-200
                text-muted-foreground
                ${TAB_STYLE[t.key].triggerActive}
              `}
            >
              <span
                className={`h-2 w-2 rounded-full ${TAB_STYLE[t.key].dot} opacity-80`}
              />
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {TABS.map((t) => (
          <TabsContent key={t.key} value={t.key} className="outline-none mt-4 space-y-3">

            {/* ── Loading ─────────────────────────────── */}
            {loading ? (
              <div className="flex h-56 items-center justify-center">
                <div className="flex items-center gap-3 text-muted-foreground">
                  <svg
                    className="h-5 w-5 animate-spin"
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
              <Card className="rounded-2xl shadow-md">
                <CardContent className="flex flex-col items-center gap-3 py-16">
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
                    Sit tight!
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Scores and standings will appear here once the tournament is underway.
                  </p>
                </CardContent>
              </Card>

            ) : (
              <>
                {/* ── Finalists ─────────────────────── */}
                {allMatchesComplete[t.key] ? (
                  standings[t.key].slice(0, 2).length >= 2 && (
                    <Card
                      className={`
                        rounded-2xl shadow-md overflow-hidden
                        ${TAB_STYLE[t.key].finalistBorder}
                      `}
                    >
                      <CardHeader className="px-4 pt-4 pb-2">
                        <div className="flex items-center gap-2">
                          <svg
                            className="h-4 w-4 text-amber-400"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                          >
                            <path
                              fillRule="evenodd"
                              d="M10 1l2.928 6.856L20 8.59l-5.072 4.572L16.18 20 10 16.284 3.82 20l1.252-6.838L0 8.59l7.072-.734L10 1z"
                              clipRule="evenodd"
                            />
                          </svg>
                          <CardTitle className="text-xs font-extrabold uppercase tracking-widest text-muted-foreground">
                            Finalists
                          </CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent className="px-4 pb-4 space-y-2">
                        {standings[t.key].slice(0, 2).map((team, i) => (
                          <div
                            key={team.teamId}
                            className="flex items-center gap-3 rounded-xl border border-border/50 bg-card px-3 py-3 shadow-sm"
                          >
                            <span
                              className={`
                                flex h-8 w-8 shrink-0 items-center justify-center
                                rounded-full text-sm font-black
                                ${TAB_STYLE[t.key].finalistRankBg}
                              `}
                            >
                              {i + 1}
                            </span>
                            <p className="flex-1 truncate text-sm font-bold text-foreground">
                              {teamNames[team.teamId] ?? team.teamId}
                              {tiedTeamIds.has(team.teamId) && <WineAlert />}
                            </p>
                            <Badge
                              className={`${TAB_STYLE[t.key].rankBadge} text-xs font-bold px-2`}
                            >
                              {team.totalPoints} pts
                            </Badge>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )
                ) : (
                  <Card className="rounded-2xl shadow-md overflow-hidden">
                    <CardContent className="flex items-center gap-3 px-4 py-4">
                      <svg
                        className="h-4 w-4 shrink-0 text-muted-foreground"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                      <p className="text-xs text-muted-foreground">
                        Finalists confirmed when all matches are complete
                      </p>
                    </CardContent>
                  </Card>
                )}

                {/* ── Top Run Scorers ───────────────── */}
                {topBatters[t.key].length > 0 && (
                  <Card className="rounded-2xl shadow-md overflow-hidden">
                    <CardHeader className="px-4 pt-4 pb-2">
                      <div className="flex items-center gap-1.5">
                        <svg
                          className="h-3.5 w-3.5 shrink-0 text-amber-500"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M4 20L18 6" />
                          <path d="M14 4l6 6" />
                          <path d="M18 6l-4-4" />
                          <circle cx="4.5" cy="19.5" r="1.5" fill="currentColor" stroke="none" />
                        </svg>
                        <CardTitle className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground leading-tight">
                          Top Run Scorers
                        </CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 space-y-1.5">
                      {topBatters[t.key].map((player, i) => (
                        <div
                          key={player.playerId}
                          className="flex items-center gap-2.5"
                        >
                          <span
                            className={`
                              flex h-5 w-5 shrink-0 items-center justify-center
                              rounded-full text-[10px] font-black
                              ${i === 0
                                ? TAB_STYLE[t.key].rankBadge
                                : TAB_STYLE[t.key].rankBadgeInactive
                              }
                            `}
                          >
                            {i + 1}
                          </span>
                          <span className="flex-1 truncate text-xs font-semibold text-foreground">
                            {player.name}
                          </span>
                          <Badge className={`${TAB_STYLE[t.key].rankBadge} text-[10px] font-bold px-1.5 py-0`}>
                            {player.value} runs
                          </Badge>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* ── Top Wicket Takers ─────────────── */}
                {topBowlers[t.key].length > 0 && (
                  <Card className="rounded-2xl shadow-md overflow-hidden">
                    <CardHeader className="px-4 pt-4 pb-2">
                      <div className="flex items-center gap-1.5">
                        <svg
                          className="h-3.5 w-3.5 shrink-0 text-red-500"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <circle cx="12" cy="12" r="9" />
                          <path d="M12 3a9 9 0 0 1 0 18" />
                          <path d="M3.6 9h16.8" />
                          <path d="M3.6 15h16.8" />
                        </svg>
                        <CardTitle className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground leading-tight">
                          Top Wicket Takers
                        </CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 space-y-1.5">
                      {topBowlers[t.key].map((player, i) => (
                        <div
                          key={player.playerId}
                          className="flex items-center gap-2.5"
                        >
                          <span
                            className={`
                              flex h-5 w-5 shrink-0 items-center justify-center
                              rounded-full text-[10px] font-black
                              ${i === 0
                                ? TAB_STYLE[t.key].rankBadge
                                : TAB_STYLE[t.key].rankBadgeInactive
                              }
                            `}
                          >
                            {i + 1}
                          </span>
                          <span className="flex-1 truncate text-xs font-semibold text-foreground">
                            {player.name}
                          </span>
                          <Badge className={`${TAB_STYLE[t.key].rankBadge} text-[10px] font-bold px-1.5 py-0`}>
                            {player.value} wkts
                          </Badge>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* ── League table — row cards ──────── */}
                <div className="space-y-2">
                  {/* Section label */}
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground px-1">
                    League Table &middot; {standings[t.key].length} teams
                  </p>

                  {standings[t.key].map((row, i) => {
                    const isTop = i < 2;
                    return (
                      <Card
                        key={row.teamId}
                        className={`
                          rounded-xl shadow-sm overflow-hidden
                          ${isTop ? TAB_STYLE[t.key].rowTopBorder : ""}
                        `}
                      >
                        <CardContent className="flex items-center gap-3 px-3 py-3">
                          {/* Rank badge */}
                          <span
                            className={`
                              flex h-7 w-7 shrink-0 items-center justify-center
                              rounded-full text-xs font-black
                              ${isTop
                                ? TAB_STYLE[t.key].rankBadge
                                : TAB_STYLE[t.key].rankBadgeInactive
                              }
                            `}
                          >
                            {i + 1}
                          </span>

                          {/* Team name */}
                          <span className="flex-1 truncate text-sm font-bold text-foreground">
                            {teamNames[row.teamId] ?? row.teamId}
                            {tiedTeamIds.has(row.teamId) && <WineAlert />}
                          </span>

                          {/* Points */}
                          <span className="text-base font-extrabold tracking-tight tabular-nums text-foreground">
                            {row.totalPoints}
                            <span className="ml-0.5 text-[10px] font-medium text-muted-foreground">
                              pts
                            </span>
                          </span>

                          {/* Runs */}
                          <span className="w-14 text-right text-xs tabular-nums text-muted-foreground">
                            {row.totalRuns} runs
                          </span>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {/* ── Last updated ─────────────────── */}
                {lastUpdated && (
                  <div className="pt-1 text-center">
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
                )}
              </>
            )}
          </TabsContent>
        ))}
      </Tabs>
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
