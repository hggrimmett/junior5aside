"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type SchoolYear = "Y3" | "Y4" | "Y5" | "Y6" | "Y7" | "Y8";

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

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

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
        <Link
          href="/register"
          className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-cricket px-4 text-sm font-bold text-cricket-foreground active:opacity-80 transition-opacity"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Player
        </Link>
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
                {/* Avatar */}
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

                {/* Info */}
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
    </div>
  );
}
