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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import TeamBalancer from "@/components/admin/TeamBalancer";

// ── Types ──────────────────────────────────────────────────

type TournamentColour = "Green" | "Red" | "Blue";

interface Tournament {
  id: string;
  name: string;
  colour: TournamentColour;
  max_team_size: number;
}

// ── Colour helpers ─────────────────────────────────────────

const COLOUR_BADGE: Record<TournamentColour, string> = {
  Green: "bg-emerald-100 text-emerald-800 border-emerald-200",
  Red:   "bg-red-100 text-red-800 border-red-200",
  Blue:  "bg-blue-100 text-blue-800 border-blue-200",
};

const PITCH_MAP: Record<string, number> = { Blue: 1, Red: 2, Green: 3 };

// ── Spinner ────────────────────────────────────────────────

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

// ── Page ───────────────────────────────────────────────────

export default function TournamentsPage() {
  const supabase = getSupabaseBrowserClient();

  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // ── Export/import state ──────────────────────────────────
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  // ── Expanded balancer state ───────────────────────────────
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ── Per-card save state ───────────────────────────────────
  // Map from tournament id → { pendingSize, saving }
  const [cardState, setCardState] = useState<
    Record<string, { pendingSize: number; saving: boolean }>
  >({});

  // ── Create dialog state ───────────────────────────────────
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColour, setNewColour] = useState<TournamentColour>("Green");
  const [newMaxSize, setNewMaxSize] = useState(5);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // ── Generate fixtures state ───────────────────────────────
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  // ── Auth guard ────────────────────────────────────────────

  useEffect(() => {
    async function checkRole() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

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

  // ── Fetch tournaments ─────────────────────────────────────

  const fetchTournaments = useCallback(async () => {
    setLoading(true);
    const { data, error: fetchErr } = await supabase
      .from("tournaments")
      .select("id, name, colour, max_team_size")
      .order("name")
      .returns<Tournament[]>();

    if (fetchErr) {
      setError(fetchErr.message);
    } else {
      const list = data ?? [];
      setTournaments(list);

      // Initialise card state for any new tournaments
      setCardState((prev) => {
        const next = { ...prev };
        for (const t of list) {
          if (!next[t.id]) {
            next[t.id] = { pendingSize: t.max_team_size, saving: false };
          }
        }
        return next;
      });
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchTournaments();
  }, [fetchTournaments]);

  // ── Save max_team_size ─────────────────────────────────────

  async function handleSaveSize(tournamentId: string) {
    const state = cardState[tournamentId];
    if (!state) return;

    setCardState((prev) => ({
      ...prev,
      [tournamentId]: { ...prev[tournamentId], saving: true },
    }));
    setError(null);

    const { error: updateErr } = await supabase
      .from("tournaments")
      .update({ max_team_size: state.pendingSize })
      .eq("id", tournamentId);

    if (updateErr) {
      setError(updateErr.message);
    } else {
      // Reflect updated value back into tournaments list
      setTournaments((prev) =>
        prev.map((t) =>
          t.id === tournamentId
            ? { ...t, max_team_size: state.pendingSize }
            : t
        )
      );
      showToast("Max team size updated.");
    }

    setCardState((prev) => ({
      ...prev,
      [tournamentId]: { ...prev[tournamentId], saving: false },
    }));
  }

  // ── Create tournament ─────────────────────────────────────

  async function handleCreate() {
    if (!newName.trim()) {
      setCreateError("Name is required.");
      return;
    }

    setCreating(true);
    setCreateError(null);

    const { data, error: insertErr } = await supabase
      .from("tournaments")
      .insert({
        name: newName.trim(),
        colour: newColour,
        max_team_size: newMaxSize,
      })
      .select("id, name, colour, max_team_size")
      .returns<Tournament[]>()
      .single();

    if (insertErr) {
      setCreateError(insertErr.message);
      setCreating(false);
      return;
    }

    if (data) {
      setTournaments((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setCardState((prev) => ({
        ...prev,
        [data.id]: { pendingSize: data.max_team_size, saving: false },
      }));
    }

    // Reset dialog
    setNewName("");
    setNewColour("Green");
    setNewMaxSize(5);
    setCreating(false);
    setDialogOpen(false);
    showToast("Tournament created.");
  }

  // ── Export entrants ──────────────────────────────────────

  async function handleExport() {
    setExporting(true);
    setError(null);

    const { data: players, error: fetchErr } = await supabase
      .from("players")
      .select("first_name, last_name, age_group")
      .order("age_group")
      .order("first_name");

    if (fetchErr) {
      setError(fetchErr.message);
      setExporting(false);
      return;
    }

    const lines = ["First Name,Last Name,School Year,Competition,Team Name,Mentor Email"];
    for (const p of players ?? []) {
      lines.push(`${csvEscape(p.first_name)},${csvEscape(p.last_name)},${p.age_group},,,`);
    }

    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `entrants-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setExporting(false);
    showToast("Entrants exported.");
  }

  // ── Import teams ───────────────────────────────────────

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setError(null);
    setImportResult(null);

    const text = await file.text();
    const rows = text.split("\n").map((r) => r.split(",").map((c) => c.trim().replace(/^"|"$/g, "")));

    const header = rows[0]?.map((h) => h.toLowerCase()) ?? [];
    const firstNameIdx = header.indexOf("first name");
    const lastNameIdx = header.indexOf("last name");
    const compIdx = header.indexOf("competition");
    const teamIdx = header.indexOf("team name");
    const mentorEmailIdx = header.indexOf("mentor email");

    if (firstNameIdx === -1 || lastNameIdx === -1 || compIdx === -1 || teamIdx === -1) {
      setError("CSV must have 'First Name', 'Last Name', 'Competition', 'Team Name', and optionally 'Mentor Email' columns.");
      setImporting(false);
      return;
    }

    // Fetch all players to match by first_name + last_name
    const { data: allPlayers } = await supabase
      .from("players")
      .select("id, first_name, last_name");

    const playerLookup: Record<string, string> = {};
    for (const p of allPlayers ?? []) {
      const key = `${p.first_name} ${p.last_name}`.toLowerCase().trim();
      playerLookup[key] = p.id;
    }

    // Fetch all mentor profiles to match by email
    const { data: mentorProfiles } = await supabase
      .from("profiles")
      .select("id, email")
      .eq("role", "mentor");

    const mentorByEmail: Record<string, string> = {};
    for (const m of mentorProfiles ?? []) {
      if (m.email) {
        mentorByEmail[m.email.toLowerCase()] = m.id;
      }
    }

    // Fetch existing tournaments
    const { data: existingTournaments } = await supabase
      .from("tournaments")
      .select("id, name, colour");

    const tournamentByColour: Record<string, string> = {};
    for (const t of existingTournaments ?? []) {
      tournamentByColour[t.colour.toLowerCase()] = t.id;
      tournamentByColour[t.name.toLowerCase()] = t.id;
    }

    // Collect team assignments
    const teamPlayers = new Map<string, { colour: string; playerIds: string[]; mentorEmail: string }>();
    let skipped = 0;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const firstName = row[firstNameIdx]?.trim();
      const lastName = row[lastNameIdx]?.trim();
      const comp = row[compIdx]?.trim();
      const teamName = row[teamIdx]?.trim();
      const mentorEmail = mentorEmailIdx !== -1 ? (row[mentorEmailIdx]?.trim() ?? "") : "";

      if (!firstName || !lastName || !comp || !teamName) { skipped++; continue; }

      const fullName = `${firstName} ${lastName}`.toLowerCase();
      const playerId = playerLookup[fullName];
      if (!playerId) { skipped++; continue; }

      const key = `${teamName}|||${comp}`;
      if (!teamPlayers.has(key)) {
        teamPlayers.set(key, { colour: comp, playerIds: [], mentorEmail });
      }
      teamPlayers.get(key)!.playerIds.push(playerId);
    }

    let tournamentsCreated = 0;
    let teamsCreated = 0;
    let playersAssigned = 0;

    for (const [key, { colour, playerIds, mentorEmail }] of teamPlayers) {
      const teamName = key.split("|||")[0];

      // Find or create tournament
      let tournamentId = tournamentByColour[colour.toLowerCase()];
      if (!tournamentId) {
        const validColour = ["Green", "Red", "Blue"].find(
          (c) => c.toLowerCase() === colour.toLowerCase()
        );
        if (!validColour) continue;

        const { data: newT } = await supabase
          .from("tournaments")
          .insert({ name: `${validColour} Tournament`, colour: validColour, max_team_size: 4 })
          .select("id")
          .single();

        if (!newT) continue;
        tournamentId = newT.id;
        tournamentByColour[colour.toLowerCase()] = tournamentId;
        tournamentsCreated++;
      }

      // Find or create team
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
        const { data: newTeam } = await supabase
          .from("teams")
          .insert({ name: teamName, tournament_id: tournamentId })
          .select("id")
          .single();

        if (!newTeam) continue;
        teamId = newTeam.id;
        teamsCreated++;
      }

      // Assign mentor if an email was provided and matched
      if (mentorEmail) {
        const mentorId = mentorByEmail[mentorEmail.toLowerCase()];
        if (mentorId) {
          await supabase
            .from("teams")
            .update({ mentor_id: mentorId })
            .eq("id", teamId);
        }
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

    setImportResult(
      `${tournamentsCreated} tournaments, ${teamsCreated} teams created. ${playersAssigned} players assigned.${skipped > 0 ? ` ${skipped} rows skipped.` : ""}`
    );
    setImporting(false);
    fetchTournaments();
    e.target.value = "";
  }

  // ── Generate fixtures ─────────────────────────────────────

  function generateRoundRobin(teams: { id: string; name: string }[]) {
    const list = [...teams];
    if (list.length % 2 !== 0) list.push({ id: "__bye__", name: "BYE" });
    const n = list.length;
    const pairs: [{ id: string; name: string }, { id: string; name: string }][] = [];
    for (let round = 0; round < n - 1; round++) {
      for (let i = 0; i < n / 2; i++) {
        const home = list[i];
        const away = list[n - 1 - i];
        if (home.id !== "__bye__" && away.id !== "__bye__") pairs.push([home, away]);
      }
      const last = list.pop()!;
      list.splice(1, 0, last);
    }
    return pairs;
  }

  async function handleGenerateFixtures(tournament: Tournament) {
    setGeneratingId(tournament.id);
    setError(null);

    // 1. Fetch all teams for this tournament
    const { data: teamsData, error: teamsErr } = await supabase
      .from("teams")
      .select("id, name")
      .eq("tournament_id", tournament.id);

    if (teamsErr) {
      setError(teamsErr.message);
      setGeneratingId(null);
      return;
    }

    const teams = teamsData ?? [];

    // 2. Need at least 2 teams
    if (teams.length < 2) {
      setError(`Not enough teams in ${tournament.name} — need at least 2 to generate fixtures.`);
      setGeneratingId(null);
      return;
    }

    // 3. Generate round-robin pairs
    const pairs = generateRoundRobin(teams);

    // 4. Delete existing unplayed matches for this tournament
    const { error: deleteErr } = await supabase
      .from("matches")
      .delete()
      .eq("tournament_id", tournament.id)
      .eq("status", false);

    if (deleteErr) {
      setError(deleteErr.message);
      setGeneratingId(null);
      return;
    }

    // 5. Bulk insert new matches
    const rows = pairs.map(([home, away]) => ({
      tournament_id: tournament.id,
      team_a_id: home.id,
      team_b_id: away.id,
      score_a: 0,
      score_b: 0,
      wickets_a: 0,
      wickets_b: 0,
      status: false,
      scheduled_time: null,
    }));

    const { error: insertErr } = await supabase.from("matches").insert(rows);

    if (insertErr) {
      setError(insertErr.message);
      setGeneratingId(null);
      return;
    }

    // 6. Toast
    showToast(`${pairs.length} fixtures generated for ${tournament.name}`);
    setGeneratingId(null);
  }

  // ── Toast helper ──────────────────────────────────────────

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  // ── Loading / auth guard render ───────────────────────────

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

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-md px-4 py-6 space-y-5">

        {/* Page header */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-black tracking-tight">Tournament Setup</h1>
          <Button
            onClick={() => {
              setCreateError(null);
              setDialogOpen(true);
            }}
            className="h-12 rounded-2xl bg-[#114232] px-4 font-bold text-white hover:bg-[#1a5c44]"
          >
            + Create
          </Button>
        </div>

        {/* ── Step 1: Export / Step 2: Import ────────── */}
        <Card className="rounded-2xl shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-black">Team Allocation</CardTitle>
            <CardDescription className="text-sm">
              Step 1: Download entrants. Step 2: Fill in Competition &amp; Team Name columns. Step 3: Upload.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Export */}
            <button
              onClick={handleExport}
              disabled={exporting}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-cricket text-sm font-bold text-cricket-foreground shadow-md transition-opacity active:opacity-80 disabled:opacity-60"
            >
              {exporting ? (
                <><Spinner /> Exporting...</>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v3a2 2 0 002 2h14a2 2 0 002-2v-3" />
                  </svg>
                  Download Entrants
                </>
              )}
            </button>

            {/* Import */}
            <label className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/40 text-sm font-bold text-muted-foreground transition-colors active:bg-muted">
              {importing ? (
                <><Spinner /> Importing...</>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                  Upload Completed Sheet
                </>
              )}
              <input
                type="file"
                accept=".csv"
                onChange={handleImport}
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

        {/* Global error banner */}
        {error && (
          <Card className="rounded-2xl border-destructive/50 bg-destructive/5">
            <CardContent className="py-3 text-sm text-destructive">{error}</CardContent>
          </Card>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-36 w-full animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        )}

        {/* Tournament cards */}
        {!loading && tournaments.length === 0 && (
          <Card className="rounded-2xl border-dashed">
            <CardContent className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              No tournaments yet. Tap &ldquo;+ Create&rdquo; to add one.
            </CardContent>
          </Card>
        )}

        {!loading &&
          tournaments.map((tournament) => {
            const cs = cardState[tournament.id] ?? {
              pendingSize: tournament.max_team_size,
              saving: false,
            };
            const isExpanded = expandedId === tournament.id;

            return (
              <div key={tournament.id} className="space-y-3">
                <Card className="rounded-2xl shadow-md">
                  {/* Card header — tap to expand/collapse balancer */}
                  <CardHeader className="pb-2 pt-4">
                    <div className="flex items-center gap-2">
                      <CardTitle
                        className="flex-1 cursor-pointer text-base font-black"
                        onClick={() =>
                          setExpandedId(isExpanded ? null : tournament.id)
                        }
                      >
                        {tournament.name}
                      </CardTitle>
                      <Badge
                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold border ${COLOUR_BADGE[tournament.colour]}`}
                      >
                        {tournament.colour}
                      </Badge>
                      <button
                        onClick={() =>
                          setExpandedId(isExpanded ? null : tournament.id)
                        }
                        aria-label={isExpanded ? "Collapse" : "Expand team balancer"}
                        className="ml-1 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted"
                      >
                        <svg
                          className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2.5}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </div>
                    <CardDescription className="text-xs text-muted-foreground">
                      Tap to {isExpanded ? "hide" : "open"} Team Balancer
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="space-y-3 px-4 pb-2">
                    {/* Max team size editor */}
                    <div className="flex items-center gap-3">
                      <Label
                        htmlFor={`size-${tournament.id}`}
                        className="shrink-0 text-sm font-semibold"
                      >
                        Team size (incl. mentor)
                      </Label>
                      <Input
                        id={`size-${tournament.id}`}
                        type="number"
                        min={1}
                        max={20}
                        value={cs.pendingSize}
                        onChange={(e) =>
                          setCardState((prev) => ({
                            ...prev,
                            [tournament.id]: {
                              ...prev[tournament.id],
                              pendingSize: Math.max(1, Number(e.target.value) || 1),
                            },
                          }))
                        }
                        className="h-12 w-24 text-center text-base font-bold"
                      />
                    </div>
                  </CardContent>

                  <CardFooter className="px-4 pb-4 pt-1">
                    <Button
                      onClick={() => handleSaveSize(tournament.id)}
                      disabled={cs.saving || cs.pendingSize === tournament.max_team_size}
                      className="h-12 w-full rounded-xl bg-[#114232] font-bold text-white hover:bg-[#1a5c44] disabled:opacity-50"
                    >
                      {cs.saving ? (
                        <span className="flex items-center gap-2">
                          <Spinner />
                          Saving...
                        </span>
                      ) : (
                        "Save"
                      )}
                    </Button>
                  </CardFooter>
                </Card>

                {/* Team Balancer — expanded inline */}
                {isExpanded && (
                  <div className="rounded-2xl border bg-background px-4 py-5 shadow-md">
                    <p className="mb-4 text-sm font-black">
                      Team Balancer — {tournament.name}
                    </p>

                    {/* Generate Fixtures */}
                    <button
                      onClick={() => handleGenerateFixtures(tournament)}
                      disabled={generatingId === tournament.id}
                      className="mb-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-[#114232] bg-transparent text-sm font-bold text-[#114232] transition-colors hover:bg-[#114232]/5 active:bg-[#114232]/10 disabled:opacity-60"
                    >
                      {generatingId === tournament.id ? (
                        <><Spinner /> Generating...</>
                      ) : (
                        <>
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Generate Fixtures
                        </>
                      )}
                    </button>

                    <TeamBalancer tournamentId={tournament.id} />
                  </div>
                )}
              </div>
            );
          })}
      </div>

      {/* ── Create Tournament Dialog ──────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="mx-auto max-w-md rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-black">Create Tournament</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="new-name" className="text-sm font-semibold">
                Name
              </Label>
              <Input
                id="new-name"
                placeholder="e.g. Green Tournament 2026"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="h-12"
              />
            </div>

            {/* Colour */}
            <div className="space-y-1.5">
              <Label htmlFor="new-colour" className="text-sm font-semibold">
                Colour
              </Label>
              <Select
                value={newColour}
                onValueChange={(v) => setNewColour(v as TournamentColour)}
              >
                <SelectTrigger id="new-colour" className="h-12">
                  <SelectValue placeholder="Select colour..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Green">Green (Y3 &amp; Y4)</SelectItem>
                  <SelectItem value="Red">Red (Y5 &amp; Y6)</SelectItem>
                  <SelectItem value="Blue">Blue (Y7 &amp; Y8)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Max team size */}
            <div className="space-y-1.5">
              <Label htmlFor="new-max-size" className="text-sm font-semibold">
                Max team size
              </Label>
              <Input
                id="new-max-size"
                type="number"
                min={1}
                max={20}
                value={newMaxSize}
                onChange={(e) =>
                  setNewMaxSize(Math.max(1, Number(e.target.value) || 1))
                }
                className="h-12"
              />
            </div>

            {/* Create error */}
            {createError && (
              <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {createError}
              </p>
            )}
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              onClick={handleCreate}
              disabled={creating}
              className="h-12 w-full rounded-xl bg-[#114232] font-bold text-white hover:bg-[#1a5c44]"
            >
              {creating ? (
                <span className="flex items-center gap-2">
                  <Spinner />
                  Creating...
                </span>
              ) : (
                "Create Tournament"
              )}
            </Button>
            <DialogClose
              disabled={creating}
              className="inline-flex h-12 w-full items-center justify-center rounded-xl text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
            >
              Cancel
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-2xl bg-emerald-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
