"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

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
      <div className="flex h-[60vh] items-center justify-center">
        <svg
          className="h-6 w-6 animate-spin text-muted-foreground"
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
      <div className="px-4 py-6">
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-center text-base text-destructive">
          {error}
        </div>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="px-4 py-6 space-y-4">
        <Card className="rounded-2xl border-2 border-dashed shadow-none">
          <CardContent className="py-20 text-center">
            <p className="text-xl font-semibold text-muted-foreground">
              No team assigned yet
            </p>
            <p className="mt-2 text-base text-muted-foreground">
              Ask an admin to assign you.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────

  return (
    <div className="px-4 py-6 space-y-6">

      {/* Refresh button — top right */}
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => loadData(false)}
          disabled={refreshing}
          aria-label="Refresh"
          className="h-12 w-12 rounded-xl text-muted-foreground active:scale-95"
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
        </Button>
      </div>

      {/* Team name — compact cricket-green card, no gradient */}
      <Card className="rounded-2xl shadow-md border-0 bg-cricket text-white">
        <CardContent className="px-6 py-5">
          <p className="text-xs font-bold uppercase tracking-widest opacity-60">
            Your Team
          </p>
          <p className="mt-1 text-2xl font-black leading-tight">{team.name}</p>
          <p className="mt-0.5 text-sm opacity-70">
            {players.length} player{players.length !== 1 && "s"}
          </p>
        </CardContent>
      </Card>

      {/* ── Next match ────────────────────────────────── */}
      {nextMatch && (
        <section className="space-y-3">
          <SectionLabel>Next Up</SectionLabel>
          <Card className="rounded-2xl shadow-md border-l-4 border-l-amber-400 border-t-0 border-r-0 border-b-0 bg-amber-50/60">
            <CardContent className="px-6 py-5">
              <p className="text-2xl font-black text-foreground">
                vs{" "}
                {nextMatch.team_a.id === team.id
                  ? nextMatch.team_b.name
                  : nextMatch.team_a.name}
              </p>
              {nextMatch.scheduled_time && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="relative flex h-2.5 w-2.5 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
                  </span>
                  <p className="text-sm text-amber-800/70">
                    {formatDate(nextMatch.scheduled_time)} &middot;{" "}
                    {formatTime(nextMatch.scheduled_time)}
                  </p>
                  <Badge className="ml-auto bg-amber-500 text-white font-bold hover:bg-amber-500 shrink-0">
                    {relativeTime(nextMatch.scheduled_time)}
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      {/* ── Roster ────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionLabel>Team Roster</SectionLabel>
        {players.length === 0 ? (
          <p className="px-1 text-sm text-muted-foreground">
            No players assigned yet.
          </p>
        ) : (
          <div className="space-y-2">
            {players.map((p) => (
              <Card key={p.id} className="rounded-2xl shadow-md">
                <CardContent className="flex items-center gap-4 px-5 py-4">
                  <span
                    className={`h-3 w-3 shrink-0 rounded-full ${AGE_DOT[p.age_group]}`}
                  />
                  <span className="flex-1 text-base font-semibold text-foreground truncate">
                    {p.name}
                  </span>
                  <Badge
                    variant="secondary"
                    className="bg-cricket-light text-cricket font-bold shrink-0 rounded-full px-3"
                  >
                    {p.age_group}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* ── Schedule ──────────────────────────────────── */}
      {upcoming.length > 1 && (
        <section className="space-y-3">
          <SectionLabel>Schedule</SectionLabel>
          <div className="space-y-2">
            {upcoming.slice(1).map((m) => {
              const opponent =
                m.team_a.id === team.id ? m.team_b.name : m.team_a.name;

              return (
                <Card key={m.id} className="rounded-2xl shadow-md">
                  <CardContent className="flex items-center justify-between gap-3 px-5 py-4">
                    <div className="min-w-0">
                      <p className="text-base font-bold text-foreground truncate">
                        vs {opponent}
                      </p>
                      {m.scheduled_time && (
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          {formatDate(m.scheduled_time)} &middot;{" "}
                          {formatTime(m.scheduled_time)}
                        </p>
                      )}
                    </div>
                    {m.scheduled_time && (
                      <Badge variant="secondary" className="shrink-0 font-semibold rounded-full">
                        {relativeTime(m.scheduled_time)}
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Results ───────────────────────────────────── */}
      {completed.length > 0 && (
        <section className="space-y-3">
          <SectionLabel>Results</SectionLabel>
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
                <Card key={m.id} className="rounded-2xl shadow-md">
                  <CardContent className="flex items-center justify-between gap-3 px-5 py-4">
                    <div className="min-w-0">
                      <p className="text-base font-bold text-foreground truncate">
                        vs {opponent}
                      </p>
                      <p className="mt-0.5 text-sm tabular-nums text-muted-foreground">
                        <span className="font-bold text-foreground">
                          {ours}/{oursW}
                        </span>
                        <span className="mx-2 text-muted-foreground/40">&ndash;</span>
                        {theirs}/{theirsW}
                      </p>
                    </div>
                    <Badge
                      className={`shrink-0 font-bold rounded-full px-3 ${
                        won
                          ? "bg-cricket text-white hover:bg-cricket"
                          : draw
                            ? "bg-secondary text-secondary-foreground hover:bg-secondary"
                            : "bg-destructive text-destructive-foreground hover:bg-destructive"
                      }`}
                    >
                      {won ? "Won" : draw ? "Draw" : "Lost"}
                    </Badge>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* Safe-area bottom padding */}
      <div className="h-6" />
    </div>
  );
}

// ── SectionLabel ───────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
      {children}
    </h2>
  );
}
