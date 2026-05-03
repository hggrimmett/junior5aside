"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface Profile {
  id: string;
  role: string;
  full_name: string;
  mobile_number: string;
}

type SchoolYear = "Y3" | "Y4" | "Y5" | "Y6" | "Y7" | "Y8";

interface Child {
  id: string;
  first_name: string;
  last_name: string;
  name: string;
  age_group: SchoolYear;
}

function roleLabel(role: string): string {
  if (role === "parent") return "Parent";
  if (role === "mentor") return "Mentor";
  if (role === "coach") return "Coach";
  return role;
}

export default function ProfilePage() {
  const supabase = getSupabaseBrowserClient();
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [fullName, setFullName] = useState("");
  const [mobile, setMobile] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/register");
        return;
      }

      const { data: profileData } = await supabase
        .from("profiles")
        .select("id, role, full_name, mobile_number")
        .eq("id", user.id)
        .single<Profile>();

      if (!profileData) {
        setError("Profile not found.");
        setLoading(false);
        return;
      }

      setProfile(profileData);
      setFullName(profileData.full_name);
      setMobile(profileData.mobile_number);

      // Fetch children if parent
      if (profileData.role === "parent") {
        const { data: kids } = await supabase
          .from("players")
          .select("id, first_name, last_name, name, age_group")
          .eq("parent_id", user.id)
          .returns<Child[]>();

        setChildren(kids ?? []);
      }

      setLoading(false);
    }

    load();
  }, [supabase, router]);

  async function handleSave() {
    if (!fullName.trim() || !mobile.trim()) {
      setError("Name and mobile number are required.");
      return;
    }

    setSaving(true);
    setError(null);
    setSaved(false);

    const { error: updateErr } = await supabase
      .from("profiles")
      .update({
        full_name: fullName.trim(),
        mobile_number: mobile.trim(),
      })
      .eq("id", profile!.id);

    if (updateErr) {
      setError(updateErr.message);
      setSaving(false);
      return;
    }

    setSaved(true);
    setSaving(false);
    setTimeout(() => setSaved(false), 2500);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <svg
          className="h-6 w-6 animate-spin text-muted-foreground"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 space-y-6">

      {/* Name + role — no page header, start with content */}
      <div className="space-y-2">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground leading-tight">
          {profile?.full_name || "My Profile"}
        </h1>
        {profile?.role && (
          <Badge className="bg-cricket text-white text-xs font-bold px-3 py-1 rounded-full">
            {roleLabel(profile.role)}
          </Badge>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Contact details card */}
      <Card className="rounded-2xl shadow-md">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Contact Details</CardTitle>
          <CardDescription className="text-sm">Update your name and mobile number.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="full-name" className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Full Name
            </Label>
            <Input
              id="full-name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="h-12 rounded-xl text-base"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mobile" className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Mobile Number
            </Label>
            <Input
              id="mobile"
              type="tel"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              className="h-12 rounded-xl text-base"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Email
            </Label>
            <p className="text-sm text-muted-foreground">
              Managed via your login — contact an organiser to change.
            </p>
          </div>

          <Separator />

          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full h-12 rounded-xl bg-cricket hover:bg-cricket/90 text-white font-bold text-base shadow-md"
          >
            {saving ? "Saving..." : "Update Details"}
          </Button>

          {saved && (
            <p className="text-center text-sm font-semibold text-cricket">
              Details updated successfully.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Children (parents only) */}
      {profile?.role === "parent" && (
        <div className="space-y-3">
          <div className="flex items-baseline gap-2">
            <h2 className="text-base font-bold text-foreground uppercase tracking-wide">
              My Children
            </h2>
            <span className="text-sm text-muted-foreground">{children.length}</span>
          </div>

          {children.length === 0 ? (
            <p className="text-sm text-muted-foreground px-1">
              No children registered.
            </p>
          ) : (
            <div className="space-y-3">
              {children.map((child) => (
                <Card key={child.id} className="rounded-2xl shadow-md">
                  <CardContent className="flex items-center justify-between px-5 py-4">
                    <span className="text-base font-semibold text-foreground">
                      {child.first_name} {child.last_name}
                    </span>
                    <Badge
                      variant="secondary"
                      className="bg-cricket-light text-cricket font-bold rounded-full px-3"
                    >
                      {child.age_group}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Safe-area bottom pad */}
      <div className="h-6" />
    </div>
  );
}
