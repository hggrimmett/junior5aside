"use client";

import { useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPage() {
  const supabase = getSupabaseBrowserClient();

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }

    setLoading(true);

    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(
      email,
      { redirectTo: `${window.location.origin}/reset-password` }
    );

    if (resetErr) {
      setError(resetErr.message);
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f5f5f5] px-6 py-16">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
            Reset Password
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            We&apos;ll send you a link to reset your password
          </p>
        </div>

        <div className="rounded-2xl bg-background shadow-md px-6 py-7 space-y-5">
          {sent ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-cricket/10 text-cricket">
                <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-base font-bold text-foreground">Check your email</p>
              <p className="text-sm text-muted-foreground">
                If an account exists for <strong>{email}</strong>, you&apos;ll receive a password reset link shortly.
              </p>
              <Link
                href="/login"
                className="inline-flex h-12 w-full items-center justify-center rounded-2xl border-2 border-cricket bg-background text-base font-bold text-cricket transition-opacity active:opacity-80"
              >
                Back to Sign In
              </Link>
            </div>
          ) : (
            <>
              {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <form onSubmit={handleReset} className="space-y-4" noValidate>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-12"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-cricket px-6 text-base font-bold text-cricket-foreground shadow-md transition-opacity hover:opacity-90 active:opacity-80 disabled:opacity-60"
                >
                  {loading ? "Sending..." : "Send Reset Link"}
                </button>
              </form>

              <p className="text-center text-sm text-muted-foreground">
                Remember your password?{" "}
                <Link href="/login" className="font-semibold text-primary hover:underline">
                  Sign In
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
