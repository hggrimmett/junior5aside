"use client";

import { useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function CheckIcon() {
  return (
    <svg
      className="h-7 w-7"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

export default function RegisterMentorPage() {
  const supabase = getSupabaseBrowserClient();

  // Registration form
  const [fullName, setFullName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!fullName.trim() || !mobile.trim() || !email.trim() || !password.trim()) {
      setError("All fields are required.");
      return;
    }

    if (!EMAIL_RE.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);

    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });

    if (authErr) {
      setError(authErr.message);
      setLoading(false);
      return;
    }

    const uid = authData.user?.id;
    if (!uid) {
      setError("Signup succeeded but no user ID was returned.");
      setLoading(false);
      return;
    }

    const { error: profileErr } = await supabase.from("profiles").insert({
      id: uid,
      role: "mentor",
      full_name: fullName.trim(),
      mobile_number: mobile.trim(),
      email: email.trim(),
    });

    if (profileErr) {
      setError(profileErr.message);
      setLoading(false);
      return;
    }

    setDone(true);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-start bg-[#f5f5f5] px-4 py-10">
      <div className="w-full max-w-md space-y-5">
        {/* Branding */}
        <div className="text-center">
          <p className="text-3xl">🏏</p>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-foreground">
            Junior 5-a-Side
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Mentor Registration
          </p>
          {!done && (
            <p className="mt-3 text-sm text-muted-foreground">
              Registering your children?{" "}
              <Link href="/register" className="font-semibold text-primary hover:underline">
                Parent signup
              </Link>
            </p>
          )}
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-background shadow-md px-6 py-7 space-y-5">
          {done ? (
            /* ── Success ── */
            <div className="flex flex-col items-center py-4 text-center">
              <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-cricket/10 text-cricket">
                <CheckIcon />
              </div>
              <h2 className="mb-2 text-xl font-extrabold tracking-tight text-foreground">
                You&apos;re all set!
              </h2>
              <p className="text-sm text-muted-foreground">
                Your mentor account has been created.
              </p>

              <div className="mt-6 flex flex-col gap-3 w-full">
                <Link
                  href="/home"
                  className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-cricket px-6 text-base font-bold text-cricket-foreground shadow-md transition-opacity hover:opacity-90"
                >
                  Go to Home
                </Link>
                <Link
                  href="/profile"
                  className="inline-flex h-12 w-full items-center justify-center rounded-2xl border-2 border-cricket bg-background px-6 text-base font-bold text-cricket shadow-md transition-opacity hover:opacity-90"
                >
                  My Profile
                </Link>
              </div>
            </div>
          ) : (
            /* ── Registration form ── */
            <form onSubmit={handleRegister} className="space-y-4" noValidate>
              <h2 className="text-xl font-extrabold tracking-tight text-foreground">
                Mentor Registration
              </h2>

              {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="fullName" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Full Name
                </Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="Jane Smith"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoComplete="name"
                  className="h-12"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="mobile" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Guardian&apos;s mobile number
                </Label>
                <Input
                  id="mobile"
                  type="tel"
                  placeholder="07XXX XXX XXX"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  autoComplete="tel"
                  inputMode="tel"
                  className="h-12"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Guardian&apos;s email address
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="parent@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  inputMode="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="h-12"
                />
                <p className="text-[11px] text-muted-foreground">
                  We&apos;ll use this to sign you in and for tournament-day
                  updates.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Password
                </Label>
                <PasswordInput
                  id="password"
                  placeholder="Min. 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  className="h-12"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-cricket px-6 text-base font-bold text-cricket-foreground shadow-md transition-opacity hover:opacity-90 active:opacity-80 disabled:opacity-60"
              >
                {loading ? "Creating account..." : "Complete Registration"}
              </button>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}
