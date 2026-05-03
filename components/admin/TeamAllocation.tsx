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
} from "@dnd-kit/core";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

// ── Types ──────────────────────────────────────────────────

type SchoolYear = "Y3" | "Y4" | "Y5" | "Y6" | "Y7" | "Y8";

interface Player {
  id: string;
  first_name: string;
  last_name: string;
  name: string;
  age_group: SchoolYear;
  team_id: string | null;
  parent_id: string;
  avatar_url: string | null;
}

interface Team {
  id: string;
  name: string;
  tournament_id: string;
  mentor_id: string | null;
}

const SCHOOL_YEARS: SchoolYear[] = ["Y3", "Y4", "Y5", "Y6", "Y7", "Y8"];

const SCHOOL_YEAR_COLORS: Record<
  SchoolYear,
  { bg: string; ring: string; text: string; badgeClass: string }
> = {
  Y3: {
    bg: "bg-blue-50",
    ring: "ring-blue-300",
    text: "text-blue-700",
    badgeClass: "bg-blue-100 text-blue-700 border-blue-200",
  },
  Y4: {
    bg: "bg-green-50",
    ring: "ring-green-300",
    text: "text-green-700",
    badgeClass: "bg-green-100 text-green-700 border-green-200",
  },
  Y5: {
    bg: "bg-amber-50",
    ring: "ring-amber-300",
    text: "text-amber-700",
    badgeClass: "bg-amber-100 text-amber-700 border-amber-200",
  },
  Y6: {
    bg: "bg-red-50",
    ring: "ring-red-300",
    text: "text-red-700",
    badgeClass: "bg-red-100 text-red-700 border-red-200",
  },
  Y7: {
    bg: "bg-purple-50",
    ring: "ring-purple-300",
    text: "text-purple-700",
    badgeClass: "bg-purple-100 text-purple-700 border-purple-200",
  },
  Y8: {
    bg: "bg-pink-50",
    ring: "ring-pink-300",
    text: "text-pink-700",
    badgeClass: "bg-pink-100 text-pink-700 border-pink-200",
  },
};

// ── Circular draggable player avatar ──────────────────────

function PlayerCircle({
  player,
  overlay,
}: {
  player: Player;
  overlay?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: player.id,
    data: player,
  });

  const colors = SCHOOL_YEAR_COLORS[player.age_group];

  const initials = `${player.first_name?.[0] ?? ""}${player.last_name?.[0] ?? ""}`.toUpperCase();

  const inner = (
    <div className="flex flex-col items-center gap-1">
      {player.avatar_url ? (
        <img
          src={player.avatar_url}
          alt={`${player.first_name} ${player.last_name}`}
          className={`h-14 w-14 rounded-full object-cover ring-2 ${colors.ring} ${
            isDragging ? "opacity-30" : ""
          }`}
        />
      ) : (
        <span
          className={`flex h-14 w-14 items-center justify-center rounded-full text-sm font-black ${colors.bg} ${colors.text} ring-2 ${colors.ring} ${
            isDragging ? "opacity-30" : ""
          }`}
        >
          {initials}
        </span>
      )}
      <span className="w-16 truncate text-center text-xs font-semibold leading-tight">
        {player.first_name}
      </span>
    </div>
  );

  if (overlay) {
    return (
      <div className={`opacity-90 drop-shadow-xl`}>
        {inner}
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className="cursor-grab touch-none active:scale-110 transition-transform"
    >
      {inner}
    </div>
  );
}

// ── Droppable Team Card ────────────────────────────────────

