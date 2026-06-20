"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { Card, CardContent } from "@/components/ui/card";

interface ParentRow {
  id: string;
  full_name: string;
  email: string | null;
  mobile_number: string | null;
  created_at: string;
  child_count: number;
}

export default function AdminParentsPage() {
  const supabase = getSupabaseBrowserClient();
  const [rows, setRows] = useState<ParentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);

      const { data: parents, error: parentsErr } = await supabase
        .from("profiles")
        .select("id, full_name, email, mobile_number, created_at")
        .eq("role", "parent")
        .order("created_at", { ascending: false });

      if (parentsErr) {
        setError(parentsErr.message);
        setLoading(false);
        return;
      }

      const ids = (parents ?? []).map((p) => p.id);
      const childCounts = new Map<string, number>();
      if (ids.length > 0) {
        const { data: players } = await supabase
          .from("players")
          .select("parent_id")
          .in("parent_id", ids);
        for (const p of players ?? []) {
          childCounts.set(p.parent_id, (childCounts.get(p.parent_id) ?? 0) + 1);
        }
      }

      setRows(
        (parents ?? []).map((p) => ({
          ...p,
          child_count: childCounts.get(p.id) ?? 0,
        }))
      );
      setLoading(false);
    }
    load();
  }, [supabase]);

  const filtered = rows.filter((r) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (
      r.full_name.toLowerCase().includes(q) ||
      (r.email ?? "").toLowerCase().includes(q) ||
      (r.mobile_number ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-md px-4 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-extrabold tracking-tight">Parents</h1>
          <p className="text-sm text-muted-foreground tabular-nums">
            {loading ? "…" : `${rows.length} total`}
          </p>
        </div>

        <input
          type="search"
          placeholder="Search by name, email or mobile…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-cricket"
        />

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
              {rows.length === 0 ? "No parents have registered yet." : "No matches."}
            </CardContent>
          </Card>
        )}

        <div className="space-y-2">
          {filtered.map((p) => (
            <Card key={p.id} className="rounded-2xl shadow-sm">
              <CardContent className="py-4 px-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-foreground">{p.full_name}</p>
                    {p.email && (
                      <a
                        href={`mailto:${p.email}`}
                        className="block truncate text-xs text-primary hover:underline"
                      >
                        {p.email}
                      </a>
                    )}
                    {p.mobile_number && (
                      <a
                        href={`tel:${p.mobile_number}`}
                        className="block truncate text-xs text-muted-foreground hover:underline"
                      >
                        {p.mobile_number}
                      </a>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-2xl font-black tabular-nums leading-none">
                      {p.child_count}
                    </p>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {p.child_count === 1 ? "kid" : "kids"}
                    </p>
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
