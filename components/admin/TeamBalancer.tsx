"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
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

// ── PlayerAvatar — draggable + droppable (for swap) ──────────

function PlayerAvatar({
  player,
  colour,
  overlay = false,
  onLongPress,
}: {
  player: Player;
  colour: TournamentColour;
  overlay?: boolean;
  onLongPress?: (player: Player) => void;
}) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: player.id,
    data: player,
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: player.id });

  // Long press detection
  const longPressTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleTouchStart() {
    longPressTimer.current = setTimeout(() => {
      onLongPress?.(player);
    }, 600);
  }
  function handleTouchEnd() {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  }

  const styles = COLOUR_STYLES[colour];

  const avatar = (
    <div className={`flex flex-col items-center gap-1 ${isOver && !overlay ? "scale-110" : ""} transition-transform`}>
      {player.avatar_url ? (
        <img
          src={player.avatar_url}
          alt={`${player.first_name} ${player.last_name}`}
          className={`h-12 w-12 rounded-full object-cover ring-2 ${styles.ring} ${
            isDragging && !overlay ? "opacity-25" : ""
          } ${isOver ? "ring-4 ring-amber-400" : ""}`}
        />
      ) : (
        <span
          className={`flex h-12 w-12 items-center justify-center rounded-full text-xs font-black ring-2 ${styles.bg} ${styles.text} ${styles.ring} ${
            isDragging && !overlay ? "opacity-25" : ""
          } ${isOver ? "ring-4 ring-amber-400" : ""}`}
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
      ref={(node) => { setDragRef(node); setDropRef(node); }}
      {...listeners}
      {...attributes}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onContextMenu={(e) => { e.preventDefault(); onLongPress?.(player); }}
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
  onLongPress,
}: {
  team: Team;
  players: Player[];
  maxPlayerSlots: number;
  colour: TournamentColour;
  mentors: Mentor[];
  onLongPress: (p: Player) => void;
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
                <PlayerAvatar key={p.id} player={p} colour={colour} onLongPress={onLongPress} />
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

  // Long-press state for tournament move
  const [longPressPlayer, setLongPressPlayer] = useState<Player | null>(null);
  const [allTournaments, setAllTournaments] = useState<{ id: string; name: string; colour: string }[]>([]);

  // Fetch all tournaments for the move dialog
  useEffect(() => {
    supabase.from("tournaments").select("id, name, colour").then(({ data }) => {
      setAllTournaments(data ?? []);
    });
  }, [supabase]);

  function handleDragStart(event: DragStartEvent) {
    setActivePlayer(event.active.data.current as Player);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActivePlayer(null);
    const { active, over } = event;
    if (!over) return;

    const playerId = active.id as string;
    const dropTarget = over.id as string;
    const draggedPlayer = players.find((p) => p.id === playerId);
    if (!draggedPlayer) return;

    // Dropped onto the "unassigned" zone
    if (dropTarget === "unassigned-pool") {
      if (draggedPlayer.team_id === null) return; // already unassigned
      const prevTeamId = draggedPlayer.team_id;
      setPlayers((prev) => prev.map((p) => (p.id === playerId ? { ...p, team_id: null } : p)));
      const { error: err } = await supabase.from("players").update({ team_id: null }).eq("id", playerId);
      if (err) {
        setError(err.message);
        setPlayers((prev) => prev.map((p) => (p.id === playerId ? { ...p, team_id: prevTeamId } : p)));
      }
      return;
    }

    // Check if we dropped onto another player (swap)
    const targetPlayer = players.find((p) => p.id === dropTarget);
    if (targetPlayer && targetPlayer.team_id) {
      // Swap: dragged player goes to target's team, target goes to dragged's team
      const dragTeam = draggedPlayer.team_id;
      const targetTeam = targetPlayer.team_id;
      if (dragTeam === targetTeam) return; // same team, no-op

      setPlayers((prev) => prev.map((p) => {
        if (p.id === playerId) return { ...p, team_id: targetTeam };
        if (p.id === dropTarget) return { ...p, team_id: dragTeam };
        return p;
      }));

      const [err1, err2] = await Promise.all([
        supabase.from("players").update({ team_id: targetTeam }).eq("id", playerId),
        supabase.from("players").update({ team_id: dragTeam }).eq("id", dropTarget),
      ]);

      if (err1.error || err2.error) {
        setError("Swap failed. Reverting.");
        setPlayers((prev) => prev.map((p) => {
          if (p.id === playerId) return { ...p, team_id: dragTeam };
          if (p.id === dropTarget) return { ...p, team_id: targetTeam };
          return p;
        }));
      }
      return;
    }

    // Dropped onto a team card
    const teamId = dropTarget;
    const targetPlayers = teamPlayerMap.get(teamId) ?? [];
    if (targetPlayers.length >= maxPlayerSlots) return;

    const previousTeamId = draggedPlayer.team_id;
    setPlayers((prev) => prev.map((p) => (p.id === playerId ? { ...p, team_id: teamId } : p)));

    const { error: updateErr } = await supabase.from("players").update({ team_id: teamId }).eq("id", playerId);
    if (updateErr) {
      setError(updateErr.message);
      setPlayers((prev) => prev.map((p) => (p.id === playerId ? { ...p, team_id: previousTeamId } : p)));
    }
  }

  // Long-press: move player to another tournament
  async function handleMoveTournament(player: Player, targetTournamentId: string) {
    if (targetTournamentId === tournamentId) { setLongPressPlayer(null); return; }

    // Unassign from current team and move to the other tournament's pool
    // We just set team_id = null. The player's age_group determines which tournament pool they appear in.
    // If moving across age groups we'd need to change age_group too, but for now just unassign.
    setPlayers((prev) => prev.filter((p) => p.id !== player.id));
    setLongPressPlayer(null);

    await supabase.from("players").update({ team_id: null }).eq("id", player.id);
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
        {/* Unassigned pool (droppable) */}
        <UnassignedPool
          unassigned={unassigned}
          colour={colour}
          onLongPress={setLongPressPlayer}
        />

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
                onLongPress={setLongPressPlayer}
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

      {/* Long-press: move to another tournament */}
      {longPressPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6">
          <div className="w-full max-w-sm rounded-2xl bg-background p-5 shadow-xl space-y-4">
            <h3 className="text-base font-black text-foreground">
              Move {longPressPlayer.first_name} {longPressPlayer.last_name}
            </h3>
            <p className="text-sm text-muted-foreground">
              Move to another tournament&apos;s unassigned pool:
            </p>
            <div className="space-y-2">
              {allTournaments
                .filter((t) => t.id !== tournamentId)
                .map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleMoveTournament(longPressPlayer, t.id)}
                    className="w-full h-12 rounded-xl border-2 border-border text-sm font-bold text-foreground active:scale-[0.98] transition-transform hover:bg-muted"
                  >
                    {t.name} ({t.colour})
                  </button>
                ))}
            </div>
            <button
              onClick={() => setLongPressPlayer(null)}
              className="w-full h-12 rounded-xl text-sm font-bold text-muted-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── UnassignedPool — droppable zone ────────────────────────

function UnassignedPool({
  unassigned,
  colour,
  onLongPress,
}: {
  unassigned: Player[];
  colour: TournamentColour;
  onLongPress: (p: Player) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "unassigned-pool" });

  return (
    <Card
      ref={setNodeRef}
      className={`rounded-2xl shadow-md border-dashed transition-all ${
        isOver ? "ring-2 ring-amber-400 bg-amber-50/30" : ""
      }`}
    >
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
            {isOver ? "Drop here to unassign" : "All players assigned"}
          </p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {unassigned.map((p) => (
              <PlayerAvatar key={p.id} player={p} colour={colour} onLongPress={onLongPress} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
