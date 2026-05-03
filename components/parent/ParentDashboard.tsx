"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { calculateMatchScore } from "@/lib/tournament-logic";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// ── Types ──────────────────────────────────────────────────

type SchoolYear = "Y3" | "Y4" | "Y5" | "Y6" | "Y7" | "Y8";

interface Player {
  id: string;
  name: string;
  age_group: SchoolYear;
  team_id: string | null;
}

interface Team {
  id: string;
  name: string;
}

interface MatchRow {
  id: string;
  scheduled_time: string | null;
  status: boolean;
  score_a: number;
  score_b: number;
  wickets_a: number;
  wickets_b: number;
  team_a_id: string;
  team_b_id: string;
  team_a: { id: string; name: string };
  team_b: { id: string; name: string };
}

interface ChildCard {
  player: Player;
  team: Team | null;
  nextMatch: MatchRow | null;
  lastMatch: MatchRow | null;
}

// ── Component ──────────────────────────────────────────────

export default function ParentDashboard() {
  const supabase = getSupabaseBrowserClient();

  const [cards, setCards] = useState<ChildCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setError(null);

    // 1. Current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Not signed in.");
      setLoading(false);
      return;
    }

    // 2. Children
    const { data: players, error: playersErr } = await supabase
      .from("players")
      .select("id, name, age_group, team_id")
      .eq("parent_id", user.id)
      .returns<Player[]>();

    if (playersErr) {
      setError(playersErr.message);
      setLoading(false);
      return;
    }

    if (!players || players.length === 0) {
      setCards([]);
      setLoading(false);
      return;
    }

    // 3. Teams for assigned children
    const teamIds = [
      ...new Set(players.map((p) => p.team_id).filter(Boolean)),
    ] as string[];

    let teamsMap: Record<string, Team> = {};
    if (teamIds.length > 0) {
      const { data: teams } = await supabase
        .from("teams")
        .select("id, name")
        .in("id", teamIds)
        .returns<Team[]>();

      for (const t of teams ?? []) teamsMap[t.id] = t;
    }

    // 4. Matches for those teams
    let matchesByTeam: Record<string, MatchRow[]> = {};
    if (teamIds.length > 0) {
      // Build OR filter for all team IDs
      const orFilter = teamIds
        .map((id) => `team_a_id.eq.${id},team_b_id.eq.${id}`)
        .join(",");

      const { data: matches } = await supabase
        .from("matches")
        .select(
          "id, scheduled_time, status, score_a, score_b, wickets_a, wickets_b, team_a_id, team_b_id, team_a:teams!team_a_id(id, name), team_b:teams!team_b_id(id, name)"
        )
        .or(orFilter)
        .order("scheduled_time", { ascending: true })
        .returns<MatchRow[]>();

      for (const m of matches ?? []) {
        for (const tid of teamIds) {
          if (m.team_a_id === tid || m.team_b_id === tid) {
            if (!matchesByTeam[tid]) matchesByTeam[tid] = [];
            matchesByTeam[tid].push(m);
          }
        }
      }
    }

    // 5. Build cards
    const result: ChildCard[] = players.map((player) => {
      const team = player.team_id ? teamsMap[player.team_id] ?? null : null;
      const teamMatches = player.team_id
        ? matchesByTeam[player.team_id] ?? []
        : [];

      const nextMatch = teamMatches.find((m) => !m.status) ?? null;
      const completedMatches = teamMatches.filter((m) => m.status);
      const lastMatch = completedMatches[completedMatches.length - 1] ?? null;

      return { player, team, nextMatch, lastMatch };
    });

    setCards(result);
    setLoading(false);
  }, [supabase]);

  // ── Initial load ─────────────────────────────────────────

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Realtime: refresh when matches change ────────────────

  useEffect(() => {
    const channel = supabase
      .channel("parent-match-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches" },
        () => fetchData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchData]);

  // ── Render ───────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <svg
          className="h-6 w-6 animate-spin text-muted-foreground"
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
      </div>
    );
  }

  if (error) {
    return (
      <Card className="rounded-2xl border-destructive/50 bg-destructive/5">
        <CardContent className="p-6 text-center text-sm text-destructive">
          {error}
        </CardContent>
      </Card>
    );
  }

  if (cards.length === 0) {
    return (
      <Card className="rounded-2xl border-dashed">
        <CardContent className="py-16 text-center">
          <p className="text-lg font-semibold text-muted-foreground">
            No children registered yet.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add your children from the registration page.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {cards.map((card) => (
        <TradingCard key={card.player.id} card={card} />
      ))}
    </div>
  );
}

