import { SupabaseClient } from "@supabase/supabase-js";

// ── Types ────────────────────────────────────────────────────

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
  scheduled_time: string | null;
}

export interface TeamStanding {
  teamId: string;
  gamesPlayed: number;
  won: number;
  drawn: number;
  lost: number;
  totalPoints: number;
  totalRuns: number;
}

// ── Score calculation ────────────────────────────────────────

export function calculateMatchScore(runs: number, wickets: number): number {
  return 100 + runs - wickets * 6;
}

// ── League table ─────────────────────────────────────────────

export async function getLeagueTable(
  supabase: SupabaseClient,
  tournamentId: string
): Promise<TeamStanding[]> {
  const { data: matches, error } = await supabase
    .from("matches")
    .select("*")
    .eq("tournament_id", tournamentId)
    .eq("status", true)
    .returns<Match[]>();

  if (error) throw error;

  const standings = new Map<string, TeamStanding>();

  function getOrCreate(teamId: string): TeamStanding {
    let entry = standings.get(teamId);
    if (!entry) {
      entry = {
        teamId,
        gamesPlayed: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        totalPoints: 0,
        totalRuns: 0,
      };
      standings.set(teamId, entry);
    }
    return entry;
  }

  for (const match of matches ?? []) {
    const a = getOrCreate(match.team_a_id);
    const b = getOrCreate(match.team_b_id);

    a.gamesPlayed++;
    b.gamesPlayed++;

    a.totalRuns += match.score_a;
    b.totalRuns += match.score_b;

    if (match.score_a > match.score_b) {
      a.won++;
      a.totalPoints += 3;
      b.lost++;
      b.totalPoints += 1;
    } else if (match.score_b > match.score_a) {
      b.won++;
      b.totalPoints += 3;
      a.lost++;
      a.totalPoints += 1;
    } else {
      a.drawn++;
      b.drawn++;
      a.totalPoints += 2;
      b.totalPoints += 2;
    }
  }

  return [...standings.values()].sort(
    (x, y) => y.totalPoints - x.totalPoints || y.totalRuns - x.totalRuns
  );
}

// ── Finalists ────────────────────────────────────────────────

export async function getFinalists(
  supabase: SupabaseClient,
  tournamentId: string
): Promise<TeamStanding[]> {
  const table = await getLeagueTable(supabase, tournamentId);
  return table.slice(0, 2);
}

// ── Team stats (for leading run scorer / top wicket taker) ────

export interface TeamMatchStats {
  teamId: string;
  totalRuns: number;
  totalWicketsTaken: number;
}

/**
 * Returns per-team aggregate stats: total runs scored and total wickets taken.
 * "Wickets taken" = wickets the opposing team lost (i.e. the other side's wickets column).
 */
export async function getTeamStats(
  supabase: SupabaseClient,
  tournamentId: string
): Promise<TeamMatchStats[]> {
  const { data: matches, error } = await supabase
    .from("matches")
    .select("*")
    .eq("tournament_id", tournamentId)
    .eq("status", true)
    .returns<Match[]>();

  if (error) throw error;

  const stats = new Map<string, TeamMatchStats>();

  function getOrCreate(teamId: string): TeamMatchStats {
    let entry = stats.get(teamId);
    if (!entry) {
      entry = { teamId, totalRuns: 0, totalWicketsTaken: 0 };
      stats.set(teamId, entry);
    }
    return entry;
  }

  for (const match of matches ?? []) {
    const a = getOrCreate(match.team_a_id);
    const b = getOrCreate(match.team_b_id);

    a.totalRuns += match.score_a;
    b.totalRuns += match.score_b;

    // Team A's wickets taken = Team B's wickets lost
    a.totalWicketsTaken += match.wickets_b;
    b.totalWicketsTaken += match.wickets_a;
  }

  return [...stats.values()];
}

/**
 * Returns the team with the most runs scored in a tournament.
 */
export async function getLeadingRunScorer(
  supabase: SupabaseClient,
  tournamentId: string
): Promise<TeamMatchStats | null> {
  const stats = await getTeamStats(supabase, tournamentId);
  if (stats.length === 0) return null;
  return stats.sort((a, b) => b.totalRuns - a.totalRuns)[0];
}

/**
 * Returns the team with the most wickets taken in a tournament.
 */
export async function getTopWicketTaker(
  supabase: SupabaseClient,
  tournamentId: string
): Promise<TeamMatchStats | null> {
  const stats = await getTeamStats(supabase, tournamentId);
  if (stats.length === 0) return null;
  return stats.sort((a, b) => b.totalWicketsTaken - a.totalWicketsTaken)[0];
}
