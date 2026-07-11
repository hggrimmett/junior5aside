"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import RoleAndDelete from "@/components/admin/RoleAndDelete";
import AddCoachDialog from "@/components/admin/AddCoachDialog";

interface CoachRow {
  id: string;
  full_name: string;
  email: string | null;
  mobile_number: string | null;
}

function vcardEscape(s: string): string {
  return s.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
}

function downloadCoachVCard(c: CoachRow) {
  const [first, ...rest] = c.full_name.trim().split(/\s+/);
  const last = rest.join(" ");
  const vcf = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${vcardEscape(last)};${vcardEscape(first ?? "")};;;`,
    `FN:${vcardEscape(c.full_name)}`,
    c.mobile_number ? `TEL;TYPE=CELL:${vcardEscape(c.mobile_number)}` : "",
    c.email ? `EMAIL;TYPE=INTERNET:${vcardEscape(c.email)}` : "",
    "NOTE:Coach — Junior 5-a-Side",
    "CATEGORIES:Junior 5-a-Side",
    "END:VCARD",
  ]
    .filter(Boolean)
    .join("\r\n");
  const blob = new Blob([vcf], { type: "text/vcard;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${c.full_name.replace(/[^a-zA-Z0-9]+/g, "_")}.vcf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function AdminCoachesPage() {
  const supabase = getSupabaseBrowserClient();
  const [rows, setRows] = useState<CoachRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

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
    const { data, error: fetchErr } = await supabase
      .from("profiles")
      .select("id, full_name, email, mobile_number")
      .eq("role", "coach")
      .order("full_name", { ascending: true });
    if (fetchErr) {
      setError(fetchErr.message);
      setLoading(false);
      return;
    }
    setRows((data ?? []) as CoachRow[]);
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
          <h1 className="text-xl font-extrabold tracking-tight">Coaches</h1>
          <p className="text-sm text-muted-foreground tabular-nums">
            {loading ? "…" : `${rows.length} total`}
          </p>
        </div>

        <Button
          onClick={() => setDialogOpen(true)}
          className="h-11 w-full rounded-xl bg-cricket text-cricket-foreground hover:opacity-90 font-bold"
        >
          + Add coach
        </Button>

        <AddCoachDialog open={dialogOpen} onOpenChange={setDialogOpen} onCreated={load} />

        <div className="rounded-xl border border-dashed border-muted-foreground/30 bg-muted/30 px-3 py-2 text-[11px] leading-snug text-muted-foreground">
          Coaches can use the <strong>Team Balancer</strong> and <strong>Live Scoring</strong>.
          They cannot delete data, change settings, or run the GDPR purge. Promote someone
          from Parents or Mentors by changing their role to <strong>coach</strong>.
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
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <Card className="rounded-2xl">
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              {rows.length === 0
                ? "No coaches yet. Promote a parent or mentor to coach to give them scoring + balancer access."
                : "No matches."}
            </CardContent>
          </Card>
        )}

        <div className="space-y-2">
          {filtered.map((c) => (
            <Card key={c.id} className="rounded-2xl shadow-sm">
              <CardContent className="py-4 px-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-foreground">{c.full_name}</p>
                    {c.email && (
                      <a href={`mailto:${c.email}`} className="block truncate text-xs text-primary hover:underline">
                        {c.email}
                      </a>
                    )}
                    {c.mobile_number && (
                      <a href={`tel:${c.mobile_number}`} className="block truncate text-xs text-muted-foreground hover:underline">
                        {c.mobile_number}
                      </a>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => downloadCoachVCard(c)}
                    className="shrink-0 inline-flex h-8 items-center gap-1 rounded-full border border-border bg-background px-3 text-[11px] font-bold text-foreground shadow-sm hover:bg-muted"
                    aria-label={`Save ${c.full_name} to contacts`}
                  >
                    Save contact
                  </button>
                </div>
                <RoleAndDelete
                  profileId={c.id}
                  currentRole="coach"
                  currentEmail={c.email}
                  displayName={c.full_name}
                  cascadeWarning={null}
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
