"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import AddPlayerDialog from "@/components/admin/AddPlayerDialog";
import PlayerActions from "@/components/admin/PlayerActions";

interface PlayerRow {
  id: string;
  first_name: string;
  last_name: string;
  age_group: string;
  avatar_url: string | null;
  team_id: string | null;
  parent_id: string;
  parent_name: string;
  team_name: string | null;
  created_at: string;
}

const AGE_GROUP_COLOUR: Record<string, string> = {
  Blue: "bg-sky-100 text-sky-800",
  Green: "bg-emerald-100 text-emerald-800",
  Red: "bg-rose-100 text-rose-800",
};

export default function AdminPlayersPage() {
  const supabase = getSupabaseBrowserClient();
  const [rows, setRows] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filterGroup, setFilterGroup] = useState<"All" | "Blue" | "Green" | "Red">("All");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = "/login";
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single<{ role: string }>();
      if (profile?.role === "superadmin") setAuthorized(true);
      else window.location.href = "/dashboard";
    })();
  }, [supabase]);

  const load = useCallback(async () => {
    setLoading(true);

    const { data: players, error: playersErr } = await supabase
      .from("players")
      .select("id, first_name, last_name, age_group, avatar_url, team_id, parent_id, created_at")
      .order("created_at", { ascending: false });

    if (playersErr) {
      setError(playersErr.message);
      setLoading(false);
      return;
    }

    const parentIds = Array.from(new Set((players ?? []).map((p) => p.parent_id)));
    const teamIds = Array.from(new Set((players ?? []).map((p) => p.team_id).filter(Boolean) as string[]));

    const [parentsRes, teamsRes] = await Promise.all([
      parentIds.length
        ? supabase.from("profiles").select("id, full_name").in("id", parentIds)
        : Promise.resolve({ data: [] }),
      teamIds.length
        ? supabase.from("teams").select("id, name").in("id", teamIds)
        : Promise.resolve({ data: [] }),
    ]);

    const parentMap = new Map((parentsRes.data ?? []).map((p) => [p.id, p.full_name]));
    const teamMap = new Map((teamsRes.data ?? []).map((t) => [t.id, t.name]));

    setRows(
      (players ?? []).map((p) => ({
        ...p,
        parent_name: parentMap.get(p.parent_id) ?? "—",
        team_name: p.team_id ? teamMap.get(p.team_id) ?? null : null,
      }))
    );
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = rows.filter((r) => {
    if (filterGroup !== "All" && r.age_group !== filterGroup) return false;
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (
      `${r.first_name} ${r.last_name}`.toLowerCase().includes(q) ||
      r.parent_name.toLowerCase().includes(q)
    );
  });

  const groupCounts = {
    All: rows.length,
    Blue: rows.filter((r) => r.age_group === "Blue").length,
    Green: rows.filter((r) => r.age_group === "Green").length,
    Red: rows.filter((r) => r.age_group === "Red").length,
  };

  if (!authorized) {
    return (
      <div className="flex h-60 items-center justify-center text-sm text-muted-foreground">
        Checking access...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-md px-4 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-extrabold tracking-tight">Players</h1>
          <p className="text-sm text-muted-foreground tabular-nums">
            {loading ? "…" : `${rows.length} total`}
          </p>
        </div>

        <Button
          onClick={() => setDialogOpen(true)}
          className="h-11 w-full rounded-xl bg-cricket text-cricket-foreground hover:opacity-90 font-bold"
        >
          + Add player
        </Button>

        <AddPlayerDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onCreated={load}
        />

        <input
          type="search"
          placeholder="Search by player or parent name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-cricket"
        />

        <div className="flex gap-2">
          {(["All", "Blue", "Green", "Red"] as const).map((g) => (
            <button
              key={g}
              onClick={() => setFilterGroup(g)}
              className={`flex-1 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                filterGroup === g
                  ? "bg-cricket text-cricket-foreground"
                  : "bg-background text-muted-foreground border border-border"
              }`}
            >
              {g} <span className="opacity-70">{groupCounts[g]}</span>
            </button>
          ))}
        </div>

        {error && (
          <Card className="rounded-2xl border-destructive/40 bg-destructive/5">
            <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
          </Card>
        )}

        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <Card className="rounded-2xl">
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              {rows.length === 0 ? "No players have registered yet." : "No matches."}
            </CardContent>
          </Card>
        )}

        <div className="space-y-2">
          {filtered.map((p) => (
            <Card key={p.id} className="rounded-2xl shadow-sm">
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-3">
                  {p.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.avatar_url}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold text-muted-foreground">
                      {p.first_name[0]}
                      {p.last_name[0]}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-foreground">
                      {p.first_name} {p.last_name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      Parent: {p.parent_name}
                    </p>
                    {p.team_name && (
                      <p className="truncate text-xs text-muted-foreground">
                        Team: {p.team_name}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-2">
                    <Badge
                      className={`${AGE_GROUP_COLOUR[p.age_group] ?? "bg-muted text-foreground"}`}
                    >
                      {p.age_group}
                    </Badge>
                    <PlayerActions
                      playerId={p.id}
                      displayName={`${p.first_name} ${p.last_name}`}
                      onChanged={load}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="pt-2 text-center">
          <Link
            href="/admin/settings"
            className="text-sm font-semibold text-muted-foreground hover:underline"
          >
            ← Back to admin
          </Link>
        </div>
      </div>
    </div>
  );
}
