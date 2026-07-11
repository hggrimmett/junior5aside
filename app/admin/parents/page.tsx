"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { Card, CardContent } from "@/components/ui/card";
import RoleAndDelete from "@/components/admin/RoleAndDelete";

interface ParentRow {
  id: string;
  full_name: string;
  email: string | null;
  mobile_number: string | null;
  created_at: string;
  child_count: number;
  children: { first_name: string; last_name: string; age_group: string }[];
}

function vcardEscape(s: string): string {
  return s.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
}

function buildVCard(p: ParentRow): string {
  const [first, ...rest] = p.full_name.trim().split(/\s+/);
  const last = rest.join(" ");
  const kidsNote = p.children.length
    ? `Parent of ${p.children.map((c) => `${c.first_name} (${c.age_group})`).join(", ")} — Junior 5-a-Side`
    : "Junior 5-a-Side parent";
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${vcardEscape(last)};${vcardEscape(first ?? "")};;;`,
    `FN:${vcardEscape(p.full_name)}`,
    p.mobile_number ? `TEL;TYPE=CELL:${vcardEscape(p.mobile_number)}` : "",
    p.email ? `EMAIL;TYPE=INTERNET:${vcardEscape(p.email)}` : "",
    `NOTE:${vcardEscape(kidsNote)}`,
    `CATEGORIES:Junior 5-a-Side`,
    "END:VCARD",
  ];
  return lines.filter(Boolean).join("\r\n");
}

function downloadVCard(p: ParentRow) {
  const vcf = buildVCard(p);
  const blob = new Blob([vcf], { type: "text/vcard;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${p.full_name.replace(/[^a-zA-Z0-9]+/g, "_")}.vcf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function AdminParentsPage() {
  const supabase = getSupabaseBrowserClient();
  const [rows, setRows] = useState<ParentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
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
    const childrenByParent = new Map<string, { first_name: string; last_name: string; age_group: string }[]>();
    if (ids.length > 0) {
      const { data: players } = await supabase
        .from("players")
        .select("parent_id, first_name, last_name, age_group")
        .in("parent_id", ids);
      for (const p of players ?? []) {
        const arr = childrenByParent.get(p.parent_id) ?? [];
        arr.push({ first_name: p.first_name, last_name: p.last_name, age_group: p.age_group });
        childrenByParent.set(p.parent_id, arr);
      }
    }

    setRows(
      (parents ?? []).map((p) => {
        const children = childrenByParent.get(p.id) ?? [];
        return { ...p, child_count: children.length, children };
      })
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
              <CardContent className="py-4 px-4 space-y-3">
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
                  <div className="shrink-0 flex flex-col items-end gap-2">
                    <div className="text-right">
                      <p className="text-2xl font-black tabular-nums leading-none">
                        {p.child_count}
                      </p>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {p.child_count === 1 ? "kid" : "kids"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => downloadVCard(p)}
                      className="inline-flex h-8 items-center gap-1 rounded-full border border-border bg-background px-3 text-[11px] font-bold text-foreground shadow-sm hover:bg-muted"
                      aria-label={`Save ${p.full_name} to contacts`}
                    >
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M12 3v14m-3-3l3 3 3-3M22 8v4M22 12h-4" />
                      </svg>
                      Save contact
                    </button>
                  </div>
                </div>
                <RoleAndDelete
                  profileId={p.id}
                  currentRole="parent"
                  currentEmail={p.email}
                  displayName={p.full_name}
                  cascadeWarning={p.child_count > 0
                    ? `Also deletes ${p.child_count} kid${p.child_count === 1 ? "" : "s"} from players.`
                    : null}
                  onChanged={load}
                />
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
