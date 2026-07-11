import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

interface Body {
  profileAId: string;
  profileBId: string;
}

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: callerProfile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single<{ role: string }>();
  if (callerProfile?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Body;
  try { body = (await req.json()) as Body; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { profileAId, profileBId } = body;
  if (!profileAId || !profileBId) {
    return NextResponse.json({ error: "profileAId and profileBId required" }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();

  // Delete both directions
  await admin.from("guardian_links").delete()
    .or(`and(a.eq.${profileAId},b.eq.${profileBId}),and(a.eq.${profileBId},b.eq.${profileAId})`);

  return NextResponse.json({ ok: true });
}
