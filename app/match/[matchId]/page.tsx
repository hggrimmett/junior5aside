"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { calculateMatchScore } from "@/lib/tournament-logic";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────

interface MatchRow {
  id: string;
  team_a_id: string;
  team_b_id: string;
  status: boolean;
  scheduled_time: string | null;
  team_a: { name: string } | null;
  team_b: { name: string } | null;
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
  created_at: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function deriveStats(events: MatchEvent[], teamId: string) {
  const teamEvents = events.filter((e) => e.team_id === teamId);
  const runs = teamEvents.reduce((sum, e) => sum + e.runs, 0);
  const wickets = teamEvents.filter((e) => e.is_wicket).length;
  return { runs, wickets };
}

function currentOverNumber(events: MatchEvent[], teamId: string): number {
  const teamEvents = events.filter((e) => e.team_id === teamId);
  if (teamEvents.length === 0) return 1;
  return Math.max(...teamEvents.map((e) => e.over_number));
}

/** Last up-to-6 balls of the current over for a team */
function currentOverBalls(events: MatchEvent[], teamId: string, overNum: number): MatchEvent[] {
  return events
    .filter((e) => e.team_id === teamId && e.over_number === overNum)
    .sort((a, b) => a.ball_number - b.ball_number);
}

/** Label to show inside each ball badge */
function ballLabel(event: MatchEvent): string {
  if (event.is_wicket) return "W";
  if (event.extra_type === "wide") return "Wd";
  if (event.extra_type === "no_ball") return "Nb";
  if (event.extra_type === "bye") return `${event.runs}B`;
  if (event.runs === 0) return "•";
  return String(event.runs);
}

/** Tailwind classes for the ball badge */
function ballBadgeClass(event: MatchEvent): string {
  if (event.is_wicket)
    return "bg-red-500 text-white font-black";
  if (event.extra_type)
    return "bg-amber-400 text-amber-900 font-bold";
  if (event.runs === 0)
    return "bg-gray-200 text-gray-500 font-semibold";
  if (event.runs >= 4)
    return "bg-[#114232] text-white font-black";
  return "bg-slate-700 text-white font-semibold";
}

/** Row badge colour for the timeline */
function runsBadgeClass(event: MatchEvent): string {
  if (event.is_wicket)    return "bg-red-500 text-white";
  if (event.runs === 6)   return "bg-[#114232] text-white font-black";
  if (event.runs === 4)   return "bg-[#114232] text-white";
  if (event.runs === 0)   return "bg-gray-200 text-gray-600";
  return "bg-slate-700 text-white";
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function MatchCentrePage() {
  const { matchId } = useParams<{ matchId: string }>();
  const supabase = getSupabaseBrowserClient();

  const [match, setMatch] = useState<MatchRow | null>(null);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const timelineTopRef = useRef<HTMLDivElement>(null);

  // ── Initial fetch ──────────────────────────────────────────────────────

  useEffect(() => {
    async function init() {
      const [matchRes, eventsRes] = await Promise.all([
        supabase
          .from("matches")
          .select("*, team_a:team_a_id(name), team_b:team_b_id(name)")
          .eq("id", matchId)
          .single(),
        supabase
          .from("match_events")
          .select("*")
          .eq("match_id", matchId)
          .order("created_at", { ascending: true }),
      ]);

      if (matchRes.data) setMatch(matchRes.data as unknown as MatchRow);
      if (eventsRes.data) setEvents(eventsRes.data as MatchEvent[]);
      setLoading(false);
    }

    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  // ── Realtime subscription ──────────────────────────────────────────────

  useEffect(() => {
    const channel = supabase
      .channel(`match-events-${matchId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "match_events",
          filter: `match_id=eq.${matchId}`,
        },
        (payload) => {
          const newEvent = payload.new as MatchEvent;
          setEvents((prev) => {
            const updated = [...prev, newEvent].sort(
              (a, b) =>
                new Date(a.created_at).getTime() -
                new Date(b.created_at).getTime()
            );
            return updated;
          });
          // Scroll timeline to top (newest event)
          setTimeout(() => {
            timelineTopRef.current?.scrollIntoView({ behavior: "smooth" });
          }, 50);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "match_events",
          filter: `match_id=eq.${matchId}`,
        },
        (payload) => {
          const deletedId = (payload.old as { id: string }).id;
          setEvents((prev) => prev.filter((e) => e.id !== deletedId));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  // ── Derived data ───────────────────────────────────────────────────────

  const teamAId = match?.team_a_id ?? "";
  const teamBId = match?.team_b_id ?? "";
  const teamAName = match?.team_a?.name ?? "Team A";
  const teamBName = match?.team_b?.name ?? "Team B";

  const statsA = useMemo(() => deriveStats(events, teamAId), [events, teamAId]);
  const statsB = useMemo(() => deriveStats(events, teamBId), [events, teamBId]);

  const netScoreA = calculateMatchScore(statsA.runs, statsA.wickets);
  const netScoreB = calculateMatchScore(statsB.runs, statsB.wickets);

  const teamAEvents = useMemo(
    () => events.filter((e) => e.team_id === teamAId),
    [events, teamAId]
  );
  const teamBEvents = useMemo(
    () => events.filter((e) => e.team_id === teamBId),
    [events, teamBId]
  );

  // Determine who is currently batting:
  // If team B has events they are (or were) batting; otherwise team A.
  const teamBHasEvents = teamBEvents.length > 0;
  const currentlyBattingId = teamBHasEvents ? teamBId : teamAId;

  // Current over info for the batting team
  const battingTeamEvents = teamBHasEvents ? teamBEvents : teamAEvents;
  const latestOverNum = useMemo(() => {
    if (battingTeamEvents.length === 0) return 1;
    return Math.max(...battingTeamEvents.map((e) => e.over_number));
  }, [battingTeamEvents]);

  const currentOverBallsList = useMemo(
    () => currentOverBalls(events, currentlyBattingId, latestOverNum),
    [events, currentlyBattingId, latestOverNum]
  );

  // Team A innings complete = team B has started batting
  const teamAInningsDone = teamBHasEvents;

  // Balls remaining for Team B (assume 6 balls per over, e.g. 5 overs = 30 balls)
  // We don't know the max overs from the schema, so show "Need X" without balls if not enough info.
  // Using team A's over count as the innings length reference.
  const teamAMaxOver = teamAEvents.length > 0
    ? Math.max(...teamAEvents.map((e) => e.over_number))
    : 0;
  // All balls count (wides/no-balls not rebowled in Barrington Pairs)
  const teamABallsPlayed = teamAEvents.length;
  const teamBBallsPlayed = teamBEvents.length;
  const totalBalls = 24; // 4 overs × 6 balls
  const ballsRemaining = Math.max(0, totalBalls - teamBBallsPlayed);
  const runsNeeded = Math.max(0, netScoreA - netScoreB + 1);

  // Winner
  const winner = useMemo(() => {
    if (!match?.status) return null;
    if (netScoreA > netScoreB) return teamAName;
    if (netScoreB > netScoreA) return teamBName;
    return "Draw";
  }, [match?.status, netScoreA, netScoreB, teamAName, teamBName]);

  // All events newest-first for the timeline
  const timelineEvents = useMemo(
    () => [...events].reverse(),
    [events]
  );

  // Group events by over for separator rendering
  const overGroups = useMemo(() => {
    const groups: Record<string, MatchEvent[]> = {};
    for (const e of timelineEvents) {
      const key = `${e.team_id}-${e.over_number}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(e);
    }
    return groups;
  }, [timelineEvents]);

  // Build a flat list of { type: 'event' | 'separator', ... } for rendering
  const flatTimeline = useMemo(() => {
    type TimelineItem =
      | { type: "event"; event: MatchEvent }
      | { type: "separator"; label: string };

    const items: TimelineItem[] = [];
    let lastKey: string | null = null;

    for (const e of timelineEvents) {
      const key = `${e.team_id}-${e.over_number}`;
      const teamName = e.team_id === teamAId ? teamAName : teamBName;
      if (key !== lastKey) {
        if (lastKey !== null) {
          items.push({ type: "separator", label: `Over ${e.over_number} — ${teamName}` });
        }
        lastKey = key;
      }
      items.push({ type: "event", event: e });
    }

    return items;
  }, [timelineEvents, teamAId, teamAName, teamBName]);

  // ── Loading state ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center px-4">
        <div className="flex items-center gap-3 text-muted-foreground">
          <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12" cy="12" r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <span className="text-sm font-medium">Loading match&hellip;</span>
        </div>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 px-4 text-center">
        <p className="text-sm font-bold text-foreground">Match not found</p>
        <p className="text-xs text-muted-foreground">
          This match may have been removed or the link is incorrect.
        </p>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="px-4 py-4 space-y-4">

      {/* ── Match status badge ──────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">
          Match Centre
        </p>
        {match.status ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#114232] px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white">
            Match Complete
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white">
            <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
            Live
          </span>
        )}
      </div>

      {/* ── Final result card ───────────────────────────────────────── */}
      {match.status && winner && (
        <Card className="rounded-2xl shadow-md border-[#114232]/30 bg-[#114232]/5 overflow-hidden">
          <CardContent className="flex flex-col items-center gap-1 py-5">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">
              Result
            </p>
            <p className="text-lg font-black text-foreground text-center">
              {winner === "Draw"
                ? "Match Drawn"
                : `${winner} won`}
            </p>
            {winner !== "Draw" && (
              <p className="text-xs text-muted-foreground text-center">
                by {Math.abs(netScoreA - netScoreB)} net run{Math.abs(netScoreA - netScoreB) !== 1 ? "s" : ""}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Scoreboard ─────────────────────────────────────────────── */}
      <Card className="rounded-2xl shadow-md overflow-hidden">
        <CardContent className="px-4 pt-5 pb-4">
          <div className="grid grid-cols-2 divide-x divide-border">

            {/* Team A */}
            <div
              className={cn(
                "flex flex-col items-center gap-1 pr-4 transition-opacity",
                currentlyBattingId === teamAId && !match.status
                  ? "opacity-100"
                  : "opacity-50"
              )}
            >
              {currentlyBattingId === teamAId && !match.status && (
                <span className="mb-0.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#114232]" />
              )}
              <p className="max-w-[120px] truncate text-center text-xs font-bold text-muted-foreground">
                {teamAName}
              </p>
              <p className="text-3xl font-black tabular-nums text-foreground leading-none">
                {statsA.runs}/{statsA.wickets}
              </p>
              <p className="text-[11px] font-semibold text-muted-foreground">
                Net {netScoreA}
              </p>
            </div>

            {/* Team B */}
            <div
              className={cn(
                "flex flex-col items-center gap-1 pl-4 transition-opacity",
                currentlyBattingId === teamBId && !match.status
                  ? "opacity-100"
                  : teamBHasEvents || match.status
                  ? "opacity-100"
                  : "opacity-40"
              )}
            >
              {currentlyBattingId === teamBId && !match.status && (
                <span className="mb-0.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#114232]" />
              )}
              <p className="max-w-[120px] truncate text-center text-xs font-bold text-muted-foreground">
                {teamBName}
              </p>
              <p className="text-3xl font-black tabular-nums text-foreground leading-none">
                {statsB.runs}/{statsB.wickets}
              </p>
              <p className="text-[11px] font-semibold text-muted-foreground">
                Net {netScoreB}
              </p>
            </div>

          </div>
        </CardContent>
      </Card>

      {/* ── Required run rate (Team B batting, Team A done) ─────────── */}
      {!match.status && teamAInningsDone && runsNeeded > 0 && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 text-center">
          <p className="text-xs font-bold text-amber-800">
            {teamBName} need{" "}
            <span className="text-sm font-black">{runsNeeded}</span> more net run{runsNeeded !== 1 ? "s" : ""}
            {ballsRemaining > 0 && (
              <>
                {" "}from{" "}
                <span className="text-sm font-black">{ballsRemaining}</span>{" "}
                ball{ballsRemaining !== 1 ? "s" : ""}
              </>
            )}
          </p>
        </div>
      )}

      {/* ── Current Over ────────────────────────────────────────────── */}
      {!match.status && (
        <Card className="rounded-2xl shadow-md overflow-hidden">
          <CardHeader className="px-4 pt-4 pb-2">
            <CardTitle className="text-xs font-extrabold uppercase tracking-widest text-muted-foreground">
              Over {latestOverNum}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {currentOverBallsList.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                No balls bowled yet this over
              </p>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                {currentOverBallsList.map((ball) => (
                  <div
                    key={ball.id}
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-full text-xs shrink-0",
                      ballBadgeClass(ball)
                    )}
                  >
                    {ballLabel(ball)}
                  </div>
                ))}
                {/* Empty placeholders up to 6 */}
                {Array.from({ length: Math.max(0, 6 - currentOverBallsList.length) }).map(
                  (_, i) => (
                    <div
                      key={`empty-${i}`}
                      className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/20 text-muted-foreground/30 text-xs"
                    />
                  )
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Ball-by-ball timeline ────────────────────────────────────── */}
      <Card className="rounded-2xl shadow-md overflow-hidden">
        <CardHeader className="px-4 pt-4 pb-2">
          <CardTitle className="text-xs font-extrabold uppercase tracking-widest text-muted-foreground">
            Ball-by-ball
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {timelineEvents.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground italic">
              No balls recorded yet
            </p>
          ) : (
            <div className="space-y-1">
              {/* Anchor for auto-scroll */}
              <div ref={timelineTopRef} />

              {flatTimeline.map((item, idx) => {
                if (item.type === "separator") {
                  return (
                    <div
                      key={`sep-${idx}`}
                      className="flex items-center gap-2 py-1.5"
                    >
                      <Separator className="flex-1" />
                      <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground whitespace-nowrap">
                        {item.label}
                      </span>
                      <Separator className="flex-1" />
                    </div>
                  );
                }

                const e = item.event;
                const teamName = e.team_id === teamAId ? teamAName : teamBName;

                return (
                  <div
                    key={e.id}
                    className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-muted/40 transition-colors"
                  >
                    {/* Over.Ball */}
                    <span className="w-14 shrink-0 text-[11px] font-mono font-semibold text-muted-foreground">
                      {teamName.slice(0, 1)}{e.over_number}.{e.ball_number}
                    </span>

                    {/* Runs badge */}
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px]",
                        runsBadgeClass(e)
                      )}
                    >
                      {e.runs === 0 && !e.is_wicket ? "•" : e.runs}
                    </span>

                    {/* Wicket badge */}
                    {e.is_wicket && (
                      <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
                        Wicket
                      </span>
                    )}

                    {/* Extra label */}
                    {e.extra_type && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 capitalize">
                        {e.extra_type === "no_ball" ? "No Ball" : e.extra_type}
                      </span>
                    )}

                    {/* Boundary label */}
                    {!e.is_wicket && !e.extra_type && e.runs >= 4 && (
                      <span className="rounded-full bg-[#114232]/10 px-2 py-0.5 text-[10px] font-bold text-[#114232]">
                        {e.runs === 6 ? "Six" : "Four"}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