// ── Trading Card ───────────────────────────────────────────

function TradingCard({ card }: { card: ChildCard }) {
  const { player, team, nextMatch, lastMatch } = card;

  const featuredMatch = nextMatch ?? lastMatch;
  const hasNext = nextMatch !== null;

  return (
    <Card className="rounded-2xl shadow-md overflow-hidden">
      {/* Header: bg-cricket, child name + school year badge */}
      <div className="bg-cricket px-5 py-5">
        <CardHeader className="p-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-2xl font-black leading-tight text-white truncate">
                {player.name}
              </h3>
              <p className="mt-1 text-sm font-medium text-white/70 truncate">
                {team ? team.name : "Unassigned"}
              </p>
            </div>
            <Badge
              variant="outline"
              className="shrink-0 border-white/40 bg-white/15 text-white text-xs font-bold rounded-full px-3"
            >
              {player.age_group}
            </Badge>
          </div>
        </CardHeader>
      </div>

      {/* Body: match info */}
      <CardContent className="px-5 py-4">
        {!team ? (
          <p className="text-sm text-muted-foreground">
            Not yet assigned to a team.
          </p>
        ) : !featuredMatch ? (
          <p className="text-sm text-muted-foreground">
            No matches scheduled yet.
          </p>
        ) : hasNext ? (
          <UpcomingBlock match={nextMatch!} teamId={team.id} />
        ) : (
          <ResultBlock match={lastMatch!} teamId={team.id} />
        )}
      </CardContent>
    </Card>
  );
}

// ── Upcoming match block ───────────────────────────────────

function UpcomingBlock({ match, teamId }: { match: MatchRow; teamId: string }) {
  const opponent =
    match.team_a_id === teamId ? match.team_b.name : match.team_a.name;

  return (
    <Card className="rounded-xl border-l-4 border-l-amber-400 border-t-0 border-r-0 border-b-0 bg-amber-50/60 shadow-none">
      <CardContent className="px-4 py-4">
        <div className="flex items-center gap-2 mb-2">
          {/* Pulsing dot */}
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
          </span>
          <span className="text-xs font-black uppercase tracking-widest text-amber-700">
            Next Match
          </span>
        </div>

        <p className="text-xl font-bold text-foreground">vs {opponent}</p>

        {match.scheduled_time && (
          <p className="mt-1 text-sm text-amber-800/70">
            {new Date(match.scheduled_time).toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
            {" at "}
            {new Date(match.scheduled_time).toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Result block ───────────────────────────────────────────

function ResultBlock({ match, teamId }: { match: MatchRow; teamId: string }) {
  const isTeamA = match.team_a_id === teamId;
  const opponent = isTeamA ? match.team_b.name : match.team_a.name;
  const ours = isTeamA ? match.score_a : match.score_b;
  const theirs = isTeamA ? match.score_b : match.score_a;
  const oursW = isTeamA ? match.wickets_a : match.wickets_b;
  const theirsW = isTeamA ? match.wickets_b : match.wickets_a;

  const netOurs = calculateMatchScore(ours, oursW);
  const netTheirs = calculateMatchScore(theirs, theirsW);

  const won = ours > theirs;
  const draw = ours === theirs;
  const resultLabel = won ? "Won" : draw ? "Draw" : "Lost";

  const cardBg = won
    ? "border-l-emerald-400 bg-emerald-50/60"
    : draw
      ? "border-l-slate-400 bg-muted/30"
      : "border-l-red-400 bg-red-50/60";

  const badgeClass = won
    ? "bg-emerald-600 text-white hover:bg-emerald-600"
    : draw
      ? "bg-slate-500 text-white hover:bg-slate-500"
      : "bg-red-600 text-white hover:bg-red-600";

  return (
    <Card className={`rounded-xl border-l-4 border-t-0 border-r-0 border-b-0 shadow-none ${cardBg}`}>
      <CardContent className="px-4 py-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">
            Last Result
          </span>
          <Badge className={`font-bold rounded-full px-3 ${badgeClass}`}>
            {resultLabel}
          </Badge>
        </div>

        <p className="text-xl font-bold text-foreground">vs {opponent}</p>

        <div className="mt-2 flex items-baseline gap-4">
          <p className="tabular-nums">
            <span className="text-2xl font-black text-foreground">
              {ours}/{oursW}
            </span>
            <span className="mx-2 text-muted-foreground/50">&ndash;</span>
            <span className="text-base text-muted-foreground">
              {theirs}/{theirsW}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            Net: <span className="font-bold text-foreground">{netOurs}</span>
            {" vs "}
            {netTheirs}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
