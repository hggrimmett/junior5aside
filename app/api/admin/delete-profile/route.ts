import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

interface Body {
  profileId: string;
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

  const { profileId } = body;
  if (!profileId) return NextResponse.json({ error: "Missing profileId" }, { status: 400 });
  if (profileId === user.id) {
    return NextResponse.json({ error: "You can't delete your own account here" }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();

  const { data: target } = await admin
    .from("profiles")
    .select("role")
    .eq("id", profileId)
    .single<{ role: string }>();
  if (!target) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  if (target.role === "superadmin") {
    return NextResponse.json({ error: "Cannot delete another superadmin from here" }, { status: 403 });
  }

  // Delete auth user — profiles cascade via profiles.id FK, players cascade via
  // players.parent_id FK. Auth deletion is the atomic top of the chain.
  const { error: authErr } = await admin.auth.admin.deleteUser(profileId);
  if (authErr) {
    return NextResponse.json({ error: `Auth delete failed: ${authErr.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
