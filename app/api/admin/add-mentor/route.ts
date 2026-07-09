import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

interface Body {
  email: string;
  password: string;
  fullName: string;
  mobile: string;
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

  const { email, password, fullName, mobile } = body;
  if (!email || !password || !fullName || !mobile) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();

  const { data: userData, error: userErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (userErr || !userData.user?.id) {
    return NextResponse.json(
      { error: `Auth create failed: ${userErr?.message ?? "no user id"}` },
      { status: 400 },
    );
  }
  const uid = userData.user.id;

  const { error: profileErr } = await admin.from("profiles").insert({
    id: uid,
    role: "mentor",
    full_name: fullName.trim(),
    email,
    mobile_number: mobile.trim(),
  });
  if (profileErr) {
    await admin.auth.admin.deleteUser(uid);
    return NextResponse.json(
      { error: `Profile create failed: ${profileErr.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ profileId: uid });
}
