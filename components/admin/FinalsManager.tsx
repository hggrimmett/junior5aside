"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { getLeagueTable, TeamStanding } from "@/lib/tournament-logic";

// ── Types ──────────────────────────────────────────────────

type AgeGroup = "Blue" | "Green" | "Red";

interface Tournament {
  id: string;
  name: string;
  age_group_category: AgeGroup;
}

interface TeamName {
  id: string;
  name: string;
}

interface GroupState {
  tournament: Tournament | null;
  standings: TeamStanding[];
  finalCreated: boolean;
  plateCreated: boolean;
  winnerTrophy: boolean;
  runnerTrophy: boolean;
  plateWinnerTrophy: boolean;
  plateRunnerTrophy: boolean;
}

const AGE_GROUPS: AgeGroup[] = ["Blue", "Green", "Red"];

const GROUP_STYLE: Record<
  AgeGroup,
  { border: string; bg: string; badge: string; accent: string }
> = {
  Blue: {
    border: "border-blue-200",
    bg: "bg-blue-50",
    badge: "bg-blue-600 text-white",
    accent: "text-blue-700",
  },
  Green: {
    border: "border-green-200",
    bg: "bg-green-50",
    badge: "bg-green-600 text-white",
    accent: "text-green-700",
  },
  Red: {
    border: "border-red-200",
    bg: "bg-red-50",
    badge: "bg-red-600 text-white",
    accent: "text-red-700",
  },
};

// ── Component ──────────────────────────────────────────────

