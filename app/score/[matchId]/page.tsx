"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { calculateMatchScore } from "@/lib/tournament-logic";
import { Card, CardContent } from "@/components/ui/card";

// ── Types ─────────────────────────────────────────────────────────────────────

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
  team_a: Team;
  team_b: Team;
}

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

type ExtraType = "wide" | "no_ball" | "bye";

// ── Helpers ───────────────────────────────────────────────────────────────────

function deriveInningsState(events: MatchEvent[], teamId: string) {
  const innings = events.filter((e) => e.team_id === teamId);
  const runs = innings.reduce((sum, e) => sum + e.runs, 0);
  const wickets = innings.filter((e) => e.is_wicket).length;

  // Balls that count: not wide or no-ball
  const legalBalls = innings.filter(
    (e) => e.extra_type !== "wide" && e.extra_type !== "no_ball"
  );

  const totalLegalBalls = legalBalls.length;
  const overNumber = Math.floor(totalLegalBalls / 6);
  const ballNumber = totalLegalBalls % 6;

  return { runs, wickets, overNumber, ballNumber };
}

function getNextBallCoords(
  events: MatchEvent[],
  teamId: string
): { overNumber: number; ballNumber: number } {
  const { overNumber, ballNumber } = deriveInningsState(events, teamId);
  // ballNumber is already "balls bowled in current over" (0-5)
  // Next ball: if we've completed 6, start new over
  if (ballNumber === 0 && deriveInningsState(events, teamId).overNumber > overNumber) {
    return { overNumber: overNumber + 1, ballNumber: 1 };
  }
  return { overNumber, ballNumber: ballNumber + 1 };
}

function getLastSixDeliveries(events: MatchEvent[], teamId: string): string[] {
  const innings = events.filter((e) => e.team_id === teamId);
  const last6 = innings.slice(-6);
  return last6.map((e) => {
    if (e.is_wicket) return "W";
    if (e.extra_type === "wide") return "Wd";
    if (e.extra_type === "no_ball") return "Nb";
    if (e.extra_type === "bye") return "By";
    if (e.runs === 0) return "·";
    return String(e.runs);
  });
}

