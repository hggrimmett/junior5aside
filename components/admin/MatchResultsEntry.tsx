"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { calculateMatchScore } from "@/lib/tournament-logic";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

// ── Types ──────────────────────────────────────────────────

type TournamentColour = "Green" | "Red" | "Blue";

interface Team {
  id: string;
  name: string;
}

interface Match {
  id: string;
  tournament_id: string;
  team_a_id: string;
  team_b_id: string;
  score_a: number;
  score_b: number;
  wickets_a: number;
  wickets_b: number;
  status: boolean;
  scheduled_time: string | null;
  team_a: Team;
  team_b: Team;
}

interface MatchWithGroup extends Match {
  ageGroup: TournamentColour;
}

const COLOURS: TournamentColour[] = ["Green", "Red", "Blue"];

const GROUP_BADGE: Record<TournamentColour, string> = {
  Green: "bg-emerald-100 text-emerald-800 border-emerald-200",
  Red:   "bg-red-100 text-red-800 border-red-200",
  Blue:  "bg-blue-100 text-blue-800 border-blue-200",
};

const GROUP_BORDER: Record<TournamentColour, string> = {
  Green: "border-l-emerald-500",
  Red:   "border-l-red-500",
  Blue:  "border-l-blue-500",
};

// ── Toast ──────────────────────────────────────────────────

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-slide-up rounded-2xl bg-emerald-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg">
      {message}
    </div>
  );
}

// ── Spinner ────────────────────────────────────────────────

