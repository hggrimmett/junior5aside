"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";

type Status = "verifying" | "ready" | "invalid";

export default function ResetPasswordPage() {
  const supabase = getSupabaseBrowserClient();

  const [status, setStatus] = useState<Status>("verifying");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    async function verifyLink() {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      const tokenHash = url.searchParams.get("token_hash");
      const type = url.searchParams.get("type");
      const errParam = url.searchParams.get("error_description") ?? url.searchParams.get("error");

      if (errParam) {
        setError(decodeURIComponent(errParam));
        setStatus("invalid");
        return;
      }

      // Stateless token-hash flow — works across browsers/devices.
      if (tokenHash && type === "recovery") {
        const { error: verifyErr } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: "recovery",
        });
        if (verifyErr) {
          setError("This reset link is invalid or has expired. Please request a new one.");
          setStatus("invalid");
          return;
        }
        window.history.replaceState({}, "", "/reset-password");
        setStatus("ready");
        return;
      }

      // PKCE flow — only works if the link is opened in the same browser
      // context that requested the reset (same code_verifier in storage).
      if (code) {
        const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeErr) {
          setError(
            "This reset link is invalid, expired, or was opened in a different browser than the one that requested it. Please request a new one."
          );
          setStatus("invalid");
          return;
        }
        window.history.replaceState({}, "", "/reset-password");
        setStatus("ready");
        return;
      }

      // Fallback: no code/token — maybe the SDK auto-set a session via hash.
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setStatus("ready");
      } else {
        setError("Open this page from the password-reset link in your email.");
        setStatus("invalid");
      }
    }
    verifyLink();
  }, [supabase]);

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    const { error: updateErr } = await supabase.auth.updateUser({
      password,
    });

    if (updateErr) {
      setError(updateErr.message);
      setLoading(false);
      return;
    }

    setDone(true);
    setLoading(false);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f5f5f5] px-6 py-16">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
            New Password
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose a new password for your account
          </p>
        </div>

        <div className="rounded-2xl bg-background shadow-md px-6 py-7 space-y-5">
          {status === "verifying" && (
            <p className="text-center text-sm text-muted-foreground">
              Verifying reset link…
            </p>
          )}

          {status === "invalid" && (
            <div className="space-y-4 text-center">
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {error ?? "This reset link is invalid or has expired."}
              </div>
              <button
                onClick={() => (window.location.href = "/forgot-password")}
                className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-cricket px-6 text-base font-bold text-cricket-foreground shadow-md transition-opacity active:opacity-80"
              >
                Request a new link
              </button>
            </div>
          )}

          {status === "ready" && done && (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-cricket/10 text-cricket">
                <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-base font-bold text-foreground">Password updated</p>
              <p className="text-sm text-muted-foreground">
                You can now sign in with your new password.
              </p>
              <button
                onClick={() => (window.location.href = "/login")}
                className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-cricket px-6 text-base font-bold text-cricket-foreground shadow-md transition-opacity active:opacity-80"
              >
                Sign In
              </button>
            </div>
          )}

          {status === "ready" && !done && (
            <>
              {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <form onSubmit={handleUpdate} className="space-y-4" noValidate>
                <div className="space-y-1.5">
                  <Label htmlFor="password">New Password</Label>
                  <PasswordInput
                    id="password"
                    placeholder="Min. 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-12"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirm">Confirm Password</Label>
                  <PasswordInput
                    id="confirm"
                    placeholder="Repeat password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="h-12"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-cricket px-6 text-base font-bold text-cricket-foreground shadow-md transition-opacity hover:opacity-90 active:opacity-80 disabled:opacity-60"
                >
                  {loading ? "Updating..." : "Update Password"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
