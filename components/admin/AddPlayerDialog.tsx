"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const SCHOOL_YEARS = ["Y3", "Y4", "Y5", "Y6", "Y7", "Y8"] as const;
type SchoolYear = (typeof SCHOOL_YEARS)[number];

const YEAR_TO_COLOUR: Record<SchoolYear, "Green" | "Red" | "Blue"> = {
  Y3: "Green",
  Y4: "Green",
  Y5: "Red",
  Y6: "Red",
  Y7: "Blue",
  Y8: "Blue",
};

interface ParentOption {
  id: string;
  full_name: string;
  email: string | null;
}

interface TeamOption {
  id: string;
  name: string;
  tournament_colour: "Green" | "Red" | "Blue";
}

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 12; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// Parse the minimum subset of a vCard we care about: FN, TEL, EMAIL.
function parseVCard(text: string): { fullName: string; mobile: string; email: string } {
  const out = { fullName: "", mobile: "", email: "" };
  const lines = text
    .replace(/\r\n[ \t]/g, "") // unfold long lines
    .split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const prefix = line.slice(0, colonIdx).toUpperCase();
    const value = line.slice(colonIdx + 1);
    const propName = prefix.split(";")[0];
    if (propName === "FN" && !out.fullName) out.fullName = value.replace(/\\,/g, ",").replace(/\\;/g, ";");
    else if (propName === "TEL" && !out.mobile) out.mobile = value.trim();
    else if (propName === "EMAIL" && !out.email) out.email = value.trim();
  }
  return out;
}

// Chrome Android exposes the OS contact picker via navigator.contacts.
// Returns null on browsers that don't support it (including iOS Safari).
async function pickFromDeviceContacts(): Promise<
  { fullName: string; mobile: string; email: string } | null
> {
  const nav = navigator as unknown as {
    contacts?: {
      select: (
        props: string[],
        opts?: { multiple?: boolean },
      ) => Promise<
        Array<{ name?: string[]; tel?: string[]; email?: string[] }>
      >;
    };
  };
  if (!nav.contacts?.select) return null;
  try {
    const results = await nav.contacts.select(["name", "tel", "email"], { multiple: false });
    if (!results.length) return null;
    const r = results[0];
    return {
      fullName: r.name?.[0] ?? "",
      mobile: r.tel?.[0] ?? "",
      email: r.email?.[0] ?? "",
    };
  } catch {
    return null;
  }
}

