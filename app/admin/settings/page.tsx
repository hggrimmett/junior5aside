"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { getLeagueTable, TeamStanding } from "@/lib/tournament-logic";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  tournament_id: string;
}

interface MatchExport {
  team_a: { name: string };
  team_b: { name: string };
  score_a: number;
  score_b: number;
  wickets_a: number;
  wickets_b: number;
  status: boolean;
  match_type: string;
  scheduled_time: string | null;
}

interface Counts {
  players: number;
  parents: number;
  matches: number;
}

const COLOURS: TournamentColour[] = ["Green", "Red", "Blue"];

// ── Page ───────────────────────────────────────────────────

export default function AdminSettingsPage() {
  const supabase = getSupabaseBrowserClient();

  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [counts, setCounts] = useState<Counts>({ players: 0, parents: 0, matches: 0 });
  const [loading, setLoading] = useState(true);
  const [purging, setPurging] = useState(false);
  const [purgeConfirm, setPurgeConfirm] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Auth guard ──────────────────────────────────────────

  useEffect(() => {
    async function checkRole() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = "/login";
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single<{ role: string }>();

      if (profile?.role === "superadmin" || profile?.role === "coach") {
        setAuthorized(true);
      } else {
        window.location.href = "/dashboard";
      }
    }
    checkRole();
  }, [supabase]);

  // ── Fetch counts ─────────────────────────────────────────

  const fetchCounts = useCallback(async () => {
    const [playersRes, parentsRes, matchesRes] = await Promise.all([
      supabase.from("players").select("id", { count: "exact", head: true }),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "parent"),
      supabase.from("matches").select("id", { count: "exact", head: true }),
    ]);

    setCounts({
      players: playersRes.count ?? 0,
      parents: parentsRes.count ?? 0,
      matches: matchesRes.count ?? 0,
    });
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  // ── GDPR Purge ───────────────────────────────────────────

  async function handlePurge() {
    setPurging(true);
    setError(null);

    // 1. Delete all players
    const { error: playersErr } = await supabase
      .from("players")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000"); // match all rows

    if (playersErr) {
      setError(`Players delete failed: ${playersErr.message}`);
      setPurging(false);
      return;
    }

    // 2. Anonymize teams: remove mentor links
    const { error: teamsErr } = await supabase
      .from("teams")
      .update({ mentor_id: null })
      .neq("id", "00000000-0000-0000-0000-000000000000");

    if (teamsErr) {
      setError(`Teams anonymize failed: ${teamsErr.message}`);
      setPurging(false);
      return;
    }

    // 3. Delete non-superadmin profiles
    const { error: profilesErr } = await supabase
      .from("profiles")
      .delete()
      .neq("role", "superadmin");

    if (profilesErr) {
      setError(`Profiles delete failed: ${profilesErr.message}`);
      setPurging(false);
      return;
    }

    setPurging(false);
    setPurgeConfirm(false);
    showToast("Tournament data purged. Matches & teams retained (anonymized).");
    fetchCounts();
  }

  // ── CSV Export ───────────────────────────────────────────

  async function handleExport() {
    setExporting(true);
    setError(null);

    // Fetch tournaments, teams, matches, and standings
    const [tournamentsRes, teamsRes, matchesRes] = await Promise.all([
      supabase.from("tournaments").select("*").returns<Tournament[]>(),
      supabase.from("teams").select("id, name, tournament_id").returns<TeamRow[]>(),
      supabase
        .from("matches")
        .select(
          "team_a:teams!team_a_id(name), team_b:teams!team_b_id(name), score_a, score_b, wickets_a, wickets_b, status, match_type, scheduled_time"
        )
        .eq("status", true)
        .order("scheduled_time", { ascending: true })
        .returns<MatchExport[]>(),
    ]);

    const tournaments = tournamentsRes.data ?? [];
    const teamsData = teamsRes.data ?? [];
    const matchesData = matchesRes.data ?? [];

    // Build team name lookup
    const teamNameMap: Record<string, string> = {};
    for (const t of teamsData) teamNameMap[t.id] = t.name;

    // Build tournament lookup
    const tournamentMap: Record<TournamentColour, Tournament | null> = {
      Green: null,
      Red: null,
      Blue: null,
    };
    for (const t of tournaments) {
      if (!tournamentMap[t.colour]) tournamentMap[t.colour] = t;
    }

    // Build standings per group
    const standingsMap: Record<TournamentColour, TeamStanding[]> = {
      Green: [],
      Red: [],
      Blue: [],
    };
    await Promise.all(
      COLOURS.map(async (group) => {
        const t = tournamentMap[group];
        if (!t) return;
        try {
          standingsMap[group] = await getLeagueTable(supabase, t.id);
        } catch {
          // skip
        }
      })
    );

    // ── Build CSV lines ────────────────────────────────────

    const lines: string[] = [];

    // League tables
    for (const group of COLOURS) {
      const standings = standingsMap[group];
      if (standings.length === 0) continue;

      lines.push("");
      lines.push(`LEAGUE TABLE - ${group.toUpperCase()}`);
      lines.push("Rank,Team,P,W,D,L,Pts,Runs");

      standings.forEach((row, i) => {
        lines.push(
          [
            i + 1,
            csvEscape(teamNameMap[row.teamId] ?? row.teamId),
            row.gamesPlayed,
            row.won,
            row.drawn,
            row.lost,
            row.totalPoints,
            row.totalRuns,
          ].join(",")
        );
      });
    }

    // Match results
    if (matchesData.length > 0) {
      lines.push("");
      lines.push("MATCH RESULTS");
      lines.push("Team A,Score A,Wickets A,Team B,Score B,Wickets B,Type,Date");

      for (const m of matchesData) {
        lines.push(
          [
            csvEscape(m.team_a.name),
            m.score_a,
            m.wickets_a,
            csvEscape(m.team_b.name),
            m.score_b,
            m.wickets_b,
            m.match_type,
            m.scheduled_time ? new Date(m.scheduled_time).toLocaleString() : "",
          ].join(",")
        );
      }
    }

    // Download
    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tournament-archive-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setExporting(false);
    showToast("CSV exported successfully.");
  }

  // ── Toast helper ─────────────────────────────────────────

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  // ── Render ───────────────────────────────────────────────

  if (!authorized) {
    return (
      <div className="flex h-60 items-center justify-center">
        <svg className="h-6 w-6 animate-spin text-muted-foreground" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-md px-4 py-6 space-y-5">
        {/* Error */}
        {error && (
          <Card className="rounded-2xl border-destructive/50 bg-destructive/5">
            <CardContent className="pt-4 pb-4 text-sm text-destructive">{error}</CardContent>
          </Card>
        )}

        {/* ── Stat cards — 3-col grid ─────────────────── */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Players" value={counts.players} loading={loading} />
          <StatCard label="Parents" value={counts.parents} loading={loading} />
          <StatCard label="Matches" value={counts.matches} loading={loading} />
        </div>

        {/* ── Export card ──────────────────────────────── */}
        <Card className="rounded-2xl shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-black">Export Master Sheet</CardTitle>
            <CardDescription className="text-sm">
              Download a CSV with all league tables and completed match results
              for club archives.
            </CardDescription>
          </CardHeader>
          <CardFooter className="pt-0">
            <Button
              onClick={handleExport}
              disabled={exporting}
              className="h-12 w-full rounded-xl bg-[#114232] hover:bg-[#1a5c44] text-white font-bold gap-2"
            >
              {exporting ? (
                <>
                  <Spinner />
                  Generating...
                </>
              ) : (
                <>
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v3a2 2 0 002 2h14a2 2 0 002-2v-3"
                    />
                  </svg>
                  Download CSV
                </>
              )}
            </Button>
          </CardFooter>
        </Card>

        {/* ── GDPR Purge card ──────────────────────────── */}
        <Card className="rounded-2xl shadow-md border-2 border-destructive/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-black text-destructive">
              Tournament Reset &amp; GDPR Purge
            </CardTitle>
            <CardDescription className="text-sm">
              Permanently deletes all player and non-superadmin profile data.
              Matches and teams are retained but anonymized.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <Separator />

            {/* Warning list */}
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 space-y-2">
              <p className="text-sm font-bold text-amber-800">This action will:</p>
              <ul className="list-disc pl-5 text-xs text-amber-700 space-y-1 leading-relaxed">
                <li>Delete all rows from the <strong>players</strong> table</li>
                <li>Delete all <strong>parent</strong> and <strong>mentor</strong> profiles</li>
                <li>Set <strong>mentor_id = null</strong> on all teams</li>
                <li>Retain all matches, teams, and tournament structure</li>
                <li>Admin profiles are <strong>not</strong> affected</li>
              </ul>
            </div>

            {!purgeConfirm ? (
              <Button
                variant="outline"
                onClick={() => setPurgeConfirm(true)}
                className="h-12 w-full rounded-xl border-destructive/50 text-destructive hover:bg-destructive/5 hover:text-destructive font-bold"
              >
                Begin Tournament Reset...
              </Button>
            ) : (
              <div className="space-y-2">
                <Button
                  variant="destructive"
                  onClick={handlePurge}
                  disabled={purging}
                  className="h-12 w-full rounded-xl font-bold gap-2"
                >
                  {purging ? (
                    <>
                      <Spinner />
                      Purging...
                    </>
                  ) : (
                    "Confirm Purge — Cannot Be Undone"
                  )}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setPurgeConfirm(false)}
                  disabled={purging}
                  className="h-12 w-full rounded-xl"
                >
                  Cancel
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-2xl bg-emerald-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────

function StatCard({
  label,
  value,
  loading,
}: {
  label: string;
  value: number;
  loading: boolean;
}) {
  return (
    <Card className="rounded-2xl shadow-md">
      <CardContent className="pt-5 pb-4 text-center px-2">
        {loading ? (
          <div className="mx-auto h-9 w-10 animate-pulse rounded bg-muted" />
        ) : (
          <p className="text-4xl font-black tabular-nums">{value}</p>
        )}
        <p className="mt-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground leading-tight">
          {label}
        </p>
      </CardContent>
    </Card>
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
  );
}

// ── CSV helper ─────────────────────────────────────────────

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
