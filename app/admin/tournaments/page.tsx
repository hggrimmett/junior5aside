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
                        Max team size
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
