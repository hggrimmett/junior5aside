"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { calculateMatchScore } from "@/lib/tournament-logic";

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

const AGE_ACCENT: Record<SchoolYear, { gradient: string; dot: string; badge: string }> = {
  Y3: {
    gradient: "from-blue-600 to-blue-500",
    dot: "bg-blue-400",
    badge: "bg-blue-100 text-blue-700",
  },
  Y4: {
    gradient: "from-green-600 to-green-500",
    dot: "bg-green-400",
    badge: "bg-green-100 text-green-700",
  },
  Y5: {
    gradient: "from-amber-600 to-amber-500",
    dot: "bg-amber-400",
    badge: "bg-amber-100 text-amber-700",
  },
  Y6: {
    gradient: "from-red-600 to-red-500",
    dot: "bg-red-400",
    badge: "bg-red-100 text-red-700",
  },
  Y7: {
    gradient: "from-purple-600 to-purple-500",
    dot: "bg-purple-400",
    badge: "bg-purple-100 text-purple-700",
  },
  Y8: {
    gradient: "from-pink-600 to-pink-500",
    dot: "bg-pink-400",
    badge: "bg-pink-100 text-pink-700",
  },
};

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
    const teamIds = [...new Set(players.map((p) => p.team_id).filter(Boolean))] as string[];

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
      const teamMatches = player.team_id ? matchesByTeam[player.team_id] ?? [] : [];

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
          className="h-6 w-6 animate-spin text-gray-300"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-red-50 p-6 text-center text-sm text-red-600">
        {error}
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-gray-200 py-16 text-center">
        <p className="text-lg font-semibold text-gray-400">
          No children registered yet.
        </p>
        <p className="mt-1 text-sm text-gray-400">
          Add your children from the registration page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {cards.map((card) => (
        <HeroCard key={card.player.id} card={card} />
      ))}
    </div>
  );
}

// ── Hero Card ──────────────────────────────────────────────

function HeroCard({ card }: { card: ChildCard }) {
  const { player, team, nextMatch, lastMatch } = card;
  const accent = AGE_ACCENT[player.age_group];

  // Determine the "active" match to feature (upcoming > just-completed)
  const featuredMatch = nextMatch ?? lastMatch;
  const isLive = nextMatch !== null;

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      {/* Gradient header */}
      <div className={`bg-gradient-to-r ${accent.gradient} px-6 py-5 text-white`}>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-xl font-black leading-tight">{player.name}</h3>
            <p className="mt-1 text-sm font-medium opacity-80">
              {team ? team.name : "Unassigned"}
            </p>
          </div>
          <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold backdrop-blur-sm">
            {player.age_group}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="px-6 py-5 space-y-4">
        {!team ? (
          <p className="text-sm text-gray-400">
            Not yet assigned to a team.
          </p>
        ) : !featuredMatch ? (
          <p className="text-sm text-gray-400">
            No matches scheduled yet.
          </p>
        ) : isLive ? (
          /* ── Upcoming / Live match ────────────────────── */
          <UpcomingBlock match={nextMatch!} teamId={team.id} />
        ) : (
          /* ── Last completed match ─────────────────────── */
          <ResultBlock match={lastMatch!} teamId={team.id} />
        )}
      </div>
    </div>
  );
}

// ── Upcoming match block ───────────────────────────────────

function UpcomingBlock({ match, teamId }: { match: MatchRow; teamId: string }) {
  const opponent =
    match.team_a_id === teamId ? match.team_b.name : match.team_a.name;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
        </span>
        <span className="text-xs font-black uppercase tracking-widest text-amber-700">
          Next Match
        </span>
      </div>

      <p className="text-lg font-bold text-gray-900">
        vs {opponent}
      </p>

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
    </div>
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

  const resultStyle = won
    ? "border-emerald-200 bg-emerald-50"
    : draw
      ? "border-gray-200 bg-gray-50"
      : "border-red-200 bg-red-50";

  const badgeStyle = won
    ? "bg-emerald-600 text-white"
    : draw
      ? "bg-gray-500 text-white"
      : "bg-red-600 text-white";

  return (
    <div className={`rounded-xl border ${resultStyle} px-5 py-4`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-black uppercase tracking-widest text-gray-500">
          Last Result
        </span>
        <span className={`rounded-full px-3 py-1 text-xs font-black ${badgeStyle}`}>
          {resultLabel}
        </span>
      </div>

      <p className="text-lg font-bold text-gray-900">
        vs {opponent}
      </p>

      <div className="mt-2 flex items-baseline gap-4">
        <p className="text-base tabular-nums text-gray-700">
          <span className="font-bold text-gray-900">{ours}/{oursW}</span>
          <span className="mx-2 text-gray-300">&ndash;</span>
          {theirs}/{theirsW}
        </p>
        <p className="text-xs text-gray-400">
          Net: <span className="font-bold text-gray-600">{netOurs}</span>
          {" vs "}
          {netTheirs}
        </p>
      </div>
    </div>
  );
}
