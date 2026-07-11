"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface CandidateProfile {
  id: string;
  full_name: string;
  email: string | null;
}

export default function GuardianLinkPicker({
  profileId,
  displayName,
}: {
  profileId: string;
  displayName: string;
}) {
  const supabase = getSupabaseBrowserClient();
  const [links, setLinks] = useState<CandidateProfile[]>([]);
  const [candidates, setCandidates] = useState<CandidateProfile[]>([]);
  const [query, setQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    // Fetch current links (rows where a = this profile) — join to get names.
    const { data: linkRows } = await supabase
      .from("guardian_links")
      .select("b")
      .eq("a", profileId);
    const linkedIds = (linkRows ?? []).map((r) => r.b as string);

    const [linkedRes, allRes] = await Promise.all([
      linkedIds.length
        ? supabase.from("profiles").select("id, full_name, email").in("id", linkedIds)
        : Promise.resolve({ data: [] }),
      supabase
        .from("profiles")
        .select("id, full_name, email")
        .neq("id", profileId)
        .order("full_name", { ascending: true }),
    ]);
    setLinks((linkedRes.data ?? []) as CandidateProfile[]);
    setCandidates((allRes.data ?? []) as CandidateProfile[]);
    setLoading(false);
  }, [supabase, profileId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleLink(otherId: string) {
    setSavingId(otherId);
    setError(null);
    const res = await fetch("/api/admin/link-guardians", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileAId: profileId, profileBId: otherId }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    setSavingId(null);
    if (!res.ok) {
      setError(json.error ?? "Link failed");
      return;
    }
    setPickerOpen(false);
    setQuery("");
    load();
  }

  async function handleUnlink(otherId: string) {
    setSavingId(otherId);
    setError(null);
    const res = await fetch("/api/admin/unlink-guardians", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileAId: profileId, profileBId: otherId }),
    });
    setSavingId(null);
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setError(json.error ?? "Unlink failed");
      return;
    }
    load();
  }

  const linkedIds = useMemo(() => new Set(links.map((l) => l.id)), [links]);
  const filteredCandidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return candidates
      .filter((c) => !linkedIds.has(c.id))
      .filter((c) =>
        !q
          ? true
          : c.full_name.toLowerCase().includes(q) || (c.email ?? "").toLowerCase().includes(q),
      )
      .slice(0, 15);
  }, [candidates, linkedIds, query]);

  return (
    <div className="border-t pt-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Linked guardians
        </p>
        {!pickerOpen && (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="text-[11px] font-bold text-cricket hover:underline"
          >
            + Link
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-[11px] text-muted-foreground">Loading...</p>
      ) : links.length === 0 && !pickerOpen ? (
        <p className="text-[11px] text-muted-foreground italic">
          None. Link {displayName} to another parent so they share visibility of the same kids.
        </p>
      ) : (
        <ul className="space-y-1">
          {links.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/30 px-2 py-1.5">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold truncate">{l.full_name}</p>
                {l.email && <p className="text-[10px] text-muted-foreground truncate">{l.email}</p>}
              </div>
              <button
                type="button"
                onClick={() => handleUnlink(l.id)}
                disabled={savingId === l.id}
                className="shrink-0 text-[10px] font-bold text-destructive hover:underline disabled:opacity-50"
              >
                {savingId === l.id ? "..." : "Unlink"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {pickerOpen && (
        <div className="space-y-2 rounded-lg border border-dashed p-2">
          <Input
            type="search"
            placeholder="Search by name or email..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9 rounded-lg text-xs"
          />
          <div className="max-h-40 overflow-y-auto rounded-lg border">
            {filteredCandidates.length === 0 ? (
              <p className="p-2 text-[11px] text-muted-foreground">No matches.</p>
            ) : (
              filteredCandidates.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleLink(c.id)}
                  disabled={savingId === c.id}
                  className="block w-full px-2 py-1.5 text-left text-[11px] hover:bg-muted/50 disabled:opacity-50"
                >
                  <span className="block truncate font-bold">{c.full_name}</span>
                  <span className="block truncate text-muted-foreground">{c.email ?? ""}</span>
                </button>
              ))
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            onClick={() => { setPickerOpen(false); setQuery(""); }}
            className="h-8 w-full text-[11px]"
          >
            Cancel
          </Button>
        </div>
      )}

      {error && (
        <p className="text-[11px] text-destructive">{error}</p>
      )}
    </div>
  );
}
