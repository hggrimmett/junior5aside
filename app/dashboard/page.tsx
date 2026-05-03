"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

interface Profile {
  id: string;
  role: string;
  full_name: string;
  mobile_number: string;
}

interface Player {
  id: string;
  first_name: string;
  last_name: string;
  name: string;
  age_group: SchoolYear;
  avatar_url: string | null;
}

export default function DashboardPage() {
  const supabase = getSupabaseBrowserClient();
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [fullName, setFullName] = useState("");
  const [mobile, setMobile] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit player
  const [editPlayer, setEditPlayer] = useState<Player | null>(null);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editYear, setEditYear] = useState<SchoolYear>("Y3");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Add player
  const [addOpen, setAddOpen] = useState(false);
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newYear, setNewYear] = useState<SchoolYear>("Y3");
  const [newPlayerId, setNewPlayerId] = useState<string | null>(null);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }

      const [profileRes, playersRes] = await Promise.all([
        supabase.from("profiles").select("id, role, full_name, mobile_number").eq("id", user.id).single<Profile>(),
        supabase.from("players").select("id, first_name, last_name, name, age_group, avatar_url").eq("parent_id", user.id).returns<Player[]>(),
      ]);

      if (profileRes.data) {
        setProfile(profileRes.data);
        setFullName(profileRes.data.full_name);
        setMobile(profileRes.data.mobile_number);
      }
      setPlayers(playersRes.data ?? []);
      setLoading(false);
    }
    load();
  }, [supabase, router]);

  // ── Save profile ─────────────────────────────────────────

  async function handleSaveProfile() {
    if (!fullName.trim() || !mobile.trim()) { setError("Name and mobile required."); return; }
    setSaving(true); setError(null); setSaved(false);

    const { error: err } = await supabase
      .from("profiles")
      .update({ full_name: fullName.trim(), mobile_number: mobile.trim() })
      .eq("id", profile!.id);

    if (err) { setError(err.message); setSaving(false); return; }
    setSaved(true); setSaving(false);
    setTimeout(() => setSaved(false), 2500);
  }

  // ── Edit player ──────────────────────────────────────────

  function openEdit(player: Player) {
    setEditPlayer(player);
    setEditFirstName(player.first_name);
    setEditLastName(player.last_name);
    setEditYear(player.age_group);
    setEditError(null);
  }

  async function handleSaveEdit() {
    if (!editPlayer || !editFirstName.trim() || !editLastName.trim()) {
      setEditError("Both names required."); return;
    }
    setEditSaving(true); setEditError(null);

    const { error: err } = await supabase.from("players").update({
      first_name: editFirstName.trim(),
      last_name: editLastName.trim(),
      name: `${editFirstName.trim()} ${editLastName.trim()}`,
      age_group: editYear,
    }).eq("id", editPlayer.id);

    if (err) { setEditError(err.message); setEditSaving(false); return; }

    setPlayers((prev) => prev.map((p) =>
      p.id === editPlayer.id
        ? { ...p, first_name: editFirstName.trim(), last_name: editLastName.trim(), name: `${editFirstName.trim()} ${editLastName.trim()}`, age_group: editYear }
        : p
    ));
    setEditSaving(false);
    setEditPlayer(null);
  }

  async function handleEditPhoto(file: File): Promise<string | null> {
    if (!editPlayer || !profile) return null;
    const url = await uploadPlayerPhoto(supabase, profile.id, editPlayer.id, file);
    if (url) {
      setPlayers((prev) => prev.map((p) => (p.id === editPlayer.id ? { ...p, avatar_url: url } : p)));
      setEditPlayer((prev) => (prev ? { ...prev, avatar_url: url } : null));
    }
    return url;
  }

  // ── Add player ───────────────────────────────────────────

  function openAdd() {
    setNewFirstName(""); setNewLastName(""); setNewYear("Y3");
    setNewPlayerId(null); setAddError(null); setAddOpen(true);
  }

  async function handleSaveAdd() {
    if (!newFirstName.trim() || !newLastName.trim()) { setAddError("Both names required."); return; }
    setAddSaving(true); setAddError(null);

    const { data, error: err } = await supabase.from("players").insert({
      parent_id: profile!.id,
      first_name: newFirstName.trim(),
      last_name: newLastName.trim(),
      name: `${newFirstName.trim()} ${newLastName.trim()}`,
      age_group: newYear,
    }).select("id, first_name, last_name, name, age_group, avatar_url").single<Player>();

    if (err) { setAddError(err.message); setAddSaving(false); return; }
    if (data) { setNewPlayerId(data.id); setPlayers((prev) => [...prev, data]); }
    setAddSaving(false);
  }

  // ── Render ───────────────────────────────────────────────

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
    <div className="px-4 py-5 space-y-6">
      <h2 className="text-xl font-extrabold tracking-tight text-foreground">
        My Account
      </h2>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ── Profile section ───────────────────────────── */}
      <Card className="rounded-2xl shadow-md">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-black">My Details</CardTitle>
            {profile?.role && (
              <Badge className="bg-cricket text-white text-xs font-semibold">
                {profile.role === "parent" ? "Parent" : profile.role === "coach" ? "Coach" : profile.role}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Full Name</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-12" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mobile</Label>
            <Input type="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} className="h-12" />
          </div>
          <button
            onClick={handleSaveProfile}
            disabled={saving}
            className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-cricket px-6 text-base font-bold text-cricket-foreground shadow-md transition-opacity active:opacity-80 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Update Details"}
          </button>
          {saved && <p className="text-center text-sm font-medium text-cricket">Saved!</p>}
        </CardContent>
      </Card>

      {/* ── Players section ───────────────────────────── */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-extrabold tracking-tight text-foreground">
          My Players <span className="text-muted-foreground font-normal text-sm ml-1">{players.length}</span>
        </h3>
        <button
          onClick={openAdd}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-cricket px-4 text-sm font-bold text-cricket-foreground active:opacity-80 transition-opacity"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add
        </button>
      </div>

      {players.length === 0 ? (
        <Card className="rounded-2xl shadow-md">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No players registered yet.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {players.map((player) => (
            <Card
              key={player.id}
              className="rounded-2xl shadow-md cursor-pointer active:scale-[0.98] transition-transform"
              onClick={() => openEdit(player)}
            >
              <CardContent className="flex items-center gap-4 px-5 py-4">
                {player.avatar_url ? (
                  <img
                    src={player.avatar_url}
                    alt={`${player.first_name} ${player.last_name}`}
                    className="h-14 w-14 shrink-0 rounded-full object-cover ring-2 ring-border"
                  />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-cricket text-cricket-foreground text-lg font-black ring-2 ring-border">
                    {player.first_name?.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-base font-extrabold tracking-tight text-foreground truncate">
                    {player.first_name} {player.last_name}
                  </p>
                  <Badge variant="secondary" className="mt-1 bg-cricket-light text-cricket font-semibold">
                    {player.age_group}
                  </Badge>
                </div>
                <svg className="h-4 w-4 shrink-0 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Edit Player Dialog ────────────────────────── */}
      <Dialog open={!!editPlayer} onOpenChange={(open) => { if (!open) setEditPlayer(null); }}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-extrabold tracking-tight">Edit Player</DialogTitle>
          </DialogHeader>
          {editError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{editError}</div>
          )}
          {editPlayer && (
            <div className="space-y-5">
              <div className="flex flex-col items-center gap-2">
                <AvatarUpload size={96} currentUrl={editPlayer.avatar_url} onUpload={handleEditPhoto} />
                <p className="text-xs text-muted-foreground">Tap to change photo</p>
              </div>
              <div className="flex gap-2">
                <div className="flex-1 space-y-1.5">
                  <Label>First Name</Label>
                  <Input value={editFirstName} onChange={(e) => setEditFirstName(e.target.value)} className="h-12" />
                </div>
                <div className="flex-1 space-y-1.5">
                  <Label>Last Name</Label>
                  <Input value={editLastName} onChange={(e) => setEditLastName(e.target.value)} className="h-12" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>School Year</Label>
                <Select value={editYear} onValueChange={(v) => setEditYear((v ?? "Y3") as SchoolYear)}>
                  <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SCHOOL_YEARS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <button onClick={handleSaveEdit} disabled={editSaving} className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-cricket px-6 text-base font-bold text-cricket-foreground shadow-md transition-opacity active:opacity-80 disabled:opacity-60">
                {editSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Add Player Dialog ─────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-extrabold tracking-tight">
              {newPlayerId ? "Add Photo" : "Add Player"}
            </DialogTitle>
          </DialogHeader>
          {addError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{addError}</div>
          )}
          {newPlayerId ? (
            <div className="flex flex-col items-center gap-4 py-4">
              <AvatarUpload
                size={96}
                onUpload={async (file) => {
                  const url = await uploadPlayerPhoto(supabase, profile!.id, newPlayerId, file);
                  if (url) setPlayers((prev) => prev.map((p) => (p.id === newPlayerId ? { ...p, avatar_url: url } : p)));
                  return url;
                }}
              />
              <p className="text-sm text-muted-foreground">Tap to add a photo (optional)</p>
              <button onClick={() => { setAddOpen(false); setNewPlayerId(null); }} className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-cricket px-6 text-base font-bold text-cricket-foreground shadow-md transition-opacity active:opacity-80">
                Done
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex gap-2">
                <div className="flex-1 space-y-1.5">
                  <Label>First Name</Label>
                  <Input placeholder="First" value={newFirstName} onChange={(e) => setNewFirstName(e.target.value)} className="h-12" />
                </div>
                <div className="flex-1 space-y-1.5">
                  <Label>Last Name</Label>
                  <Input placeholder="Last" value={newLastName} onChange={(e) => setNewLastName(e.target.value)} className="h-12" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>School Year</Label>
                <Select value={newYear} onValueChange={(v) => setNewYear((v ?? "Y3") as SchoolYear)}>
                  <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SCHOOL_YEARS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <button onClick={handleSaveAdd} disabled={addSaving} className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-cricket px-6 text-base font-bold text-cricket-foreground shadow-md transition-opacity active:opacity-80 disabled:opacity-60">
                {addSaving ? "Saving..." : "Save & Add Photo"}
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
