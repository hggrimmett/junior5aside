"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// ── Types ───────────────────────────────────────────────────

type TournamentColour = "Blue" | "Red" | "Green";

interface Tournament {
  id: string;
  name: string;
  colour: TournamentColour;
}

interface TeamRef {
  id: string;
  name: string;
  mentor_id: string | null;
}

interface MatchRow {
  id: string;
  tournament_id: string;
  team_a: TeamRef | null;
  team_b: TeamRef | null;
  score_a: number | null;
  score_b: number | null;
  wickets_a: number | null;
  wickets_b: number | null;
  status: boolean;
  scheduled_time: string | null;
  match_type: string | null;
  locked_by: string | null;
  locked_by_name: string | null;
}

type MatchStatus = "upcoming" | "live" | "completed";

interface EnrichedMatch extends MatchRow {
  matchStatus: MatchStatus;
  seqWithinTournament: number;
}

// ── Pitch config ────────────────────────────────────────────

const PITCHES: {
  colour: TournamentColour;
  pitchNum: number;
  label: string;
  years: string;
  headerBg: string;
  headerText: string;
  leftBorder: string;
  dotBg: string;
  liveBadgeBg: string;
}[] = [
  {
    colour: "Blue",
    pitchNum: 1,
    label: "Pitch 1 — Blue",
    years: "Y7/8",
    headerBg: "bg-blue-700",
    headerText: "text-white",
    leftBorder: "border-l-[4px] border-l-blue-600",
    dotBg: "bg-blue-500",
    liveBadgeBg: "bg-blue-600",
  },
  {
    colour: "Red",
    pitchNum: 2,
    label: "Pitch 2 — Red",
    years: "Y5/6",
    headerBg: "bg-red-600",
    headerText: "text-white",
    leftBorder: "border-l-[4px] border-l-red-500",
    dotBg: "bg-red-500",
    liveBadgeBg: "bg-red-600",
  },
  {
    colour: "Green",
    pitchNum: 3,
    label: "Pitch 3 — Green",
    years: "Y3/4",
    headerBg: "bg-[#114232]",
    headerText: "text-white",
    leftBorder: "border-l-[4px] border-l-green-600",
    dotBg: "bg-green-500",
    liveBadgeBg: "bg-[#114232]",
  },
];

// ── Helpers ─────────────────────────────────────────────────

function formatTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function scoreLabel(
  score: number | null,
  wickets: number | null
): string {
  if (score === null) return "—";
  const w = wickets !== null ? wickets : 0;
  return `${score}/${w}`;
}

// ── Page ────────────────────────────────────────────────────

