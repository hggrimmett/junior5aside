"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import AddMentorDialog from "@/components/admin/AddMentorDialog";
import RoleAndDelete from "@/components/admin/RoleAndDelete";

interface MentorRow {
  id: string;
  full_name: string;
  email: string | null;
  mobile_number: string | null;
  team_count: number;
}

function vcardEscape(s: string): string {
  return s.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
}

function downloadMentorVCard(m: MentorRow) {
  const [first, ...rest] = m.full_name.trim().split(/\s+/);
  const last = rest.join(" ");
  const vcf = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${vcardEscape(last)};${vcardEscape(first ?? "")};;;`,
    `FN:${vcardEscape(m.full_name)}`,
    m.mobile_number ? `TEL;TYPE=CELL:${vcardEscape(m.mobile_number)}` : "",
    m.email ? `EMAIL;TYPE=INTERNET:${vcardEscape(m.email)}` : "",
    "NOTE:Mentor — Junior 5-a-Side",
    "CATEGORIES:Junior 5-a-Side",
    "END:VCARD",
  ]
    .filter(Boolean)
    .join("\r\n");
  const blob = new Blob([vcf], { type: "text/vcard;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${m.full_name.replace(/[^a-zA-Z0-9]+/g, "_")}.vcf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function AdminMentorsPage() {
  const supabase = getSupabaseBrowserClient();
  const [rows, setRows] = useState<MentorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: mentors, error: mErr } = await supabase
      .from("profiles")
      .select("id, full_name, email, mobile_number")
      .eq("role", "mentor")
      .order("full_name", { ascending: true });
    if (mErr) {
      setError(mErr.message);
      setLoading(false);
      return;
    }
    const ids = (mentors ?? []).map((m) => m.id);
    const teamCounts = new Map<string, number>();
    if (ids.length) {
      const { data: teams } = await supabase.from("teams").select("mentor_id").in("mentor_id", ids);
      for (const t of teams ?? []) {
        if (t.mentor_id) teamCounts.set(t.mentor_id, (teamCounts.get(t.mentor_id) ?? 0) + 1);
      }
    }
    setRows(
      (mentors ?? []).map((m) => ({ ...m, team_count: teamCounts.get(m.id) ?? 0 })),
    );
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

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
          <h1 className="text-xl font-extrabold tracking-tight">Mentors</h1>
          <p className="text-sm text-muted-foreground tabular-nums">
            {loading ? "…" : `${rows.length} total`}
          </p>
        </div>

        <Button
          onClick={() => setDialogOpen(true)}
          className="h-11 w-full rounded-xl bg-cricket text-cricket-foreground hover:opacity-90 font-bold"
        >
          + Add mentor
        </Button>

        <AddMentorDialog open={dialogOpen} onOpenChange={setDialogOpen} onCreated={load} />

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
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <Card className="rounded-2xl">
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              {rows.length === 0 ? "No mentors yet." : "No matches."}
            </CardContent>
          </Card>
        )}

        <div className="space-y-2">
          {filtered.map((m) => (
            <Card key={m.id} className="rounded-2xl shadow-sm">
              <CardContent className="py-4 px-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-foreground">{m.full_name}</p>
                    {m.email && (
                      <a href={`mailto:${m.email}`} className="block truncate text-xs text-primary hover:underline">
                        {m.email}
                      </a>
                    )}
                    {m.mobile_number && (
                      <a href={`tel:${m.mobile_number}`} className="block truncate text-xs text-muted-foreground hover:underline">
                        {m.mobile_number}
                      </a>
                    )}
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-2">
                    <div className="text-right">
                      <p className="text-2xl font-black tabular-nums leading-none">{m.team_count}</p>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {m.team_count === 1 ? "team" : "teams"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => downloadMentorVCard(m)}
                      className="inline-flex h-8 items-center gap-1 rounded-full border border-border bg-background px-3 text-[11px] font-bold text-foreground shadow-sm hover:bg-muted"
                      aria-label={`Save ${m.full_name} to contacts`}
                    >
                      Save contact
                    </button>
                  </div>
                </div>
                <RoleAndDelete
                  profileId={m.id}
                  currentRole="mentor"
                  displayName={m.full_name}
                  cascadeWarning={m.team_count > 0
                    ? `Deleting will unlink ${m.team_count} team${m.team_count === 1 ? "" : "s"} from a mentor.`
                    : null}
                  onChanged={load}
                />
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="pt-2 text-center">
          <Link href="/admin/settings" className="text-sm font-semibold text-muted-foreground hover:underline">
            ← Back to admin
          </Link>
        </div>
      </div>
    </div>
  );
}
