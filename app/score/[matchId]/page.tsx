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

interface Player {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
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

type ExtraType = "wide" | "no_ball";

type Phase =
  | "team_a_setup"
  | "team_a_innings"
  | "team_b_setup"
  | "team_b_innings"
  | "match_complete";

type TransitionType =
  | "over_1_done"
  | "over_2_done"
  | "over_3_done"
  | "over_4_done"
  | null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function playerName(p: Player): string {
  return `${p.first_name} ${p.last_name}`;
}

function playerInitials(p: Player): string {
  return `${p.first_name?.[0] ?? ""}${p.last_name?.[0] ?? ""}`.toUpperCase();
}

function deriveInningsState(events: MatchEvent[], teamId: string) {
  const innings = events.filter((e) => e.team_id === teamId);
  const runs = innings.reduce((sum, e) => sum + e.runs, 0);
  const wickets = innings.filter((e) => e.is_wicket).length;
  // All deliveries count as legal balls (wides/no-balls are NOT rebowled)
  const totalLegalBalls = innings.length;
  const overNumber = Math.floor(totalLegalBalls / 6) + 1; // 1-based over
  const ballInOver = totalLegalBalls % 6; // balls bowled in current over (0-5)
  return { runs, wickets, totalLegalBalls, overNumber, ballInOver };
}

function getLastSixDeliveries(events: MatchEvent[], teamId: string): string[] {
  const innings = events.filter((e) => e.team_id === teamId);
  const last6 = innings.slice(-6);
  return last6.map((e) => {
    if (e.is_wicket) return "W";
    if (e.extra_type === "wide") return "Wd";
    if (e.extra_type === "no_ball") return "Nb";
    if (e.extra_type === "bye") return `${e.runs}B`;
    if (e.runs === 0) return "\u00B7";
    return String(e.runs);
  });
}

function badgeStyle(label: string): string {
  if (label === "W") return "bg-red-500 text-white";
  if (label === "4") return "bg-cricket text-white";
  if (label === "6") return "bg-cricket text-white";
  if (label.endsWith("B")) return "bg-blue-100 text-blue-700 border border-blue-300";
  if (label === "\u00B7") return "bg-gray-200 text-gray-500";
  return "bg-gray-100 text-gray-700 border border-gray-300";
}

/** Derive bowlers used so far from events for a given fielding team */
function getUsedBowlerIds(events: MatchEvent[], battingTeamId: string): string[] {
  const innings = events.filter((e) => e.team_id === battingTeamId);
  const ids = new Set<string>();
  innings.forEach((e) => {
    if (e.bowler_id) ids.add(e.bowler_id);
  });
  return Array.from(ids);
}

/** Derive pair selections from events */
function derivePairsFromEvents(
  events: MatchEvent[],
  battingTeamId: string
): { pair1: string[]; pair2: string[] } {
  const innings = events.filter((e) => e.team_id === battingTeamId);
  const pair1Ids = new Set<string>();
  const pair2Ids = new Set<string>();
  innings.forEach((e) => {
    if (!e.batter_id) return;
    // All balls count (wides/no-balls are not rebowled)
    const ballsBefore = innings.filter((ev) => ev.created_at < e.created_at).length;
    // Overs 1-2 (first 12 balls) = pair 1, overs 3-4 = pair 2
    const overNum = Math.floor(ballsBefore / 6) + 1;
    if (overNum <= 2) pair1Ids.add(e.batter_id);
    else pair2Ids.add(e.batter_id);
  });
  return { pair1: Array.from(pair1Ids), pair2: Array.from(pair2Ids) };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ScorePage() {
  const params = useParams();
  const matchId = params?.matchId as string;
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  // Core state
  const [loading, setLoading] = useState(true);
  const [match, setMatch] = useState<Match | null>(null);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [playersA, setPlayersA] = useState<Player[]>([]);
  const [playersB, setPlayersB] = useState<Player[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Phase / flow state
  const [phase, setPhase] = useState<Phase>("team_a_setup");
  const [transition, setTransition] = useState<TransitionType>(null);

  // Team A innings selections
  const [aPair1, setAPair1] = useState<string[]>([]);
  const [aPair2, setAPair2] = useState<string[]>([]);
  const [aBowlers, setABowlers] = useState<string[]>([]); // bowler for each over [over1, over2, over3, over4]

  // Team B innings selections
  const [bPair1, setBPair1] = useState<string[]>([]);
  const [bPair2, setBPair2] = useState<string[]>([]);
  const [bBowlers, setBBowlers] = useState<string[]>([]);

  // Ending match
  const [endingMatch, setEndingMatch] = useState(false);

  // Temp state for transition selections
  const [tempBowlerSelection, setTempBowlerSelection] = useState<string | null>(null);

  // ── Auth + data fetch ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!matchId) return;

    async function init() {
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

      if (
        !profile ||
        (profile.role !== "superadmin" &&
          profile.role !== "coach" &&
          profile.role !== "mentor")
      ) {
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

      // Mentor access check
      if (profile.role === "mentor") {
        const { data: teamsData } = await supabase
          .from("teams")
          .select("id, mentor_id")
          .in("id", [matchData.team_a_id, matchData.team_b_id]);

        const isMentorOfMatch = teamsData?.some(
          (team) => team.mentor_id === user.id
        );

        if (!isMentorOfMatch) {
          window.location.href = "/home";
          return;
        }
      }

      const m = matchData as unknown as Match;
      setMatch(m);

      // Fetch players for both teams
      const [playersARes, playersBRes] = await Promise.all([
        supabase
          .from("players")
          .select("id, first_name, last_name, avatar_url")
          .eq("team_id", m.team_a_id),
        supabase
          .from("players")
          .select("id, first_name, last_name, avatar_url")
          .eq("team_id", m.team_b_id),
      ]);

      setPlayersA((playersARes.data as Player[]) ?? []);
      setPlayersB((playersBRes.data as Player[]) ?? []);

      // Fetch existing events
      const { data: eventsData } = await supabase
        .from("match_events")
        .select("*")
        .eq("match_id", matchId)
        .order("created_at", { ascending: true });

      const existingEvents = (eventsData as MatchEvent[]) ?? [];
      setEvents(existingEvents);

      // Derive phase from existing events
      const teamAEvents = existingEvents.filter((e) => e.team_id === m.team_a_id);
      const teamBEvents = existingEvents.filter((e) => e.team_id === m.team_b_id);
      // All balls count as legal (wides/no-balls not rebowled)
      const teamALegal = teamAEvents.length;
      const teamBLegal = teamBEvents.length;

      if (m.status === true) {
        setPhase("match_complete");
      } else if (teamBLegal >= 24) {
        setPhase("match_complete");
      } else if (teamBLegal > 0 || (teamALegal >= 24 && teamBEvents.length > 0)) {
        // Team B is batting — reconstruct selections from events
        setPhase("team_b_innings");
        // Reconstruct team A selections
        const aPairs = derivePairsFromEvents(existingEvents, m.team_a_id);
        setAPair1(aPairs.pair1);
        setAPair2(aPairs.pair2);
        setABowlers(getUsedBowlerIds(existingEvents, m.team_a_id));
        // Reconstruct team B selections
        const bPairs = derivePairsFromEvents(existingEvents, m.team_b_id);
        if (bPairs.pair1.length > 0) setBPair1(bPairs.pair1);
        if (bPairs.pair2.length > 0) setBPair2(bPairs.pair2);
        setBBowlers(getUsedBowlerIds(existingEvents, m.team_b_id));
      } else if (teamALegal >= 24) {
        setPhase("team_b_setup");
        const aPairs = derivePairsFromEvents(existingEvents, m.team_a_id);
        setAPair1(aPairs.pair1);
        setAPair2(aPairs.pair2);
        setABowlers(getUsedBowlerIds(existingEvents, m.team_a_id));
      } else if (teamALegal > 0) {
        setPhase("team_a_innings");
        const aPairs = derivePairsFromEvents(existingEvents, m.team_a_id);
        if (aPairs.pair1.length > 0) setAPair1(aPairs.pair1);
        if (aPairs.pair2.length > 0) setAPair2(aPairs.pair2);
        setABowlers(getUsedBowlerIds(existingEvents, m.team_a_id));
      } else {
        setPhase("team_a_setup");
      }

      setLoading(false);
    }

    init();
  }, [matchId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Current innings helpers ────────────────────────────────────────────────

  const currentBattingTeamId =
    phase === "team_a_innings"
      ? match?.team_a_id ?? ""
      : phase === "team_b_innings"
      ? match?.team_b_id ?? ""
      : "";

  const currentPair1 = phase === "team_a_innings" ? aPair1 : bPair1;
  const currentPair2 = phase === "team_a_innings" ? aPair2 : bPair2;
  const currentBowlers = phase === "team_a_innings" ? aBowlers : bBowlers;

  // Derive current innings state
  const inningsState = currentBattingTeamId
    ? deriveInningsState(events, currentBattingTeamId)
    : { runs: 0, wickets: 0, totalLegalBalls: 0, overNumber: 1, ballInOver: 0 };

  // Current over (1-based) — clamp to 4
  const currentOver = Math.min(inningsState.overNumber, 4);
  // ── Detect over transitions ────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== "team_a_innings" && phase !== "team_b_innings") return;
    if (!currentBattingTeamId) return;

    const state = deriveInningsState(events, currentBattingTeamId);

    // Check if innings is complete (24 legal balls = 4 overs)
    if (state.totalLegalBalls >= 24) {
      if (phase === "team_a_innings") {
        setTransition("over_4_done");
      } else {
        setPhase("match_complete");
      }
      return;
    }

    // Check over boundaries — only trigger if we just completed an over (ballInOver === 0 and totalLegalBalls > 0)
    if (state.ballInOver === 0 && state.totalLegalBalls > 0) {
      const completedOver = state.totalLegalBalls / 6;
      const bowlersSet = phase === "team_a_innings" ? aBowlers : bBowlers;

      // Only show transition if we haven't already set up the next bowler
      if (completedOver === 1 && bowlersSet.length < 2) {
        setTransition("over_1_done");
      } else if (completedOver === 2 && bowlersSet.length < 3) {
        setTransition("over_2_done");
      } else if (completedOver === 3 && bowlersSet.length < 4) {
        setTransition("over_3_done");
      }
    }
  }, [events, phase, currentBattingTeamId, aBowlers, bBowlers]);

  // ── Insert event ───────────────────────────────────────────────────────────

  const insertEvent = useCallback(
    async (opts: {
      runs: number;
      isWicket?: boolean;
      extraType?: ExtraType;
    }) => {
      if (!match || saving || transition) return;
      if (phase !== "team_a_innings" && phase !== "team_b_innings") return;

      const teamId = currentBattingTeamId;
      if (!teamId) return;

      // Check innings not complete
      const state = deriveInningsState(events, teamId);
      if (state.totalLegalBalls >= 24) return;

      setSaving(true);

      // All deliveries count as legal balls (wides/no-balls not rebowled)
      const overNum = Math.min(state.overNumber, 4);
      const ballNum = state.ballInOver + 1;

      // Determine batter — alternate between pair members
      const pair = overNum <= 2 ? currentPair1 : currentPair2;
      const pairIndex = state.totalLegalBalls % 2;
      const batterId = pair.length > 0 ? pair[pairIndex % pair.length] : null;
      const bowlerId =
        currentBowlers.length >= overNum ? currentBowlers[overNum - 1] : null;

      const newEvent: Omit<MatchEvent, "id" | "created_at"> = {
        match_id: matchId,
        team_id: teamId,
        over_number: overNum,
        ball_number: ballNum,
        runs: opts.runs,
        is_wicket: opts.isWicket ?? false,
        extra_type: opts.extraType ?? null,
        batter_id: batterId,
        bowler_id: bowlerId,
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
        setEvents((prev) => prev.filter((e) => e.id !== optimisticId));
        setError("Failed to record delivery. Please try again.");
      } else {
        setEvents((prev) =>
          prev.map((e) =>
            e.id === optimisticId ? (inserted as MatchEvent) : e
          )
        );
      }

      setSaving(false);
    },
    [match, saving, transition, phase, currentBattingTeamId, events, matchId, currentPair1, currentPair2, currentBowlers, supabase]
  );

  // ── Undo ───────────────────────────────────────────────────────────────────

  const undoLast = useCallback(async () => {
    if (!match || saving || events.length === 0) return;
    if (phase !== "team_a_innings" && phase !== "team_b_innings") return;

    const teamId = currentBattingTeamId;
    const teamEvents = events.filter((e) => e.team_id === teamId);
    if (teamEvents.length === 0) return;

    const last = teamEvents[teamEvents.length - 1];

    // Clear any transition since we're undoing
    setTransition(null);

    setEvents((prev) => prev.filter((e) => e.id !== last.id));

    const { error: delErr } = await supabase
      .from("match_events")
      .delete()
      .eq("id", last.id);

    if (delErr) {
      setEvents((prev) =>
        [...prev, last].sort((a, b) => a.created_at.localeCompare(b.created_at))
      );
      setError("Failed to undo. Please try again.");
    }
  }, [match, saving, events, phase, currentBattingTeamId, supabase]);

  // ── End match ──────────────────────────────────────────────────────────────

  const submitResults = useCallback(async () => {
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
      setError("Failed to submit results. Please try again.");
      setEndingMatch(false);
      return;
    }

    const netA = calculateMatchScore(stateA.runs, stateA.wickets);
    const netB = calculateMatchScore(stateB.runs, stateB.wickets);

    let pointsA = 0;
    let pointsB = 0;
    if (netA > netB) {
      pointsA = 3;
    } else if (netB > netA) {
      pointsB = 3;
    } else {
      pointsA = 1;
      pointsB = 1;
    }

    const [teamARes, teamBRes] = await Promise.all([
      supabase
        .from("teams")
        .select("points, total_runs")
        .eq("id", match.team_a_id)
        .single(),
      supabase
        .from("teams")
        .select("points, total_runs")
        .eq("id", match.team_b_id)
        .single(),
    ]);

    await Promise.all([
      supabase
        .from("teams")
        .update({
          points: (teamARes.data?.points ?? 0) + pointsA,
          total_runs: (teamARes.data?.total_runs ?? 0) + stateA.runs,
        })
        .eq("id", match.team_a_id),
      supabase
        .from("teams")
        .update({
          points: (teamBRes.data?.points ?? 0) + pointsB,
          total_runs: (teamBRes.data?.total_runs ?? 0) + stateB.runs,
        })
        .eq("id", match.team_b_id),
    ]);

    window.location.href = "/fixtures";
  }, [match, events, matchId, endingMatch, supabase]);

  // ── Player card component ──────────────────────────────────────────────────

  function PlayerCard({
    player,
    selected,
    disabled,
    onTap,
  }: {
    player: Player;
    selected: boolean;
    disabled: boolean;
    onTap: () => void;
  }) {
    return (
      <button
        onClick={onTap}
        disabled={disabled}
        className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-all ${
          selected
            ? "ring-3 ring-cricket bg-green-50"
            : disabled
            ? "opacity-40"
            : "bg-white hover:bg-gray-50"
        }`}
      >
        <div className="h-16 w-16 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden shadow">
          {player.avatar_url ? (
            <img
              src={player.avatar_url}
              alt={playerName(player)}
              className="h-16 w-16 object-cover rounded-full"
            />
          ) : (
            <span className="text-lg font-black text-gray-500">
              {playerInitials(player)}
            </span>
          )}
        </div>
        <span className="text-xs font-bold text-center leading-tight truncate w-full">
          {player.first_name}
        </span>
      </button>
    );
  }

  // ── Loading / Error states ─────────────────────────────────────────────────

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

  // ── Derived display state ──────────────────────────────────────────────────

  const teamAState = deriveInningsState(events, match.team_a_id);
  const teamBState = deriveInningsState(events, match.team_b_id);
  const netA = calculateMatchScore(teamAState.runs, teamAState.wickets);
  const netB = calculateMatchScore(teamBState.runs, teamBState.wickets);

  // ── Setup screens ──────────────────────────────────────────────────────────

  function renderSetupScreen(
    battingLabel: string,
    battingRoster: Player[],
    fieldingRoster: Player[],
    pair1: string[],
    setPair1Fn: (ids: string[]) => void,
    bowlers: string[],
    setBowlersFn: (ids: string[]) => void,
    onStart: () => void
  ) {
    const togglePair1 = (id: string) => {
      if (pair1.includes(id)) {
        setPair1Fn(pair1.filter((p) => p !== id));
      } else if (pair1.length < 2) {
        setPair1Fn([...pair1, id]);
      }
    };

    const toggleBowler = (id: string) => {
      if (bowlers.includes(id)) {
        setBowlersFn(bowlers.filter((b) => b !== id));
      } else if (bowlers.length < 1) {
        setBowlersFn([...bowlers, id]);
      }
    };

    const canStart = pair1.length === 2 && bowlers.length === 1;

    return (
      <div className="mx-auto max-w-md min-h-screen bg-background pb-10">
        <div className="bg-cricket px-4 pt-6 pb-4">
          <p className="text-cricket-foreground/70 text-xs font-bold uppercase tracking-widest mb-1">
            Innings Setup
          </p>
          <h1 className="text-cricket-foreground text-xl font-black tracking-tight leading-tight">
            {battingLabel} Batting
          </h1>
        </div>

        <div className="px-4 pt-4 space-y-6">
          {/* Select Pair 1 */}
          <Card className="rounded-2xl shadow-md">
            <CardContent className="px-4 py-5">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">
                Select Pair 1
              </p>
              <p className="text-xs text-muted-foreground mb-4">
                Choose 2 batters for Overs 1 &amp; 2
              </p>
              <div className="grid grid-cols-4 gap-2">
                {battingRoster.map((p) => (
                  <PlayerCard
                    key={p.id}
                    player={p}
                    selected={pair1.includes(p.id)}
                    disabled={!pair1.includes(p.id) && pair1.length >= 2}
                    onTap={() => togglePair1(p.id)}
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Select Bowler for Over 1 */}
          <Card className="rounded-2xl shadow-md">
            <CardContent className="px-4 py-5">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">
                Select Bowler for Over 1
              </p>
              <p className="text-xs text-muted-foreground mb-4">
                Choose 1 bowler from the fielding team
              </p>
              <div className="grid grid-cols-4 gap-2">
                {fieldingRoster.map((p) => (
                  <PlayerCard
                    key={p.id}
                    player={p}
                    selected={bowlers.includes(p.id)}
                    disabled={!bowlers.includes(p.id) && bowlers.length >= 1}
                    onTap={() => toggleBowler(p.id)}
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          <button
            disabled={!canStart}
            onClick={onStart}
            className="w-full h-14 rounded-2xl bg-cricket text-white text-base font-black tracking-tight active:scale-[0.98] transition-transform disabled:opacity-40 shadow-md"
          >
            Start Innings
          </button>
        </div>
      </div>
    );
  }

  // Phase 1: Team A Setup
  if (phase === "team_a_setup") {
    return renderSetupScreen(
      match.team_a.name,
      playersA,
      playersB,
      aPair1,
      setAPair1,
      aBowlers,
      setABowlers,
      () => setPhase("team_a_innings")
    );
  }

  // Phase 3: Team B Setup
  if (phase === "team_b_setup") {
    return renderSetupScreen(
      match.team_b.name,
      playersB,
      playersA,
      bPair1,
      setBPair1,
      bBowlers,
      setBBowlers,
      () => setPhase("team_b_innings")
    );
  }

  // ── Phase 5: Match Complete ────────────────────────────────────────────────

  if (phase === "match_complete") {
    const winner =
      netA > netB
        ? match.team_a.name
        : netB > netA
        ? match.team_b.name
        : null;

    return (
      <div className="mx-auto max-w-md min-h-screen bg-background pb-10">
        <div className="bg-cricket px-4 pt-6 pb-4">
          <p className="text-cricket-foreground/70 text-xs font-bold uppercase tracking-widest mb-1">
            Match Complete
          </p>
          <h1 className="text-cricket-foreground text-xl font-black tracking-tight leading-tight">
            {match.team_a.name} vs {match.team_b.name}
          </h1>
        </div>

        <div className="px-4 pt-6 space-y-6">
          <Card className="rounded-2xl shadow-md">
            <CardContent className="px-5 py-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="text-center">
                  <p className="text-xs font-bold text-muted-foreground truncate mb-2">
                    {match.team_a.name}
                  </p>
                  <p className="text-4xl font-black text-foreground">
                    {teamAState.runs}/{teamAState.wickets}
                  </p>
                  <p className="text-sm font-bold text-cricket mt-1">
                    Net: {netA}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs font-bold text-muted-foreground truncate mb-2">
                    {match.team_b.name}
                  </p>
                  <p className="text-4xl font-black text-foreground">
                    {teamBState.runs}/{teamBState.wickets}
                  </p>
                  <p className="text-sm font-bold text-cricket mt-1">
                    Net: {netB}
                  </p>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t text-center">
                {winner ? (
                  <p className="text-lg font-black text-foreground">
                    {winner} wins!
                  </p>
                ) : (
                  <p className="text-lg font-black text-foreground">
                    Match drawn
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {!match.status && (
            <button
              disabled={endingMatch}
              onClick={submitResults}
              className="w-full h-14 rounded-2xl bg-cricket text-white text-base font-black tracking-tight active:scale-[0.98] transition-transform disabled:opacity-60 shadow-md"
            >
              {endingMatch ? "Submitting..." : "Submit Results"}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Phases 2 & 4: Scoring Interface ────────────────────────────────────────

  const isBattingA = phase === "team_a_innings";
  const scoringTeamId = isBattingA ? match.team_a_id : match.team_b_id;
  const scoringTeamName = isBattingA ? match.team_a.name : match.team_b.name;
  const scoringBattingRoster = isBattingA ? playersA : playersB;
  const scoringFieldingRoster = isBattingA ? playersB : playersA;
  const scoringState = deriveInningsState(events, scoringTeamId);
  const scoringNetScore = calculateMatchScore(scoringState.runs, scoringState.wickets);

  const scoringOver = Math.min(scoringState.overNumber, 4);
  const scoringPair1 = isBattingA ? aPair1 : bPair1;
  const scoringPair2 = isBattingA ? aPair2 : bPair2;
  const scoringBowlers = isBattingA ? aBowlers : bBowlers;
  const scoringCurrentPair = scoringOver <= 2 ? scoringPair1 : scoringPair2;
  const scoringCurrentBowler =
    scoringBowlers.length >= scoringOver
      ? scoringBowlers[scoringOver - 1]
      : null;

  const pairPlayers = scoringCurrentPair
    .map((id) => scoringBattingRoster.find((p) => p.id === id))
    .filter(Boolean) as Player[];
  const bowlerPlayer = scoringCurrentBowler
    ? scoringFieldingRoster.find((p) => p.id === scoringCurrentBowler)
    : null;

  const last6 = getLastSixDeliveries(events, scoringTeamId);
  const inningsComplete = scoringState.totalLegalBalls >= 24;

  // ── Over transition cards ──────────────────────────────────────────────────

  function renderTransition() {
    if (!transition) return null;

    const setPair2Fn = isBattingA ? setAPair2 : setBPair2;
    const currentPair2Sel = isBattingA ? aPair2 : bPair2;
    const setBowlersFn = isBattingA ? setABowlers : setBBowlers;
    const currentBowlersList = isBattingA ? aBowlers : bBowlers;

    // After over 4: transition to next phase
    if (transition === "over_4_done") {
      return (
        <Card className="rounded-2xl shadow-md border-2 border-cricket">
          <CardContent className="px-5 py-6 text-center space-y-4">
            <p className="text-lg font-black text-foreground">
              {scoringTeamName} innings complete!
            </p>
            <p className="text-sm text-muted-foreground">
              {scoringState.runs}/{scoringState.wickets} &mdash; Net: {scoringNetScore}
            </p>
            <button
              onClick={() => {
                setTransition(null);
                if (isBattingA) {
                  setPhase("team_b_setup");
                } else {
                  setPhase("match_complete");
                }
              }}
              className="w-full h-12 rounded-2xl bg-cricket text-white text-base font-black active:scale-[0.98] transition-transform shadow-md"
            >
              {isBattingA ? "Set Up Team B Innings" : "View Results"}
            </button>
          </CardContent>
        </Card>
      );
    }

    // After over 1: select bowler for over 2
    if (transition === "over_1_done") {
      const usedBowlers = currentBowlersList;

      return (
        <Card className="rounded-2xl shadow-md border-2 border-cricket">
          <CardContent className="px-4 py-5 space-y-4">
            <p className="text-sm font-black text-foreground">
              Over 1 complete. Select bowler for Over 2.
            </p>
            <div className="grid grid-cols-4 gap-2">
              {scoringFieldingRoster.map((p) => {
                const used = usedBowlers.includes(p.id);
                return (
                  <PlayerCard
                    key={p.id}
                    player={p}
                    selected={tempBowlerSelection === p.id}
                    disabled={used}
                    onTap={() => {
                      if (!used) setTempBowlerSelection(p.id);
                    }}
                  />
                );
              })}
            </div>
            <button
              disabled={!tempBowlerSelection}
              onClick={() => {
                if (tempBowlerSelection) {
                  setBowlersFn([...currentBowlersList, tempBowlerSelection]);
                  setTempBowlerSelection(null);
                  setTransition(null);
                }
              }}
              className="w-full h-12 rounded-2xl bg-cricket text-white text-sm font-black active:scale-[0.98] transition-transform disabled:opacity-40 shadow-md"
            >
              Confirm &amp; Continue
            </button>
          </CardContent>
        </Card>
      );
    }

    // After over 2: select pair 2 + bowler for over 3
    if (transition === "over_2_done") {
      const usedBowlers = currentBowlersList;
      const pair1Ids = isBattingA ? aPair1 : bPair1;

      const togglePair2 = (id: string) => {
        if (currentPair2Sel.includes(id)) {
          setPair2Fn(currentPair2Sel.filter((p) => p !== id));
        } else if (currentPair2Sel.length < 2) {
          setPair2Fn([...currentPair2Sel, id]);
        }
      };

      return (
        <Card className="rounded-2xl shadow-md border-2 border-cricket">
          <CardContent className="px-4 py-5 space-y-4">
            <p className="text-sm font-black text-foreground">
              Over 2 complete. Pair 2 now batting.
            </p>

            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
                Select Pair 2 (Overs 3 &amp; 4)
              </p>
              <div className="grid grid-cols-4 gap-2">
                {scoringBattingRoster.map((p) => {
                  const inPair1 = pair1Ids.includes(p.id);
                  return (
                    <PlayerCard
                      key={p.id}
                      player={p}
                      selected={currentPair2Sel.includes(p.id)}
                      disabled={
                        inPair1 ||
                        (!currentPair2Sel.includes(p.id) &&
                          currentPair2Sel.length >= 2)
                      }
                      onTap={() => {
                        if (!inPair1) togglePair2(p.id);
                      }}
                    />
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
                Select Bowler for Over 3
              </p>
              <div className="grid grid-cols-4 gap-2">
                {scoringFieldingRoster.map((p) => {
                  const used = usedBowlers.includes(p.id);
                  return (
                    <PlayerCard
                      key={p.id}
                      player={p}
                      selected={tempBowlerSelection === p.id}
                      disabled={used}
                      onTap={() => {
                        if (!used) setTempBowlerSelection(p.id);
                      }}
                    />
                  );
                })}
              </div>
            </div>

            <button
              disabled={currentPair2Sel.length !== 2 || !tempBowlerSelection}
              onClick={() => {
                if (tempBowlerSelection) {
                  setBowlersFn([...currentBowlersList, tempBowlerSelection]);
                  setTempBowlerSelection(null);
                  setTransition(null);
                }
              }}
              className="w-full h-12 rounded-2xl bg-cricket text-white text-sm font-black active:scale-[0.98] transition-transform disabled:opacity-40 shadow-md"
            >
              Confirm &amp; Continue
            </button>
          </CardContent>
        </Card>
      );
    }

    // After over 3: select bowler for over 4 (last remaining)
    if (transition === "over_3_done") {
      const usedBowlers = currentBowlersList;
      const remaining = scoringFieldingRoster.filter(
        (p) => !usedBowlers.includes(p.id)
      );

      return (
        <Card className="rounded-2xl shadow-md border-2 border-cricket">
          <CardContent className="px-4 py-5 space-y-4">
            <p className="text-sm font-black text-foreground">
              Over 3 complete. Select bowler for Over 4.
            </p>
            <div className="grid grid-cols-4 gap-2">
              {scoringFieldingRoster.map((p) => {
                const used = usedBowlers.includes(p.id);
                return (
                  <PlayerCard
                    key={p.id}
                    player={p}
                    selected={tempBowlerSelection === p.id}
                    disabled={used}
                    onTap={() => {
                      if (!used) setTempBowlerSelection(p.id);
                    }}
                  />
                );
              })}
            </div>
            <button
              disabled={!tempBowlerSelection}
              onClick={() => {
                if (tempBowlerSelection) {
                  setBowlersFn([...currentBowlersList, tempBowlerSelection]);
                  setTempBowlerSelection(null);
                  setTransition(null);
                }
              }}
              className="w-full h-12 rounded-2xl bg-cricket text-white text-sm font-black active:scale-[0.98] transition-transform disabled:opacity-40 shadow-md"
            >
              Confirm &amp; Continue
            </button>
          </CardContent>
        </Card>
      );
    }

    return null;
  }

  // ── Main scoring render ────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-md min-h-screen bg-background pb-10">
      {/* Error toast */}
      {error && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-red-500 text-white text-sm font-semibold px-4 py-2 rounded-full shadow-lg">
          {error}
          <button className="ml-3 underline" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {/* Header */}
      <div className="bg-cricket px-4 pt-6 pb-4">
        <p className="text-cricket-foreground/70 text-xs font-bold uppercase tracking-widest mb-1">
          {scoringTeamName} Batting
        </p>
        <div className="flex items-end gap-4">
          <span className="text-5xl font-black tracking-tight text-cricket-foreground">
            {scoringState.runs}/{scoringState.wickets}
          </span>
          <div className="mb-1">
            <p className="text-xs text-cricket-foreground/70 font-semibold">
              Net Score
            </p>
            <p className="text-xl font-black text-cricket-foreground">
              {scoringNetScore}
            </p>
          </div>
        </div>
        <p className="text-xs text-cricket-foreground/70 mt-1">
          100 + {scoringState.runs} - {scoringState.wickets * 6} = {scoringNetScore}
        </p>
      </div>

      <div className="px-4 pt-4 space-y-4">
        {/* Over / pair / bowler info */}
        <Card className="rounded-2xl shadow-md">
          <CardContent className="px-5 py-4 space-y-1">
            <p className="text-sm font-bold text-foreground">
              Over {scoringOver} of 4
            </p>
            <p className="text-sm text-muted-foreground">
              {scoringOver <= 2 ? "Pair 1" : "Pair 2"}:{" "}
              {pairPlayers.map((p) => p.first_name).join(" & ")}
            </p>
            {bowlerPlayer && (
              <p className="text-sm text-muted-foreground">
                {playerName(bowlerPlayer)} bowling
              </p>
            )}
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

        {/* Transition card (if any) */}
        {transition && renderTransition()}

        {/* Scoring buttons — hidden during transitions */}
        {!transition && !inningsComplete && (
          <>
            {/* Run buttons */}
            <Card className="rounded-2xl shadow-md">
              <CardContent className="px-4 py-5">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">
                  Runs
                </p>
                <div className="grid grid-cols-3 gap-3 place-items-center">
                  <button
                    disabled={saving}
                    onClick={() => insertEvent({ runs: 0 })}
                    className="h-20 w-20 rounded-full bg-gray-200 text-gray-600 text-2xl font-black active:scale-95 transition-transform disabled:opacity-50 shadow"
                  >
                    0
                  </button>
                  <button
                    disabled={saving}
                    onClick={() => insertEvent({ runs: 1 })}
                    className="h-20 w-20 rounded-full bg-white border-2 border-gray-300 text-gray-800 text-2xl font-black active:scale-95 transition-transform disabled:opacity-50 shadow"
                  >
                    1
                  </button>
                  <button
                    disabled={saving}
                    onClick={() => insertEvent({ runs: 2 })}
                    className="h-20 w-20 rounded-full bg-white border-2 border-gray-300 text-gray-800 text-2xl font-black active:scale-95 transition-transform disabled:opacity-50 shadow"
                  >
                    2
                  </button>
                  <button
                    disabled={saving}
                    onClick={() => insertEvent({ runs: 3 })}
                    className="h-20 w-20 rounded-full bg-white border-2 border-gray-300 text-gray-800 text-2xl font-black active:scale-95 transition-transform disabled:opacity-50 shadow"
                  >
                    3
                  </button>
                  <button
                    disabled={saving}
                    onClick={() => insertEvent({ runs: 4 })}
                    className="h-20 w-20 rounded-full bg-cricket text-white text-2xl font-black active:scale-95 transition-transform disabled:opacity-50 shadow-md"
                  >
                    4
                  </button>
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
              WICKET (-6 runs)
            </button>

            {/* Extras */}
            <Card className="rounded-2xl shadow-md">
              <CardContent className="px-4 py-4">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
                  Extras
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    disabled={saving}
                    onClick={() =>
                      insertEvent({ runs: 2, extraType: "wide" })
                    }
                    className="h-14 rounded-xl bg-amber-100 text-amber-800 border border-amber-300 text-sm font-black active:scale-95 transition-transform disabled:opacity-50"
                  >
                    Wide
                    <span className="block text-xs font-semibold">
                      +2 runs, counts as ball
                    </span>
                  </button>
                  <button
                    disabled={saving}
                    onClick={() =>
                      insertEvent({ runs: 2, extraType: "no_ball" })
                    }
                    className="h-14 rounded-xl bg-orange-100 text-orange-800 border border-orange-300 text-sm font-black active:scale-95 transition-transform disabled:opacity-50"
                  >
                    No Ball
                    <span className="block text-xs font-semibold">
                      +2 runs, counts as ball
                    </span>
                  </button>
                </div>

                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mt-4 mb-3">
                  Byes / Leg Byes
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    disabled={saving}
                    onClick={() => insertEvent({ runs: 1, extraType: "bye" })}
                    className="h-14 rounded-xl bg-blue-100 text-blue-800 border border-blue-300 text-lg font-black active:scale-95 transition-transform disabled:opacity-50"
                  >
                    1 Bye
                  </button>
                  <button
                    disabled={saving}
                    onClick={() => insertEvent({ runs: 2, extraType: "bye" })}
                    className="h-14 rounded-xl bg-blue-100 text-blue-800 border border-blue-300 text-lg font-black active:scale-95 transition-transform disabled:opacity-50"
                  >
                    2 Byes
                  </button>
                  <button
                    disabled={saving}
                    onClick={() => insertEvent({ runs: 4, extraType: "bye" })}
                    className="h-14 rounded-xl bg-blue-100 text-blue-800 border border-blue-300 text-lg font-black active:scale-95 transition-transform disabled:opacity-50"
                  >
                    4 Byes
                  </button>
                </div>
              </CardContent>
            </Card>

            {/* Undo — big fat-finger friendly button */}
            <button
              disabled={saving}
              onClick={undoLast}
              className="w-full h-14 rounded-2xl bg-amber-500 text-white text-base font-black tracking-tight flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50 shadow-md"
            >
              <svg
                className="h-5 w-5"
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
              UNDO LAST BALL
            </button>
          </>
        )}
      </div>
    </div>
  );
}
