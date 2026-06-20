"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Profile {
  id: string;
  role: string;
  full_name: string;
  mobile_number: string;
}

interface Team {
  id: string;
  name: string;
}

interface Player {
  id: string;
  first_name: string;
  last_name: string;
  age_group: string;
  avatar_url: string | null;
  parent_id: string | null;
}

interface ParentContact {
  id: string;
  full_name: string;
  mobile_number: string;
}

export default function HomePage() {
  const supabase = getSupabaseBrowserClient();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [mentorTeam, setMentorTeam] = useState<Team | null | "loading">("loading");
  const [loading, setLoading] = useState(true);

  // Mentor roster state
  const [teamPlayers, setTeamPlayers] = useState<Player[]>([]);
  const [parentContacts, setParentContacts] = useState<ParentContact[]>([]);
  const [pendingMatchId, setPendingMatchId] = useState<string | null | "none">("none");

  // Mentor profile edit
  const [fullName, setFullName] = useState("");
  const [mobile, setMobile] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("profiles")
        .select("id, role, full_name, mobile_number")
        .eq("id", user.id)
        .single<Profile>();

      if (data) {
        setProfile(data);
        setFullName(data.full_name);
        setMobile(data.mobile_number);

        // If mentor, fetch their team and related data
        if (data.role === "mentor") {
          const { data: team } = await supabase
            .from("teams")
            .select("id, name")
            .eq("mentor_id", user.id)
            .limit(1)
            .single<Team>();
          setMentorTeam(team ?? null);

          if (team) {
            // Fetch team players
            const { data: players } = await supabase
              .from("players")
              .select("id, first_name, last_name, age_group, avatar_url, parent_id")
              .eq("team_id", team.id);

            if (players && players.length > 0) {
              setTeamPlayers(players);

              // Fetch parent contacts for those players
              const parentIds = players
                .map((p: Player) => p.parent_id)
                .filter((id): id is string => id !== null);

              if (parentIds.length > 0) {
                const { data: contacts } = await supabase
                  .from("profiles")
                  .select("id, full_name, mobile_number")
                  .in("id", parentIds);
                setParentContacts(contacts ?? []);
              }
            }

            // Fetch first pending match for this team
            const { data: match } = await supabase
              .from("matches")
              .select("id")
              .or(`team_a_id.eq.${team.id},team_b_id.eq.${team.id}`)
              .eq("status", false)
              .order("scheduled_time", { ascending: true })
              .limit(1)
              .single();

            setPendingMatchId(match ? match.id : null);
          } else {
            setPendingMatchId(null);
          }
        }
      }
      setLoading(false);
    }
    load();
  }, [supabase]);

  async function handleSaveMentorProfile() {
    if (!profile || !fullName.trim() || !mobile.trim()) return;
    setSaving(true); setSaved(false);
    await supabase.from("profiles").update({
      full_name: fullName.trim(),
      mobile_number: mobile.trim(),
    }).eq("id", profile.id);
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const role = profile?.role;
  const isAdmin = role === "superadmin" || role === "coach";
  const isMentor = role === "mentor";

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

  // ── Mentor view ──────────────────────────────────────────

  if (isMentor) {
    const teamId = mentorTeam && mentorTeam !== "loading" ? mentorTeam.id : null;

    return (
      <div className="px-4 py-5 space-y-5">
        <h2 className="text-xl font-extrabold tracking-tight text-foreground">
          Home
        </h2>

        {/* My Team */}
        <Card className="rounded-2xl shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-black">My Team</CardTitle>
          </CardHeader>
          <CardContent>
            {mentorTeam === "loading" ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : mentorTeam ? (
              <p className="text-2xl font-extrabold text-foreground">{mentorTeam.name}</p>
            ) : (
              <p className="text-sm text-muted-foreground">Not assigned yet</p>
            )}
          </CardContent>
        </Card>

        {/* Live Scorer button */}
        {teamId && (
          pendingMatchId === "none" ? (
            /* still loading match */ null
          ) : pendingMatchId ? (
            <Link href={`/score/${pendingMatchId}`}>
              <button className="inline-flex h-16 w-full items-center justify-center rounded-2xl bg-cricket px-6 text-lg font-black text-cricket-foreground shadow-md transition-opacity active:opacity-80">
                Live Scorer
              </button>
            </Link>
          ) : (
            <button
              disabled
              className="inline-flex h-16 w-full items-center justify-center rounded-2xl bg-muted px-6 text-lg font-black text-muted-foreground shadow-md cursor-not-allowed"
            >
              No matches scheduled
            </button>
          )
        )}

        {/* Team Roster */}
        {teamPlayers.length > 0 && (
          <Card className="rounded-2xl shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-black">Team Roster</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {teamPlayers.slice(0, 4).map((player) => {
                const parent = parentContacts.find((c) => c.id === player.parent_id);
                return (
                  <div key={player.id} className="flex items-start gap-3">
                    {/* Avatar */}
                    {player.avatar_url ? (
                      <img
                        src={player.avatar_url}
                        alt={player.first_name}
                        className="h-12 w-12 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <span className="text-base font-extrabold text-muted-foreground">
                          {player.first_name.charAt(0)}
                        </span>
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-foreground leading-tight">
                          {player.first_name} {player.last_name}
                        </span>
                        <Badge className="bg-cricket/10 text-cricket text-xs font-semibold border-0">
                          {player.age_group}
                        </Badge>
                      </div>
                      {/* Emergency contact */}
                      {parent && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {parent.full_name} &middot; {parent.mobile_number}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* My Details */}
        <Card className="rounded-2xl shadow-md">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-black">My Details</CardTitle>
              <Badge className="bg-cricket text-white text-xs font-semibold">Mentor</Badge>
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
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email</Label>
              <p className="text-sm text-muted-foreground">Managed via login — contact an organiser to change.</p>
            </div>
            <button
              onClick={handleSaveMentorProfile}
              disabled={saving}
              className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-cricket px-6 text-base font-bold text-cricket-foreground shadow-md transition-opacity active:opacity-80 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Update Details"}
            </button>
            {saved && <p className="text-center text-sm font-medium text-cricket">Saved!</p>}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Parent / Admin view ──────────────────────────────────

  return (
    <div className="px-4 py-5 space-y-4">
      <h2 className="text-xl font-extrabold tracking-tight text-foreground">
        Home
      </h2>

      <div className="flex flex-col gap-3">
        {/* Competition Dashboard */}
        <NavCard
          href="/competitions"
          borderColour="border-l-amber-500"
          iconColour="text-amber-500"
          icon={<path strokeLinecap="round" strokeLinejoin="round" d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />}
          title="Competition Dashboard"
          subtitle="Scores, standings & fixtures"
        />

        {/* My Profile */}
        <NavCard
          href="/dashboard"
          borderColour="border-l-blue-500"
          iconColour="text-blue-500"
          icon={<path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />}
          title="My Profile"
          subtitle="Players, profile & contact details"
        />

        {/* Admin section */}
        {isAdmin && (
          <>
            <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground pt-2">
              Admin
            </h3>

            <NavCard
              href="/admin/tournaments"
              borderColour="border-l-cricket"
              iconColour="text-cricket"
              icon={<path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />}
              title="Tournament Setup"
              subtitle="Create tournaments, manage teams & players"
            />

            <NavCard
              href="/admin/settings"
              borderColour="border-l-gray-400"
              iconColour="text-gray-400"
              icon={<path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />}
              title="Settings"
              subtitle="Export players, import teams, data management"
            />
          </>
        )}
      </div>
    </div>
  );
}

function NavCard({
  href,
  borderColour,
  iconColour,
  icon,
  title,
  subtitle,
}: {
  href: string;
  borderColour: string;
  iconColour: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <Link href={href}>
      <Card className={`rounded-2xl shadow-md cursor-pointer active:scale-[0.98] transition-transform border-l-[4px] ${borderColour}`}>
        <CardContent className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <svg className={`h-6 w-6 ${iconColour}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              {icon}
            </svg>
            <div>
              <p className="font-extrabold tracking-tight text-foreground leading-tight">
                {title}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {subtitle}
              </p>
            </div>
          </div>
          <span className="text-sm font-bold text-muted-foreground">→</span>
        </CardContent>
      </Card>
    </Link>
  );
}