export default function FinalsManager() {
  const supabase = getSupabaseBrowserClient();

  const [groups, setGroups] = useState<Record<AgeGroup, GroupState>>({
    Blue: emptyGroup(),
    Green: emptyGroup(),
    Red: emptyGroup(),
  });
  const [teamNames, setTeamNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyGroup, setBusyGroup] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // ── Fetch data ───────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [tournamentsRes, teamsRes, existingFinalsRes] = await Promise.all([
      supabase.from("tournaments").select("*").returns<Tournament[]>(),
      supabase.from("teams").select("id, name").returns<TeamName[]>(),
      supabase
        .from("matches")
        .select("tournament_id, match_type")
        .in("match_type", ["final", "plate_final"])
        .returns<{ tournament_id: string; match_type: string }[]>(),
    ]);

    // Build team name map
    const names: Record<string, string> = {};
    for (const t of teamsRes.data ?? []) names[t.id] = t.name;
    setTeamNames(names);

    // Map tournaments by age group
    const tournamentMap: Record<AgeGroup, Tournament | null> = {
      Blue: null,
      Green: null,
      Red: null,
    };
    for (const t of tournamentsRes.data ?? []) {
      if (!tournamentMap[t.age_group_category]) {
        tournamentMap[t.age_group_category] = t;
      }
    }

    // Check which finals already exist
    const existingFinals = new Set<string>();
    const existingPlates = new Set<string>();
    for (const row of existingFinalsRes.data ?? []) {
      if (row.match_type === "final") existingFinals.add(row.tournament_id);
      if (row.match_type === "plate_final") existingPlates.add(row.tournament_id);
    }

    // Fetch standings for each group
    const next: Record<AgeGroup, GroupState> = {
      Blue: emptyGroup(),
      Green: emptyGroup(),
      Red: emptyGroup(),
    };

    await Promise.all(
      AGE_GROUPS.map(async (group) => {
        const t = tournamentMap[group];
        next[group].tournament = t;
        if (!t) return;
        try {
          next[group].standings = await getLeagueTable(supabase, t.id);
        } catch {
          // leave empty
        }
        next[group].finalCreated = existingFinals.has(t.id);
        next[group].plateCreated = existingPlates.has(t.id);
      })
    );

    setGroups(next);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ── Create final matches ─────────────────────────────────

  async function createFinals(group: AgeGroup) {
    const g = groups[group];
    if (!g.tournament || g.standings.length < 2) return;

    setBusyGroup(group);
    setError(null);

    const tournamentId = g.tournament.id;
    const rows: {
      tournament_id: string;
      team_a_id: string;
      team_b_id: string;
      match_type: string;
      score_a: number;
      score_b: number;
      wickets_a: number;
      wickets_b: number;
      status: boolean;
    }[] = [];

    // Final: 1st vs 2nd
    rows.push({
      tournament_id: tournamentId,
      team_a_id: g.standings[0].teamId,
      team_b_id: g.standings[1].teamId,
      match_type: "final",
      score_a: 0,
      score_b: 0,
      wickets_a: 0,
      wickets_b: 0,
      status: false,
    });

    // Plate Final: 3rd vs 4th (if enough teams)
    if (g.standings.length >= 4) {
      rows.push({
        tournament_id: tournamentId,
        team_a_id: g.standings[2].teamId,
        team_b_id: g.standings[3].teamId,
        match_type: "plate_final",
        score_a: 0,
        score_b: 0,
        wickets_a: 0,
        wickets_b: 0,
        status: false,
      });
    }

    const { error: insertErr } = await supabase.from("matches").insert(rows);

    if (insertErr) {
      setError(insertErr.message);
      setBusyGroup(null);
      return;
    }

    setGroups((prev) => ({
      ...prev,
      [group]: {
        ...prev[group],
        finalCreated: true,
        plateCreated: g.standings.length >= 4,
      },
    }));

    setToast(`${group} finals created`);
    setTimeout(() => setToast(null), 2500);
    setBusyGroup(null);
  }

  // ── Trophy toggle ────────────────────────────────────────

  function toggleTrophy(
    group: AgeGroup,
    key: "winnerTrophy" | "runnerTrophy" | "plateWinnerTrophy" | "plateRunnerTrophy"
  ) {
    setGroups((prev) => ({
      ...prev,
      [group]: { ...prev[group], [key]: !prev[group][key] },
    }));
  }

  // ── Helpers ──────────────────────────────────────────────

  function teamName(id: string): string {
    return teamNames[id] ?? "TBD";
  }

  // ── Render ───────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-gray-400">
        Loading finals data...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Finals Manager</h2>
        <p className="mt-0.5 text-sm text-gray-400">
          Create final and plate-final matches from league standings.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Group cards */}
      <div className="grid gap-6 lg:grid-cols-3">
        {AGE_GROUPS.map((group) => {
          const g = groups[group];
          const s = GROUP_STYLE[group];
          const hasEnoughTeams = g.standings.length >= 2;
          const hasPlateTeams = g.standings.length >= 4;
          const isBusy = busyGroup === group;

          return (
            <div
              key={group}
              className={`rounded-2xl border-2 ${s.border} bg-white shadow-sm overflow-hidden`}
            >
              {/* Header */}
              <div className={`${s.bg} px-5 py-4`}>
                <span className={`inline-block rounded-full px-3 py-1 text-xs font-black ${s.badge}`}>
                  {group}
                </span>
              </div>

              <div className="px-5 py-5 space-y-5">
                {!g.tournament ? (
                  <p className="text-sm text-gray-400">
                    No tournament found for this age group.
                  </p>
                ) : !hasEnoughTeams ? (
                  <p className="text-sm text-gray-400">
                    Not enough completed matches to determine finalists.
                  </p>
                ) : (
                  <>
                    {/* Final: 1st vs 2nd */}
                    <MatchupCard
                      label="Final"
                      teamA={teamName(g.standings[0].teamId)}
                      teamB={teamName(g.standings[1].teamId)}
                      rankA="1st"
                      rankB="2nd"
                      accent={s.accent}
                    />

                    {/* Plate Final: 3rd vs 4th */}
                    {hasPlateTeams ? (
                      <MatchupCard
                        label="Plate Final"
                        teamA={teamName(g.standings[2].teamId)}
                        teamB={teamName(g.standings[3].teamId)}
                        rankA="3rd"
                        rankB="4th"
                        accent={s.accent}
                      />
                    ) : (
                      <p className="text-xs text-gray-400">
                        Not enough teams for a plate final.
                      </p>
                    )}

                    {/* Create button */}
                    {!g.finalCreated ? (
                      <button
                        onClick={() => createFinals(group)}
                        disabled={isBusy}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 py-2.5 text-sm font-bold text-white transition hover:bg-gray-800 disabled:opacity-50"
                      >
                        {isBusy ? (
                          <>
                            <Spinner />
                            Creating...
                          </>
                        ) : (
                          "Create Final Matches"
                        )}
                      </button>
                    ) : (
                      <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-center text-xs font-bold text-emerald-700">
                        Final matches created
                      </div>
                    )}

                    {/* Trophy tracker */}
                    {g.finalCreated && (
                      <div className="space-y-2 pt-1">
                        <p className="text-xs font-bold uppercase tracking-widest text-gray-400">
                          Trophy Tracker
                        </p>

                        <TrophyCheck
                          label={`Winners Trophy — ${teamName(g.standings[0].teamId)}`}
                          checked={g.winnerTrophy}
                          onChange={() => toggleTrophy(group, "winnerTrophy")}
                        />
                        <TrophyCheck
                          label={`Runners-up Trophy — ${teamName(g.standings[1].teamId)}`}
                          checked={g.runnerTrophy}
                          onChange={() => toggleTrophy(group, "runnerTrophy")}
                        />

                        {hasPlateTeams && (
                          <>
                            <TrophyCheck
                              label={`Plate Winners — ${teamName(g.standings[2].teamId)}`}
                              checked={g.plateWinnerTrophy}
                              onChange={() => toggleTrophy(group, "plateWinnerTrophy")}
                            />
                            <TrophyCheck
                              label={`Plate Runners-up — ${teamName(g.standings[3].teamId)}`}
                              checked={g.plateRunnerTrophy}
                              onChange={() => toggleTrophy(group, "plateRunnerTrophy")}
                            />
                          </>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-lg animate-slide-up">
          {toast}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────

function MatchupCard({
  label,
  teamA,
  teamB,
  rankA,
  rankB,
  accent,
}: {
  label: string;
  teamA: string;
  teamB: string;
  rankA: string;
  rankB: string;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4">
      <p className={`mb-3 text-xs font-black uppercase tracking-widest ${accent}`}>
        {label}
      </p>
      <div className="flex items-center gap-3">
        <div className="flex-1 text-center">
          <span className="block text-xs text-gray-400">{rankA}</span>
          <p className="mt-0.5 text-base font-bold text-gray-900 truncate">
            {teamA}
          </p>
        </div>
        <span className="shrink-0 text-xs font-bold text-gray-300">VS</span>
        <div className="flex-1 text-center">
          <span className="block text-xs text-gray-400">{rankB}</span>
          <p className="mt-0.5 text-base font-bold text-gray-900 truncate">
            {teamB}
          </p>
        </div>
      </div>
    </div>
  );
}

function TrophyCheck({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition hover:bg-gray-50 active:bg-gray-100">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-5 w-5 rounded border-gray-300 text-amber-500 focus:ring-amber-400"
      />
      <span
        className={`text-sm ${
          checked ? "font-semibold text-gray-900 line-through decoration-gray-300" : "text-gray-600"
        }`}
      >
        {checked ? "\u{1F3C6} " : ""}{label}
      </span>
    </label>
  );
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ── Helpers ────────────────────────────────────────────────

function emptyGroup(): GroupState {
  return {
    tournament: null,
    standings: [],
    finalCreated: false,
    plateCreated: false,
    winnerTrophy: false,
    runnerTrophy: false,
    plateWinnerTrophy: false,
    plateRunnerTrophy: false,
  };
}
