"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ── Types ──────────────────────────────────────────────────

type TournamentColour = "Green" | "Red" | "Blue";
type SchoolYear = "Y3" | "Y4" | "Y5" | "Y6" | "Y7" | "Y8";

interface Tournament {
  id: string;
  name: string;
  colour: TournamentColour;
  max_team_size: number;
}

interface Team {
  id: string;
  name: string;
  tournament_id: string;
  mentor_id: string | null;
}

interface Mentor {
  id: string;
  full_name: string;
}

interface Player {
  id: string;
  first_name: string;
  last_name: string;
  name: string;
  age_group: SchoolYear;
  team_id: string | null;
  avatar_url?: string | null;
}

// ── Constants ──────────────────────────────────────────────

const COLOUR_YEARS: Record<TournamentColour, SchoolYear[]> = {
  Green: ["Y3", "Y4"],
  Red: ["Y5", "Y6"],
  Blue: ["Y7", "Y8"],
};

const COLOUR_STYLES: Record<
  TournamentColour,
  { bg: string; ring: string; text: string; badgeCls: string }
> = {
  Green: {
    bg: "bg-emerald-100",
    ring: "ring-emerald-400",
    text: "text-emerald-800",
    badgeCls: "bg-emerald-100 text-emerald-800 border-emerald-200",
  },
  Red: {
    bg: "bg-red-100",
    ring: "ring-red-400",
    text: "text-red-800",
    badgeCls: "bg-red-100 text-red-800 border-red-200",
  },
  Blue: {
    bg: "bg-blue-100",
    ring: "ring-blue-400",
    text: "text-blue-800",
    badgeCls: "bg-blue-100 text-blue-800 border-blue-200",
  },
};

// ── Helpers ────────────────────────────────────────────────

