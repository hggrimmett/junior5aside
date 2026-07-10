import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

// Returns everything a mentor needs for their home page.
// Caller must be signed in and assigned as a team's mentor.
export async function GET() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = getSupabaseAdminClient();

  const { data: team } = await admin
    .from("teams")
    .select("id, name, tournament_id")
    .eq("mentor_id", user.id)
    .maybeSingle<{ id: string; name: string; tournament_id: string }>();

  if (!team) {
    return NextResponse.json({ team: null });
  }

  const [tournamentRes, playersRes, matchesRes] = await Promise.all([
    admin
      .from("tournaments")
      .select("id, name, colour")
      .eq("id", team.tournament_id)
      .maybeSingle<{ id: string; name: string; colour: string }>(),
    admin
      .from("players")
      .select("id, first_name, last_name, age_group, avatar_url, parent_id")
      .eq("team_id", team.id),
    admin
      .from("matches")
      .select("id, tournament_id, team_a_id, team_b_id, score_a, score_b, wickets_a, wickets_b, status, scheduled_time, match_type, locked_by")
      .or(`team_a_id.eq.${team.id},team_b_id.eq.${team.id}`)
      .order("scheduled_time", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true }),
  ]);

  const players = (playersRes.data ?? []) as Array<{
    id: string;
    first_name: string;
    last_name: string;
    age_group: string;
    avatar_url: string | null;
    parent_id: string | null;
  }>;

  const parentIds = players
    .map((p) => p.parent_id)
    .filter((id): id is string => id !== null);
  const { data: parents } = parentIds.length
    ? await admin
        .from("profiles")
        .select("id, full_name, mobile_number")
        .in("id", parentIds)
    : { data: [] };

  const matches = (matchesRes.data ?? []) as Array<{
    id: string;
    team_a_id: string;
    team_b_id: string;
    score_a: number | null;
    score_b: number | null;
    wickets_a: number | null;
    wickets_b: number | null;
    status: boolean;
    scheduled_time: string | null;
    match_type: string | null;
    locked_by: string | null;
  }>;
  const opponentIds = new Set<string>();
  for (const m of matches) {
    opponentIds.add(m.team_a_id === team.id ? m.team_b_id : m.team_a_id);
  }
  const { data: opponents } = opponentIds.size
    ? await admin.from("teams").select("id, name").in("id", Array.from(opponentIds))
    : { data: [] };
  const opponentNameById = new Map<string, string>();
  for (const o of (opponents ?? []) as Array<{ id: string; name: string }>) {
    opponentNameById.set(o.id, o.name);
  }

  return NextResponse.json({
    team: {
      id: team.id,
      name: team.name,
      tournament: tournamentRes.data ?? null,
    },
    players: players.map((p) => ({
      id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      age_group: p.age_group,
      avatar_url: p.avatar_url,
      parent_id: p.parent_id,
    })),
    parents: (parents ?? []) as Array<{ id: string; full_name: string; mobile_number: string | null }>,
    matches: matches.map((m) => {
      const isTeamA = m.team_a_id === team.id;
      const opponentId = isTeamA ? m.team_b_id : m.team_a_id;
      return {
        id: m.id,
        opponent_name: opponentNameById.get(opponentId) ?? "TBD",
        scheduled_time: m.scheduled_time,
        status: m.status,
        is_live: !m.status && !!m.locked_by,
        my_score: isTeamA ? m.score_a : m.score_b,
        my_wickets: isTeamA ? m.wickets_a : m.wickets_b,
        opponent_score: isTeamA ? m.score_b : m.score_a,
        opponent_wickets: isTeamA ? m.wickets_b : m.wickets_a,
        match_type: m.match_type,
      };
    }),
  });
}
