"use client";

import { useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ACCESS_CODE = "CRICKET2026";

export default function RegisterMentorPage() {
  const supabase = getSupabaseBrowserClient();

  // Access code step
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeAccepted, setCodeAccepted] = useState(false);

  // Registration form
  const [fullName, setFullName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (code.trim() === ACCESS_CODE) {
      setCodeError(null);
      setCodeAccepted(true);
    } else {
      setCodeError("Invalid access code. Please check with your organiser.");
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!fullName.trim() || !mobile.trim() || !email.trim() || !password.trim()) {
      setError("All fields are required.");
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

    window.location.href = "/home";
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
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-background shadow-md px-6 py-7 space-y-5">
          {!codeAccepted ? (
            /* ── Access code gate ── */
            <form onSubmit={handleCodeSubmit} className="space-y-4" noValidate>
              <h2 className="text-xl font-extrabold tracking-tight text-foreground">
                Enter Access Code
              </h2>
              <p className="text-sm text-muted-foreground">
                Mentor registration requires an access code. Contact your organiser if you don&apos;t have one.
              </p>

              {codeError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {codeError}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="accessCode" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Access Code
                </Label>
                <Input
                  id="accessCode"
                  type="text"
                  placeholder="e.g. CRICKET2026"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="h-12"
                  autoCapitalize="characters"
                />
              </div>

              <button
                type="submit"
                className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-cricket px-6 text-base font-bold text-cricket-foreground shadow-md transition-opacity hover:opacity-90 active:opacity-80"
              >
                Continue
              </button>
            </form>
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
                  className="h-12"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="mobile" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Mobile Number
                </Label>
                <Input
                  id="mobile"
                  type="tel"
                  placeholder="04XX XXX XXX"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  className="h-12"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="jane@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-12"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Min. 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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

          {/* Footer links */}
          <div className="space-y-2 text-center text-sm text-muted-foreground">
            <p>
              Registering your children?{" "}
              <Link href="/register" className="font-semibold text-primary hover:underline">
                Parent signup
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
