"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { Card, CardContent } from "@/components/ui/card";

export default function HomePage() {
  const supabase = getSupabaseBrowserClient();
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    async function loadRole() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single<{ role: string }>();
      setRole(data?.role ?? null);
    }
    loadRole();
  }, [supabase]);

  const isAdmin = role === "superadmin" || role === "coach";

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

        {/* My Account */}
        <NavCard
          href="/dashboard"
          borderColour="border-l-blue-500"
          iconColour="text-blue-500"
          icon={<path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />}
          title="My Account"
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
