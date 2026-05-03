"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { getLeagueTable, TeamStanding } from "@/lib/tournament-logic";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

// ── Types ──────────────────────────────────────────────────

type TournamentColour = "Green" | "Red" | "Blue";

interface Tournament {
  id: string;
  name: string;
  colour: TournamentColour;
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

const COLOURS: TournamentColour[] = ["Green", "Red", "Blue"];

const GROUP_STYLE: Record<
  TournamentColour,
  { headerGradient: string; badge: string; accent: string; matchupAccent: string }
> = {
  Green: {
    headerGradient: "from-emerald-700 to-emerald-500",
    badge: "bg-white/20 text-white border-white/30",
    accent: "text-emerald-700",
    matchupAccent: "text-emerald-600",
  },
  Red: {
    headerGradient: "from-red-700 to-red-500",
    badge: "bg-white/20 text-white border-white/30",
    accent: "text-red-700",
    matchupAccent: "text-red-600",
  },
  Blue: {
    headerGradient: "from-blue-800 to-blue-600",
    badge: "bg-white/20 text-white border-white/30",
    accent: "text-blue-700",
    matchupAccent: "text-blue-600",
  },
};

// ── Component ──────────────────────────────────────────────

export default function FinalsManager() {
  const supabase = getSupabaseBrowserClient();

  const [groups, setGroups] = useState<Record<TournamentColour, GroupState>>({
    Green: emptyGroup(),
    Red: emptyGroup(),
    Blue: emptyGroup(),
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

    // Map tournaments by colour
    const tournamentMap: Record<TournamentColour, Tournament | null> = {
      Green: null,
      Red: null,
      Blue: null,
    };
    for (const t of tournamentsRes.data ?? []) {
      if (!tournamentMap[t.colour]) {
        tournamentMap[t.colour] = t;
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
    const next: Record<TournamentColour, GroupState> = {
      Green: emptyGroup(),
      Red: emptyGroup(),
      Blue: emptyGroup(),
    };

    await Promise.all(
      COLOURS.map(async (group) => {
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

  async function createFinals(group: TournamentColour) {
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
    group: TournamentColour,
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
      <div className="mx-auto max-w-md px-4">
        <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
          Loading finals data...
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 space-y-5">
      {error && (
        <Card className="rounded-2xl border-destructive/50 bg-destructive/5">
          <CardContent className="pt-4 pb-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {/* 3 stacked cards — one per group */}
      {COLOURS.map((group) => {
        const g = groups[group];
        const s = GROUP_STYLE[group];
        const hasEnoughTeams = g.standings.length >= 2;
        const hasPlateTeams = g.standings.length >= 4;
        const isBusy = busyGroup === group;

        return (
          <Card key={group} className="rounded-2xl shadow-md overflow-hidden">
            {/* Coloured top bar */}
            <div className={`bg-gradient-to-r ${s.headerGradient} px-5 py-4`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white font-black text-lg leading-tight">{group} Group</p>
                  {g.tournament && (
                    <p className="text-white/70 text-xs mt-0.5">{g.tournament.name}</p>
                  )}
                </div>
                {g.finalCreated && (
                  <Badge
                    variant="outline"
                    className="border-white/30 bg-white/20 text-white font-semibold text-xs"
                  >
                    Created
                  </Badge>
                )}
              </div>
            </div>

            <CardContent className="space-y-4 pt-5 pb-5">
              {!g.tournament ? (
                <p className="text-sm text-muted-foreground">
                  No tournament found for this age group.
                </p>
              ) : !hasEnoughTeams ? (
                <p className="text-sm text-muted-foreground">
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
                    accentClass={s.matchupAccent}
                  />

                  {/* Plate Final: 3rd vs 4th */}
                  {hasPlateTeams ? (
                    <MatchupCard
                      label="Plate Final"
                      teamA={teamName(g.standings[2].teamId)}
                      teamB={teamName(g.standings[3].teamId)}
                      rankA="3rd"
                      rankB="4th"
                      accentClass={s.matchupAccent}
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Not enough teams for a plate final.
                    </p>
                  )}

                  {/* Create button */}
                  {!g.finalCreated ? (
                    <Button
                      onClick={() => createFinals(group)}
                      disabled={isBusy}
                      className="h-12 w-full rounded-xl bg-[#114232] hover:bg-[#1a5c44] text-white font-bold"
                    >
                      {isBusy ? (
                        <span className="flex items-center gap-2">
                          <Spinner />
                          Creating...
                        </span>
                      ) : (
                        "Create Final Matches"
                      )}
                    </Button>
                  ) : (
                    <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-center">
                      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100">
                        Final matches created
                      </Badge>
                    </div>
                  )}

                  {/* Trophy tracker */}
                  {g.finalCreated && (
                    <>
                      <Separator />
                      <div className="space-y-1">
                        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
                          Trophy Tracker
                        </p>

                        <TrophyCheck
                          id={`${group}-winner`}
                          label={`Winners — ${teamName(g.standings[0].teamId)}`}
                          checked={g.winnerTrophy}
                          onChange={() => toggleTrophy(group, "winnerTrophy")}
                        />
                        <TrophyCheck
                          id={`${group}-runner`}
                          label={`Runners-up — ${teamName(g.standings[1].teamId)}`}
                          checked={g.runnerTrophy}
                          onChange={() => toggleTrophy(group, "runnerTrophy")}
                        />

                        {hasPlateTeams && (
                          <>
                            <TrophyCheck
                              id={`${group}-plate-winner`}
                              label={`Plate Winners — ${teamName(g.standings[2].teamId)}`}
                              checked={g.plateWinnerTrophy}
                              onChange={() => toggleTrophy(group, "plateWinnerTrophy")}
                            />
                            <TrophyCheck
                              id={`${group}-plate-runner`}
                              label={`Plate Runners-up — ${teamName(g.standings[3].teamId)}`}
                              checked={g.plateRunnerTrophy}
                              onChange={() => toggleTrophy(group, "plateRunnerTrophy")}
                            />
                          </>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-2xl bg-emerald-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg animate-slide-up">
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
  accentClass,
}: {
  label: string;
  teamA: string;
  teamB: string;
  rankA: string;
  rankB: string;
  accentClass: string;
}) {
  return (
    <div className="rounded-xl bg-muted/40 px-4 py-4">
      <p className={`mb-3 text-xs font-black uppercase tracking-widest ${accentClass}`}>
        {label}
      </p>
      <div className="flex items-center gap-3">
        <div className="flex-1 text-center">
          <span className="block text-xs text-muted-foreground font-semibold">{rankA}</span>
          <p className="mt-0.5 text-base font-bold truncate">{teamA}</p>
        </div>
        <span className="shrink-0 text-sm font-black text-muted-foreground/40">VS</span>
        <div className="flex-1 text-center">
          <span className="block text-xs text-muted-foreground font-semibold">{rankB}</span>
          <p className="mt-0.5 text-base font-bold truncate">{teamB}</p>
        </div>
      </div>
    </div>
  );
}

function TrophyCheck({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-3 transition active:bg-muted/70 hover:bg-muted/50">
      <Checkbox id={id} checked={checked} onCheckedChange={onChange} className="h-5 w-5" />
      <Label
        htmlFor={id}
        className={`cursor-pointer text-sm leading-snug ${
          checked
            ? "font-semibold line-through decoration-muted-foreground/50"
            : "text-muted-foreground"
        }`}
      >
        {checked ? "\u{1F3C6} " : ""}{label}
      </Label>
    </div>
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
