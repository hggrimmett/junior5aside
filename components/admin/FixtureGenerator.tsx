"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

// ── Types ──────────────────────────────────────────────────

interface Tournament {
  id: string;
  name: string;
  colour: string;
}

interface Team {
  id: string;
  name: string;
}

interface Fixture {
  teamA: Team;
  teamB: Team;
  time: Date;
  pitch: number;
}

// ── Round Robin ────────────────────────────────────────────

function generateRoundRobin(teams: Team[]): [Team, Team][] {
  const list = [...teams];
  if (list.length % 2 !== 0) list.push({ id: "__bye__", name: "BYE" });

  const n = list.length;
  const pairs: [Team, Team][] = [];

  for (let round = 0; round < n - 1; round++) {
    for (let i = 0; i < n / 2; i++) {
      const home = list[i];
      const away = list[n - 1 - i];
      if (home.id !== "__bye__" && away.id !== "__bye__") {
        pairs.push([home, away]);
      }
    }
    const last = list.pop()!;
    list.splice(1, 0, last);
  }

  return pairs;
}

// ── Component ──────────────────────────────────────────────

export default function FixtureGenerator() {
  const supabase = getSupabaseBrowserClient();

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [teams, setTeams] = useState<Team[]>([]);
  const [startTime, setStartTime] = useState("");
  const [matchDuration, setMatchDuration] = useState(20);
  const [pitchNumber, setPitchNumber] = useState(1);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Load tournaments ─────────────────────────────────────

  useEffect(() => {
    supabase
      .from("tournaments")
      .select("*")
      .returns<Tournament[]>()
      .then(({ data }) => setTournaments(data ?? []));
  }, [supabase]);

  // ── Load teams on tournament change ──────────────────────

  const fetchTeams = useCallback(async () => {
    if (!selectedId) {
      setTeams([]);
      return;
    }
    const { data } = await supabase
      .from("teams")
      .select("id, name")
      .eq("tournament_id", selectedId)
      .returns<Team[]>();
    setTeams(data ?? []);
    setPreviewing(false);
    setFixtures([]);
    setDone(false);
  }, [supabase, selectedId]);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  // ── Generate preview ─────────────────────────────────────

  function handleGenerate() {
    setError(null);

    if (!selectedId) {
      setError("Select a tournament first.");
      return;
    }
    if (teams.length < 2) {
      setError("Need at least 2 teams to generate fixtures.");
      return;
    }
    if (!startTime) {
      setError("Set a start time.");
      return;
    }

    const pairs = generateRoundRobin(teams);
    const base = new Date(startTime);

    const list: Fixture[] = pairs.map(([a, b], i) => ({
      teamA: a,
      teamB: b,
      time: new Date(base.getTime() + i * matchDuration * 60_000),
      pitch: pitchNumber,
    }));

    setFixtures(list);
    setPreviewing(true);
    setDone(false);
  }

  // ── Save fixtures ────────────────────────────────────────

  async function handleSave() {
    setSaving(true);
    setError(null);

    // Clear existing unplayed matches for this tournament
    const { error: deleteErr } = await supabase
      .from("matches")
      .delete()
      .eq("tournament_id", selectedId)
      .eq("status", false);

    if (deleteErr) {
      setError(deleteErr.message);
      setSaving(false);
      return;
    }

    const rows = fixtures.map((f) => ({
      tournament_id: selectedId,
      team_a_id: f.teamA.id,
      team_b_id: f.teamB.id,
      score_a: 0,
      score_b: 0,
      wickets_a: 0,
      wickets_b: 0,
      status: false,
      scheduled_time: f.time.toISOString(),
    }));

    const { error: insertErr } = await supabase.from("matches").insert(rows);

    if (insertErr) {
      setError(insertErr.message);
      setSaving(false);
      return;
    }

    setDone(true);
    setSaving(false);
  }

  // ── Derived ──────────────────────────────────────────────

  const selectedTournament = tournaments.find((t) => t.id === selectedId);
  const expectedMatches =
    teams.length >= 2 ? (teams.length * (teams.length - 1)) / 2 : 0;

  // ── Render ───────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h2 className="text-xl font-bold tracking-tight">Fixture Generator</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Round-robin schedule — every team plays each other once.
        </p>
      </div>

      {/* Error */}
      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-4 pb-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {/* ── Configuration card ────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configuration</CardTitle>
          <CardDescription>Select a tournament and set scheduling options.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Tournament selector */}
          <div className="space-y-1.5">
            <Label htmlFor="tournament-select">Age Group / Tournament</Label>
            <Select value={selectedId} onValueChange={(v) => setSelectedId(v ?? "")}>
              <SelectTrigger id="tournament-select">
                <SelectValue placeholder="Select a tournament..." />
              </SelectTrigger>
              <SelectContent>
                {tournaments.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} — {t.colour}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Team count summary */}
          {selectedId && (
            <div className="rounded-lg bg-muted/60 px-4 py-3 text-sm">
              <span className="font-bold">{teams.length}</span> team
              {teams.length !== 1 && "s"} found
              {expectedMatches > 0 && (
                <span className="text-muted-foreground">
                  {" "}&middot; {expectedMatches} match
                  {expectedMatches !== 1 && "es"} to generate
                </span>
              )}
            </div>
          )}

          <Separator />

          {/* Scheduling inputs */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="start-time">Start Time</Label>
              <Input
                id="start-time"
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="match-duration">Duration (mins)</Label>
              <Input
                id="match-duration"
                type="number"
                min={1}
                value={matchDuration}
                onChange={(e) =>
                  setMatchDuration(Math.max(1, Number(e.target.value) || 1))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pitch-number">Pitch Number</Label>
              <Input
                id="pitch-number"
                type="number"
                min={1}
                value={pitchNumber}
                onChange={(e) =>
                  setPitchNumber(Math.max(1, Number(e.target.value) || 1))
                }
              />
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button
            onClick={handleGenerate}
            disabled={!selectedId || teams.length < 2}
            className="w-full sm:w-auto"
          >
            Generate Preview
          </Button>
        </CardFooter>
      </Card>

      {/* ── Preview ───────────────────────────────────── */}
      {previewing && fixtures.length > 0 && (
        <div className="space-y-4">
          {/* Warning banner */}
          <Card className="border-amber-300 bg-amber-50">
            <CardContent className="flex items-start gap-3 pt-4 pb-4">
              <svg
                className="mt-0.5 h-5 w-5 shrink-0 text-amber-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div>
                <p className="text-sm font-semibold text-amber-800">
                  This will delete existing unplayed matches for this group
                </p>
                <p className="mt-0.5 text-xs text-amber-700">
                  All pending matches (status&nbsp;=&nbsp;false) for{" "}
                  <span className="font-bold">{selectedTournament?.name}</span>{" "}
                  will be removed and replaced. Completed matches are not affected.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Preview table */}
          <Card>
            <CardHeader className="pb-0">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold">
                  Preview — {fixtures.length} match{fixtures.length !== 1 && "es"}
                </CardTitle>
                <span className="text-xs text-muted-foreground">Pitch {pitchNumber}</span>
              </div>
            </CardHeader>

            <CardContent className="pt-4 px-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="w-12 py-2.5 pl-5 pr-1 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        #
                      </th>
                      <th className="py-2.5 px-3 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Team A
                      </th>
                      <th className="w-8 py-2.5 text-center text-xs text-muted-foreground/50">
                        vs
                      </th>
                      <th className="py-2.5 px-3 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Team B
                      </th>
                      <th className="w-14 py-2.5 px-2 text-center text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Pitch
                      </th>
                      <th className="w-28 py-2.5 pl-2 pr-5 text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Time
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {fixtures.map((f, i) => (
                      <tr
                        key={i}
                        className="border-b last:border-0 transition-colors hover:bg-muted/30"
                      >
                        <td className="py-3 pl-5 pr-1">
                          <Badge
                            variant="secondary"
                            className="h-6 w-6 items-center justify-center rounded-full p-0 text-xs font-bold"
                          >
                            {i + 1}
                          </Badge>
                        </td>
                        <td className="py-3 px-3 font-semibold">{f.teamA.name}</td>
                        <td className="py-3 text-center text-muted-foreground/50">vs</td>
                        <td className="py-3 px-3 font-semibold">{f.teamB.name}</td>
                        <td className="py-3 px-2 text-center text-muted-foreground">
                          {f.pitch}
                        </td>
                        <td className="py-3 pl-2 pr-5 text-right tabular-nums text-muted-foreground">
                          {f.time.toLocaleTimeString(undefined, {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Duration summary */}
              <div className="border-t bg-muted/30 px-5 py-2.5 text-xs text-muted-foreground">
                First match{" "}
                <span className="font-medium text-foreground">
                  {fixtures[0].time.toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                {" "}&rarr; last match ends approx.{" "}
                <span className="font-medium text-foreground">
                  {new Date(
                    fixtures[fixtures.length - 1].time.getTime() +
                      matchDuration * 60_000
                  ).toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Save / success */}
          {done ? (
            <Card className="border-emerald-200 bg-emerald-50">
              <CardContent className="py-4 text-center">
                <p className="text-sm font-bold text-emerald-700">
                  {fixtures.length} fixtures saved successfully.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Button
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
              size="lg"
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <svg
                    className="h-4 w-4 animate-spin"
                    xmlns="http://www.w3.org/2000/svg"
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
                  Saving...
                </span>
              ) : (
                "Save Fixtures"
              )}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
