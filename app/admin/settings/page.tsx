"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { Input } from "@/components/ui/input";
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

interface PlayerExport {
  id: string;
  name: string;
  age_group: string;
  parent_name: string;
}

interface Counts {
  players: number;
  parents: number;
  matches: number;
}

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

  // ── Export Players CSV ───────────────────────────────────

  async function handleExportPlayers() {
    setExporting(true);
    setError(null);

    // Fetch players with parent names
    const { data: players, error: fetchErr } = await supabase
      .from("players")
      .select("id, name, age_group, parent_id")
      .order("age_group")
      .order("name");

    if (fetchErr) {
      setError(fetchErr.message);
      setExporting(false);
      return;
    }

    // Fetch parent names
    const parentIds = [...new Set((players ?? []).map((p: { parent_id: string }) => p.parent_id))];
    let parentNames: Record<string, string> = {};
    if (parentIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", parentIds);
      for (const p of profiles ?? []) {
        parentNames[p.id] = p.full_name;
      }
    }

    // Build CSV
    const lines = ["Player ID,Player Name,School Year,Parent Name,Team Name,Tournament"];
    for (const p of players ?? []) {
      lines.push(
        [
          p.id,
          csvEscape(p.name),
          p.age_group,
          csvEscape(parentNames[p.parent_id] ?? ""),
          "", // Team Name — blank for coaches to fill in
          "", // Tournament — blank for coaches to fill in
        ].join(",")
      );
    }

    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `registered-players-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setExporting(false);
    showToast("Players CSV exported.");
  }

  // ── Import Teams CSV ───────────────────────────────────

  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  async function handleImportTeams(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setError(null);
    setImportResult(null);

    const text = await file.text();
    const rows = text.split("\n").map((r) => r.split(",").map((c) => c.trim().replace(/^"|"$/g, "")));

    // Find header row
    const header = rows[0]?.map((h) => h.toLowerCase()) ?? [];
    const idIdx = header.indexOf("player id");
    const teamIdx = header.indexOf("team name");
    const tournamentIdx = header.indexOf("tournament");

    if (idIdx === -1 || teamIdx === -1) {
      setError("CSV must have 'Player ID' and 'Team Name' columns.");
      setImporting(false);
      return;
    }

    // Collect unique team+tournament combos and player assignments
    const teamPlayers = new Map<string, { tournament: string; playerIds: string[] }>();

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const playerId = row[idIdx]?.trim();
      const teamName = row[teamIdx]?.trim();
      const tournament = tournamentIdx !== -1 ? row[tournamentIdx]?.trim() : "";

      if (!playerId || !teamName) continue;

      const key = `${teamName}|||${tournament}`;
      if (!teamPlayers.has(key)) {
        teamPlayers.set(key, { tournament, playerIds: [] });
      }
      teamPlayers.get(key)!.playerIds.push(playerId);
    }

    // Fetch tournaments to map names to IDs
    const { data: tournaments } = await supabase
      .from("tournaments")
      .select("id, name, colour");

    const tournamentLookup: Record<string, string> = {};
    for (const t of tournaments ?? []) {
      tournamentLookup[t.name.toLowerCase()] = t.id;
      tournamentLookup[t.colour.toLowerCase()] = t.id;
    }

    let teamsCreated = 0;
    let playersAssigned = 0;

    for (const [key, { tournament, playerIds }] of teamPlayers) {
      const teamName = key.split("|||")[0];
      const tournamentId = tournamentLookup[tournament.toLowerCase()];

      if (!tournamentId) continue;

      // Create or find team
      let teamId: string;
      const { data: existing } = await supabase
        .from("teams")
        .select("id")
        .eq("name", teamName)
        .eq("tournament_id", tournamentId)
        .limit(1)
        .single();

      if (existing) {
        teamId = existing.id;
      } else {
        const { data: newTeam, error: teamErr } = await supabase
          .from("teams")
          .insert({ name: teamName, tournament_id: tournamentId })
          .select("id")
          .single();

        if (teamErr || !newTeam) continue;
        teamId = newTeam.id;
        teamsCreated++;
      }

      // Assign players
      for (const pid of playerIds) {
        const { error: updateErr } = await supabase
          .from("players")
          .update({ team_id: teamId })
          .eq("id", pid);

        if (!updateErr) playersAssigned++;
      }
    }

    setImportResult(`${teamsCreated} teams created, ${playersAssigned} players assigned.`);
    setImporting(false);
    fetchCounts();

    // Reset file input
    e.target.value = "";
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

        {/* ── Export Players ────────────────────────────── */}
        <Card className="rounded-2xl shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-black">Export Registered Players</CardTitle>
            <CardDescription className="text-sm">
              Download a CSV of all registered players with their school year and parent.
              Fill in the &quot;Team Name&quot; and &quot;Tournament&quot; columns, then import it back.
            </CardDescription>
          </CardHeader>
          <CardFooter className="pt-0">
            <Button
              onClick={handleExportPlayers}
              disabled={exporting}
              className="h-12 w-full rounded-xl bg-[#114232] hover:bg-[#1a5c44] text-white font-bold gap-2"
            >
              {exporting ? (
                <>
                  <Spinner />
                  Exporting...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v3a2 2 0 002 2h14a2 2 0 002-2v-3" />
                  </svg>
                  Export Players CSV
                </>
              )}
            </Button>
          </CardFooter>
        </Card>

        {/* ── Import Teams ─────────────────────────────── */}
        <Card className="rounded-2xl shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-black">Import Team Allocations</CardTitle>
            <CardDescription className="text-sm">
              Upload the completed CSV with &quot;Team Name&quot; and &quot;Tournament&quot; columns filled in.
              Teams will be created and players assigned automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/40 text-sm font-bold text-muted-foreground transition-colors active:bg-muted">
              {importing ? (
                <>
                  <Spinner />
                  Importing...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                  Choose CSV File
                </>
              )}
              <Input
                type="file"
                accept=".csv"
                onChange={handleImportTeams}
                disabled={importing}
                className="hidden"
              />
            </label>

            {importResult && (
              <div className="rounded-xl bg-cricket/5 border border-cricket/20 px-4 py-3 text-sm font-semibold text-cricket">
                {importResult}
              </div>
            )}
          </CardContent>
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
