import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

interface Body {
  profileId: string;
  newEmail: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<{ role: string }>();
  if (callerProfile?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { profileId, newEmail } = body;
  if (!profileId || !newEmail) {
    return NextResponse.json({ error: "Missing profileId or newEmail" }, { status: 400 });
  }
  if (!EMAIL_RE.test(newEmail.trim())) {
    return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
  }
  if (profileId === user.id) {
    return NextResponse.json(
      { error: "Change your own email via /profile, not here" },
      { status: 400 },
    );
  }

  const admin = getSupabaseAdminClient();

  // Guard: never change another superadmin's email via this route
  const { data: target } = await admin
    .from("profiles")
    .select("role")
    .eq("id", profileId)
    .single<{ role: string }>();
  if (!target) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  if (target.role === "superadmin") {
    return NextResponse.json(
      { error: "Cannot change a superadmin's email from here" },
      { status: 403 },
    );
  }

  const cleaned = newEmail.trim();

  // 1) Update auth.users.email with email_confirm:true so it's instantly active
  //    for login and password-reset lookups.
  const { error: authErr } = await admin.auth.admin.updateUserById(profileId, {
    email: cleaned,
    email_confirm: true,
  });
  if (authErr) {
    return NextResponse.json({ error: `Auth update failed: ${authErr.message}` }, { status: 400 });
  }

  // 2) Mirror the change to profiles.email so app queries stay in sync.
  const { error: profileErr } = await admin
    .from("profiles")
    .update({ email: cleaned })
    .eq("id", profileId);
  if (profileErr) {
    return NextResponse.json(
      { error: `Profile mirror failed: ${profileErr.message} — auth was updated, please re-sync manually` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
