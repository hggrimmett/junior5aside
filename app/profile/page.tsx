"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

interface Profile {
  id: string;
  role: string;
  full_name: string;
  mobile_number: string;
}

type SchoolYear = "Y3" | "Y4" | "Y5" | "Y6" | "Y7" | "Y8";

interface Child {
  id: string;
  name: string;
  age_group: SchoolYear;
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
          .select("id, name, age_group")
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

  const inputClass =
    "w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition";

  const labelClass =
    "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500";

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8f7f4]">
        <svg
          className="h-6 w-6 animate-spin text-gray-300"
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
    <div className="min-h-screen bg-[#f8f7f4]">
      <div className="mx-auto max-w-md px-4 py-10">
        <h1 className="text-2xl font-extrabold text-gray-900">My Profile</h1>
        <p className="mt-1 text-sm text-gray-400">
          {profile?.role === "parent" ? "Parent" : profile?.role === "mentor" ? "Mentor" : profile?.role === "coach" ? "Coach" : profile?.role}
        </p>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Contact details form */}
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
          <div>
            <label className={labelClass}>Full Name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Mobile Number</label>
            <input
              type="tel"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Email</label>
            <p className="text-sm text-gray-500">
              Managed via your login — contact an organiser to change.
            </p>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white shadow-md shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Update Details"}
          </button>

          {saved && (
            <p className="text-center text-sm font-medium text-emerald-600">
              Details updated.
            </p>
          )}
        </div>

        {/* Children (parents only) */}
        {profile?.role === "parent" && (
          <div className="mt-8">
            <h2 className="text-lg font-bold text-gray-900">
              My Children
              <span className="ml-2 text-base font-normal text-gray-400">
                {children.length}
              </span>
            </h2>

            {children.length === 0 ? (
              <p className="mt-3 text-sm text-gray-400">
                No children registered.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {children.map((child) => (
                  <li
                    key={child.id}
                    className="flex items-center justify-between rounded-xl bg-white px-5 py-4 shadow-sm border border-gray-100"
                  >
                    <span className="text-base font-semibold text-gray-900">
                      {child.name}
                    </span>
                    <span className="text-sm text-gray-400">
                      {child.age_group}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
