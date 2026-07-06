"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export default function HomePage() {
  const supabase = getSupabaseBrowserClient();
  const [deadlinePassed, setDeadlinePassed] = useState(false);

  // Safety net: Supabase password-reset links land here with ?code=...
  // when the Redirect URLs allow-list doesn't include /reset-password.
  // Forward the user (and their code) to the proper page.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("code")) {
      window.location.replace(`/reset-password${window.location.search}`);
    }
  }, []);

  useEffect(() => {
    supabase
      .from("settings")
      .select("value")
      .eq("key", "registration_deadline")
      .single()
      .then(({ data }) => {
        if (data) setDeadlinePassed(new Date() > new Date(data.value));
      });
  }, [supabase]);

  return (
    <div className="min-h-screen bg-[#f5f5f5] px-6 py-10">
      <div className="mx-auto w-full max-w-md space-y-8">
        {/* Title block */}
        <div className="text-center">
          <p className="text-5xl">🏏</p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-foreground">
            Junior 5-a-Side
          </h1>
          <p className="mt-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Youth Cricket Tournament · Bledlow Ridge CC
          </p>
        </div>

        {/* Hero blurb */}
        <div className="rounded-3xl bg-cricket px-6 py-7 text-cricket-foreground shadow-lg">
          <h2 className="text-xl font-extrabold leading-tight">
            One day. Three age groups. Fast-paced 5-a-side cricket.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-white/90">
            {deadlinePassed ? (
              <>
                Entries are now <strong>closed</strong>. Teams are being finalised —
                fixtures and pitch allocations will appear here in the run-up to
                the day. See you at Bledlow Ridge on Sunday 12 July!
              </>
            ) : (
              <>
                A friendly, action-packed tournament for boys and girls in school
                years 3 to 8. Short matches, mixed teams, plenty of batting and
                bowling for everyone — and a trophy on the line.
              </>
            )}
          </p>
          <ul className="mt-4 space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <span aria-hidden>🟦</span>
              <span><strong>Blue</strong> — Years 3 &amp; 4</span>
            </li>
            <li className="flex items-start gap-2">
              <span aria-hidden>🟩</span>
              <span><strong>Green</strong> — Years 5 &amp; 6</span>
            </li>
            <li className="flex items-start gap-2">
              <span aria-hidden>🟥</span>
              <span><strong>Red</strong> — Years 7 &amp; 8</span>
            </li>
          </ul>
        </div>

        {/* Quick facts */}
        <div className="rounded-2xl bg-background px-5 py-5 shadow-md">
          <dl className="grid grid-cols-3 gap-4 text-center">
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                When
              </dt>
              <dd className="mt-1 text-sm font-bold text-foreground">12 Jul</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Where
              </dt>
              <dd className="mt-1 text-sm font-bold text-foreground">{/* TODO */}Bledlow Ridge</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Entries
              </dt>
              <dd className={`mt-1 text-sm font-bold ${deadlinePassed ? "text-destructive" : "text-foreground"}`}>
                {deadlinePassed ? "Closed" : "Close 10 Jul"}
              </dd>
            </div>
          </dl>
        </div>

        {/* CTA */}
        <div className="flex flex-col gap-3">
          {deadlinePassed ? (
            <>
              <div
                aria-disabled="true"
                className="inline-flex h-14 w-full items-center justify-center rounded-2xl bg-muted px-6 text-base font-bold text-muted-foreground shadow-inner"
              >
                Entries closed
              </div>
              <Link
                href="/login"
                className="inline-flex h-14 w-full items-center justify-center rounded-2xl bg-cricket px-6 text-base font-bold text-cricket-foreground shadow-md transition-opacity hover:opacity-90 active:opacity-80"
              >
                Sign in to see fixtures
              </Link>
              <p className="pt-1 text-center text-xs text-muted-foreground">
                Already registered? Sign in above to view your team, fixtures, and standings.
              </p>
            </>
          ) : (
            <>
              <Link
                href="/register"
                className="inline-flex h-14 w-full items-center justify-center rounded-2xl bg-cricket px-6 text-base font-bold text-cricket-foreground shadow-md transition-opacity hover:opacity-90 active:opacity-80"
              >
                Register your child
              </Link>
              <Link
                href="/login"
                className="inline-flex h-14 w-full items-center justify-center rounded-2xl border-2 border-cricket bg-background px-6 text-base font-bold text-cricket shadow-md transition-opacity hover:opacity-90 active:opacity-80"
              >
                Sign In
              </Link>
              <p className="pt-1 text-center text-xs text-muted-foreground">
                Volunteering to mentor a team?{" "}
                <Link href="/register-mentor" className="font-semibold text-primary hover:underline">
                  Sign up as a mentor
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
