"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { calculateMatchScore } from "@/lib/tournament-logic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface MatchEvent {
  id: string;
  match_id: string;
  team_id: string;
  over_number: number;
  ball_number: number;
  runs: number;
  is_wicket: boolean;
  extra_type: string | null;
  batter_id: string | null;
  bowler_id: string | null;
  created_at: string;
}

interface Team {
  id: string;
  name: string;
}

interface Match {
  id: string;
  team_a_id: string;
  team_b_id: string;
  score_a: number;
  score_b: number;
  wickets_a: number;
  wickets_b: number;
  team_a: Team;
  team_b: Team;
  status: boolean;
}

export default function MatchEventsPage() {
  const params = useParams();
  const matchId = params?.matchId as string;
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [playerNames, setPlayerNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit dialog
  const [editEvent, setEditEvent] = useState<MatchEvent | null>(null);
  const [editRuns, setEditRuns] = useState(0);
  const [editWicket, setEditWicket] = useState(false);
  const [editSaving, setEditSaving] = useState(false);

  // Recalculate
  const [recalculating, setRecalculating] = useState(false);
  const [recalcResult, setRecalcResult] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }

      const { data: profile } = await supabase
        .from("profiles").select("role").eq("id", user.id).single<{ role: string }>();

      if (profile?.role !== "superadmin" && profile?.role !== "coach") {
        window.location.href = "/home"; return;
      }
      setAuthorized(true);

      const { data: matchData } = await supabase
        .from("matches")
        .select("id, team_a_id, team_b_id, score_a, score_b, wickets_a, wickets_b, status, team_a:teams!team_a_id(id, name), team_b:teams!team_b_id(id, name)")
        .eq("id", matchId)
        .single();

      if (matchData) {
        setMatch(matchData as unknown as Match);
        // Fetch player names for both teams
        const m = matchData as any;
        const { data: players } = await supabase
          .from("players")
          .select("id, first_name")
          .or(`team_id.eq.${m.team_a_id},team_id.eq.${m.team_b_id}`);
        const names: Record<string, string> = {};
        for (const p of players ?? []) names[p.id] = p.first_name;
        setPlayerNames(names);
      }
      await fetchEvents();
      setLoading(false);
    }
    init();
  }, [matchId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchEvents = useCallback(async () => {
    const { data } = await supabase
      .from("match_events")
      .select("*")
      .eq("match_id", matchId)
      .order("created_at", { ascending: true });
    setEvents((data as MatchEvent[]) ?? []);
  }, [matchId, supabase]);

  async function handleDelete(eventId: string) {
    setEvents((prev) => prev.filter((e) => e.id !== eventId));
    const { error: err } = await supabase.from("match_events").delete().eq("id", eventId);
    if (err) { setError(err.message); fetchEvents(); }
  }

  function openEdit(e: MatchEvent) {
    setEditEvent(e);
    setEditRuns(e.runs);
    setEditWicket(e.is_wicket);
  }

  async function handleSaveEdit() {
    if (!editEvent) return;
    setEditSaving(true);
    const { error: err } = await supabase
      .from("match_events")
      .update({ runs: editRuns, is_wicket: editWicket })
      .eq("id", editEvent.id);

    if (err) { setError(err.message); }
    else {
      setEvents((prev) => prev.map((e) =>
        e.id === editEvent.id ? { ...e, runs: editRuns, is_wicket: editWicket } : e
      ));
    }
    setEditSaving(false);
    setEditEvent(null);
  }

  async function handleRecalculate() {
    if (!match) return;
    setRecalculating(true);
    setRecalcResult(null);
    setError(null);

    // Recalculate from events
    const aEvents = events.filter((e) => e.team_id === match.team_a_id);
    const bEvents = events.filter((e) => e.team_id === match.team_b_id);

    const runsA = aEvents.reduce((s, e) => s + e.runs, 0);
    const wicketsA = aEvents.filter((e) => e.is_wicket).length;
    const runsB = bEvents.reduce((s, e) => s + e.runs, 0);
    const wicketsB = bEvents.filter((e) => e.is_wicket).length;

    const netA = calculateMatchScore(runsA, wicketsA);
    const netB = calculateMatchScore(runsB, wicketsB);

    // Update match scores
    const { error: updateErr } = await supabase
      .from("matches")
      .update({ score_a: runsA, score_b: runsB, wickets_a: wicketsA, wickets_b: wicketsB })
      .eq("id", matchId);

    if (updateErr) {
      setError(updateErr.message);
      setRecalculating(false);
      return;
    }

    // If match is complete, recalculate team points
    if (match.status) {
      // First, remove old points contribution from this match
      // We need to fetch current team points and subtract old, add new
      const [teamARes, teamBRes] = await Promise.all([
        supabase.from("teams").select("points, total_runs").eq("id", match.team_a_id).single(),
        supabase.from("teams").select("points, total_runs").eq("id", match.team_b_id).single(),
      ]);

      // Calculate old points from old match data
      const oldNetA = calculateMatchScore(match.score_a ?? 0, match.wickets_a ?? 0);
      const oldNetB = calculateMatchScore(match.score_b ?? 0, match.wickets_b ?? 0);
      let oldPtsA = 0, oldPtsB = 0;
      if (oldNetA > oldNetB) { oldPtsA = 3; } else if (oldNetB > oldNetA) { oldPtsB = 3; } else { oldPtsA = 1; oldPtsB = 1; }

      // Calculate new points
      let newPtsA = 0, newPtsB = 0;
      if (netA > netB) { newPtsA = 3; } else if (netB > netA) { newPtsB = 3; } else { newPtsA = 1; newPtsB = 1; }

      // Apply delta
      await Promise.all([
        supabase.from("teams").update({
          points: Math.max(0, (teamARes.data?.points ?? 0) - oldPtsA + newPtsA),
          total_runs: Math.max(0, (teamARes.data?.total_runs ?? 0) - (match.score_a ?? 0) + runsA),
        }).eq("id", match.team_a_id),
        supabase.from("teams").update({
          points: Math.max(0, (teamBRes.data?.points ?? 0) - oldPtsB + newPtsB),
          total_runs: Math.max(0, (teamBRes.data?.total_runs ?? 0) - (match.score_b ?? 0) + runsB),
        }).eq("id", match.team_b_id),
      ]);
    }

    // Update local match state
    setMatch({ ...match, score_a: runsA, score_b: runsB, wickets_a: wicketsA, wickets_b: wicketsB } as any);

    const winner = netA > netB ? match.team_a.name : netB > netA ? match.team_b.name : "Draw";
    setRecalcResult(`Updated: ${match.team_a.name} ${runsA}/${wicketsA} (Net ${netA}) vs ${match.team_b.name} ${runsB}/${wicketsB} (Net ${netB}) — ${winner === "Draw" ? "Draw" : `${winner} wins`}`);
    setRecalculating(false);
  }

  function ballLabel(e: MatchEvent): string {
    if (e.is_wicket) return "W";
    if (e.extra_type === "wide") return "Wd";
    if (e.extra_type === "no_ball") return "Nb";
    if (e.runs === 0) return "·";
    return String(e.runs);
  }

  function badgeColour(e: MatchEvent): string {
    if (e.is_wicket) return "bg-red-500 text-white";
    if (e.runs >= 4) return "bg-cricket text-white";
    if (e.extra_type) return "bg-amber-100 text-amber-800";
    if (e.runs === 0) return "bg-gray-200 text-gray-500";
    return "bg-gray-100 text-gray-700";
  }

  if (!authorized || loading) {
    return (
      <div className="flex h-60 items-center justify-center">
        <svg className="h-6 w-6 animate-spin text-muted-foreground" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  // Group events by team
  const teamAEvents = events.filter((e) => e.team_id === match?.team_a_id);
  const teamBEvents = events.filter((e) => e.team_id === match?.team_b_id);

  function renderInnings(teamName: string, teamEvents: MatchEvent[]) {
    // Group by over
    const byOver: Record<number, MatchEvent[]> = {};
    for (const e of teamEvents) {
      if (!byOver[e.over_number]) byOver[e.over_number] = [];
      byOver[e.over_number].push(e);
    }

    return (
      <Card className="rounded-2xl shadow-md">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-black">{teamName} Innings</CardTitle>
          <p className="text-xs text-muted-foreground">{teamEvents.length} deliveries</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {Object.keys(byOver).length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No deliveries recorded</p>
          ) : (
            Object.entries(byOver).sort(([a], [b]) => Number(a) - Number(b)).map(([over, balls]) => (
              <div key={over}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                  Over {over}
                </p>
                <div className="space-y-1">
                  {balls.map((e) => (
                    <div
                      key={e.id}
                      className="flex items-center gap-2 rounded-xl bg-muted/40 px-3 py-2"
                    >
                      <Badge className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-black p-0 ${badgeColour(e)}`}>
                        {ballLabel(e)}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-semibold">
                          {e.batter_id ? playerNames[e.batter_id] ?? "" : ""} {e.runs} run{e.runs !== 1 ? "s" : ""}
                          {e.is_wicket ? " WICKET" : ""}
                          {e.extra_type ? ` (${e.extra_type})` : ""}
                        </span>
                        <span className="text-[10px] text-muted-foreground ml-1">
                          {e.bowler_id ? `bowled by ${playerNames[e.bowler_id] ?? ""}` : ""}
                        </span>
                      </div>
                      <button
                        onClick={() => openEdit(e)}
                        className="text-[10px] font-bold text-primary hover:underline shrink-0"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(e.id)}
                        className="text-[10px] font-bold text-destructive hover:underline shrink-0"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="px-4 py-5 space-y-5">
      <h2 className="text-xl font-extrabold tracking-tight text-foreground">
        Match Events
      </h2>
      {match && (
        <p className="text-sm text-muted-foreground">
          {match.team_a.name} vs {match.team_b.name}
          {match.status && <Badge className="ml-2 bg-cricket/10 text-cricket text-[10px]">Complete</Badge>}
        </p>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>
      )}

      {/* Recalculate button */}
      {match && (
        <div className="space-y-2">
          <button
            onClick={handleRecalculate}
            disabled={recalculating}
            className="w-full h-14 rounded-2xl bg-cricket text-white text-base font-black active:scale-[0.98] transition-transform disabled:opacity-50 shadow-md"
          >
            {recalculating ? "Recalculating..." : "Recalculate & Update Scores"}
          </button>
          {recalcResult && (
            <div className="rounded-xl bg-cricket/5 border border-cricket/20 px-4 py-3 text-sm font-semibold text-cricket">
              {recalcResult}
            </div>
          )}
        </div>
      )}

      {match && renderInnings(match.team_a.name, teamAEvents)}
      {match && renderInnings(match.team_b.name, teamBEvents)}

      {/* Edit dialog */}
      <Dialog open={!!editEvent} onOpenChange={(open) => { if (!open) setEditEvent(null); }}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-extrabold tracking-tight">Edit Delivery</DialogTitle>
          </DialogHeader>
          {editEvent && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Runs</Label>
                <Input
                  type="number"
                  min={0}
                  value={editRuns}
                  onChange={(e) => setEditRuns(Number(e.target.value) || 0)}
                  className="h-12 text-2xl font-black text-center"
                />
              </div>
              <label className="flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editWicket}
                  onChange={(e) => setEditWicket(e.target.checked)}
                  className="h-5 w-5 rounded"
                />
                <span className="text-sm font-bold">Wicket (-6 penalty)</span>
              </label>
              <button
                onClick={handleSaveEdit}
                disabled={editSaving}
                className="w-full h-12 rounded-2xl bg-cricket text-white text-base font-black active:scale-[0.98] transition-transform disabled:opacity-60 shadow-md"
              >
                {editSaving ? "Saving..." : "Save"}
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
