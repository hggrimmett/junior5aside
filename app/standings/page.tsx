"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { getLeagueTable, TeamStanding } from "@/lib/tournament-logic";

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
  { key: "Red", label: "Red (Y5/6)" },
  { key: "Blue", label: "Blue (Y7/8)" },
];

const TAB_STYLE: Record<
  TournamentColour,
  { active: string; dot: string; finalistBg: string; finalistBorder: string; rankBg: string; rankText: string }
> = {
  Green: {
    active: "bg-green-600 text-white shadow-sm shadow-green-600/25",
    dot: "bg-green-500",
    finalistBg: "bg-green-50",
    finalistBorder: "border-green-200",
    rankBg: "bg-green-600",
    rankText: "text-white",
  },
  Red: {
    active: "bg-red-600 text-white shadow-sm shadow-red-600/25",
    dot: "bg-red-500",
    finalistBg: "bg-red-50",
    finalistBorder: "border-red-200",
    rankBg: "bg-red-600",
    rankText: "text-white",
  },
  Blue: {
    active: "bg-blue-600 text-white shadow-sm shadow-blue-600/25",
    dot: "bg-blue-500",
    finalistBg: "bg-blue-50",
    finalistBorder: "border-blue-200",
    rankBg: "bg-blue-600",
    rankText: "text-white",
  },
};

// ── Page ───────────────────────────────────────────────────

export default function StandingsPage() {
  const supabase = getSupabaseBrowserClient();

  const [activeTab, setActiveTab] = useState<TournamentColour>("Green");
  const [tournaments, setTournaments] = useState<Record<TournamentColour, Tournament | null>>({
    Green: null,
    Red: null,
    Blue: null,
  });
  const [standings, setStandings] = useState<Record<TournamentColour, TeamStanding[]>>({
    Green: [],
    Red: [],
    Blue: [],
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
          event: "UPDATE",
          schema: "public",
          table: "matches",
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

  const table = standings[activeTab];
  const finalists = useMemo(() => table.slice(0, 2), [table]);
  const style = TAB_STYLE[activeTab];

  // Detect total ties: teams sharing identical points AND runs
  const tiedTeamIds = useMemo(() => {
    const tied = new Set<string>();
    for (let i = 0; i < table.length; i++) {
      for (let j = i + 1; j < table.length; j++) {
        if (
          table[i].totalPoints === table[j].totalPoints &&
          table[i].totalRuns === table[j].totalRuns
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
      <div className="mx-auto max-w-3xl px-4 py-10">
        {/* Header */}
        <header className="mb-8">
          <h1 className="text-center text-3xl font-black tracking-tight text-gray-900">
            Standings
          </h1>
          <p className="mt-1 text-center text-sm text-gray-400">
            Live league tables &mdash; updates automatically
          </p>
        </header>

        {/* Tabs */}
        <nav className="mb-8 flex justify-center">
          <div className="inline-flex rounded-2xl bg-white p-1.5 shadow-sm border border-gray-200/80">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-bold transition-all ${
                  activeTab === t.key
                    ? TAB_STYLE[t.key].active
                    : "text-gray-400 hover:text-gray-600"
                }`}
              >
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    activeTab === t.key ? "bg-white/60" : TAB_STYLE[t.key].dot
                  }`}
                />
                {t.label}
              </button>
            ))}
          </div>
        </nav>

        {loading ? (
          <div className="flex h-52 items-center justify-center">
            <div className="flex items-center gap-3 text-gray-400">
              <svg
                className="h-5 w-5 animate-spin"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-sm font-medium">Loading standings...</span>
            </div>
          </div>
        ) : table.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white py-20 text-center shadow-sm">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
              <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-500">
              No completed matches yet for {TABS.find((t) => t.key === activeTab)?.label ?? activeTab}.
            </p>
            <p className="mt-1 text-xs text-gray-400">
              Results will appear here once matches are finalised.
            </p>
          </div>
        ) : (
          <>
            {/* ── Finalists card ──────────────────────────── */}
            {finalists.length >= 2 && (
              <div className={`mb-6 rounded-2xl border ${style.finalistBorder} ${style.finalistBg} p-5`}>
                <div className="mb-4 flex items-center gap-2">
                  <svg className="h-4 w-4 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M10 1l2.928 6.856L20 8.59l-5.072 4.572L16.18 20 10 16.284 3.82 20l1.252-6.838L0 8.59l7.072-.734L10 1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <h2 className="text-xs font-black uppercase tracking-widest text-gray-600">
                    Finalists
                  </h2>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {finalists.map((team, i) => (
                    <div
                      key={team.teamId}
                      className="flex items-center gap-3 rounded-xl bg-white px-4 py-4 shadow-sm"
                    >
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black ${style.rankBg} ${style.rankText}`}
                      >
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-base font-bold text-gray-900">
                          {teamNames[team.teamId] ?? team.teamId}
                          {tiedTeamIds.has(team.teamId) && (
                            <WineAlert />
                          )}
                        </p>
                        <p className="text-xs text-gray-500">
                          <span className="font-bold text-gray-700">{team.totalPoints}</span> pts
                          <span className="mx-1.5 text-gray-300">&middot;</span>
                          {team.totalRuns} runs
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── League table ────────────────────────────── */}
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/80">
                    <th className="w-14 py-3 pl-5 pr-1 text-left text-xs font-bold uppercase tracking-wider text-gray-400">
                      #
                    </th>
                    <th className="py-3 px-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">
                      Team
                    </th>
                    <th className="w-14 py-3 px-2 text-center text-xs font-bold uppercase tracking-wider text-gray-400">
                      P
                    </th>
                    <th className="w-16 py-3 px-2 text-center text-xs font-bold uppercase tracking-wider text-gray-400">
                      Pts
                    </th>
                    <th className="w-20 py-3 pl-2 pr-5 text-right text-xs font-bold uppercase tracking-wider text-gray-400">
                      Runs
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {table.map((row, i) => {
                    const isFinalist = i < 2;
                    return (
                      <tr
                        key={row.teamId}
                        className={`border-b border-gray-50 transition-colors ${
                          isFinalist
                            ? `${style.finalistBg}/40`
                            : "hover:bg-gray-50/60"
                        }`}
                      >
                        {/* Rank */}
                        <td className="py-4 pl-5 pr-1">
                          <span
                            className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-black ${
                              isFinalist
                                ? `${style.rankBg} ${style.rankText}`
                                : "bg-gray-100 text-gray-500"
                            }`}
                          >
                            {i + 1}
                          </span>
                        </td>

                        {/* Team */}
                        <td className="py-4 px-3">
                          <span className="font-bold text-gray-900">
                            {teamNames[row.teamId] ?? row.teamId}
                          </span>
                          {tiedTeamIds.has(row.teamId) && (
                            <WineAlert />
                          )}
                        </td>

                        {/* Played */}
                        <td className="py-4 px-2 text-center text-gray-600">
                          {row.gamesPlayed}
                        </td>

                        {/* Points */}
                        <td className="py-4 px-2 text-center">
                          <span className="font-black text-gray-900">
                            {row.totalPoints}
                          </span>
                        </td>

                        {/* Runs */}
                        <td className="py-4 pl-2 pr-5 text-right tabular-nums text-gray-600">
                          {row.totalRuns}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── Last Updated ────────────────────────────── */}
            {lastUpdated && (
              <p className="mt-4 text-center text-xs text-gray-400">
                Last updated{" "}
                <time dateTime={lastUpdated.toISOString()} className="font-medium text-gray-500">
                  {lastUpdated.toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </time>
              </p>
            )}
          </>
        )}
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
