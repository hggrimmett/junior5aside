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
  mobile_number: string | null;
}

interface MentorMatch {
  id: string;
  opponent_name: string;
  scheduled_time: string | null;
  status: boolean;
  is_live: boolean;
  my_score: number | null;
  my_wickets: number | null;
  opponent_score: number | null;
  opponent_wickets: number | null;
  match_type: string | null;
}

interface Tournament {
  id: string;
  name: string;
  colour: "Blue" | "Red" | "Green";
}

const TOURNAMENT_STYLE: Record<string, { dot: string; text: string }> = {
  Blue: { dot: "bg-blue-500", text: "text-blue-700" },
  Red: { dot: "bg-red-500", text: "text-red-700" },
  Green: { dot: "bg-green-500", text: "text-green-700" },
};

function formatTime(iso: string | null): string {
  if (!iso) return "TBC";
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export default function HomePage() {
  const supabase = getSupabaseBrowserClient();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [mentorTeam, setMentorTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);

  // Mentor roster state
  const [teamPlayers, setTeamPlayers] = useState<Player[]>([]);
  const [parentContacts, setParentContacts] = useState<ParentContact[]>([]);
  const [mentorMatches, setMentorMatches] = useState<MentorMatch[]>([]);
  const [mentorTournament, setMentorTournament] = useState<Tournament | null>(null);
  const [hasLinkedKids, setHasLinkedKids] = useState(false);

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

        // Anyone (any role) might be assigned as a team's mentor. The
        // endpoint returns team=null if this user isn't in teams.mentor_id
        // for any team, so this is safe to call universally.
        const ctxRes = await fetch("/api/mentor/team-context");
        if (ctxRes.ok) {
          const ctx = (await ctxRes.json()) as {
            team: { id: string; name: string; tournament: Tournament | null } | null;
            players: Player[];
            parents: ParentContact[];
            matches: MentorMatch[];
          };
          if (ctx.team) {
            setMentorTeam({ id: ctx.team.id, name: ctx.team.name });
            setMentorTournament(ctx.team.tournament ?? null);
            setTeamPlayers(ctx.players);
            setParentContacts(ctx.parents);
            setMentorMatches(ctx.matches);
          } else {
            setMentorTeam(null);
          }
        } else {
          setMentorTeam(null);
        }

        // Anyone (any role) might have kids linked via players.parent_id.
        const { count: kidCount } = await supabase
          .from("players")
          .select("id", { count: "exact", head: true })
          .eq("parent_id", user.id);
        setHasLinkedKids((kidCount ?? 0) > 0);
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

  // ── Combined view — sections shown based on data relationships ──

  const isTeamMentor = !!mentorTeam;
  const tStyle = mentorTournament ? TOURNAMENT_STYLE[mentorTournament.colour] : null;

  if (isTeamMentor) {

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
            {mentorTeam ? (
              <div className="space-y-1">
                <p className="text-2xl font-extrabold text-foreground">{mentorTeam.name}</p>
                {mentorTournament && tStyle && (
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tStyle.dot}`} />
                    <p className={`text-sm font-bold ${tStyle.text}`}>{mentorTournament.name}</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Not assigned yet</p>
            )}
          </CardContent>
        </Card>

        {/* My Matches */}
        {mentorTeam && (
          <Card className="rounded-2xl shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-black">My Matches</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {mentorMatches.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No matches scheduled yet.</p>
              ) : (
                mentorMatches.map((m) => {
                  const label = m.match_type === "final" ? "Final" : m.match_type === "plate_final" ? "Plate" : null;
                  return (
                    <Link key={m.id} href={m.status ? `/match/${m.id}` : `/score/${m.id}`}>
                      <div className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5 active:bg-muted/50 transition-colors">
                        <div className="flex flex-col items-center shrink-0 w-14">
                          <p className="text-xs font-bold tabular-nums text-foreground leading-tight">
                            {formatTime(m.scheduled_time)}
                          </p>
                          {label && <p className="text-[9px] font-bold text-cricket uppercase tracking-wider mt-0.5">{label}</p>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-foreground truncate">
                            vs {m.opponent_name}
                          </p>
                          {m.status ? (
                            <p className="text-xs text-muted-foreground">
                              {m.my_score}/{m.my_wickets} — {m.opponent_score}/{m.opponent_wickets}
                            </p>
                          ) : m.is_live ? (
                            <p className="text-xs font-bold text-red-600">🔴 LIVE now</p>
                          ) : (
                            <p className="text-xs text-muted-foreground">Upcoming</p>
                          )}
                        </div>
                        <Badge
                          className={
                            m.status
                              ? "bg-emerald-100 text-emerald-800 border-0 text-[10px] font-bold"
                              : m.is_live
                              ? "bg-red-100 text-red-800 border-0 text-[10px] font-bold"
                              : "bg-cricket text-white border-0 text-[10px] font-bold"
                          }
                        >
                          {m.status ? "DONE" : m.is_live ? "SCORE" : "SCORE"}
                        </Badge>
                      </div>
                    </Link>
                  );
                })
              )}
            </CardContent>
          </Card>
        )}

        {/* Quick links */}
        <div className="grid grid-cols-2 gap-3">
          <Link href="/fixtures">
            <button className="w-full h-12 rounded-xl border-2 border-cricket bg-background text-sm font-bold text-cricket active:scale-[0.98] transition-transform">
              All Fixtures
            </button>
          </Link>
          <Link href="/standings">
            <button className="w-full h-12 rounded-xl border-2 border-cricket bg-background text-sm font-bold text-cricket active:scale-[0.98] transition-transform">
              Standings
            </button>
          </Link>
        </div>

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

        {/* Nav cards — mentors also want to reach these */}
        <NavCard
          href="/competitions"
          borderColour="border-l-amber-500"
          iconColour="text-amber-500"
          icon={<path strokeLinecap="round" strokeLinejoin="round" d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />}
          title="Competition Dashboard"
          subtitle="Scores, standings & fixtures"
        />
        {hasLinkedKids && (
          <NavCard
            href="/my-players"
            borderColour="border-l-emerald-500"
            iconColour="text-emerald-500"
            icon={<path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-4a4 4 0 11-8 0 4 4 0 018 0zm6 0a3 3 0 11-6 0 3 3 0 016 0z" />}
            title="My Kids"
            subtitle="Your linked players"
          />
        )}
        {isAdmin && (
          <>
            <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground pt-2">Admin</h3>
            <NavCard
              href="/admin/tournaments"
              borderColour="border-l-cricket"
              iconColour="text-cricket"
              icon={<path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />}
              title="Tournament Setup"
              subtitle="Balancer, fixtures, finals"
            />
            {role === "superadmin" && (
              <NavCard
                href="/admin/settings"
                borderColour="border-l-gray-400"
                iconColour="text-gray-500"
                icon={<path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />}
                title="Admin Settings"
                subtitle="People, schedule, publish, purge"
              />
            )}
          </>
        )}
      </div>
    );
  }

  // ── Non-mentor view (parent-only, coach, superadmin without a team) ──

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

        {/* WhatsApp group */}
        <a
          href="https://chat.whatsapp.com/J0wKOchPFeGJAbbVQZVmmD?s=cl&p=a&ilr=2"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 flex items-center justify-center gap-2 rounded-2xl bg-[#25D366] px-5 py-3 text-sm font-bold text-white shadow-md transition-opacity active:opacity-80"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M20.52 3.48A11.93 11.93 0 0012.04 0C5.47 0 .15 5.32.15 11.89c0 2.09.55 4.13 1.58 5.93L0 24l6.34-1.66a11.88 11.88 0 005.7 1.45h.01c6.57 0 11.89-5.32 11.9-11.89a11.83 11.83 0 00-3.43-8.42zM12.05 21.8a9.86 9.86 0 01-5.03-1.38l-.36-.21-3.76.98 1-3.67-.23-.38a9.84 9.84 0 01-1.51-5.25c0-5.45 4.44-9.89 9.9-9.89 2.64 0 5.13 1.03 7 2.9a9.83 9.83 0 012.9 7c0 5.45-4.44 9.9-9.91 9.9zm5.43-7.41c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15s-.77.97-.94 1.17c-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.39-1.47a9.04 9.04 0 01-1.67-2.07c-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52s.2-.3.3-.5.05-.37-.02-.52c-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51l-.57-.01c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.49 0 1.47 1.07 2.89 1.22 3.09.15.2 2.1 3.21 5.09 4.5.71.31 1.27.49 1.71.63.72.23 1.37.2 1.88.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35z" />
          </svg>
          Join the WhatsApp group
        </a>
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
