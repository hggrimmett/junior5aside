"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

// ── Types ──────────────────────────────────────────────────

type SchoolYear = "Y3" | "Y4" | "Y5" | "Y6" | "Y7" | "Y8";

interface Profile {
  id: string;
  role: string;
  full_name: string;
}

interface Team {
  id: string;
  name: string;
  tournament_id: string;
}

interface Player {
  id: string;
  name: string;
  age_group: SchoolYear;
}

interface MatchRow {
  id: string;
  scheduled_time: string | null;
  status: boolean;
  score_a: number;
  score_b: number;
  wickets_a: number;
  wickets_b: number;
  team_a: { id: string; name: string };
  team_b: { id: string; name: string };
}

const AGE_DOT: Record<SchoolYear, string> = {
  Y3: "bg-blue-500",
  Y4: "bg-green-500",
  Y5: "bg-amber-500",
  Y6: "bg-red-500",
  Y7: "bg-purple-500",
  Y8: "bg-pink-500",
};

// ── Helpers ────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff < 0) return "Now";
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `in ${mins} min${mins !== 1 ? "s" : ""}`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `in ${hrs}h ${rem}m` : `in ${hrs}h`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// ── Page ───────────────────────────────────────────────────

export default function MentorDashboard() {
  const supabase = getSupabaseBrowserClient();
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Data loading ─────────────────────────────────────────

  const loadData = useCallback(
    async (showFullLoader: boolean) => {
      if (showFullLoader) setLoading(true);
      else setRefreshing(true);

      // 1. Auth
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/register");
        return;
      }

      // 2. Profile + role check
      const { data: profileData, error: profileErr } = await supabase
        .from("profiles")
        .select("id, role, full_name")
        .eq("id", user.id)
        .single<Profile>();

      if (profileErr || !profileData) {
        setError("Could not load your profile.");
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (profileData.role !== "mentor") {
        router.replace("/");
        return;
      }

      setProfile(profileData);

      // 3. Team
      const { data: teamData } = await supabase
        .from("teams")
        .select("id, name, tournament_id")
        .eq("mentor_id", user.id)
        .limit(1)
        .single<Team>();

      if (!teamData) {
        setTeam(null);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      setTeam(teamData);

      // 4. Roster + matches
      const [playersRes, matchesRes] = await Promise.all([
        supabase
          .from("players")
          .select("id, name, age_group")
          .eq("team_id", teamData.id)
          .returns<Player[]>(),
        supabase
          .from("matches")
          .select(
            "id, scheduled_time, status, score_a, score_b, wickets_a, wickets_b, team_a:teams!team_a_id(id, name), team_b:teams!team_b_id(id, name)"
          )
          .or(`team_a_id.eq.${teamData.id},team_b_id.eq.${teamData.id}`)
          .order("scheduled_time", { ascending: true })
          .returns<MatchRow[]>(),
      ]);

      setPlayers(playersRes.data ?? []);
      setMatches(matchesRes.data ?? []);
      setLoading(false);
      setRefreshing(false);
    },
    [supabase, router]
  );

  useEffect(() => {
    loadData(true);
  }, [loadData]);

  // ── Derived data ─────────────────────────────────────────

  const upcoming = matches.filter((m) => !m.status);
  const completed = matches.filter((m) => m.status);
  const nextMatch = upcoming[0] ?? null;

  // ── Loading state ────────────────────────────────────────

  if (loading) {
    return (
      <Shell>
        <div className="flex h-[60vh] items-center justify-center">
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
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell>
        <div className="rounded-2xl bg-red-50 p-6 text-center text-lg text-red-600">
          {error}
        </div>
      </Shell>
    );
  }

  if (!team) {
    return (
      <Shell>
        <Greeting name={profile?.full_name} />
        <div className="mt-8 rounded-2xl border-2 border-dashed border-gray-200 py-20 text-center">
          <p className="text-xl font-semibold text-gray-400">
            No team assigned yet
          </p>
          <p className="mt-2 text-base text-gray-400">
            Ask an admin to assign you.
          </p>
        </div>
      </Shell>
    );
  }

  // ── Render ───────────────────────────────────────────────

  return (
    <Shell>
      {/* Header + refresh */}
      <div className="flex items-start justify-between">
        <Greeting name={profile?.full_name} />
        <button
          onClick={() => loadData(false)}
          disabled={refreshing}
          className="mt-1 rounded-xl p-2 text-gray-400 transition active:scale-95 active:bg-gray-100"
          aria-label="Refresh"
        >
          <svg
            className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
      </div>

      {/* Team banner */}
      <div className="mt-5 rounded-2xl bg-emerald-600 px-6 py-5 text-white shadow-lg">
        <p className="text-xs font-bold uppercase tracking-widest opacity-60">
          Your Team
        </p>
        <p className="mt-1 text-2xl font-black leading-tight">{team.name}</p>
        <p className="mt-1 text-sm opacity-70">
          {players.length} player{players.length !== 1 && "s"}
        </p>
      </div>

      {/* ── Next match highlight ──────────────────────── */}
      {nextMatch && (
        <section className="mt-6">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-400">
            Next Up
          </h2>
          <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 px-6 py-5">
            <div className="flex items-center justify-between">
              <p className="text-xl font-black text-gray-900">
                vs{" "}
                {nextMatch.team_a.id === team.id
                  ? nextMatch.team_b.name
                  : nextMatch.team_a.name}
              </p>
              {nextMatch.scheduled_time && (
                <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold text-white">
                  {relativeTime(nextMatch.scheduled_time)}
                </span>
              )}
            </div>
            {nextMatch.scheduled_time && (
              <p className="mt-2 text-base text-emerald-800/70">
                {formatDate(nextMatch.scheduled_time)} &middot;{" "}
                {formatTime(nextMatch.scheduled_time)}
              </p>
            )}
          </div>
        </section>
      )}

      {/* ── Roster ────────────────────────────────────── */}
      <section className="mt-8">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-gray-400">
          Team Roster
        </h2>

        {players.length === 0 ? (
          <p className="py-6 text-center text-base text-gray-400">
            No players assigned yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {players.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-4 rounded-2xl bg-white px-5 py-4 shadow-sm border border-gray-100 active:bg-gray-50"
              >
                <span
                  className={`h-3.5 w-3.5 shrink-0 rounded-full ${AGE_DOT[p.age_group]}`}
                />
                <span className="flex-1 text-lg font-semibold text-gray-900 truncate">
                  {p.name}
                </span>
                <span className="text-sm font-medium text-gray-400">
                  {p.age_group}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Upcoming matches ──────────────────────────── */}
      {upcoming.length > 1 && (
        <section className="mt-8">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-gray-400">
            Schedule
          </h2>
          <div className="space-y-2">
            {upcoming.slice(1).map((m) => {
              const opponent =
                m.team_a.id === team.id ? m.team_b.name : m.team_a.name;

              return (
                <div
                  key={m.id}
                  className="flex items-center justify-between rounded-2xl bg-white px-5 py-4 shadow-sm border border-gray-100"
                >
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-gray-900 truncate">
                      vs {opponent}
                    </p>
                    {m.scheduled_time && (
                      <p className="mt-0.5 text-sm text-gray-400">
                        {formatDate(m.scheduled_time)} &middot;{" "}
                        {formatTime(m.scheduled_time)}
                      </p>
                    )}
                  </div>
                  {m.scheduled_time && (
                    <span className="ml-3 shrink-0 rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-500">
                      {relativeTime(m.scheduled_time)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Results ───────────────────────────────────── */}
      {completed.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-gray-400">
            Results
          </h2>
          <div className="space-y-2">
            {completed.map((m) => {
              const isTeamA = m.team_a.id === team.id;
              const opponent = isTeamA ? m.team_b.name : m.team_a.name;
              const ours = isTeamA ? m.score_a : m.score_b;
              const theirs = isTeamA ? m.score_b : m.score_a;
              const oursW = isTeamA ? m.wickets_a : m.wickets_b;
              const theirsW = isTeamA ? m.wickets_b : m.wickets_a;
              const won = ours > theirs;
              const draw = ours === theirs;

              return (
                <div
                  key={m.id}
                  className="flex items-center justify-between rounded-2xl bg-white px-5 py-4 shadow-sm border border-gray-100"
                >
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-gray-900 truncate">
                      vs {opponent}
                    </p>
                    <p className="mt-0.5 text-base tabular-nums text-gray-500">
                      <span className="font-bold text-gray-800">
                        {ours}/{oursW}
                      </span>
                      <span className="mx-2 text-gray-300">&ndash;</span>
                      {theirs}/{theirsW}
                    </p>
                  </div>
                  <span
                    className={`ml-3 shrink-0 rounded-full px-3 py-1.5 text-xs font-black ${
                      won
                        ? "bg-emerald-100 text-emerald-700"
                        : draw
                          ? "bg-gray-100 text-gray-600"
                          : "bg-red-100 text-red-700"
                    }`}
                  >
                    {won ? "Won" : draw ? "Draw" : "Lost"}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Safe-area bottom padding */}
      <div className="h-10" />
    </Shell>
  );
}

// ── Shell ──────────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f8f7f4]">
      <div className="mx-auto max-w-lg px-4 pb-4 pt-6">{children}</div>
    </div>
  );
}

// ── Greeting ───────────────────────────────────────────────

function Greeting({ name }: { name?: string }) {
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <h1 className="text-2xl font-extrabold text-gray-900">
      {greeting}
      {name ? `, ${name.split(" ")[0]}` : ""}
    </h1>
  );
}