function TeamDropCard({
  team,
  players,
}: {
  team: Team;
  players: Player[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: team.id });

  return (
    <Card
      ref={setNodeRef}
      className={`rounded-2xl shadow-md transition-all ${
        isOver ? "ring-2 ring-[#114232] border-[#114232] bg-emerald-50/40" : ""
      }`}
    >
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-black">{team.name}</CardTitle>
          <span className="text-xs text-muted-foreground font-semibold">
            {players.length} player{players.length !== 1 && "s"}
          </span>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-5 min-h-[80px]">
        {players.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            Drop players here
          </p>
        ) : (
          <div className="flex flex-wrap gap-3 pt-1">
            {players.map((p) => (
              <PlayerCircle key={p.id} player={p} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main Component ─────────────────────────────────────────

export default function TeamAllocation({
  tournamentId,
}: {
  tournamentId: string;
}) {
  const supabase = getSupabaseBrowserClient();

  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [ageFilter, setAgeFilter] = useState<SchoolYear>("Y3");
  const [activePlayer, setActivePlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // ── Fetch data ───────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [playersRes, teamsRes] = await Promise.all([
      supabase.from("players").select("*").returns<Player[]>(),
      supabase
        .from("teams")
        .select("*")
        .eq("tournament_id", tournamentId)
        .returns<Team[]>(),
    ]);

    if (playersRes.error) {
      setError(playersRes.error.message);
    } else {
      setPlayers(playersRes.data ?? []);
    }

    if (teamsRes.error) {
      setError(teamsRes.error.message);
    } else {
      setTeams(teamsRes.data ?? []);
    }

    setLoading(false);
  }, [supabase, tournamentId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Derived lists (filtered by age group) ────────────────

  const unassigned = useMemo(
    () => players.filter((p) => p.team_id === null && p.age_group === ageFilter),
    [players, ageFilter]
  );

  const teamPlayerMap = useMemo(() => {
    const map = new Map<string, Player[]>();
    for (const t of teams) map.set(t.id, []);
    for (const p of players) {
      if (p.team_id && p.age_group === ageFilter && map.has(p.team_id)) {
        map.get(p.team_id)!.push(p);
      }
    }
    return map;
  }, [players, teams, ageFilter]);

  // ── Drag handlers ────────────────────────────────────────

  function handleDragStart(event: DragStartEvent) {
    setActivePlayer(event.active.data.current as Player);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActivePlayer(null);
    const { active, over } = event;
    if (!over) return;

    const playerId = active.id as string;
    const teamId = over.id as string;

    // Optimistic update
    setPlayers((prev) =>
      prev.map((p) => (p.id === playerId ? { ...p, team_id: teamId } : p))
    );

    const { error: updateErr } = await supabase
      .from("players")
      .update({ team_id: teamId })
      .eq("id", playerId);

    if (updateErr) {
      setError(updateErr.message);
      // Revert
      setPlayers((prev) =>
        prev.map((p) => (p.id === playerId ? { ...p, team_id: null } : p))
      );
    }
  }

  // ── Quick-create team ────────────────────────────────────

  async function quickCreateTeam() {
    setCreating(true);
    setError(null);

    const teamNumber = teams.length + 1;
    const { data, error: insertErr } = await supabase
      .from("teams")
      .insert({
        name: `Team ${teamNumber}`,
        tournament_id: tournamentId,
      })
      .select()
      .returns<Team[]>()
      .single();

    if (insertErr) {
      setError(insertErr.message);
    } else if (data) {
      setTeams((prev) => [...prev, data]);
    }

    setCreating(false);
  }

  // ── Render ───────────────────────────────────────────────

  if (loading) {
    return (
      <div className="mx-auto max-w-md px-4">
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 space-y-5">
      {/* Year filter tabs — full width, scrollable */}
      <div className="overflow-x-auto -mx-4 px-4">
        <Tabs
          value={ageFilter}
          onValueChange={(v) => setAgeFilter(v as SchoolYear)}
        >
          <TabsList className="h-12 gap-1 w-full">
            {SCHOOL_YEARS.map((g) => (
              <TabsTrigger
                key={g}
                value={g}
                className="flex-1 h-10 text-sm font-bold"
              >
                {g}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Error banner */}
      {error && (
        <Card className="rounded-2xl border-destructive/50 bg-destructive/5">
          <CardContent className="pt-3 pb-3 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {/* DnD context */}
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {/* Unassigned players pool */}
        <Card className="rounded-2xl shadow-md border-dashed">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-black">
                Unassigned{" "}
                <Badge variant="secondary" className="ml-1.5 text-xs font-bold">
                  {unassigned.length}
                </Badge>
              </CardTitle>
              <Button
                onClick={quickCreateTeam}
                disabled={creating}
                className="h-9 rounded-xl bg-[#114232] hover:bg-[#1a5c44] text-white text-xs font-bold px-3"
              >
                {creating ? "Creating..." : "+ New Team"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 min-h-[80px]">
            {unassigned.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                No unassigned {ageFilter} players
              </p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {unassigned.map((p) => (
                  <PlayerCircle key={p.id} player={p} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Team drop zones — stacked */}
        {teams.length === 0 ? (
          <Card className="rounded-2xl border-dashed">
            <CardContent className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              No teams yet — tap "+ New Team" above.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <span className="text-sm font-black">Teams</span>
              <Badge variant="secondary" className="text-xs font-bold">
                {teams.length}
              </Badge>
            </div>
            {teams.map((t) => (
              <TeamDropCard
                key={t.id}
                team={t}
                players={teamPlayerMap.get(t.id) ?? []}
              />
            ))}
          </div>
        )}

        {/* Drag overlay (follows pointer) */}
        <DragOverlay>
          {activePlayer ? <PlayerCircle player={activePlayer} overlay /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
