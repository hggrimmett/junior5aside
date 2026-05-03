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

// ── Types ──────────────────────────────────────────────────

type SchoolYear = "Y3" | "Y4" | "Y5" | "Y6" | "Y7" | "Y8";

interface Player {
  id: string;
  name: string;
  age_group: SchoolYear;
  team_id: string | null;
  parent_id: string;
}

interface Team {
  id: string;
  name: string;
  tournament_id: string;
  mentor_id: string | null;
}

const SCHOOL_YEARS: SchoolYear[] = ["Y3", "Y4", "Y5", "Y6", "Y7", "Y8"];

const SCHOOL_YEAR_COLORS: Record<SchoolYear, { bg: string; ring: string; text: string }> = {
  Y3: { bg: "bg-blue-50", ring: "ring-blue-300", text: "text-blue-700" },
  Y4: { bg: "bg-green-50", ring: "ring-green-300", text: "text-green-700" },
  Y5: { bg: "bg-amber-50", ring: "ring-amber-300", text: "text-amber-700" },
  Y6: { bg: "bg-red-50", ring: "ring-red-300", text: "text-red-700" },
  Y7: { bg: "bg-purple-50", ring: "ring-purple-300", text: "text-purple-700" },
  Y8: { bg: "bg-pink-50", ring: "ring-pink-300", text: "text-pink-700" },
};

// ── Draggable Player Card ──────────────────────────────────

function PlayerCard({ player, overlay }: { player: Player; overlay?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: player.id,
    data: player,
  });

  const colors = SCHOOL_YEAR_COLORS[player.age_group];

  if (overlay) {
    return (
      <div
        className={`rounded-lg border px-3 py-2 shadow-lg ${colors.bg} ring-2 ${colors.ring}`}
      >
        <p className="text-sm font-medium text-gray-800">{player.name}</p>
        <span className={`text-xs font-semibold ${colors.text}`}>
          {player.age_group}
        </span>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`cursor-grab rounded-lg border px-3 py-2 transition ${colors.bg} hover:ring-2 ${colors.ring} ${
        isDragging ? "opacity-30" : ""
      }`}
    >
      <p className="text-sm font-medium text-gray-800">{player.name}</p>
      <span className={`text-xs font-semibold ${colors.text}`}>
        {player.age_group}
      </span>
    </div>
  );
}

// ── Droppable Team Card ────────────────────────────────────

function TeamCard({
  team,
  players,
}: {
  team: Team;
  players: Player[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: team.id });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col rounded-xl border-2 p-4 transition ${
        isOver
          ? "border-blue-400 bg-blue-50/50"
          : "border-gray-200 bg-white"
      }`}
    >
      <h3 className="mb-3 text-sm font-bold text-gray-700">{team.name}</h3>

      <div className="flex flex-1 flex-col gap-2">
        {players.length === 0 && (
          <p className="text-center text-xs text-gray-400 py-4">
            Drop players here
          </p>
        )}
        {players.map((p) => (
          <PlayerCard key={p.id} player={p} />
        ))}
      </div>

      <p className="mt-3 text-right text-xs text-gray-400">
        {players.length} player{players.length !== 1 && "s"}
      </p>
    </div>
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
      supabase
        .from("players")
        .select("*")
        .returns<Player[]>(),
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
    () =>
      players.filter(
        (p) => p.team_id === null && p.age_group === ageFilter
      ),
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
      <div className="flex h-64 items-center justify-center text-gray-400">
        Loading...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header row: age filter + create button */}
      <div className="flex items-center justify-between">
        <div className="flex rounded-lg bg-gray-100 p-1">
          {SCHOOL_YEARS.map((g) => {
            const c = SCHOOL_YEAR_COLORS[g];
            return (
              <button
                key={g}
                onClick={() => setAgeFilter(g)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
                  ageFilter === g
                    ? `bg-white shadow ${c.text}`
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {g}
              </button>
            );
          })}
        </div>

        <button
          onClick={quickCreateTeam}
          disabled={creating}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {creating ? "Creating..." : "+ Quick-Create Team"}
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* DnD context wrapping both columns */}
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-6">
          {/* Left: unassigned players */}
          <div className="w-64 shrink-0">
            <h2 className="mb-2 text-sm font-bold text-gray-600">
              Unassigned Players
              <span className="ml-1 text-gray-400">({unassigned.length})</span>
            </h2>
            <div className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto rounded-xl border border-dashed border-gray-300 bg-gray-50 p-3">
              {unassigned.length === 0 && (
                <p className="py-8 text-center text-xs text-gray-400">
                  No unassigned {ageFilter} players
                </p>
              )}
              {unassigned.map((p) => (
                <PlayerCard key={p.id} player={p} />
              ))}
            </div>
          </div>

          {/* Main: team grid */}
          <div className="flex-1">
            <h2 className="mb-2 text-sm font-bold text-gray-600">
              Teams
              <span className="ml-1 text-gray-400">({teams.length})</span>
            </h2>
            {teams.length === 0 ? (
              <div className="flex h-48 items-center justify-center rounded-xl border-2 border-dashed border-gray-200 text-sm text-gray-400">
                No teams yet — create one above.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {teams.map((t) => (
                  <TeamCard
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
          {activePlayer ? (
            <PlayerCard player={activePlayer} overlay />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
