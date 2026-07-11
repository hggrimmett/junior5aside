"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 12; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function parseVCard(text: string): { fullName: string; mobile: string; email: string } {
  const out = { fullName: "", mobile: "", email: "" };
  const lines = text.replace(/\r\n[ \t]/g, "").split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const prefix = line.slice(0, colonIdx).toUpperCase();
    const value = line.slice(colonIdx + 1);
    const propName = prefix.split(";")[0];
    if (propName === "FN" && !out.fullName) out.fullName = value.replace(/\\,/g, ",").replace(/\\;/g, ";");
    else if (propName === "TEL" && !out.mobile) out.mobile = value.trim();
    else if (propName === "EMAIL" && !out.email) out.email = value.trim();
  }
  return out;
}

async function pickFromDeviceContacts(): Promise<
  { fullName: string; mobile: string; email: string } | null
> {
  const nav = navigator as unknown as {
    contacts?: {
      select: (
        props: string[],
        opts?: { multiple?: boolean },
      ) => Promise<Array<{ name?: string[]; tel?: string[]; email?: string[] }>>;
    };
  };
  if (!nav.contacts?.select) return null;
  try {
    const results = await nav.contacts.select(["name", "tel", "email"], { multiple: false });
    if (!results.length) return null;
    const r = results[0];
    return {
      fullName: r.name?.[0] ?? "",
      mobile: r.tel?.[0] ?? "",
      email: r.email?.[0] ?? "",
    };
  } catch {
    return null;
  }
}

export default function AddParentDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [contactPickerSupported, setContactPickerSupported] = useState(false);

  useEffect(() => {
    const nav = navigator as unknown as { contacts?: { select?: unknown } };
    setContactPickerSupported(!!nav.contacts?.select);
  }, []);

  const resetForm = useCallback(() => {
    setFullName("");
    setEmail("");
    setMobile("");
    setPassword("");
    setError(null);
    setSuccessMsg(null);
    setSubmitted(false);
  }, []);

  function applyImported(c: { fullName: string; mobile: string; email: string }) {
    if (c.fullName) setFullName(c.fullName);
    if (c.mobile) setMobile(c.mobile);
    if (c.email) setEmail(c.email);
    if (!password) setPassword(generatePassword());
  }

  async function handlePick() {
    setError(null);
    const c = await pickFromDeviceContacts();
    if (!c) {
      setError("Couldn't read a contact from your device.");
      return;
    }
    applyImported(c);
  }

  async function handleVCard(file: File | null | undefined) {
    setError(null);
    if (!file) return;
    try {
      const text = await file.text();
      const c = parseVCard(text);
      if (!c.fullName && !c.mobile && !c.email) {
        setError("That file didn't contain a readable contact.");
        return;
      }
      applyImported(c);
    } catch {
      setError("Couldn't read that file.");
    }
  }

  async function handleSubmit() {
    setError(null);
    setSuccessMsg(null);
    if (!fullName.trim() || !email.trim()) {
      setError("Name and email are required.");
      return;
    }
    if (!password || password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setSubmitting(true);
    const res = await fetch("/api/admin/add-parent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email.trim(),
        password,
        fullName: fullName.trim(),
        mobile: mobile.trim(),
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    setSubmitting(false);
    if (!res.ok) {
      setError(json.error ?? `Request failed (${res.status}).`);
      return;
    }
    setSubmitted(true);
    setSuccessMsg(`Created. Give the parent this password to log in: ${password}`);
    onCreated();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetForm();
        onOpenChange(v);
      }}
    >
      <DialogContent className="mx-auto max-w-md rounded-2xl p-6 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-black">Add Parent</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* Import shortcuts */}
          <div className="flex flex-wrap gap-2 rounded-lg border border-dashed bg-muted/30 p-2">
            {contactPickerSupported && (
              <Button
                type="button"
                variant="outline"
                onClick={handlePick}
                className="h-9 flex-1 rounded-lg text-xs font-bold"
              >
                Pick from phone contacts
              </Button>
            )}
            <label className="inline-flex h-9 flex-1 cursor-pointer items-center justify-center rounded-lg border border-input bg-background px-3 text-xs font-bold text-foreground hover:bg-muted">
              Import vCard file
              <input
                type="file"
                accept=".vcf,text/vcard,text/x-vcard,text/directory"
                onChange={(e) => {
                  handleVCard(e.target.files?.[0]);
                  e.target.value = "";
                }}
                className="hidden"
              />
            </label>
          </div>
          {!contactPickerSupported && (
            <p className="text-[11px] leading-snug text-muted-foreground">
              On iPhone: Contacts → the person → Share → <strong>Save to Files</strong>, then tap Import vCard.
            </p>
          )}

          <div className="space-y-1">
            <Label className="text-xs font-bold uppercase tracking-wider">Full name</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-10 rounded-lg" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-bold uppercase tracking-wider">Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-10 rounded-lg" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-bold uppercase tracking-wider">Mobile (optional)</Label>
            <Input type="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} className="h-10 rounded-lg" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-bold uppercase tracking-wider">Temporary password</Label>
            <div className="flex gap-2">
              <Input value={password} onChange={(e) => setPassword(e.target.value)} className="h-10 rounded-lg" />
              <Button
                type="button"
                variant="outline"
                onClick={() => setPassword(generatePassword())}
                className="h-10 rounded-lg px-3 text-xs"
              >
                Generate
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">Share with the parent so they can log in and change it.</p>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}
          {successMsg && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              {successMsg}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => {
              resetForm();
              onOpenChange(false);
            }}
            disabled={submitting}
            className="h-11 rounded-xl"
          >
            Close
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || submitted}
            className="h-11 rounded-xl bg-cricket text-cricket-foreground hover:opacity-90 font-bold disabled:opacity-100"
          >
            {submitted ? "✓ Submitted" : submitting ? "Adding..." : "Add parent"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
