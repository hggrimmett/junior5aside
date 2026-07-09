import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

const VALID_YEARS = ["Y3", "Y4", "Y5", "Y6", "Y7", "Y8"] as const;
type SchoolYear = (typeof VALID_YEARS)[number];

interface NewParent {
  email: string;
  password: string;
  fullName: string;
  mobile: string;
}

interface PlayerFields {
  firstName: string;
  lastName: string;
  schoolYear: SchoolYear;
  teamId: string | null;
}

interface Body {
  existingParentId?: string;
  parent?: NewParent;
  player: PlayerFields;
}

export async function POST(req: NextRequest) {
  // Verify caller is authenticated superadmin
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

  // Parse + validate body
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { existingParentId, parent, player } = body;
  if (!player?.firstName || !player?.lastName || !player?.schoolYear) {
    return NextResponse.json({ error: "Missing player fields" }, { status: 400 });
  }
  if (!VALID_YEARS.includes(player.schoolYear)) {
    return NextResponse.json({ error: "Invalid school year" }, { status: 400 });
  }
  if (!existingParentId && !parent) {
    return NextResponse.json(
      { error: "Provide existingParentId or parent details" },
      { status: 400 },
    );
  }
  if (parent && (!parent.email || !parent.password || !parent.fullName || !parent.mobile)) {
    return NextResponse.json({ error: "Missing parent fields" }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  let parentId = existingParentId ?? "";
  let createdAuthUser = false;

  // Create new parent if needed
  if (!existingParentId && parent) {
    const { data: userData, error: userErr } = await admin.auth.admin.createUser({
      email: parent.email,
      password: parent.password,
      email_confirm: true,
    });
    if (userErr || !userData.user?.id) {
      return NextResponse.json(
        { error: `Auth create failed: ${userErr?.message ?? "no user id"}` },
        { status: 400 },
      );
    }
    parentId = userData.user.id;
    createdAuthUser = true;

    const { error: profileErr } = await admin.from("profiles").insert({
      id: parentId,
      role: "parent",
      full_name: parent.fullName.trim(),
      email: parent.email,
      mobile_number: parent.mobile.trim(),
    });
    if (profileErr) {
      // Rollback auth user
      await admin.auth.admin.deleteUser(parentId);
      return NextResponse.json(
        { error: `Profile create failed: ${profileErr.message}` },
        { status: 500 },
      );
    }
  }

  // Insert player
  const first = player.firstName.trim();
  const last = player.lastName.trim();
  const { data: newPlayer, error: playerErr } = await admin
    .from("players")
    .insert({
      parent_id: parentId,
      first_name: first,
      last_name: last,
      name: `${first} ${last}`,
      age_group: player.schoolYear,
      team_id: player.teamId,
    })
    .select("id")
    .single();
  if (playerErr) {
    if (createdAuthUser) {
      await admin.from("profiles").delete().eq("id", parentId);
      await admin.auth.admin.deleteUser(parentId);
    }
    return NextResponse.json(
      { error: `Player create failed: ${playerErr.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ playerId: newPlayer.id, parentId });
}