function getInitials(firstName: string, lastName: string): string {
  return `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase();
}

// ── PlayerAvatar — draggable ───────────────────────────────

function PlayerAvatar({
  player,
  colour,
  overlay = false,
}: {
  player: Player;
  colour: TournamentColour;
  overlay?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: player.id,
    data: player,
  });

  const styles = COLOUR_STYLES[colour];

  const avatar = (
    <div className="flex flex-col items-center gap-1">
      {player.avatar_url ? (
        <img
          src={player.avatar_url}
          alt={`${player.first_name} ${player.last_name}`}
          className={`h-12 w-12 rounded-full object-cover ring-2 ${styles.ring} ${
            isDragging && !overlay ? "opacity-25" : ""
          }`}
        />
      ) : (
        <span
          className={`flex h-12 w-12 items-center justify-center rounded-full text-xs font-black ring-2 ${styles.bg} ${styles.text} ${styles.ring} ${
            isDragging && !overlay ? "opacity-25" : ""
          }`}
        >
          {getInitials(player.first_name, player.last_name)}
        </span>
      )}
      <span className="w-14 truncate text-center text-[10px] font-semibold leading-tight">
        {player.first_name}
      </span>
    </div>
  );

  if (overlay) {
    return <div className="opacity-90 drop-shadow-xl">{avatar}</div>;
  }

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className="cursor-grab touch-none transition-transform active:scale-110"
    >
      {avatar}
    </div>
  );
}

// ── TeamDropCard — droppable ───────────────────────────────

function TeamDropCard({
  team,
  players,
  maxPlayerSlots,
  colour,
  mentors,
  assignedMentorIds,
  onMentorChange,
}: {
  team: Team;
  players: Player[];
  maxPlayerSlots: number;
  colour: TournamentColour;
  mentors: Mentor[];
  assignedMentorIds: Set<string>;
  onMentorChange: (teamId: string, mentorId: string | null) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: team.id });
  const isFull = players.length >= maxPlayerSlots;
  const hasMentor = !!team.mentor_id;
  const isComplete = isFull && hasMentor;

  return (
    <Card
      ref={setNodeRef}
      className={`rounded-2xl shadow-md transition-all ${
        isComplete ? "opacity-60" : ""
      } ${isOver && !isFull ? "ring-2 ring-[#114232] border-[#114232] bg-emerald-50/40" : ""}`}
    >
      <CardHeader className="px-4 pb-2 pt-4">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="truncate text-sm font-black">{team.name}</CardTitle>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">
              {players.length}/{maxPlayerSlots}
            </span>
            {isFull && (
              <Badge className="rounded-md bg-emerald-500 px-1.5 py-0 text-[10px] font-black text-white">
                FULL
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 px-4 pb-4">
        {/* Mentor selector */}
        <div className="space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Mentor (5th player)
          </p>
          <Select
            value={team.mentor_id ?? ""}
            onValueChange={(v) => onMentorChange(team.id, v || null)}
          >
            <SelectTrigger className={`h-10 text-xs ${!hasMentor ? "border-amber-400 bg-amber-50" : ""}`}>
              <SelectValue placeholder="Assign mentor..." />
            </SelectTrigger>
            <SelectContent>
              {mentors.map((m) => {
                const taken = assignedMentorIds.has(m.id) && m.id !== team.mentor_id;
                return (
                  <SelectItem key={m.id} value={m.id} disabled={taken}>
                    {m.full_name}{taken ? " (assigned)" : ""}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {!hasMentor && (
            <p className="text-[10px] font-semibold text-amber-600">
              Mentor required
            </p>
          )}
        </div>

        {/* Players */}
        <div className="min-h-[60px]">
          {players.length === 0 ? (
            <p className="py-3 text-center text-xs text-muted-foreground">
              Drop players here
            </p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {players.map((p) => (
                <PlayerAvatar key={p.id} player={p} colour={colour} />
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Spinner ────────────────────────────────────────────────

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

// ── Main TeamBalancer component ────────────────────────────

export default function TeamBalancer({ tournamentId }: { tournamentId: string }) {
  const supabase = getSupabaseBrowserClient();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [mentors, setMentors] = useState<Mentor[]>([]);
  const [activePlayer, setActivePlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // ── Data fetching ──────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    // 1. Fetch the tournament
    const { data: tournamentData, error: tErr } = await supabase
      .from("tournaments")
      .select("id, name, colour, max_team_size")
      .eq("id", tournamentId)
      .single<Tournament>();

    if (tErr || !tournamentData) {
      setError(tErr?.message ?? "Tournament not found.");
      setLoading(false);
      return;
    }

    setTournament(tournamentData);

    const colour = tournamentData.colour as TournamentColour;
    const relevantYears = COLOUR_YEARS[colour] ?? [];

    // 2. Fetch teams + mentors in parallel
    const [teamsRes, mentorsRes] = await Promise.all([
      supabase
        .from("teams")
        .select("id, name, tournament_id, mentor_id")
        .eq("tournament_id", tournamentId)
        .returns<Team[]>(),
      supabase
        .from("profiles")
        .select("id, full_name")
        .eq("role", "mentor")
        .returns<Mentor[]>(),
    ]);

    if (teamsRes.error) {
      setError(teamsRes.error.message);
      setLoading(false);
      return;
    }

    const teamsData = teamsRes.data ?? [];
    setTeams(teamsData);
    setMentors(mentorsRes.data ?? []);

    const teamIds = (teamsData ?? []).map((t) => t.id);

    // 3. Fetch assigned players (on one of these teams) + unassigned players
    //    in the relevant school years — two queries in parallel.
    const [assignedRes, unassignedRes] = await Promise.all([
      teamIds.length > 0
        ? supabase
            .from("players")
            .select("id, first_name, last_name, name, age_group, team_id, avatar_url")
            .in("team_id", teamIds)
            .returns<Player[]>()
        : Promise.resolve({ data: [] as Player[], error: null }),
      supabase
        .from("players")
        .select("id, first_name, last_name, name, age_group, team_id, avatar_url")
        .is("team_id", null)
        .in("age_group", relevantYears)
        .returns<Player[]>(),
    ]);

    if (assignedRes.error) {
      setError(assignedRes.error.message);
      setLoading(false);
      return;
    }
    if (unassignedRes.error) {
      setError(unassignedRes.error.message);
      setLoading(false);
      return;
    }

    // Merge and deduplicate by id
    const all = [...(assignedRes.data ?? []), ...(unassignedRes.data ?? [])];
    const unique = Array.from(new Map(all.map((p) => [p.id, p])).values());
    setPlayers(unique);

    setLoading(false);
  }, [supabase, tournamentId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Derived state ──────────────────────────────────────

  const colour: TournamentColour =
    (tournament?.colour as TournamentColour) ?? "Green";
  // max_team_size is total including mentor; player slots = max - 1 (mentor is the 5th)
  const maxPlayerSlots = Math.max(1, (tournament?.max_team_size ?? 5) - 1);

  const unassigned = useMemo(
    () => players.filter((p) => p.team_id === null),
    [players]
  );

  const teamPlayerMap = useMemo(() => {
    const map = new Map<string, Player[]>();
    for (const t of teams) map.set(t.id, []);
    for (const p of players) {
      if (p.team_id && map.has(p.team_id)) {
        map.get(p.team_id)!.push(p);
      }
    }
    return map;
  }, [players, teams]);

  const totalRegistered = players.length;
  const totalPlayerSlots = teams.length * maxPlayerSlots;
  const unassignedCount = unassigned.length;
  const teamsWithoutMentor = teams.filter((t) => !t.mentor_id).length;

  // Set of mentor IDs already assigned to a team
  const assignedMentorIds = useMemo(
    () => new Set(teams.map((t) => t.mentor_id).filter(Boolean) as string[]),
    [teams]
  );

  // ── Drag handlers ──────────────────────────────────────

  function handleDragStart(event: DragStartEvent) {
    setActivePlayer(event.active.data.current as Player);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActivePlayer(null);
    const { active, over } = event;
    if (!over) return;

    const playerId = active.id as string;
    const teamId = over.id as string;

    // Don't drop onto a full team (player slots only, mentor is separate)
    const targetPlayers = teamPlayerMap.get(teamId) ?? [];
    if (targetPlayers.length >= maxPlayerSlots) return;

    // Optimistic update
    const previousTeamId =
      players.find((p) => p.id === playerId)?.team_id ?? null;
    setPlayers((prev) =>
      prev.map((p) => (p.id === playerId ? { ...p, team_id: teamId } : p))
    );

    const { error: updateErr } = await supabase
      .from("players")
      .update({ team_id: teamId })
      .eq("id", playerId);

    if (updateErr) {
      setError(updateErr.message);
      // Revert on error
      setPlayers((prev) =>
        prev.map((p) =>
          p.id === playerId ? { ...p, team_id: previousTeamId } : p
        )
      );
    }
  }

  // ── Mentor assignment ─────────────────────────────────

  async function handleMentorChange(teamId: string, mentorId: string | null) {
    // Optimistic
    setTeams((prev) =>
      prev.map((t) => (t.id === teamId ? { ...t, mentor_id: mentorId } : t))
    );

    const { error: err } = await supabase
      .from("teams")
      .update({ mentor_id: mentorId })
      .eq("id", teamId);

    if (err) {
      setError(err.message);
      // Revert
      setTeams((prev) =>
        prev.map((t) => (t.id === teamId ? { ...t, mentor_id: t.mentor_id } : t))
      );
    }
  }

  // ── Quick-create team ──────────────────────────────────

  async function quickCreateTeam() {
    setCreating(true);
    setError(null);

    const teamNumber = teams.length + 1;
    const { data, error: insertErr } = await supabase
      .from("teams")
      .insert({ name: `Team ${teamNumber}`, tournament_id: tournamentId })
      .select("id, name, tournament_id")
      .returns<Team[]>()
      .single();

    if (insertErr) {
      setError(insertErr.message);
    } else if (data) {
      setTeams((prev) => [...prev, data]);
    }

    setCreating(false);
  }

  // ── Loading / error states ─────────────────────────────

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center text-muted-foreground">
        <Spinner />
        <span className="ml-2 text-sm">Loading balancer...</span>
      </div>
    );
  }

  if (!tournament) {
    return (
      <Card className="rounded-2xl border-destructive/50 bg-destructive/5">
        <CardContent className="py-4 text-sm text-destructive">
          {error ?? "Tournament not found."}
        </CardContent>
      </Card>
    );
  }

  // ── Render ─────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Error banner */}
      {error && (
        <Card className="rounded-2xl border-destructive/50 bg-destructive/5">
          <CardContent className="py-3 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-muted/40 px-4 py-3 text-xs font-semibold">
        <span>
          <span className="font-black text-foreground">{totalRegistered}</span>{" "}
          <span className="text-muted-foreground">registered</span>
        </span>
        <span className="text-muted-foreground">&middot;</span>
        <span>
          <span className="font-black text-foreground">{totalPlayerSlots}</span>{" "}
          <span className="text-muted-foreground">
            player slots ({teams.length} &times; {maxPlayerSlots})
          </span>
        </span>
        <span className="text-muted-foreground">&middot;</span>
        <span>
          <span
            className={`font-black ${unassignedCount > 0 ? "text-amber-600" : "text-emerald-600"}`}
          >
            {unassignedCount}
          </span>{" "}
          <span className="text-muted-foreground">unassigned</span>
        </span>
        {teamsWithoutMentor > 0 && (
          <>
            <span className="text-muted-foreground">&middot;</span>
            <span>
              <span className="font-black text-amber-600">{teamsWithoutMentor}</span>{" "}
              <span className="text-muted-foreground">need mentor</span>
            </span>
          </>
        )}
      </div>

      {/* DnD context */}
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {/* Unassigned pool */}
        <Card className="rounded-2xl shadow-md border-dashed">
          <CardHeader className="px-4 pb-2 pt-4">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-black">Unassigned Players</CardTitle>
              <Badge variant="secondary" className="text-xs font-bold">
                {unassigned.length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="min-h-[80px] px-4 pb-4">
            {unassigned.length === 0 ? (
              <p className="py-5 text-center text-xs text-muted-foreground">
                All players assigned
              </p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {unassigned.map((p) => (
                  <PlayerAvatar key={p.id} player={p} colour={colour} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Teams grid */}
        {teams.length === 0 ? (
          <Card className="rounded-2xl border-dashed">
            <CardContent className="flex h-28 items-center justify-center text-sm text-muted-foreground">
              No teams yet — tap &ldquo;+ New Team&rdquo; below.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {teams.map((t) => (
              <TeamDropCard
                key={t.id}
                team={t}
                players={teamPlayerMap.get(t.id) ?? []}
                maxPlayerSlots={maxPlayerSlots}
                colour={colour}
                mentors={mentors}
                assignedMentorIds={assignedMentorIds}
                onMentorChange={handleMentorChange}
              />
            ))}
          </div>
        )}

        {/* Drag overlay */}
        <DragOverlay>
          {activePlayer ? (
            <PlayerAvatar player={activePlayer} colour={colour} overlay />
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Quick-create team */}
      <Button
        onClick={quickCreateTeam}
        disabled={creating}
        className="h-12 w-full rounded-2xl bg-[#114232] font-bold text-white hover:bg-[#1a5c44]"
      >
        {creating ? (
          <span className="flex items-center gap-2">
            <Spinner />
            Creating...
          </span>
        ) : (
          "+ New Team"
        )}
      </Button>
    </div>
  );
}
