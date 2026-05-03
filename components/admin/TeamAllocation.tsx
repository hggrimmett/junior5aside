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

// ── Draggable Player Card ──────────────────────────────────

function PlayerAvatar({ player, colors }: { player: Player; colors: typeof SCHOOL_YEAR_COLORS[SchoolYear] }) {
  if (player.avatar_url) {
    return (
      <img
        src={player.avatar_url}
        alt={player.name}
        className="h-8 w-8 shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${colors.bg} ${colors.text} ring-1 ${colors.ring}`}
    >
      {player.name.charAt(0).toUpperCase()}
    </span>
  );
}

function PlayerCard({ player, overlay }: { player: Player; overlay?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: player.id,
    data: player,
  });

  const colors = SCHOOL_YEAR_COLORS[player.age_group];

  if (overlay) {
    return (
      <Card className={`shadow-lg ring-2 ${colors.ring} ${colors.bg}`}>
        <CardContent className="px-3 py-2">
          <div className="flex items-center gap-2">
            <PlayerAvatar player={player} colors={colors} />
            <div>
              <p className="text-sm font-medium">{player.name}</p>
              <Badge
                variant="outline"
                className={`mt-0.5 text-xs font-semibold ${colors.badgeClass}`}
              >
                {player.age_group}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`cursor-grab transition ${colors.bg} hover:ring-2 ${colors.ring} ${
        isDragging ? "opacity-30" : ""
      }`}
    >
      <CardContent className="px-3 py-2">
        <div className="flex items-center gap-2">
          <PlayerAvatar player={player} colors={colors} />
          <div>
            <p className="text-sm font-medium">{player.name}</p>
            <Badge
              variant="outline"
              className={`mt-0.5 text-xs font-semibold ${colors.badgeClass}`}
            >
              {player.age_group}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
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
      className={`flex flex-col transition-all ${
        isOver
          ? "ring-2 ring-blue-400 border-blue-300 bg-blue-50/40"
          : ""
      }`}
    >
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-bold">{team.name}</CardTitle>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-2 px-4 pb-4">
        {players.length === 0 && (
          <p className="py-4 text-center text-xs text-muted-foreground">
            Drop players here
          </p>
        )}
        {players.map((p) => (
          <PlayerCard key={p.id} player={p} />
        ))}

        <p className="mt-auto pt-2 text-right text-xs text-muted-foreground">
          {players.length} player{players.length !== 1 && "s"}
        </p>
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
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header row: age filter tabs + create button */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={ageFilter}
          onValueChange={(v) => setAgeFilter(v as SchoolYear)}
        >
          <TabsList>
            {SCHOOL_YEARS.map((g) => (
              <TabsTrigger key={g} value={g}>
                {g}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Button
          onClick={quickCreateTeam}
          disabled={creating}
          size="sm"
        >
          {creating ? "Creating..." : "+ Quick-Create Team"}
        </Button>
      </div>

      {/* Error banner */}
      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-3 pb-3 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {/* DnD context wrapping both columns */}
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-6">
          {/* Left: unassigned players sidebar */}
          <div className="w-60 shrink-0">
            <Card className="border-dashed">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-bold">
                  Unassigned
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {unassigned.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto px-4 pb-4">
                {unassigned.length === 0 && (
                  <p className="py-8 text-center text-xs text-muted-foreground">
                    No unassigned {ageFilter} players
                  </p>
                )}
                {unassigned.map((p) => (
                  <PlayerCard key={p.id} player={p} />
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Main: team grid */}
          <div className="flex-1">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-sm font-bold">
                Teams
              </h2>
              <Badge variant="secondary" className="text-xs">
                {teams.length}
              </Badge>
            </div>

            {teams.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                  No teams yet — create one above.
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {teams.map((t) => (
                  <TeamDropCard
                    key={t.id}
                    team={t}
                    players={teamPlayerMap.get(t.id) ?? []}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Drag overlay (follows pointer) */}
        <DragOverlay>
          {activePlayer ? <PlayerCard player={activePlayer} overlay /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