export default function AddPlayerDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const supabase = getSupabaseBrowserClient();

  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [parents, setParents] = useState<ParentOption[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [loadingLookups, setLoadingLookups] = useState(false);

  // Existing-parent picker
  const [parentQuery, setParentQuery] = useState("");
  const [selectedParentId, setSelectedParentId] = useState<string>("");

  // New-family fields
  const [newParentName, setNewParentName] = useState("");
  const [newParentEmail, setNewParentEmail] = useState("");
  const [newParentMobile, setNewParentMobile] = useState("");
  const [newParentPassword, setNewParentPassword] = useState("");

  // Player fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [schoolYear, setSchoolYear] = useState<SchoolYear | "">("");
  const [teamId, setTeamId] = useState<string>("");

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [contactPickerSupported, setContactPickerSupported] = useState(false);
  useEffect(() => {
    const nav = navigator as unknown as { contacts?: { select?: unknown } };
    setContactPickerSupported(!!nav.contacts?.select);
  }, []);

  function applyImportedContact(c: { fullName: string; mobile: string; email: string }) {
    if (c.fullName) setNewParentName(c.fullName);
    if (c.mobile) setNewParentMobile(c.mobile);
    if (c.email) setNewParentEmail(c.email);
    if (!newParentPassword) setNewParentPassword(generatePassword());
  }

  async function handlePickContact() {
    setError(null);
    const c = await pickFromDeviceContacts();
    if (!c) {
      setError("Couldn't read a contact from your device.");
      return;
    }
    applyImportedContact(c);
  }

  async function handleVCardFile(file: File | null | undefined) {
    setError(null);
    if (!file) return;
    try {
      const text = await file.text();
      const c = parseVCard(text);
      if (!c.fullName && !c.mobile && !c.email) {
        setError("That file didn't contain a readable contact.");
        return;
      }
      applyImportedContact(c);
    } catch {
      setError("Couldn't read that file.");
    }
  }

  const resetForm = useCallback(() => {
    setMode("existing");
    setParentQuery("");
    setSelectedParentId("");
    setNewParentName("");
    setNewParentEmail("");
    setNewParentMobile("");
    setNewParentPassword("");
    setFirstName("");
    setLastName("");
    setSchoolYear("");
    setTeamId("");
    setError(null);
    setSuccessMsg(null);
    setSubmitted(false);
  }, []);

  // Fetch parents + teams when dialog opens
  useEffect(() => {
    if (!open) return;
    setLoadingLookups(true);
    (async () => {
      const [parentsRes, teamsRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, email")
          .eq("role", "parent")
          .order("full_name", { ascending: true }),
        supabase.from("teams").select("id, name, tournaments(colour)"),
      ]);
      setParents((parentsRes.data ?? []) as ParentOption[]);
      const teamRows = (teamsRes.data ?? []).map((t) => {
        const tour = Array.isArray(t.tournaments) ? t.tournaments[0] : t.tournaments;
        return {
          id: t.id,
          name: t.name,
          tournament_colour: tour?.colour as "Green" | "Red" | "Blue",
        };
      }) as TeamOption[];
      setTeams(teamRows);
      setLoadingLookups(false);
    })();
  }, [open, supabase]);

  const filteredParents = useMemo(() => {
    const q = parentQuery.trim().toLowerCase();
    if (!q) return parents.slice(0, 20);
    return parents
      .filter(
        (p) =>
          p.full_name.toLowerCase().includes(q) ||
          (p.email ?? "").toLowerCase().includes(q),
      )
      .slice(0, 20);
  }, [parents, parentQuery]);

  const eligibleTeams = useMemo(() => {
    if (!schoolYear) return [];
    const colour = YEAR_TO_COLOUR[schoolYear];
    return teams.filter((t) => t.tournament_colour === colour);
  }, [teams, schoolYear]);

  async function handleSubmit() {
    setError(null);
    setSuccessMsg(null);

    // Client-side validation
    if (!firstName.trim() || !lastName.trim()) {
      setError("First name and last name required.");
      return;
    }
    if (!schoolYear) {
      setError("Pick a school year.");
      return;
    }
    if (mode === "existing" && !selectedParentId) {
      setError("Pick a parent.");
      return;
    }
    if (mode === "new") {
      if (!newParentName.trim() || !newParentEmail.trim() || !newParentMobile.trim()) {
        setError("New parent needs name, email, and mobile.");
        return;
      }
      if (!newParentPassword || newParentPassword.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }
    }

    setSubmitting(true);
    const payload =
      mode === "existing"
        ? {
            existingParentId: selectedParentId,
            player: {
              firstName: firstName.trim(),
              lastName: lastName.trim(),
              schoolYear,
              teamId: teamId || null,
            },
          }
        : {
            parent: {
              email: newParentEmail.trim(),
              password: newParentPassword,
              fullName: newParentName.trim(),
              mobile: newParentMobile.trim(),
            },
            player: {
              firstName: firstName.trim(),
              lastName: lastName.trim(),
              schoolYear,
              teamId: teamId || null,
            },
          };

    const res = await fetch("/api/admin/add-player", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = (await res.json().catch(() => ({}))) as { error?: string };
    setSubmitting(false);

    if (!res.ok) {
      setError(json.error ?? `Request failed (${res.status}).`);
      return;
    }

    setSubmitted(true);
    if (mode === "new") {
      setSuccessMsg(
        `Created. Give the parent this password to log in: ${newParentPassword}`,
      );
    } else {
      setSuccessMsg("Player added.");
    }
    onCreated();
    // Keep dialog open on new-family so admin can copy the password.
    if (mode === "existing") {
      setTimeout(() => {
        resetForm();
        onOpenChange(false);
      }, 900);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="mx-auto max-w-md rounded-2xl p-6 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-black">Add Player</DialogTitle>
        </DialogHeader>

        {/* Mode toggle */}
        <div className="mt-2 flex rounded-xl border p-1">
          <button
            type="button"
            onClick={() => setMode("existing")}
            className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
              mode === "existing" ? "bg-cricket text-cricket-foreground" : "text-muted-foreground"
            }`}
          >
            Existing parent
          </button>
          <button
            type="button"
            onClick={() => setMode("new")}
            className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
              mode === "new" ? "bg-cricket text-cricket-foreground" : "text-muted-foreground"
            }`}
          >
            New family
          </button>
        </div>

        <div className="space-y-3 py-2">
          {/* Existing-parent picker */}
          {mode === "existing" && (
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider">Parent</Label>
              <Input
                type="search"
                placeholder="Search parents by name or email..."
                value={parentQuery}
                onChange={(e) => setParentQuery(e.target.value)}
                className="h-10 rounded-lg"
              />
              <div className="max-h-40 overflow-y-auto rounded-lg border">
                {loadingLookups ? (
                  <p className="p-3 text-xs text-muted-foreground">Loading...</p>
                ) : filteredParents.length === 0 ? (
                  <p className="p-3 text-xs text-muted-foreground">No matches.</p>
                ) : (
                  filteredParents.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedParentId(p.id)}
                      className={`block w-full px-3 py-2 text-left text-xs ${
                        selectedParentId === p.id ? "bg-cricket/10 font-bold" : "hover:bg-muted/50"
                      }`}
                    >
                      <span className="block truncate">{p.full_name}</span>
                      <span className="block truncate text-muted-foreground">{p.email ?? ""}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* New-family fields */}
          {mode === "new" && (
            <div className="space-y-2">
              {/* Import contact */}
              <div className="flex flex-wrap gap-2 rounded-lg border border-dashed bg-muted/30 p-2">
                {contactPickerSupported && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handlePickContact}
                    className="h-9 flex-1 rounded-lg text-xs font-bold"
                  >
                    Pick from phone contacts
                  </Button>
                )}
                <label className="inline-flex h-9 flex-1 cursor-pointer items-center justify-center rounded-lg border border-input bg-background px-3 text-xs font-bold text-foreground hover:bg-muted">
                  Import vCard file
                  <input
                    type="file"
                    accept=".vcf,text/vcard,text/x-vcard,text/directory"
                    onChange={(e) => {
                      handleVCardFile(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                    className="hidden"
                  />
                </label>
              </div>
              {!contactPickerSupported && (
                <p className="text-[11px] leading-snug text-muted-foreground">
                  On iPhone: open Contacts → the person → Share → <strong>Save to Files</strong>, then tap Import vCard here.
                </p>
              )}

              <div className="space-y-1">
                <Label className="text-xs font-bold uppercase tracking-wider">Parent full name</Label>
                <Input value={newParentName} onChange={(e) => setNewParentName(e.target.value)} className="h-10 rounded-lg" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold uppercase tracking-wider">Parent email</Label>
                <Input type="email" value={newParentEmail} onChange={(e) => setNewParentEmail(e.target.value)} className="h-10 rounded-lg" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold uppercase tracking-wider">Parent mobile</Label>
                <Input type="tel" value={newParentMobile} onChange={(e) => setNewParentMobile(e.target.value)} className="h-10 rounded-lg" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold uppercase tracking-wider">Temporary password</Label>
                <div className="flex gap-2">
                  <Input value={newParentPassword} onChange={(e) => setNewParentPassword(e.target.value)} className="h-10 rounded-lg" />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setNewParentPassword(generatePassword())}
                    className="h-10 rounded-lg px-3 text-xs"
                  >
                    Generate
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">Share with the parent so they can log in and change it.</p>
              </div>
            </div>
          )}

          {/* Player fields */}
          <div className="border-t pt-3 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Player</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">First name</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="h-10 rounded-lg" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Last name</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} className="h-10 rounded-lg" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">School year</Label>
              <Select value={schoolYear} onValueChange={(v) => { setSchoolYear(v as SchoolYear); setTeamId(""); }}>
                <SelectTrigger className="h-10 rounded-lg">
                  <SelectValue placeholder="Pick year..." />
                </SelectTrigger>
                <SelectContent>
                  {SCHOOL_YEARS.map((y) => (
                    <SelectItem key={y} value={y}>
                      {y} <span className="text-muted-foreground">({YEAR_TO_COLOUR[y]})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Team (optional)</Label>
              <Select value={teamId || "__none__"} onValueChange={(v) => setTeamId(!v || v === "__none__" ? "" : v)} disabled={!schoolYear}>
                <SelectTrigger className="h-10 rounded-lg">
                  <SelectValue placeholder={schoolYear ? "Unassigned" : "Pick school year first"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Unassigned</SelectItem>
                  {eligibleTeams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Feedback */}
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}
          {successMsg && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              {successMsg}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => { resetForm(); onOpenChange(false); }}
            disabled={submitting}
            className="h-11 rounded-xl"
          >
            Close
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || submitted}
            className="h-11 rounded-xl bg-cricket text-cricket-foreground hover:opacity-90 font-bold disabled:opacity-100"
          >
            {submitted ? "✓ Submitted" : submitting ? "Adding..." : "Add player"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
