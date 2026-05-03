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

const AGE_GROUPS: AgeGroup[] = ["Blue", "Green", "Red"];

// ── Page ───────────────────────────────────────────────────

export default function AdminSettingsPage() {
  const supabase = getSupabaseBrowserClient();

  const [counts, setCounts] = useState<Counts>({ players: 0, parents: 0, matches: 0 });
  const [loading, setLoading] = useState(true);
  const [purging, setPurging] = useState(false);
  const [purgeConfirm, setPurgeConfirm] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Fetch counts ─────────────────────────────────────────

  const fetchCounts = useCallback(async () => {
    const [playersRes, parentsRes, matchesRes] = await Promise.all([
      supabase.from("players").select("id", { count: "exact", head: true }),
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "parent"),
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

    // 3. Delete non-admin profiles
    const { error: profilesErr } = await supabase
      .from("profiles")
      .delete()
      .neq("role", "admin");

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
    const tournamentMap: Record<AgeGroup, Tournament | null> = { Blue: null, Green: null, Red: null };
    for (const t of tournaments) {
      if (!tournamentMap[t.age_group_category]) tournamentMap[t.age_group_category] = t;
    }

    // Build standings per group
    const standingsMap: Record<AgeGroup, TeamStanding[]> = { Blue: [], Green: [], Red: [] };
    await Promise.all(
      AGE_GROUPS.map(async (group) => {
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
    for (const group of AGE_GROUPS) {
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
            m.scheduled_time
              ? new Date(m.scheduled_time).toLocaleString()
              : "",
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

  return (
    <div className="min-h-screen bg-[#f8f7f4]">
      <div className="mx-auto max-w-3xl px-4 py-10 space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">
            Admin Settings
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            Database summary, data export, and GDPR tools.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* ── Summary cards ───────────────────────────── */}
        <section>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-gray-400">
            Database Summary
          </h2>
          <div className="grid grid-cols-3 gap-4">
            <StatCard label="Players" value={counts.players} loading={loading} />
            <StatCard label="Parents" value={counts.parents} loading={loading} />
            <StatCard label="Matches" value={counts.matches} loading={loading} />
          </div>
        </section>

        {/* ── Export ───────────────────────────────────── */}
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
          <div>
            <h2 className="text-base font-bold text-gray-900">
              Export Master Sheet
            </h2>
            <p className="mt-0.5 text-sm text-gray-400">
              Download a CSV with all league tables and completed match results
              for club archives.
            </p>
          </div>

          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-gray-800 disabled:opacity-50"
          >
            {exporting ? (
              <>
                <Spinner /> Generating...
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v3a2 2 0 002 2h14a2 2 0 002-2v-3" />
                </svg>
                Download CSV
              </>
            )}
          </button>
        </section>

        {/* ── GDPR Purge ──────────────────────────────── */}
        <section className="rounded-2xl border-2 border-red-200 bg-white p-6 shadow-sm space-y-4">
          <div>
            <h2 className="text-base font-bold text-red-700">
              Tournament Reset &amp; GDPR Purge
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Permanently deletes all player and non-admin profile data.
              Matches and teams are retained but anonymized (mentor links removed).
            </p>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 space-y-1">
            <p className="font-semibold">This action will:</p>
            <ul className="list-disc pl-5 text-xs text-amber-700 space-y-0.5">
              <li>Delete all rows from the <strong>players</strong> table</li>
              <li>Delete all <strong>parent</strong> and <strong>mentor</strong> profiles</li>
              <li>Set <strong>mentor_id = null</strong> on all teams</li>
              <li>Retain all matches, teams, and tournament structure</li>
              <li>Admin profiles are <strong>not</strong> affected</li>
            </ul>
          </div>

          {!purgeConfirm ? (
            <button
              onClick={() => setPurgeConfirm(true)}
              className="rounded-xl border-2 border-red-300 px-5 py-2.5 text-sm font-bold text-red-600 transition hover:bg-red-50"
            >
              Begin Tournament Reset...
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={handlePurge}
                disabled={purging}
                className="flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {purging ? (
                  <>
                    <Spinner /> Purging...
                  </>
                ) : (
                  "Confirm Purge"
                )}
              </button>
              <button
                onClick={() => setPurgeConfirm(false)}
                disabled={purging}
                className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          )}
        </section>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-lg">
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
    <div className="rounded-2xl border border-gray-200 bg-white px-5 py-5 shadow-sm text-center">
      {loading ? (
        <div className="mx-auto h-8 w-12 animate-pulse rounded bg-gray-100" />
      ) : (
        <p className="text-3xl font-black text-gray-900">{value}</p>
      )}
      <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-gray-400">
        {label}
      </p>
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

// ── CSV helper ─────────────────────────────────────────────

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
