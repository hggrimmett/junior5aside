import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

// Where profiles.email and auth.users.email diverge, force auth.users.email
// to match profiles.email. Skips superadmin rows and rows without an email.
// Reports how many were checked, synced, and skipped.
export async function POST() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<{ role: string }>();
  if (callerProfile?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = getSupabaseAdminClient();

  const { data: profiles, error: profErr } = await admin
    .from("profiles")
    .select("id, email, role")
    .neq("role", "superadmin")
    .not("email", "is", null);
  if (profErr) return NextResponse.json({ error: profErr.message }, { status: 500 });

  let checked = 0;
  let synced = 0;
  let alreadyMatched = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const p of (profiles ?? []) as Array<{ id: string; email: string | null; role: string }>) {
    checked += 1;
    if (!p.email) { skipped += 1; continue; }

    const { data: authUser, error: getUserErr } = await admin.auth.admin.getUserById(p.id);
    if (getUserErr || !authUser?.user) {
      errors.push(`${p.id}: auth user not found`);
      skipped += 1;
      continue;
    }

    const authEmail = (authUser.user.email ?? "").toLowerCase();
    const profileEmail = p.email.toLowerCase();
    if (authEmail === profileEmail) {
      alreadyMatched += 1;
      continue;
    }

    const { error: rpcErr } = await admin.rpc("force_email_change_admin", {
      p_user_id: p.id,
      p_new_email: profileEmail,
    });
    if (rpcErr) {
      errors.push(`${p.email}: ${rpcErr.message}`);
      continue;
    }
    synced += 1;
  }

  return NextResponse.json({
    checked,
    synced,
    alreadyMatched,
    skipped,
    errors,
  });
}
