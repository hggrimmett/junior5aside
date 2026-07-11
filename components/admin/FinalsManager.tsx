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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ── Types ──────────────────────────────────────────────────

type TournamentColour = "Green" | "Red" | "Blue";

interface Tournament {
  id: string;
  name: string;
  colour: TournamentColour;
  schedule_grand_final: boolean;
  schedule_plate_final: boolean;
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
  const [plateStart, setPlateStart] = useState<Record<TournamentColour, string>>({
    Green: "",
    Red: "",
    Blue: "",
  });
  const [scheduleGrandFinal, setScheduleGrandFinal] = useState<Record<TournamentColour, boolean>>({
    Green: true,
    Red: true,
    Blue: true,
  });
  const [schedulePlateFinal, setSchedulePlateFinal] = useState<Record<TournamentColour, boolean>>({
    Green: true,
    Red: true,
    Blue: true,
  });

  // Teams grouped by tournament, for the manual finalist dropdowns.
  const [teamsByTournament, setTeamsByTournament] = useState<Record<string, Array<{ id: string; name: string }>>>({});

  // Placeholder finals rows per group (id + current teams) so we can UPDATE them.
  const [placeholderMatches, setPlaceholderMatches] = useState<Record<TournamentColour, {
    final: { id: string; team_a_id: string | null; team_b_id: string | null } | null;
    plate: { id: string; team_a_id: string | null; team_b_id: string | null } | null;
  }>>({
    Green: { final: null, plate: null },
    Red: { final: null, plate: null },
    Blue: { final: null, plate: null },
  });

  // Persist toggle changes to the tournament row.
  async function persistToggle(
    tournamentId: string,
    field: "schedule_grand_final" | "schedule_plate_final",
    value: boolean,
  ) {
    await supabase.from("tournaments").update({ [field]: value }).eq("id", tournamentId);
  }