function Spinner() {
  return (
    <svg className="h-5 w-5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ── Main Component ─────────────────────────────────────────

export default function MatchResultsEntry({
  tournamentId,
  ageGroupMap,
}: {
  tournamentId: string;
  ageGroupMap: Record<string, TournamentColour>;
}) {
  const supabase = getSupabaseBrowserClient();

  const [matches, setMatches] = useState<MatchWithGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);
  const [selected, setSelected] = useState<MatchWithGroup | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Fetch ────────────────────────────────────────────────

  const fetchMatches = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: fetchErr } = await supabase
      .from("matches")
      .select("*, team_a:teams!team_a_id(id, name), team_b:teams!team_b_id(id, name)")
      .eq("tournament_id", tournamentId)
      .returns<Match[]>();

    if (fetchErr) {
      setError(fetchErr.message);
      setLoading(false);
      return;
    }

    const enriched: MatchWithGroup[] = (data ?? []).map((m) => ({
      ...m,
      ageGroup: ageGroupMap[m.team_a_id] ?? "Green",
    }));

    setMatches(enriched);
    setLoading(false);
  }, [supabase, tournamentId, ageGroupMap]);

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  // ── Filtered + grouped ──────────────────────────────────

  const grouped = useMemo(() => {
    const filtered = showCompleted
      ? matches
      : matches.filter((m) => !m.status);

    const groups: Record<TournamentColour, MatchWithGroup[]> = {
      Green: [],
      Red: [],
      Blue: [],
    };

    for (const m of filtered) {
      groups[m.ageGroup].push(m);
    }

    return groups;
  }, [matches, showCompleted]);

  // ── Render ───────────────────────────────────────────────

  if (loading) {
    return (
      <div className="mx-auto max-w-md px-4">
        <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
          Loading matches...
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 space-y-5">
      {/* Show completed toggle — no page header, content first */}
      <div className="flex items-center justify-between rounded-2xl bg-muted/50 px-4 py-3">
        <span className="text-sm font-semibold text-foreground">Show Completed</span>
        <button
          role="switch"
          aria-checked={showCompleted}
          onClick={() => setShowCompleted((v) => !v)}
          className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            showCompleted ? "bg-[#114232]" : "bg-input"
          }`}
        >
          <span
            className={`pointer-events-none block h-6 w-6 rounded-full bg-white shadow-lg ring-0 transition-transform ${
              showCompleted ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {error && (
        <Card className="rounded-2xl border-destructive/50 bg-destructive/5">
          <CardContent className="pt-4 pb-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {/* Grouped lists */}
      {COLOURS.map((group) => {
        const list = grouped[group];
        if (list.length === 0) return null;

        return (
          <section key={group} className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <Badge
                variant="outline"
                className={`text-xs font-bold px-2.5 py-0.5 ${GROUP_BADGE[group]}`}
              >
                {group}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {list.length} match{list.length !== 1 && "es"}
              </span>
            </div>

            <div className="space-y-2.5">
              {list.map((m) => (
                <Card
                  key={m.id}
                  onClick={() => setSelected(m)}
                  className={`cursor-pointer rounded-2xl shadow-md border-l-4 ${GROUP_BORDER[group]} active:scale-[0.98] transition-transform`}
                >
                  <CardContent className="flex items-center justify-between py-4 px-4">
                    <div className="min-w-0">
                      <p className="text-base font-bold truncate">{m.team_a.name}</p>
                      <p className="text-xs text-muted-foreground font-medium mt-0.5">
                        vs {m.team_b.name}
                      </p>
                      {m.scheduled_time && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {new Date(m.scheduled_time).toLocaleString()}
                        </p>
                      )}
                    </div>

                    <div className="ml-4 shrink-0">
                      {m.status ? (
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 font-bold hover:bg-emerald-100 text-sm px-3 py-1">
                          {m.score_a}/{m.wickets_a} – {m.score_b}/{m.wickets_b}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="bg-amber-50 text-amber-700 border-amber-300 font-semibold text-sm px-3 py-1"
                        >
                          Pending
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        );
      })}

      {/* Empty state */}
      {COLOURS.every((g) => grouped[g].length === 0) && (
        <Card className="rounded-2xl border-dashed">
          <CardContent className="py-16 text-center">
            <p className="text-sm text-muted-foreground">
              {showCompleted
                ? "No matches found for this tournament."
                : "No pending matches. Toggle Show Completed to see results."}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Entry Dialog */}
      <EntryModal
        match={selected}
        supabase={supabase}
        onClose={() => setSelected(null)}
        onSaved={(msg) => {
          setSelected(null);
          setToast(msg);
          fetchMatches();
        }}
      />

      {/* Toast */}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}

// ── Step button (big circular +/- for score entry) ─────────

function StepButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#114232] text-white text-2xl font-black shadow-md active:scale-95 transition-transform disabled:opacity-30"
    >
      {label}
    </button>
  );
}

// ── Entry Modal ────────────────────────────────────────────

function EntryModal({
  match,
  supabase,
  onClose,
  onSaved,
}: {
  match: MatchWithGroup | null;
  supabase: ReturnType<typeof getSupabaseBrowserClient>;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [runsA, setRunsA] = useState(0);
  const [wicketsA, setWicketsA] = useState(0);
  const [runsB, setRunsB] = useState(0);
  const [wicketsB, setWicketsB] = useState(0);
  const [complete, setComplete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync fields when match changes
  useEffect(() => {
    if (match) {
      setRunsA(match.score_a);
      setWicketsA(match.wickets_a);
      setRunsB(match.score_b);
      setWicketsB(match.wickets_b);
      setComplete(match.status);
      setError(null);
    }
  }, [match]);

  if (!match) return null;

  const netScoreA = calculateMatchScore(runsA, wicketsA);
  const netScoreB = calculateMatchScore(runsB, wicketsB);

  async function handleSave() {
    setSaving(true);
    setError(null);

    const { error: updateErr } = await supabase
      .from("matches")
      .update({
        score_a: runsA,
        wickets_a: wicketsA,
        score_b: runsB,
        wickets_b: wicketsB,
        status: complete,
      })
      .eq("id", match!.id);

    if (updateErr) {
      setError(updateErr.message);
      setSaving(false);
      return;
    }

    onSaved(
      complete
        ? `Result saved: ${match!.team_a.name} vs ${match!.team_b.name}`
        : "Scores updated (match still pending)."
    );
  }

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="w-full max-w-md rounded-2xl p-0 gap-0 overflow-hidden">
        {/* Coloured header bar */}
        <div className="bg-[#114232] px-6 pt-6 pb-5">
          <DialogHeader>
            <DialogTitle className="text-white text-lg font-black">
              {match.team_a.name}
            </DialogTitle>
            <DialogDescription className="text-white/70 text-base font-semibold mt-0.5">
              vs {match.team_b.name}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-5 py-5 space-y-6">
          {error && (
            <div className="rounded-xl border border-destructive/50 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* ── Team A ── */}
          <div className="space-y-4">
            <p className="text-center text-base font-black tracking-tight">{match.team_a.name}</p>

            {/* Runs A */}
            <div className="space-y-1.5">
              <p className="text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Runs
              </p>
              <div className="flex items-center justify-between gap-3">
                <StepButton label="-" onClick={() => setRunsA((v) => Math.max(0, v - 1))} />
                <span className="flex-1 text-center text-4xl font-black tabular-nums">{runsA}</span>
                <StepButton label="+" onClick={() => setRunsA((v) => v + 1)} />
              </div>
            </div>

            {/* Wickets A */}
            <div className="space-y-1.5">
              <p className="text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Wickets
              </p>
              <div className="flex items-center justify-between gap-3">
                <StepButton label="-" onClick={() => setWicketsA((v) => Math.max(0, v - 1))} />
                <span className="flex-1 text-center text-4xl font-black tabular-nums">{wicketsA}</span>
                <StepButton label="+" onClick={() => setWicketsA((v) => Math.min(10, v + 1))} />
              </div>
            </div>

            {/* Net score A */}
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 py-3 text-center">
              <p className="text-xs text-emerald-700 font-semibold uppercase tracking-wider">Net Score</p>
              <p className="text-3xl font-black text-emerald-700 mt-0.5 tabular-nums">{netScoreA}</p>
            </div>
          </div>

          <Separator />

          {/* ── Team B ── */}
          <div className="space-y-4">
            <p className="text-center text-base font-black tracking-tight">{match.team_b.name}</p>

            {/* Runs B */}
            <div className="space-y-1.5">
              <p className="text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Runs
              </p>
              <div className="flex items-center justify-between gap-3">
                <StepButton label="-" onClick={() => setRunsB((v) => Math.max(0, v - 1))} />
                <span className="flex-1 text-center text-4xl font-black tabular-nums">{runsB}</span>
                <StepButton label="+" onClick={() => setRunsB((v) => v + 1)} />
              </div>
            </div>

            {/* Wickets B */}
            <div className="space-y-1.5">
              <p className="text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Wickets
              </p>
              <div className="flex items-center justify-between gap-3">
                <StepButton label="-" onClick={() => setWicketsB((v) => Math.max(0, v - 1))} />
                <span className="flex-1 text-center text-4xl font-black tabular-nums">{wicketsB}</span>
                <StepButton label="+" onClick={() => setWicketsB((v) => Math.min(10, v + 1))} />
              </div>
            </div>

            {/* Net score B */}
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 py-3 text-center">
              <p className="text-xs text-emerald-700 font-semibold uppercase tracking-wider">Net Score</p>
              <p className="text-3xl font-black text-emerald-700 mt-0.5 tabular-nums">{netScoreB}</p>
            </div>
          </div>

          <Separator />

          {/* Match complete toggle */}
          <button
            type="button"
            onClick={() => setComplete((v) => !v)}
            className={`flex w-full items-center justify-between rounded-2xl border-2 px-5 py-4 transition-colors ${
              complete
                ? "border-emerald-500 bg-emerald-50"
                : "border-border bg-muted/30"
            }`}
          >
            <span className="text-base font-bold">Match Complete</span>
            <span
              className={`flex h-7 w-12 items-center rounded-full transition-colors ${
                complete ? "bg-[#114232]" : "bg-input"
              }`}
            >
              <span
                className={`ml-0.5 block h-6 w-6 rounded-full bg-white shadow transition-transform ${
                  complete ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </span>
          </button>

          {/* Action buttons */}
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="h-14 w-full rounded-2xl bg-[#114232] hover:bg-[#1a5c44] text-white text-base font-bold shadow-md"
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <Spinner />
                  Saving...
                </span>
              ) : (
                "Save Result"
              )}
            </Button>
            <Button
              variant="outline"
              onClick={onClose}
              disabled={saving}
              className="h-12 w-full rounded-2xl text-base"
            >
              Cancel
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