function badgeStyle(label: string): string {
  if (label === "W") return "bg-red-500 text-white";
  if (label === "4") return "bg-cricket text-white";
  if (label === "6") return "bg-cricket text-white";
  if (label === "·") return "bg-gray-200 text-gray-500";
  return "bg-gray-100 text-gray-700 border border-gray-300";
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ScorePage() {
  const params = useParams();
  const matchId = params?.matchId as string;
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  const [loading, setLoading] = useState(true);
  const [match, setMatch] = useState<Match | null>(null);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [activeTab, setActiveTab] = useState<"a" | "b">("a");
  const [saving, setSaving] = useState(false);
  const [endingMatch, setEndingMatch] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Auth + data fetch ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!matchId) return;

    async function init() {
      // Auth check
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!profile || (profile.role !== "superadmin" && profile.role !== "coach")) {
        router.replace("/dashboard");
        return;
      }

      // Fetch match with team names
      const { data: matchData, error: matchErr } = await supabase
        .from("matches")
        .select(
          `id, tournament_id, team_a_id, team_b_id, score_a, score_b, wickets_a, wickets_b, status,
           team_a:teams!matches_team_a_id_fkey(id, name),
           team_b:teams!matches_team_b_id_fkey(id, name)`
        )
        .eq("id", matchId)
        .single();

      if (matchErr || !matchData) {
        setError("Match not found.");
        setLoading(false);
        return;
      }

      setMatch(matchData as unknown as Match);

      // Fetch events
      const { data: eventsData } = await supabase
        .from("match_events")
        .select("*")
        .eq("match_id", matchId)
        .order("created_at", { ascending: true });

      setEvents((eventsData as MatchEvent[]) ?? []);
      setLoading(false);
    }

    init();
  }, [matchId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Insert event ───────────────────────────────────────────────────────────

  const insertEvent = useCallback(
    async (opts: {
      runs: number;
      isWicket?: boolean;
      extraType?: ExtraType;
    }) => {
      if (!match || saving) return;
      setSaving(true);

      const teamId =
        activeTab === "a" ? match.team_a_id : match.team_b_id;

      const isExtra =
        opts.extraType === "wide" || opts.extraType === "no_ball";

      // Determine over/ball numbers from current state
      const teamEvents = events.filter((e) => e.team_id === teamId);
      const legalBalls = teamEvents.filter(
        (e) => e.extra_type !== "wide" && e.extra_type !== "no_ball"
      );
      const totalLegal = legalBalls.length;
      const currentOver = Math.floor(totalLegal / 6);
      const currentBall = totalLegal % 6; // 0-5, balls already bowled in this over

      // For extras (wide/no-ball), ball_number doesn't change
      const ballNumber = isExtra ? currentBall + 1 : currentBall + 1;
      const overNumber = isExtra ? currentOver : currentOver;

      const newEvent: Omit<MatchEvent, "id" | "created_at"> = {
        match_id: matchId,
        team_id: teamId,
        over_number: overNumber,
        ball_number: ballNumber,
        runs: opts.runs,
        is_wicket: opts.isWicket ?? false,
        extra_type: opts.extraType ?? null,
        batter_id: null,
        bowler_id: null,
      };

      // Optimistic update
      const optimisticId = `opt-${Date.now()}`;
      const optimisticEvent: MatchEvent = {
        ...newEvent,
        id: optimisticId,
        created_at: new Date().toISOString(),
      };
      setEvents((prev) => [...prev, optimisticEvent]);

      const { data: inserted, error: insertErr } = await supabase
        .from("match_events")
        .insert(newEvent)
        .select()
        .single();

      if (insertErr) {
        // Roll back optimistic update
        setEvents((prev) => prev.filter((e) => e.id !== optimisticId));
        setError("Failed to record delivery. Please try again.");
      } else {
        // Replace optimistic with real
        setEvents((prev) =>
          prev.map((e) =>
            e.id === optimisticId ? (inserted as MatchEvent) : e
          )
        );
      }

      setSaving(false);
    },
    [match, activeTab, events, matchId, saving, supabase]
  );

  // ── Undo ───────────────────────────────────────────────────────────────────

  const undoLast = useCallback(async () => {
    if (!match || saving || events.length === 0) return;

    const teamId =
      activeTab === "a" ? match.team_a_id : match.team_b_id;
    const teamEvents = events.filter((e) => e.team_id === teamId);
    if (teamEvents.length === 0) return;

    const last = teamEvents[teamEvents.length - 1];

    // Optimistic remove
    setEvents((prev) => prev.filter((e) => e.id !== last.id));

    const { error: delErr } = await supabase
      .from("match_events")
      .delete()
      .eq("id", last.id);

    if (delErr) {
      // Roll back
      setEvents((prev) => [...prev, last].sort((a, b) =>
        a.created_at.localeCompare(b.created_at)
      ));
      setError("Failed to undo. Please try again.");
    }
  }, [match, activeTab, events, saving, supabase]);

  // ── End match ──────────────────────────────────────────────────────────────

  const endMatch = useCallback(async () => {
    if (!match || endingMatch) return;
    setEndingMatch(true);

    const stateA = deriveInningsState(events, match.team_a_id);
    const stateB = deriveInningsState(events, match.team_b_id);

    const { error: updateErr } = await supabase
      .from("matches")
      .update({
        score_a: stateA.runs,
        score_b: stateB.runs,
        wickets_a: stateA.wickets,
        wickets_b: stateB.wickets,
        status: true,
      })
      .eq("id", matchId);

    if (updateErr) {
      setError("Failed to end match. Please try again.");
      setEndingMatch(false);
    } else {
      router.replace("/dashboard");
    }
  }, [match, events, matchId, endingMatch, supabase, router]);

  // ── Derived state ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <svg
          className="h-8 w-8 animate-spin text-cricket"
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
      </div>
    );
  }

  if (error && !match) {
    return (
      <div className="flex h-screen items-center justify-center px-6">
        <p className="text-center text-destructive font-semibold">{error}</p>
      </div>
    );
  }

  if (!match) return null;

  const teamAState = deriveInningsState(events, match.team_a_id);
  const teamBState = deriveInningsState(events, match.team_b_id);

  const activeTeamId =
    activeTab === "a" ? match.team_a_id : match.team_b_id;
  const activeTeamName =
    activeTab === "a" ? match.team_a.name : match.team_b.name;
  const activeState =
    activeTab === "a" ? teamAState : teamBState;

  const netScore = calculateMatchScore(activeState.runs, activeState.wickets);
  const overDisplay = `${activeState.overNumber}.${activeState.ballNumber}`;
  const last6 = getLastSixDeliveries(events, activeTeamId);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-md min-h-screen bg-background pb-10">
      {/* Error toast */}
      {error && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-red-500 text-white text-sm font-semibold px-4 py-2 rounded-full shadow-lg">
          {error}
          <button
            className="ml-3 underline"
            onClick={() => setError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Header */}
      <div className="bg-cricket px-4 pt-6 pb-4">
        <p className="text-cricket-foreground/70 text-xs font-bold uppercase tracking-widest mb-1">
          Ball-by-ball scoring
        </p>
        <h1 className="text-cricket-foreground text-xl font-black tracking-tight leading-tight">
          {match.team_a.name} vs {match.team_b.name}
        </h1>
      </div>

      {/* Innings tabs */}
      <div className="flex border-b border-border bg-white sticky top-0 z-10">
        <button
          onClick={() => setActiveTab("a")}
          className={`flex-1 py-3.5 text-sm font-bold tracking-tight transition-colors ${
            activeTab === "a"
              ? "text-cricket border-b-[3px] border-cricket"
              : "text-muted-foreground"
          }`}
        >
          {match.team_a.name}
        </button>
        <button
          onClick={() => setActiveTab("b")}
          className={`flex-1 py-3.5 text-sm font-bold tracking-tight transition-colors ${
            activeTab === "b"
              ? "text-cricket border-b-[3px] border-cricket"
              : "text-muted-foreground"
          }`}
        >
          {match.team_b.name}
        </button>
      </div>

      <div className="px-4 pt-4 space-y-4">
        {/* Score display */}
        <Card className="rounded-2xl shadow-md">
          <CardContent className="px-5 py-4">
            <p className="text-sm font-bold text-muted-foreground mb-1">
              {activeTeamName} batting
            </p>
            <div className="flex items-end gap-4">
              <span className="text-5xl font-black tracking-tight text-foreground">
                {activeState.runs}/{activeState.wickets}
              </span>
              <div className="mb-1">
                <p className="text-xs text-muted-foreground font-semibold">
                  Net Score
                </p>
                <p className="text-xl font-black text-cricket">{netScore}</p>
              </div>
            </div>
            <p className="text-sm font-semibold text-muted-foreground mt-2">
              Over {overDisplay}
            </p>
          </CardContent>
        </Card>

        {/* Last 6 balls */}
        <div className="flex items-center gap-2">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest shrink-0">
            Last 6
          </p>
          <div className="flex gap-1.5 flex-wrap">
            {last6.length === 0 ? (
              <span className="text-xs text-muted-foreground italic">
                No deliveries yet
              </span>
            ) : (
              last6.map((label, i) => (
                <span
                  key={i}
                  className={`h-9 w-9 rounded-full flex items-center justify-center text-xs font-black ${badgeStyle(label)}`}
                >
                  {label}
                </span>
              ))
            )}
          </div>
        </div>

        {/* Run buttons */}
        <Card className="rounded-2xl shadow-md">
          <CardContent className="px-4 py-5">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">
              Runs
            </p>
            <div className="grid grid-cols-3 gap-3 place-items-center">
              {/* 0 — dot ball */}
              <button
                disabled={saving}
                onClick={() => insertEvent({ runs: 0 })}
                className="h-20 w-20 rounded-full bg-gray-200 text-gray-600 text-2xl font-black active:scale-95 transition-transform disabled:opacity-50 shadow"
              >
                0
              </button>

              {/* 1 */}
              <button
                disabled={saving}
                onClick={() => insertEvent({ runs: 1 })}
                className="h-20 w-20 rounded-full bg-white border-2 border-gray-300 text-gray-800 text-2xl font-black active:scale-95 transition-transform disabled:opacity-50 shadow"
              >
                1
              </button>

              {/* 2 */}
              <button
                disabled={saving}
                onClick={() => insertEvent({ runs: 2 })}
                className="h-20 w-20 rounded-full bg-white border-2 border-gray-300 text-gray-800 text-2xl font-black active:scale-95 transition-transform disabled:opacity-50 shadow"
              >
                2
              </button>

              {/* 3 */}
              <button
                disabled={saving}
                onClick={() => insertEvent({ runs: 3 })}
                className="h-20 w-20 rounded-full bg-white border-2 border-gray-300 text-gray-800 text-2xl font-black active:scale-95 transition-transform disabled:opacity-50 shadow"
              >
                3
              </button>

              {/* 4 — boundary */}
              <button
                disabled={saving}
                onClick={() => insertEvent({ runs: 4 })}
                className="h-20 w-20 rounded-full bg-cricket text-white text-2xl font-black active:scale-95 transition-transform disabled:opacity-50 shadow-md"
              >
                4
              </button>

              {/* 6 — six */}
              <button
                disabled={saving}
                onClick={() => insertEvent({ runs: 6 })}
                className="h-20 w-20 rounded-full bg-cricket text-white text-2xl font-black active:scale-95 transition-transform disabled:opacity-50 shadow-md"
              >
                6
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Wicket button */}
        <button
          disabled={saving}
          onClick={() => insertEvent({ runs: 0, isWicket: true })}
          className="w-full h-16 rounded-2xl bg-red-500 text-white text-xl font-black tracking-tight active:scale-[0.98] transition-transform disabled:opacity-50 shadow-md"
        >
          WICKET
        </button>

        {/* Extras row */}
        <Card className="rounded-2xl shadow-md">
          <CardContent className="px-4 py-4">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
              Extras
            </p>
            <div className="grid grid-cols-3 gap-3">
              <button
                disabled={saving}
                onClick={() => insertEvent({ runs: 1, extraType: "wide" })}
                className="h-14 rounded-xl bg-amber-100 text-amber-800 border border-amber-300 text-sm font-black active:scale-95 transition-transform disabled:opacity-50"
              >
                Wide
                <span className="block text-xs font-semibold">+1</span>
              </button>
              <button
                disabled={saving}
                onClick={() => insertEvent({ runs: 1, extraType: "no_ball" })}
                className="h-14 rounded-xl bg-orange-100 text-orange-800 border border-orange-300 text-sm font-black active:scale-95 transition-transform disabled:opacity-50"
              >
                No Ball
                <span className="block text-xs font-semibold">+1</span>
              </button>
              <button
                disabled={saving}
                onClick={() => insertEvent({ runs: 0, extraType: "bye" })}
                className="h-14 rounded-xl bg-gray-100 text-gray-700 border border-gray-300 text-sm font-black active:scale-95 transition-transform disabled:opacity-50"
              >
                Bye
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Undo */}
        <div className="flex justify-end">
          <button
            disabled={saving}
            onClick={undoLast}
            className="flex items-center gap-1.5 text-sm font-bold text-muted-foreground active:opacity-70 transition-opacity disabled:opacity-40"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3"
              />
            </svg>
            Undo Last
          </button>
        </div>

        {/* Match summary */}
        <Card className="rounded-2xl shadow-md">
          <CardContent className="px-5 py-4">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
              Match Summary
            </p>
            <div className="grid grid-cols-2 gap-4">
              {/* Team A */}
              <div className="text-center">
                <p className="text-xs font-bold text-muted-foreground truncate mb-1">
                  {match.team_a.name}
                </p>
                <p className="text-3xl font-black text-foreground">
                  {teamAState.runs}/{teamAState.wickets}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Net {calculateMatchScore(teamAState.runs, teamAState.wickets)}
                </p>
              </div>
              {/* Team B */}
              <div className="text-center">
                <p className="text-xs font-bold text-muted-foreground truncate mb-1">
                  {match.team_b.name}
                </p>
                <p className="text-3xl font-black text-foreground">
                  {teamBState.runs}/{teamBState.wickets}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Net {calculateMatchScore(teamBState.runs, teamBState.wickets)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* End match */}
        <button
          disabled={endingMatch}
          onClick={endMatch}
          className="w-full h-14 rounded-2xl bg-cricket text-white text-base font-black tracking-tight active:scale-[0.98] transition-transform disabled:opacity-60 shadow-md"
        >
          {endingMatch ? "Ending match…" : "End Match"}
        </button>
      </div>
    </div>
  );
}