  // ── Fetch data ───────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [tournamentsRes, teamsRes, existingFinalsRes] = await Promise.all([
      supabase.from("tournaments").select("*").returns<Tournament[]>(),
      supabase.from("teams").select("id, name, tournament_id").returns<Array<{ id: string; name: string; tournament_id: string }>>(),
      supabase
        .from("matches")
        .select("id, tournament_id, match_type, team_a_id, team_b_id")
        .in("match_type", ["final", "plate_final"])
        .eq("status", false)
        .returns<Array<{ id: string; tournament_id: string; match_type: string; team_a_id: string | null; team_b_id: string | null }>>(),
    ]);

    // Build team name map + group teams by tournament for dropdowns
    const names: Record<string, string> = {};
    const teamsGrouped: Record<string, Array<{ id: string; name: string }>> = {};
    for (const t of teamsRes.data ?? []) {
      names[t.id] = t.name;
      const arr = teamsGrouped[t.tournament_id] ?? [];
      arr.push({ id: t.id, name: t.name });
      teamsGrouped[t.tournament_id] = arr;
    }
    setTeamNames(names);
    setTeamsByTournament(teamsGrouped);

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

    // Seed toggle state from the persistent columns per group.
    const nextGrand: Record<TournamentColour, boolean> = { Green: true, Red: true, Blue: true };
    const nextPlate: Record<TournamentColour, boolean> = { Green: true, Red: true, Blue: true };
    for (const g of COLOURS) {
      const t = tournamentMap[g];
      if (t) {
        nextGrand[g] = t.schedule_grand_final;
        nextPlate[g] = t.schedule_plate_final;
      }
    }
    // Populate placeholder finals per group so manual selectors can bind to them.
    const nextPlaceholders: Record<TournamentColour, {
      final: { id: string; team_a_id: string | null; team_b_id: string | null } | null;
      plate: { id: string; team_a_id: string | null; team_b_id: string | null } | null;
    }> = {
      Green: { final: null, plate: null },
      Red: { final: null, plate: null },
      Blue: { final: null, plate: null },
    };
    for (const row of existingFinalsRes.data ?? []) {
      const grp = COLOURS.find((c) => tournamentMap[c]?.id === row.tournament_id);
      if (!grp) continue;
      if (row.match_type === "final") {
        nextPlaceholders[grp].final = { id: row.id, team_a_id: row.team_a_id, team_b_id: row.team_b_id };
      } else if (row.match_type === "plate_final") {
        nextPlaceholders[grp].plate = { id: row.id, team_a_id: row.team_a_id, team_b_id: row.team_b_id };
      }
    }
    setPlaceholderMatches(nextPlaceholders);

    setScheduleGrandFinal(nextGrand);
    setSchedulePlateFinal(nextPlate);

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
    if (!scheduleGrandFinal[group]) return; // Master toggle off — nothing to create.

    setBusyGroup(group);
    setError(null);

    const wantPlate = schedulePlateFinal[group] && g.standings.length >= 4;
    const localInput = plateStart[group];

    // When plate is scheduled, the datetime is the plate start; Final runs +25 min.
    // When plate is off, the datetime is the Final start.
    let plateIso: string | null = null;
    let finalIso: string | null = null;
    if (localInput) {
      const startMs = new Date(localInput).getTime();
      if (wantPlate) {
        plateIso = new Date(startMs).toISOString();
        finalIso = new Date(startMs + 25 * 60_000).toISOString();
      } else {
        finalIso = new Date(startMs).toISOString();
      }
    }

    const tournamentId = g.tournament.id;

    // Prefer to update the placeholder rows Generate Fixtures already
    // inserted, so their reserved scheduled_time is preserved. If none exist
    // for this tournament (older data), fall through to an INSERT.
    const { data: existingFinals } = await supabase
      .from("matches")
      .select("id, match_type, scheduled_time")
      .eq("tournament_id", tournamentId)
      .in("match_type", ["final", "plate_final"])
      .eq("status", false);

    const existingFinal = (existingFinals ?? []).find((m) => m.match_type === "final");
    const existingPlate = (existingFinals ?? []).find((m) => m.match_type === "plate_final");

    let insertErr: { message: string } | null = null;

    // Handle Plate Final (3rd vs 4th)
    if (wantPlate) {
      if (existingPlate) {
        const { error } = await supabase
          .from("matches")
          .update({
            team_a_id: g.standings[2].teamId,
            team_b_id: g.standings[3].teamId,
            scheduled_time: plateIso ?? existingPlate.scheduled_time,
          })
          .eq("id", existingPlate.id);
        if (error) insertErr = error;
      } else {
        const { error } = await supabase.from("matches").insert({
          tournament_id: tournamentId,
          team_a_id: g.standings[2].teamId,
          team_b_id: g.standings[3].teamId,
          match_type: "plate_final",
          score_a: 0, score_b: 0, wickets_a: 0, wickets_b: 0,
          status: false,
          scheduled_time: plateIso,
        });
        if (error) insertErr = error;
      }
    } else if (existingPlate) {
      // Plate was toggled off since generation — drop the placeholder.
      await supabase.from("matches").delete().eq("id", existingPlate.id);
    }

    // Handle Grand Final (1st vs 2nd)
    if (existingFinal) {
      const { error } = await supabase
        .from("matches")
        .update({
          team_a_id: g.standings[0].teamId,
          team_b_id: g.standings[1].teamId,
          scheduled_time: finalIso ?? existingFinal.scheduled_time,
        })
        .eq("id", existingFinal.id);
      if (error) insertErr = error;
    } else {
      const { error } = await supabase.from("matches").insert({
        tournament_id: tournamentId,
        team_a_id: g.standings[0].teamId,
        team_b_id: g.standings[1].teamId,
        match_type: "final",
        score_a: 0, score_b: 0, wickets_a: 0, wickets_b: 0,
        status: false,
        scheduled_time: finalIso,
      });
      if (error) insertErr = error;
    }

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
        plateCreated: schedulePlateFinal[group] && g.standings.length >= 4,
      },
    }));

    setToast(
      schedulePlateFinal[group] && g.standings.length >= 4
        ? `${group} finals created (Plate + Final)`
        : `${group} Grand Final created`,
    );
    setTimeout(() => setToast(null), 2500);
    setBusyGroup(null);
  }

  // ── Manual finalist selection ────────────────────────────

  async function updatePlaceholderTeam(
    matchId: string,
    field: "team_a_id" | "team_b_id",
    teamId: string | null,
  ) {
    await supabase.from("matches").update({ [field]: teamId }).eq("id", matchId);
    // Optimistic local update
    setPlaceholderMatches((prev) => {
      const next = { ...prev };
      for (const g of COLOURS) {
        if (next[g].final?.id === matchId) {
          next[g] = { ...next[g], final: { ...next[g].final!, [field]: teamId } };
        }
        if (next[g].plate?.id === matchId) {
          next[g] = { ...next[g], plate: { ...next[g].plate!, [field]: teamId } };
        }
      }
      return next;
    });
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
              ) : (
                <>
                  {!hasEnoughTeams && (
                    <div className="rounded-xl border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                      Finalists will appear here once the round-robin has produced standings.
                      You can still set toggles and the schedule now.
                    </div>
                  )}

                  {/* Grand Final matchup — only if scheduled AND standings exist */}
                  {scheduleGrandFinal[group] && hasEnoughTeams && (
                    <MatchupCard
                      label="Grand Final"
                      teamA={teamName(g.standings[0].teamId)}
                      teamB={teamName(g.standings[1].teamId)}
                      rankA="1st"
                      rankB="2nd"
                      accentClass={s.matchupAccent}
                    />
                  )}

                  {/* Plate Final matchup — only if both scheduled and enough teams */}
                  {scheduleGrandFinal[group] && schedulePlateFinal[group] && hasPlateTeams && (
                    <MatchupCard
                      label="Plate Final"
                      teamA={teamName(g.standings[2].teamId)}
                      teamB={teamName(g.standings[3].teamId)}
                      rankA="3rd"
                      rankB="4th"
                      accentClass={s.matchupAccent}
                    />
                  )}

                  {/* Toggles */}
                  {!g.finalCreated && (
                    <div className="rounded-xl border bg-muted/30 p-3 space-y-3">
                      <label className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-bold uppercase tracking-wider">Schedule Grand Final</p>
                          <p className="text-[11px] text-muted-foreground leading-snug">
                            Off: 1st and 2nd decided by RR points.
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={scheduleGrandFinal[group]}
                          onChange={(e) => {
                            const val = e.target.checked;
                            setScheduleGrandFinal((prev) => ({ ...prev, [group]: val }));
                            if (g.tournament) persistToggle(g.tournament.id, "schedule_grand_final", val);
                          }}
                          className="h-5 w-5 shrink-0 accent-cricket"
                        />
                      </label>
                      <label className={`flex items-center justify-between gap-3 ${!scheduleGrandFinal[group] || !hasPlateTeams ? "opacity-40" : ""}`}>
                        <div className="min-w-0">
                          <p className="text-xs font-bold uppercase tracking-wider">Schedule Plate Final</p>
                          <p className="text-[11px] text-muted-foreground leading-snug">
                            {hasPlateTeams
                              ? "Off: 3rd and 4th decided by RR points."
                              : "Not enough teams (need 4+)."}
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={schedulePlateFinal[group] && scheduleGrandFinal[group] && hasPlateTeams}
                          disabled={!scheduleGrandFinal[group] || !hasPlateTeams}
                          onChange={(e) => {
                            const val = e.target.checked;
                            setSchedulePlateFinal((prev) => ({ ...prev, [group]: val }));
                            if (g.tournament) persistToggle(g.tournament.id, "schedule_plate_final", val);
                          }}
                          className="h-5 w-5 shrink-0 accent-cricket"
                        />
                      </label>
                    </div>
                  )}

                  {/* Manual finalist selection — for placeholder finals */}
                  {g.tournament && (placeholderMatches[group].plate || placeholderMatches[group].final) && (
                    <div className="rounded-xl border-2 border-cricket/40 bg-cricket/5 p-3 space-y-3">
                      <p className="text-xs font-black uppercase tracking-widest text-cricket">
                        Select finalists
                      </p>
                      {placeholderMatches[group].plate && (
                        <div className="space-y-1.5">
                          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Plate Final</p>
                          <div className="grid grid-cols-2 gap-2">
                            <Select
                              value={placeholderMatches[group].plate!.team_a_id ?? ""}
                              onValueChange={(v) =>
                                updatePlaceholderTeam(placeholderMatches[group].plate!.id, "team_a_id", !v || v === "__tbd__" ? null : v)
                              }
                            >
                              <SelectTrigger className="h-9 text-xs rounded-lg">
                                {placeholderMatches[group].plate!.team_a_id
                                  ? teamName(placeholderMatches[group].plate!.team_a_id!)
                                  : <SelectValue placeholder="Team A" />}
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__tbd__">— TBD —</SelectItem>
                                {(teamsByTournament[g.tournament.id] ?? []).map((t) => (
                                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select
                              value={placeholderMatches[group].plate!.team_b_id ?? ""}
                              onValueChange={(v) =>
                                updatePlaceholderTeam(placeholderMatches[group].plate!.id, "team_b_id", !v || v === "__tbd__" ? null : v)
                              }
                            >
                              <SelectTrigger className="h-9 text-xs rounded-lg">
                                {placeholderMatches[group].plate!.team_b_id
                                  ? teamName(placeholderMatches[group].plate!.team_b_id!)
                                  : <SelectValue placeholder="Team B" />}
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__tbd__">— TBD —</SelectItem>
                                {(teamsByTournament[g.tournament.id] ?? []).map((t) => (
                                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}
                      {placeholderMatches[group].final && (
                        <div className="space-y-1.5">
                          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Grand Final</p>
                          <div className="grid grid-cols-2 gap-2">
                            <Select
                              value={placeholderMatches[group].final!.team_a_id ?? ""}
                              onValueChange={(v) =>
                                updatePlaceholderTeam(placeholderMatches[group].final!.id, "team_a_id", !v || v === "__tbd__" ? null : v)
                              }
                            >
                              <SelectTrigger className="h-9 text-xs rounded-lg">
                                {placeholderMatches[group].final!.team_a_id
                                  ? teamName(placeholderMatches[group].final!.team_a_id!)
                                  : <SelectValue placeholder="Team A" />}
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__tbd__">— TBD —</SelectItem>
                                {(teamsByTournament[g.tournament.id] ?? []).map((t) => (
                                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select
                              value={placeholderMatches[group].final!.team_b_id ?? ""}
                              onValueChange={(v) =>
                                updatePlaceholderTeam(placeholderMatches[group].final!.id, "team_b_id", !v || v === "__tbd__" ? null : v)
                              }
                            >
                              <SelectTrigger className="h-9 text-xs rounded-lg">
                                {placeholderMatches[group].final!.team_b_id
                                  ? teamName(placeholderMatches[group].final!.team_b_id!)
                                  : <SelectValue placeholder="Team B" />}
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__tbd__">— TBD —</SelectItem>
                                {(teamsByTournament[g.tournament.id] ?? []).map((t) => (
                                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}
                      <p className="text-[10px] text-muted-foreground">Selections save immediately.</p>
                    </div>
                  )}

                  {/* Schedule input + Create button */}
                  {!g.finalCreated ? (
                    scheduleGrandFinal[group] ? (
                      <div className="space-y-2">
                        <div className="space-y-1.5">
                          <Label htmlFor={`${group}-plate-start`} className="text-xs font-bold uppercase tracking-wider">
                            {schedulePlateFinal[group] && hasPlateTeams
                              ? "Plate final start time"
                              : "Grand final start time"}
                          </Label>
                          <Input
                            id={`${group}-plate-start`}
                            type="datetime-local"
                            value={plateStart[group]}
                            onChange={(e) =>
                              setPlateStart((prev) => ({ ...prev, [group]: e.target.value }))
                            }
                            className="h-11 rounded-xl"
                          />
                          {schedulePlateFinal[group] && hasPlateTeams && (
                            <p className="text-[11px] text-muted-foreground">
                              Grand Final runs 25 min after the Plate.
                            </p>
                          )}
                        </div>
                        <Button
                          onClick={() => createFinals(group)}
                          disabled={isBusy || !hasEnoughTeams}
                          className="h-12 w-full rounded-xl bg-[#114232] hover:bg-[#1a5c44] text-white font-bold disabled:opacity-50"
                        >
                          {isBusy ? (
                            <span className="flex items-center gap-2">
                              <Spinner />
                              Creating...
                            </span>
                          ) : !hasEnoughTeams ? (
                            "Waiting for standings..."
                          ) : (
                            schedulePlateFinal[group] && hasPlateTeams
                              ? "Create Plate + Grand Final"
                              : "Create Grand Final"
                          )}
                        </Button>
                      </div>
                    ) : (
                      <div className="rounded-xl bg-muted/40 border px-4 py-3 text-center text-xs text-muted-foreground">
                        No finals scheduled — final standings will be decided by round-robin points.
                      </div>
                    )
                  ) : (
                    <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-center">
                      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100">
                        Final matches created
                      </Badge>
                    </div>
                  )}

                  {/* Trophy tracker — needs real standings to know winners */}
                  {g.finalCreated && g.standings.length >= 2 && (
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
