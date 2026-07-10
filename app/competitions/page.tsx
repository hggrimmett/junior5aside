"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { usePublishGate } from "@/lib/use-publish-gate";
import { Card, CardContent } from "@/components/ui/card";

type TournamentColour = "Green" | "Red" | "Blue";

interface Tournament {
  id: string;
  name: string;
  colour: TournamentColour;
}

interface Player {
  first_name: string;
  last_name: string;
  age_group: string;
}

interface Team {
  id: string;
  name: string;
  tournament_id: string;
  mentor_name: string | null;
  players: Player[];
}

const COLOUR_STYLE: Record<TournamentColour, { border: string; dot: string; years: string; text: string }> = {
  Green: { border: "border-l-[4px] border-l-green-500", dot: "bg-green-500", years: "Y3 / Y4", text: "text-green-700" },
  Red:   { border: "border-l-[4px] border-l-red-500",   dot: "bg-red-500",   years: "Y5 / Y6", text: "text-red-700" },
  Blue:  { border: "border-l-[4px] border-l-blue-500",  dot: "bg-blue-500",  years: "Y7 / Y8", text: "text-blue-700" },
};

const COLOUR_ORDER: TournamentColour[] = ["Blue", "Red", "Green"];

export default function CompetitionsPage() {
  const supabase = getSupabaseBrowserClient();
  const gate = usePublishGate();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      // Uses server-side admin client to bypass parent RLS on profiles/players
      const res = await fetch("/api/public/rosters");
      if (!res.ok) {
        setLoading(false);
        return;
      }
      const payload = (await res.json()) as {
        tournaments: Tournament[];
        teams: Array<{ id: string; name: string; tournament_id: string; mentor_name: string | null }>;
        players: Array<{ id: string; first_name: string; last_name: string; age_group: string; team_id: string | null }>;
      };

      const playersByTeam = new Map<string, Player[]>();
      for (const p of payload.players) {
        if (!p.team_id) continue;
        const arr = playersByTeam.get(p.team_id) ?? [];
        arr.push({ first_name: p.first_name, last_name: p.last_name, age_group: p.age_group });
        playersByTeam.set(p.team_id, arr);
      }

      const teamsBuilt: Team[] = payload.teams.map((t) => ({
        id: t.id,
        name: t.name,
        tournament_id: t.tournament_id,
        mentor_name: t.mentor_name,
        players: (playersByTeam.get(t.id) ?? []).sort((a, b) =>
          (a.first_name + a.last_name).localeCompare(b.first_name + b.last_name),
        ),
      }));
      teamsBuilt.sort((a, b) => a.name.localeCompare(b.name));

      setTournaments(payload.tournaments);
      setTeams(teamsBuilt);
      setLoading(false);
    })();
  }, [supabase]);

  // Group tournaments by colour so display order is deterministic
  const tournamentsByColour = new Map<TournamentColour, Tournament[]>();
  for (const t of tournaments) {
    const arr = tournamentsByColour.get(t.colour) ?? [];
    arr.push(t);
    tournamentsByColour.set(t.colour, arr);
  }
  const orderedTournaments = COLOUR_ORDER.flatMap((c) =>
    (tournamentsByColour.get(c) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
  );

  return (
    <div className="px-4 py-5 space-y-4">
      <h2 className="text-xl font-extrabold tracking-tight text-foreground">
        Competitions
      </h2>

      {/* Fixtures & Schedule link */}
      <Link href="/fixtures">
        <Card className="rounded-2xl shadow-md cursor-pointer active:scale-[0.98] transition-transform border-l-[4px] border-l-cricket">
          <CardContent className="flex items-center justify-between px-5 py-4">
            <div className="flex items-center gap-3">
              <svg className="h-6 w-6 text-cricket" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <div>
                <p className="font-extrabold tracking-tight text-foreground leading-tight">
                  Fixtures &amp; Schedule
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  All matches by pitch
                </p>
              </div>
            </div>
            <span className="text-sm font-bold text-muted-foreground">→</span>
          </CardContent>
        </Card>
      </Link>

      {/* All standings link */}
      <Link href="/standings">
        <Card className="rounded-2xl shadow-md cursor-pointer active:scale-[0.98] transition-transform border-l-[4px] border-l-cricket">
          <CardContent className="flex items-center justify-between px-5 py-4">
            <div className="flex items-center gap-3">
              <svg className="h-6 w-6 text-cricket" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <div>
                <p className="font-extrabold tracking-tight text-foreground leading-tight">
                  Live Scores &amp; Standings
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  All age groups
                </p>
              </div>
            </div>
            <span className="text-sm font-bold text-muted-foreground">→</span>
          </CardContent>
        </Card>
      </Link>

      {/* Teams section */}
      <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground pt-1">
        Teams
      </h3>

      {!gate.visible ? (
        <Card className="rounded-2xl shadow-md">
          <CardContent className="py-8 text-center space-y-1">
            <p className="text-base font-extrabold text-foreground">Coming soon</p>
            <p className="text-xs text-muted-foreground">
              Team lists and rosters will be published shortly.
            </p>
          </CardContent>
        </Card>
      ) : loading ? (
        <div className="flex h-32 items-center justify-center">
          <svg className="h-6 w-6 animate-spin text-muted-foreground" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : orderedTournaments.length === 0 ? (
        <Card className="rounded-2xl shadow-md">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Sit tight — team details will appear here soon.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          {orderedTournaments.map((t) => {
            const style = COLOUR_STYLE[t.colour];
            const tournamentTeams = teams.filter((team) => team.tournament_id === t.id);
            return (
              <div key={t.id} className="space-y-2">
                {/* Tournament heading */}
                <div className="flex items-center gap-2 px-1">
                  <span className={`h-3 w-3 shrink-0 rounded-full ${style.dot}`} />
                  <p className={`text-sm font-black tracking-tight ${style.text}`}>
                    {t.name}
                  </p>
                  <span className="text-[11px] text-muted-foreground">· {style.years}</span>
                </div>

                {tournamentTeams.length === 0 ? (
                  <Card className={`rounded-2xl shadow-sm ${style.border}`}>
                    <CardContent className="py-4 text-center text-xs text-muted-foreground">
                      No teams yet.
                    </CardContent>
                  </Card>
                ) : (
                  tournamentTeams.map((team) => (
                    <Card key={team.id} className={`rounded-2xl shadow-sm ${style.border}`}>
                      <CardContent className="px-4 py-3">
                        <div className="flex items-baseline justify-between gap-2 mb-2">
                          <p className="font-extrabold tracking-tight text-foreground">
                            {team.name}
                          </p>
                          <p className="text-[11px] font-semibold text-muted-foreground shrink-0">
                            Mentor: <span className="text-foreground">{team.mentor_name ?? "—"}</span>
                          </p>
                        </div>
                        {team.players.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic">No players yet.</p>
                        ) : (
                          <ul className="space-y-0.5 text-xs">
                            {team.players.map((p, i) => (
                              <li key={i} className="flex items-center justify-between">
                                <span className="text-foreground">
                                  {p.first_name} {p.last_name}
                                </span>
                                <span className="text-muted-foreground text-[10px]">{p.age_group}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
