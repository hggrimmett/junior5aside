"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { calculateMatchScore } from "@/lib/tournament-logic";
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
    <div className="fixed bottom-6 right-6 z-50 animate-slide-up rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-lg">
      {message}
    </div>
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
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        Loading matches...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Match Results</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Tap a match to enter or update scores.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="show-completed"
            checked={showCompleted}
            onCheckedChange={(v) => setShowCompleted(Boolean(v))}
          />
          <Label htmlFor="show-completed" className="cursor-pointer text-sm">
            Show Completed
          </Label>
        </div>
      </div>

      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {/* Grouped lists */}
      {COLOURS.map((group) => {
        const list = grouped[group];
        if (list.length === 0) return null;

        return (
          <section key={group} className="space-y-2">
            {/* Group header */}
            <div className="flex items-center gap-2 mb-3">
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

            <div className="space-y-2">
              {list.map((m) => (
                <Card
                  key={m.id}
                  onClick={() => setSelected(m)}
                  className={`cursor-pointer border-l-4 ${GROUP_BORDER[group]} transition-all hover:shadow-md hover:-translate-y-px active:translate-y-0`}
                >
                  <CardContent className="flex items-center justify-between py-3 px-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">
                        {m.team_a.name}{" "}
                        <span className="font-normal text-muted-foreground">vs</span>{" "}
                        {m.team_b.name}
                      </p>
                      {m.scheduled_time && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {new Date(m.scheduled_time).toLocaleString()}
                        </p>
                      )}
                    </div>

                    <div className="ml-4 shrink-0">
                      {m.status ? (
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 font-bold hover:bg-emerald-100">
                          {m.score_a}/{m.wickets_a} – {m.score_b}/{m.wickets_b}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="bg-amber-50 text-amber-700 border-amber-300 font-semibold"
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
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <p className="text-sm text-muted-foreground">
              {showCompleted
                ? "No matches found for this tournament."
                : "No pending matches. Toggle 'Show Completed' to see results."}
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
  const [runsA, setRunsA] = useState("");
  const [wicketsA, setWicketsA] = useState("");
  const [runsB, setRunsB] = useState("");
  const [wicketsB, setWicketsB] = useState("");
  const [complete, setComplete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync fields when match changes
  useEffect(() => {
    if (match) {
      setRunsA(String(match.score_a));
      setWicketsA(String(match.wickets_a));
      setRunsB(String(match.score_b));
      setWicketsB(String(match.wickets_b));
      setComplete(match.status);
      setError(null);
    }
  }, [match]);

  if (!match) return null;

  const numRunsA = Number(runsA) || 0;
  const numWicketsA = Number(wicketsA) || 0;
  const numRunsB = Number(runsB) || 0;
  const numWicketsB = Number(wicketsB) || 0;

  const netScoreA = calculateMatchScore(numRunsA, numWicketsA);
  const netScoreB = calculateMatchScore(numRunsB, numWicketsB);

  async function handleSave() {
    setSaving(true);
    setError(null);

    const { error: updateErr } = await supabase
      .from("matches")
      .update({
        score_a: numRunsA,
        wickets_a: numWicketsA,
        score_b: numRunsB,
        wickets_b: numWicketsB,
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Enter Match Result</DialogTitle>
          <DialogDescription>
            {match.team_a.name} vs {match.team_b.name}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="pt-3 pb-3 text-sm text-destructive">{error}</CardContent>
          </Card>
        )}

        {/* Two-column score grid */}
        <div className="grid grid-cols-2 gap-6 py-2">
          {/* Team A */}
          <div className="space-y-3">
            <p className="text-center text-sm font-bold">{match.team_a.name}</p>

            <div className="space-y-1">
              <Label className="block text-center text-xs text-muted-foreground">Runs</Label>
              <Input
                type="number"
                min={0}
                value={runsA}
                onChange={(e) => setRunsA(e.target.value)}
                className="text-center text-2xl font-bold py-4 h-auto"
              />
            </div>

            <div className="space-y-1">
              <Label className="block text-center text-xs text-muted-foreground">Wickets</Label>
              <Input
                type="number"
                min={0}
                max={10}
                value={wicketsA}
                onChange={(e) => setWicketsA(e.target.value)}
                className="text-center text-2xl font-bold py-4 h-auto"
              />
            </div>

            <div className="rounded-lg bg-muted/60 py-3 text-center">
              <p className="text-xs text-muted-foreground">Net Score</p>
              <p className="text-2xl font-black text-emerald-600 mt-0.5">{netScoreA}</p>
            </div>
          </div>

          {/* Team B */}
          <div className="space-y-3">
            <p className="text-center text-sm font-bold">{match.team_b.name}</p>

            <div className="space-y-1">
              <Label className="block text-center text-xs text-muted-foreground">Runs</Label>
              <Input
                type="number"
                min={0}
                value={runsB}
                onChange={(e) => setRunsB(e.target.value)}
                className="text-center text-2xl font-bold py-4 h-auto"
              />
            </div>

            <div className="space-y-1">
              <Label className="block text-center text-xs text-muted-foreground">Wickets</Label>
              <Input
                type="number"
                min={0}
                max={10}
                value={wicketsB}
                onChange={(e) => setWicketsB(e.target.value)}
                className="text-center text-2xl font-bold py-4 h-auto"
              />
            </div>

            <div className="rounded-lg bg-muted/60 py-3 text-center">
              <p className="text-xs text-muted-foreground">Net Score</p>
              <p className="text-2xl font-black text-emerald-600 mt-0.5">{netScoreB}</p>
            </div>
          </div>
        </div>

        <Separator />

        {/* Match Complete toggle */}
        <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
          <Checkbox
            id="match-complete"
            checked={complete}
            onCheckedChange={(v) => setComplete(Boolean(v))}
          />
          <Label htmlFor="match-complete" className="cursor-pointer font-medium">
            Match Complete
          </Label>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Saving...
              </span>
            ) : (
              "Save Result"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
