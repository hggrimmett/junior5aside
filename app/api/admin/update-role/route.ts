import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

const ASSIGNABLE_ROLES = ["parent", "mentor", "coach"] as const;
type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

interface Body {
  profileId: string;
  newRole: AssignableRole;
}

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

  const { profileId, newRole } = body;
  if (!profileId || !newRole) {
    return NextResponse.json({ error: "Missing profileId or newRole" }, { status: 400 });
  }
  if (!ASSIGNABLE_ROLES.includes(newRole)) {
    return NextResponse.json({ error: "Role must be parent, mentor, or coach" }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();

  // Guard: never demote a superadmin via this route
  const { data: target } = await admin
    .from("profiles")
    .select("role")
    .eq("id", profileId)
    .single<{ role: string }>();
  if (!target) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  if (target.role === "superadmin") {
    return NextResponse.json({ error: "Cannot change a superadmin's role from here" }, { status: 403 });
  }

  const { error: updateErr } = await admin
    .from("profiles")
    .update({ role: newRole })
    .eq("id", profileId);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
