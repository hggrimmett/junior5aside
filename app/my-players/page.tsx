"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AvatarUpload } from "@/components/ui/avatar-upload";
import { uploadPlayerPhoto } from "@/lib/upload-photo";

type SchoolYear = "Y3" | "Y4" | "Y5" | "Y6" | "Y7" | "Y8";
const SCHOOL_YEARS: SchoolYear[] = ["Y3", "Y4", "Y5", "Y6", "Y7", "Y8"];

interface Player {
  id: string;
  name: string;
  age_group: SchoolYear;
  avatar_url: string | null;
}

export default function MyPlayersPage() {
  const supabase = getSupabaseBrowserClient();
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  // Add player dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newYear, setNewYear] = useState<SchoolYear>("Y3");
  const [newPlayerId, setNewPlayerId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      setUserId(user.id);

      const { data } = await supabase
        .from("players")
        .select("id, name, age_group, avatar_url")
        .eq("parent_id", user.id)
        .returns<Player[]>();

      setPlayers(data ?? []);
      setLoading(false);
    }

    load();
  }, [supabase, router]);

  function openDialog() {
    setNewName("");
    setNewYear("Y3");
    setNewPlayerId(null);
    setError(null);
    setDialogOpen(true);
  }

  async function handleSavePlayer() {
    if (!newName.trim()) {
      setError("Player name is required.");
      return;
    }

    setSaving(true);
    setError(null);

    const { data, error: insertErr } = await supabase
      .from("players")
      .insert({
        parent_id: userId,
        name: newName.trim(),
        age_group: newYear,
      })
      .select("id, name, age_group, avatar_url")
      .single<Player>();

    if (insertErr) {
      setError(insertErr.message);
      setSaving(false);
      return;
    }

    if (data) {
      setNewPlayerId(data.id);
      setPlayers((prev) => [...prev, data]);
    }

    setSaving(false);
  }

  function handleDone() {
    setDialogOpen(false);
    setNewPlayerId(null);
  }

  if (loading) {
    return (
      <div className="flex h-60 items-center justify-center">
        <svg className="h-6 w-6 animate-spin text-muted-foreground" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="px-4 py-5 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-extrabold tracking-tight text-foreground">
          My Players
        </h2>
        <button
          onClick={openDialog}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-cricket px-4 text-sm font-bold text-cricket-foreground active:opacity-80 transition-opacity"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Player
        </button>
      </div>

      {players.length === 0 ? (
        <Card className="rounded-2xl shadow-md">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No players registered yet.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {players.map((player) => (
            <Card
              key={player.id}
              className="rounded-2xl shadow-md overflow-hidden"
            >
              <CardContent className="flex items-center gap-4 px-5 py-4">
                {player.avatar_url ? (
                  <img
                    src={player.avatar_url}
                    alt={player.name}
                    className="h-14 w-14 shrink-0 rounded-full object-cover ring-2 ring-border"
                  />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-cricket text-cricket-foreground text-lg font-black ring-2 ring-border">
                    {player.name.charAt(0).toUpperCase()}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <p className="text-base font-extrabold tracking-tight text-foreground truncate">
                    {player.name}
                  </p>
                  <Badge
                    variant="secondary"
                    className="mt-1 bg-cricket-light text-cricket font-semibold"
                  >
                    {player.age_group}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Add Player Dialog ─────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-extrabold tracking-tight">
              {newPlayerId ? "Add Photo" : "Add Player"}
            </DialogTitle>
          </DialogHeader>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {newPlayerId ? (
            /* ── Photo step ──────────────────────────── */
            <div className="flex flex-col items-center gap-4 py-4">
              <AvatarUpload
                size={96}
                onUpload={async (file) => {
                  const url = await uploadPlayerPhoto(
                    supabase,
                    userId!,
                    newPlayerId,
                    file
                  );
                  if (url) {
                    setPlayers((prev) =>
                      prev.map((p) =>
                        p.id === newPlayerId ? { ...p, avatar_url: url } : p
                      )
                    );
                  }
                  return url;
                }}
              />
              <p className="text-sm text-muted-foreground">
                Tap to add a photo (optional)
              </p>

              <button
                onClick={handleDone}
                className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-cricket px-6 text-base font-bold text-cricket-foreground shadow-md transition-opacity active:opacity-80"
              >
                Done
              </button>
            </div>
          ) : (
            /* ── Name + Year step ────────────────────── */
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="player-name">Player Name</Label>
                <Input
                  id="player-name"
                  type="text"
                  placeholder="Child's name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="h-12"
                />
              </div>

              <div className="space-y-1.5">
                <Label>School Year</Label>
                <Select
                  value={newYear}
                  onValueChange={(v) => setNewYear((v ?? "Y3") as SchoolYear)}
                >
                  <SelectTrigger className="h-12">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SCHOOL_YEARS.map((y) => (
                      <SelectItem key={y} value={y}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <button
                onClick={handleSavePlayer}
                disabled={saving}
                className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-cricket px-6 text-base font-bold text-cricket-foreground shadow-md transition-opacity active:opacity-80 disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save & Add Photo"}
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
