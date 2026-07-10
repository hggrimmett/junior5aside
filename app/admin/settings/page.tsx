"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

// Convert stored UTC ISO ("2026-07-12T08:00:00Z") to a value usable in
// <input type="datetime-local"> ("2026-07-12T09:00" in local time).
function utcIsoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToUtcIso(local: string): string {
  return new Date(local).toISOString();
}

// ── Types ──────────────────────────────────────────────────

interface Counts {
  players: number;
  parents: number;
  mentors: number;
  coaches: number;
  matches: number;
}

// ── Page ───────────────────────────────────────────────────

export default function AdminSettingsPage() {
  const supabase = getSupabaseBrowserClient();

  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [counts, setCounts] = useState<Counts>({ players: 0, parents: 0, mentors: 0, coaches: 0, matches: 0 });
  const [loading, setLoading] = useState(true);
  const [purging, setPurging] = useState(false);
  const [purgeConfirm, setPurgeConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [purgingTeams, setPurgingTeams] = useState(false);
  const [purgeTeamsConfirm, setPurgeTeamsConfirm] = useState(false);

  const [published, setPublished] = useState<boolean>(false);
  const [publishSaving, setPublishSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [deadline, setDeadline] = useState<Date | null>(null);
  const [deadlineSaving, setDeadlineSaving] = useState(false);
  const [closeConfirm, setCloseConfirm] = useState(false);

  const [downloading, setDownloading] = useState(false);

  const [scheduleStart, setScheduleStart] = useState<string>("");
  const [scheduleLunch, setScheduleLunch] = useState<string>("");
  const [scheduleSaving, setScheduleSaving] = useState(false);

  // ── Auth guard ──────────────────────────────────────────

  useEffect(() => {
    async function checkRole() {
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

      if (profile?.role === "superadmin") {
        setAuthorized(true);
      } else {
        window.location.href = "/dashboard";
      }
    }
    checkRole();
  }, [supabase]);

  // ── Fetch counts ─────────────────────────────────────────

  const fetchCounts = useCallback(async () => {
    const [playersRes, parentsRes, mentorsRes, coachesRes, matchesRes, scheduleRes] = await Promise.all([
      supabase.from("players").select("id", { count: "exact", head: true }),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "parent"),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "mentor"),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "coach"),
      supabase.from("matches").select("id", { count: "exact", head: true }),
      supabase
        .from("settings")
        .select("key, value")
        .in("key", ["registration_deadline", "competition_start_time", "competition_lunch_start", "teams_published"]),
    ]);

    setCounts({
      players: playersRes.count ?? 0,
      parents: parentsRes.count ?? 0,
      mentors: mentorsRes.count ?? 0,
      coaches: coachesRes.count ?? 0,
      matches: matchesRes.count ?? 0,
    });
    const settingsMap = new Map((scheduleRes.data ?? []).map((s) => [s.key, s.value]));
    const dl = settingsMap.get("registration_deadline");
    if (dl) setDeadline(new Date(dl));
    const start = settingsMap.get("competition_start_time");
    if (start) setScheduleStart(utcIsoToLocalInput(start));
    const lunch = settingsMap.get("competition_lunch_start");
    if (lunch) setScheduleLunch(utcIsoToLocalInput(lunch));
    setPublished(settingsMap.get("teams_published") === "true");
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  // ── GDPR Purge ───────────────────────────────────────────

  async function handlePurge() {
    setPurging(true);
    setError(null);

    // 1. Delete all players
    const { error: playersErr } = await supabase
      .from("players")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000"); // match all rows

    if (playersErr) {
      setError(`Players delete failed: ${playersErr.message}`);
      setPurging(false);
      return;
    }

    // 2. Anonymize teams: remove mentor links
    const { error: teamsErr } = await supabase
      .from("teams")
      .update({ mentor_id: null })
      .neq("id", "00000000-0000-0000-0000-000000000000");

    if (teamsErr) {
      setError(`Teams anonymize failed: ${teamsErr.message}`);
      setPurging(false);
      return;
    }

    // 3. Delete non-superadmin profiles
    const { error: profilesErr } = await supabase
      .from("profiles")
      .delete()
      .neq("role", "superadmin");

    if (profilesErr) {
      setError(`Profiles delete failed: ${profilesErr.message}`);
      setPurging(false);
      return;
    }

    setPurging(false);
    setPurgeConfirm(false);
    showToast("Tournament data purged. Matches & teams retained (anonymized).");
    fetchCounts();
  }


  // ── Registration deadline ────────────────────────────────

  async function updateDeadline(newValue: string, successMsg: string) {
    setDeadlineSaving(true);
    setError(null);
    const { error: updateErr } = await supabase
      .from("settings")
      .update({ value: newValue })
      .eq("key", "registration_deadline");
    setDeadlineSaving(false);
    if (updateErr) {
      setError(`Deadline update failed: ${updateErr.message}`);
      return;
    }
    setDeadline(new Date(newValue));
    setCloseConfirm(false);
    showToast(successMsg);
  }

  async function handleCloseEntries() {
    await updateDeadline(new Date().toISOString(), "Registration closed.");
  }

  async function handleReopenEntries() {
    await updateDeadline("2026-07-10T22:59:00Z", "Registration reopened until 10 Jul.");
  }

  // ── Schedule ─────────────────────────────────────────────

  async function handleSaveSchedule() {
    setScheduleSaving(true);
    setError(null);
    const updates: { key: string; value: string }[] = [];
    if (scheduleStart) updates.push({ key: "competition_start_time", value: localInputToUtcIso(scheduleStart) });
    if (scheduleLunch) updates.push({ key: "competition_lunch_start", value: localInputToUtcIso(scheduleLunch) });

    for (const u of updates) {
      const { error: e } = await supabase.from("settings").update({ value: u.value }).eq("key", u.key);
      if (e) {
        setError(`Schedule save failed (${u.key}): ${e.message}`);
        setScheduleSaving(false);
        return;
      }
    }
    setScheduleSaving(false);
    showToast("Schedule saved. Regenerate fixtures to apply.");
  }

  // ── CSV backup ───────────────────────────────────────────

  function downloadCsv(filename: string, rows: string[][]) {
    const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleDownloadBackup() {
    setDownloading(true);
    setError(null);

    const [profilesRes, playersRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, role, full_name, email, mobile_number, created_at")
        .in("role", ["parent", "mentor"])
        .order("created_at", { ascending: true }),
      supabase
        .from("players")
        .select("id, parent_id, first_name, last_name, name, age_group, avatar_url, created_at, teams(name)")
        .order("created_at", { ascending: true }),
    ]);

    if (profilesRes.error) {
      setError(`Profiles fetch failed: ${profilesRes.error.message}`);
      setDownloading(false);
      return;
    }
    if (playersRes.error) {
      setError(`Players fetch failed: ${playersRes.error.message}`);
      setDownloading(false);
      return;
    }

    const profiles = profilesRes.data ?? [];
    const players = playersRes.data ?? [];
    const parentsById = new Map(profiles.filter((p) => p.role === "parent").map((p) => [p.id, p]));

    const rows: string[][] = [[
      "Role", "First name", "Last name", "Email", "Mobile",
      "School year", "Team", "Parent name", "Parent email", "Photo URL", "Registered",
    ]];

    // Parents & mentors
    for (const p of profiles) {
      const [first, ...rest] = (p.full_name ?? "").trim().split(/\s+/);
      const last = rest.join(" ");
      rows.push([
        p.role ?? "", first ?? "", last ?? "", p.email ?? "", p.mobile_number ?? "",
        "", "", "", "", "", p.created_at ?? "",
      ]);
    }

    // Kids
    for (const kid of players) {
      const team = Array.isArray(kid.teams) ? kid.teams[0] : kid.teams;
      const parent = parentsById.get(kid.parent_id);
      const fallback = (kid.name ?? "").trim().split(/\s+/);
      const first = kid.first_name ?? fallback[0] ?? "";
      const last = kid.last_name ?? fallback.slice(1).join(" ");
      rows.push([
        "kid", first, last, "", "",
        kid.age_group ?? "", team?.name ?? "",
        parent?.full_name ?? (parent ? "" : "[orphan]"),
        parent?.email ?? "",
        kid.avatar_url ?? "",
        kid.created_at ?? "",
      ]);
    }

    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`junior5aside-backup-${stamp}.csv`, rows);
    setDownloading(false);
    showToast(`Downloaded ${rows.length - 1} rows.`);
  }

  // ── Publish toggle ───────────────────────────────────────

  async function handleTogglePublish() {
    setPublishSaving(true);
    setError(null);
    const nextValue = published ? "false" : "true";
    const { error: upErr } = await supabase
      .from("settings")
      .upsert({ key: "teams_published", value: nextValue }, { onConflict: "key" });
    setPublishSaving(false);
    if (upErr) {
      setError(`Publish toggle failed: ${upErr.message}`);
      return;
    }
    setPublished(nextValue === "true");
    showToast(nextValue === "true" ? "Published — parents can now see teams." : "Unpublished — teams hidden from parents.");
  }

  // ── Purge all teams (keep players + profiles) ───────────

  async function handlePurgeTeams() {
    setPurgingTeams(true);
    setError(null);
    // Deleting a team cascades players.team_id → NULL via FK ON DELETE SET NULL.
    const { error: delErr } = await supabase
      .from("teams")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    setPurgingTeams(false);
    if (delErr) {
      setError(`Purge teams failed: ${delErr.message}`);
      return;
    }
    setPurgeTeamsConfirm(false);
    showToast("All teams purged. Players unassigned, profiles kept.");
    fetchCounts();
  }

  // ── Reset all match results (keep structure) ────────────

  async function handleResetResults() {
    setResetting(true);
    setError(null);

    // Wipe every match_event
    const { error: eventsErr } = await supabase
      .from("match_events")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    if (eventsErr) {
      setError(`Reset failed (events): ${eventsErr.message}`);
      setResetting(false);
      return;
    }

    // Zero every match: scores/wickets/status back to 0, and drop any lock
    const { error: matchesErr } = await supabase
      .from("matches")
      .update({
        score_a: 0,
        score_b: 0,
        wickets_a: 0,
        wickets_b: 0,
        status: false,
        locked_by: null,
        locked_by_name: null,
        locked_at: null,
      })
      .neq("id", "00000000-0000-0000-0000-000000000000");
    if (matchesErr) {
      setError(`Reset failed (matches): ${matchesErr.message}`);
      setResetting(false);
      return;
    }

    setResetting(false);
    setResetConfirm(false);
    showToast("Results reset. Fixtures and teams kept.");
    fetchCounts();
  }

  // ── Toast helper ─────────────────────────────────────────

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  // ── Render ───────────────────────────────────────────────

  if (!authorized) {
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
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-md px-4 py-6 space-y-5">
        {/* Error */}
        {error && (
          <Card className="rounded-2xl border-destructive/50 bg-destructive/5">
            <CardContent className="pt-4 pb-4 text-sm text-destructive">{error}</CardContent>
          </Card>
        )}

        {/* ── Stat cards ──────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Players" value={counts.players} loading={loading} href="/admin/players" />
          <StatCard label="Parents" value={counts.parents} loading={loading} href="/admin/parents" />
          <StatCard label="Mentors" value={counts.mentors} loading={loading} href="/admin/mentors" />
          <StatCard label="Coaches" value={counts.coaches} loading={loading} href="/admin/coaches" />
          <StatCard label="Matches" value={counts.matches} loading={loading} />
        </div>

        {/* ── Publish card ─────────────────────────────── */}
        <Card className={`rounded-2xl shadow-md ${published ? "border-emerald-300" : "border-amber-300"}`}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-black">
              Public visibility
            </CardTitle>
            <CardDescription className="text-sm">
              Controls whether parents can see teams, fixtures, and standings.
              Superadmins, coaches, and mentors always see everything.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-3">
            <Separator />
            <div
              className={`rounded-xl border px-4 py-3 text-sm ${
                published
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-amber-200 bg-amber-50 text-amber-800"
              }`}
            >
              <p className="font-bold">
                {published ? "PUBLISHED — parents can see everything" : "HIDDEN — parents see 'Coming soon'"}
              </p>
            </div>
            <Button
              onClick={handleTogglePublish}
              disabled={publishSaving}
              className={`h-12 w-full rounded-xl font-bold gap-2 ${
                published
                  ? "bg-amber-600 hover:bg-amber-700 text-white"
                  : "bg-emerald-600 hover:bg-emerald-700 text-white"
              }`}
            >
              {publishSaving ? <><Spinner />Saving...</> : (published ? "Unpublish (hide from parents)" : "Publish (make visible to parents)")}
            </Button>
          </CardContent>
        </Card>

        {/* ── Schedule card ────────────────────────────── */}
        <Card className="rounded-2xl shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-black">Schedule</CardTitle>
            <CardDescription className="text-sm">
              Global competition start and lunch break. Each match is 25 min back-to-back.
              Any match starting at/after the lunch time gets pushed by 30 min.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-3">
            <Separator />
            <div className="space-y-1.5">
              <Label htmlFor="sched-start" className="text-xs font-bold uppercase tracking-wider">
                Competition start
              </Label>
              <Input
                id="sched-start"
                type="datetime-local"
                value={scheduleStart}
                onChange={(e) => setScheduleStart(e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sched-lunch" className="text-xs font-bold uppercase tracking-wider">
                Lunch start (30 min)
              </Label>
              <Input
                id="sched-lunch"
                type="datetime-local"
                value={scheduleLunch}
                onChange={(e) => setScheduleLunch(e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>
            <Button
              onClick={handleSaveSchedule}
              disabled={scheduleSaving || (!scheduleStart && !scheduleLunch)}
              className="h-12 w-full rounded-xl font-bold gap-2"
            >
              {scheduleSaving ? <><Spinner />Saving...</> : "Save schedule"}
            </Button>
            <p className="text-xs text-muted-foreground leading-relaxed">
              After saving, go to <code>/admin/tournaments</code> and re-run <strong>Generate Fixtures</strong> on each tournament for the times to apply.
            </p>
          </CardContent>
        </Card>

        {/* ── Registration entries card ────────────────── */}
        <Card className="rounded-2xl shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-black">Registration entries</CardTitle>
            <CardDescription className="text-sm">
              Controls whether parents can register new players on{" "}
              <code className="text-xs">/register</code>.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <Separator />

            {/* Status badge */}
            {deadline ? (
              <div
                className={`rounded-xl border px-4 py-3 text-sm ${
                  new Date() > deadline
                    ? "border-destructive/30 bg-destructive/5 text-destructive"
                    : "border-emerald-200 bg-emerald-50 text-emerald-800"
                }`}
              >
                <p className="font-bold">
                  {new Date() > deadline ? "Registration is CLOSED" : "Registration is OPEN"}
                </p>
                <p className="mt-0.5 text-xs opacity-80">
                  Deadline:{" "}
                  {deadline.toLocaleString("en-GB", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            ) : (
              <div className="h-16 animate-pulse rounded-xl bg-muted" />
            )}

            {deadline && new Date() > deadline ? (
              <Button
                variant="outline"
                onClick={handleReopenEntries}
                disabled={deadlineSaving}
                className="h-12 w-full rounded-xl font-bold gap-2"
              >
                {deadlineSaving ? <><Spinner />Saving...</> : "Reopen entries (until 10 Jul)"}
              </Button>
            ) : !closeConfirm ? (
              <Button
                variant="outline"
                onClick={() => setCloseConfirm(true)}
                disabled={!deadline}
                className="h-12 w-full rounded-xl font-bold"
              >
                Close entries now
              </Button>
            ) : (
              <div className="space-y-2">
                <Button
                  variant="destructive"
                  onClick={handleCloseEntries}
                  disabled={deadlineSaving}
                  className="h-12 w-full rounded-xl font-bold gap-2"
                >
                  {deadlineSaving ? <><Spinner />Closing...</> : "Confirm — close entries"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setCloseConfirm(false)}
                  disabled={deadlineSaving}
                  className="h-12 w-full rounded-xl"
                >
                  Cancel
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Backup card ──────────────────────────────── */}
        <Card className="rounded-2xl shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-black">Backup</CardTitle>
            <CardDescription className="text-sm">
              Download local CSV copies of everything. Recommended before closing entries or resetting.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-3">
            <Separator />
            <p className="text-xs text-muted-foreground leading-relaxed">
              One flat CSV with a <strong>Role</strong> column (parent, mentor, kid).
              Kids include school year, team, and parent name — so you can sort/filter to allocate them to competitions.
            </p>
            <Button
              variant="outline"
              onClick={handleDownloadBackup}
              disabled={downloading}
              className="h-12 w-full rounded-xl font-bold gap-2"
            >
              {downloading ? <><Spinner />Preparing...</> : "Download full backup CSV"}
            </Button>
          </CardContent>
        </Card>

        {/* ── Purge teams card ─────────────────────────── */}
        <Card className="rounded-2xl shadow-md border-amber-300">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-black text-amber-800">
              Purge all teams
            </CardTitle>
            <CardDescription className="text-sm">
              Wipes every team row (including empty vestigial ones from previous
              uploads). Players stay — they just fall back to Unassigned in the
              balancer. Tournaments, parents, mentors, and coaches are untouched.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <Separator />
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 leading-relaxed space-y-1">
              <p className="font-bold">This action will:</p>
              <ul className="list-disc pl-5 space-y-0.5">
                <li>Delete every row in <strong>teams</strong></li>
                <li>Set every player&apos;s <strong>team_id</strong> to NULL (via FK cascade)</li>
                <li>Leave tournaments, players, parents, mentors, coaches untouched</li>
                <li>Also drops any fixtures/matches (they reference teams)</li>
              </ul>
            </div>

            {!purgeTeamsConfirm ? (
              <Button
                variant="outline"
                onClick={() => setPurgeTeamsConfirm(true)}
                className="h-12 w-full rounded-xl border-amber-400 text-amber-800 hover:bg-amber-50 font-bold"
              >
                Purge all teams...
              </Button>
            ) : (
              <div className="space-y-2">
                <Button
                  onClick={handlePurgeTeams}
                  disabled={purgingTeams}
                  className="h-12 w-full rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold gap-2"
                >
                  {purgingTeams ? <><Spinner />Purging...</> : "Confirm purge"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setPurgeTeamsConfirm(false)}
                  disabled={purgingTeams}
                  className="h-12 w-full rounded-xl"
                >
                  Cancel
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Reset match results card ──────────────────── */}
        <Card className="rounded-2xl shadow-md border-amber-300">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-black text-amber-800">
              Reset match results
            </CardTitle>
            <CardDescription className="text-sm">
              Wipes every score, wicket, and ball-by-ball event. Keeps tournaments,
              teams, mentors, players, and the fixture list. Use this after test
              scoring runs to get a clean slate.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <Separator />
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 leading-relaxed space-y-1">
              <p className="font-bold">This action will:</p>
              <ul className="list-disc pl-5 space-y-0.5">
                <li>Delete every row in <strong>match_events</strong></li>
                <li>Reset every match&apos;s score/wickets to 0, status back to unplayed</li>
                <li>Clear any live scorer locks</li>
                <li>Leave tournaments, teams, mentors, players untouched</li>
              </ul>
            </div>

            {!resetConfirm ? (
              <Button
                variant="outline"
                onClick={() => setResetConfirm(true)}
                className="h-12 w-full rounded-xl border-amber-400 text-amber-800 hover:bg-amber-50 font-bold"
              >
                Reset all match results...
              </Button>
            ) : (
              <div className="space-y-2">
                <Button
                  onClick={handleResetResults}
                  disabled={resetting}
                  className="h-12 w-full rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold gap-2"
                >
                  {resetting ? <><Spinner />Resetting...</> : "Confirm reset"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setResetConfirm(false)}
                  disabled={resetting}
                  className="h-12 w-full rounded-xl"
                >
                  Cancel
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── GDPR Purge card ──────────────────────────── */}
        <Card className="rounded-2xl shadow-md border-2 border-destructive/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-black text-destructive">
              Tournament Reset &amp; GDPR Purge
            </CardTitle>
            <CardDescription className="text-sm">
              Permanently deletes all player and non-superadmin profile data.
              Matches and teams are retained but anonymized.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <Separator />

            {/* Warning list */}
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 space-y-2">
              <p className="text-sm font-bold text-amber-800">This action will:</p>
              <ul className="list-disc pl-5 text-xs text-amber-700 space-y-1 leading-relaxed">
                <li>Delete all rows from the <strong>players</strong> table</li>
                <li>Delete all <strong>parent</strong> and <strong>mentor</strong> profiles</li>
                <li>Set <strong>mentor_id = null</strong> on all teams</li>
                <li>Retain all matches, teams, and tournament structure</li>
                <li>Admin profiles are <strong>not</strong> affected</li>
              </ul>
            </div>

            {!purgeConfirm ? (
              <Button
                variant="outline"
                onClick={() => setPurgeConfirm(true)}
                className="h-12 w-full rounded-xl border-destructive/50 text-destructive hover:bg-destructive/5 hover:text-destructive font-bold"
              >
                Begin Tournament Reset...
              </Button>
            ) : (
              <div className="space-y-2">
                <Button
                  variant="destructive"
                  onClick={handlePurge}
                  disabled={purging}
                  className="h-12 w-full rounded-xl font-bold gap-2"
                >
                  {purging ? (
                    <>
                      <Spinner />
                      Purging...
                    </>
                  ) : (
                    "Confirm Purge — Cannot Be Undone"
                  )}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setPurgeConfirm(false)}
                  disabled={purging}
                  className="h-12 w-full rounded-xl"
                >
                  Cancel
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-2xl bg-emerald-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────

function StatCard({
  label,
  value,
  loading,
  href,
}: {
  label: string;
  value: number;
  loading: boolean;
  href?: string;
}) {
  const inner = (
    <Card className="rounded-2xl shadow-md transition-shadow hover:shadow-lg">
      <CardContent className="pt-5 pb-4 text-center px-2">
        {loading ? (
          <div className="mx-auto h-9 w-10 animate-pulse rounded bg-muted" />
        ) : (
          <p className="text-4xl font-black tabular-nums">{value}</p>
        )}
        <p className="mt-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground leading-tight">
          {label}
        </p>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

// ── CSV helper ─────────────────────────────────────────────

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
