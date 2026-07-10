import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

// Returns the public team roster view — every tournament with its teams,
// each team's mentor name and player list. Uses the admin client so parent
// RLS on profiles/players doesn't hide other families' kids.
//
// Auth: any signed-in user. Anonymous callers get a 401.
export async function GET() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = getSupabaseAdminClient();

  const [tRes, teamsRes, playersRes] = await Promise.all([
    admin.from("tournaments").select("id, name, colour"),
    admin.from("teams").select("id, name, tournament_id, mentor:profiles!mentor_id(full_name)"),
    admin.from("players").select("id, first_name, last_name, age_group, team_id"),
  ]);

  return NextResponse.json({
    tournaments: tRes.data ?? [],
    teams: (teamsRes.data ?? []).map((t) => {
      const tRaw = t as unknown as {
        id: string;
        name: string;
        tournament_id: string;
        mentor: { full_name: string } | { full_name: string }[] | null;
      };
      const mentor = Array.isArray(tRaw.mentor) ? tRaw.mentor[0] : tRaw.mentor;
      return {
        id: tRaw.id,
        name: tRaw.name,
        tournament_id: tRaw.tournament_id,
        mentor_name: mentor?.full_name ?? null,
      };
    }),
    players: playersRes.data ?? [],
  });
}