export default function FixturesPage() {
  const supabase = getSupabaseBrowserClient();

  const [loading, setLoading] = useState(true);
  const [byColour, setByColour] = useState<
    Record<TournamentColour, EnrichedMatch[]>
  >({ Blue: [], Red: [], Green: [] });
  const [userId, setUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);

  // Fetch user role (optional — page still works for anonymous)
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setUserId(user.id);
      supabase.from("profiles").select("role").eq("id", user.id).single<{ role: string }>()
        .then(({ data }) => { if (data) setUserRole(data.role); });
    });
  }, [supabase]);

  // ── Fetch & enrich ────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    const [tournamentsRes, matchesRes, liveMatchIdsRes] = await Promise.all([
      supabase
        .from("tournaments")
        .select("id, name, colour")
        .returns<Tournament[]>(),
      supabase
        .from("matches")
        .select(
          "id, tournament_id, team_a:teams!team_a_id(id, name, mentor_id), team_b:teams!team_b_id(id, name, mentor_id), score_a, score_b, wickets_a, wickets_b, status, scheduled_time, match_type, locked_by, locked_by_name"
        )
        .order("scheduled_time", { ascending: true, nullsFirst: false })
        .returns<MatchRow[]>(),
      // Fetch distinct match_ids from match_events where the linked match is not yet complete
      // We do this by fetching match_events and cross-referencing with status=false matches
      supabase
        .from("match_events")
        .select("match_id")
        .returns<{ match_id: string }[]>(),
    ]);

    const tournaments: Tournament[] = tournamentsRes.data ?? [];
    const matches: MatchRow[] = matchesRes.data ?? [];
    const eventMatchIds = new Set(
      (liveMatchIdsRes.data ?? []).map((r) => r.match_id)
    );

    // Build tournament lookup
    const tournamentMap: Record<string, Tournament> = {};
    for (const t of tournaments) {
      tournamentMap[t.id] = t;
    }

    // Count sequence per tournament (sorted by scheduled_time then id)
    const seqCounter: Record<string, number> = {};

    const next: Record<TournamentColour, EnrichedMatch[]> = {
      Blue: [],
      Red: [],
      Green: [],
    };

    for (const m of matches) {
      const tournament = tournamentMap[m.tournament_id];
      if (!tournament) continue;

      const colour = tournament.colour as TournamentColour;
      if (!(colour in next)) continue;

      seqCounter[m.tournament_id] = (seqCounter[m.tournament_id] ?? 0) + 1;
      const seq = seqCounter[m.tournament_id];

      let matchStatus: MatchStatus;
      if (m.status) {
        matchStatus = "completed";
      } else if (eventMatchIds.has(m.id)) {
        matchStatus = "live";
      } else {
        matchStatus = "upcoming";
      }

      next[colour].push({
        ...m,
        matchStatus,
        seqWithinTournament: seq,
      });
    }

    setByColour(next);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ── Realtime ──────────────────────────────────────────────

  useEffect(() => {
    const channel = supabase
      .channel("fixtures-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches" },
        () => { fetchAll(); }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "match_events" },
        () => { fetchAll(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [supabase, fetchAll]);

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="px-4 py-5 space-y-6">
      <h2 className="text-xl font-extrabold tracking-tight text-foreground">
        Fixtures &amp; Schedule
      </h2>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <div className="flex items-center gap-3 text-muted-foreground">
            <svg
              className="h-5 w-5 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
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
            <span className="text-sm font-medium">Loading fixtures&hellip;</span>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {PITCHES.map((pitch) => {
            const matches = byColour[pitch.colour];
            return (
              <PitchSection
                key={pitch.colour}
                pitch={pitch}
                matches={matches}
                userId={userId}
                userRole={userRole}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── PitchSection ─────────────────────────────────────────────

function PitchSection({
  pitch,
  matches,
  userId,
  userRole,
}: {
  pitch: (typeof PITCHES)[number];
  matches: EnrichedMatch[];
  userId: string | null;
  userRole: string | null;
}) {
  const [expanded, setExpanded] = useState(true);
  const liveCount = matches.filter((m) => m.matchStatus === "live").length;

  return (
    <div className="space-y-3">
      {/* Section header — tappable to expand/collapse */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full rounded-2xl px-4 py-3 ${pitch.headerBg} ${pitch.headerText} shadow-md text-left active:scale-[0.99] transition-transform`}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="font-extrabold tracking-tight leading-tight">
              {pitch.label}
            </p>
            <p className="text-xs font-semibold opacity-80 mt-0.5">
              {pitch.years}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {liveCount > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                {liveCount} live
              </span>
            )}
            <span className="text-xs font-bold opacity-70">
              {matches.length}
            </span>
            <svg
              className={`h-4 w-4 opacity-70 transition-transform ${expanded ? "rotate-180" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </button>

      {/* Match cards — collapsible */}
      {!expanded ? null : matches.length === 0 ? (
        <Card className="rounded-xl shadow-sm">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No fixtures scheduled yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {matches.map((match) => (
            <MatchCard
              key={match.id}
              match={match}
              pitch={pitch}
              userId={userId}
              userRole={userRole}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── MatchCard ────────────────────────────────────────────────

function MatchCard({
  match,
  pitch,
  userId,
  userRole,
}: {
  match: EnrichedMatch;
  pitch: (typeof PITCHES)[number];
  userId: string | null;
  userRole: string | null;
}) {
  const teamAName = match.team_a?.name ?? "TBC";
  const teamBName = match.team_b?.name ?? "TBC";
  const isLive = match.matchStatus === "live";
  const isCompleted = match.matchStatus === "completed";
  const isUpcoming = match.matchStatus === "upcoming";

  // Can this user score this match?
  const isSuperadminOrCoach = userRole === "superadmin" || userRole === "coach";
  const isMentorOfMatch =
    userRole === "mentor" &&
    userId &&
    (match.team_a?.mentor_id === userId || match.team_b?.mentor_id === userId);
  const canScore = !isCompleted && (isSuperadminOrCoach || isMentorOfMatch);

  return (
    <Card
      className={`rounded-xl shadow-sm overflow-hidden ${
        isLive ? pitch.leftBorder : ""
      }`}
    >
      <CardContent className="px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          {/* Left: match number + teams */}
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground mb-1">
              Match {match.seqWithinTournament}
              {match.scheduled_time && (
                <span className="ml-2 font-semibold normal-case tracking-normal">
                  · {formatTime(match.scheduled_time)}
                </span>
              )}
              {match.match_type && (
                <span className="ml-2 font-semibold normal-case tracking-normal opacity-70">
                  · {match.match_type}
                </span>
              )}
            </p>

            {/* Teams */}
            <div className="space-y-0.5">
              <p className="text-sm font-bold text-foreground truncate leading-tight">
                {teamAName}
              </p>
              <p className="text-[10px] font-semibold text-muted-foreground">
                vs
              </p>
              <p className="text-sm font-bold text-foreground truncate leading-tight">
                {teamBName}
              </p>
            </div>
          </div>

          {/* Right: status badge + score or action */}
          <div className="flex flex-col items-end gap-2 shrink-0">
            {/* Status badge */}
            {isUpcoming && (
              <Badge
                className="rounded-full bg-gray-100 text-gray-500 border border-gray-200 text-[10px] font-bold px-2.5 py-0.5"
                variant="outline"
              >
                Upcoming
              </Badge>
            )}

            {isLive && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white ${pitch.liveBadgeBg}`}
              >
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                Live
              </span>
            )}

            {/* Locked by indicator (for admins) */}
            {match.locked_by_name && !isCompleted && isSuperadminOrCoach && (
              <span className="text-[10px] font-semibold text-amber-600">
                Scoring: {match.locked_by_name}
              </span>
            )}

            {isCompleted && (() => {
              const netA = 100 + (match.score_a ?? 0) - ((match.wickets_a ?? 0) * 6);
              const netB = 100 + (match.score_b ?? 0) - ((match.wickets_b ?? 0) * 6);
              const aWon = netA > netB;
              const bWon = netB > netA;
              const draw = netA === netB;
              return (
                <>
                  <Badge className={`rounded-full text-[10px] font-bold px-2.5 py-0.5 ${
                    draw ? "bg-gray-100 text-gray-600" : "bg-[#114232]/10 text-[#114232]"
                  }`}>
                    {draw ? "Draw" : aWon ? `${teamAName} win` : `${teamBName} win`}
                  </Badge>
                  <div className="text-right space-y-0.5">
                    <p className={`text-xs tabular-nums leading-tight ${aWon ? "font-black text-foreground" : "font-semibold text-muted-foreground"}`}>
                      {teamAName}: {scoreLabel(match.score_a, match.wickets_a)} <span className="text-[10px]">Net {netA}</span>
                    </p>
                    <p className={`text-xs tabular-nums leading-tight ${bWon ? "font-black text-foreground" : "font-semibold text-muted-foreground"}`}>
                      {teamBName}: {scoreLabel(match.score_b, match.wickets_b)} <span className="text-[10px]">Net {netB}</span>
                    </p>
                  </div>
                </>
              );
            })()}

            {/* Watch live link */}
            {isLive && (
              <Link
                href={`/match/${match.id}`}
                className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] font-extrabold text-white transition-opacity active:opacity-80 ${pitch.liveBadgeBg}`}
              >
                Watch Live
                <svg
                  className="h-3 w-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            )}

            {/* Score button — only for authorized users */}
            {canScore && (
              <Link
                href={`/score/${match.id}`}
                className="inline-flex items-center gap-1 rounded-lg bg-cricket px-3 py-1.5 text-[11px] font-extrabold text-white transition-opacity active:opacity-80"
              >
                Score
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </Link>
            )}

            {/* Admin edit events link */}
            {isSuperadminOrCoach && !isUpcoming && (
              <Link
                href={`/admin/match-events/${match.id}`}
                className="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-1.5 text-[11px] font-bold text-muted-foreground transition-opacity active:opacity-80"
              >
                Edit
              </Link>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
