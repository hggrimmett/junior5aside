"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "./supabase-browser";

export interface GateState {
  loading: boolean;
  visible: boolean;
  published: boolean;
  role: string | null;
}

const PRIVILEGED_ROLES = new Set(["superadmin", "coach", "mentor"]);

export function usePublishGate(): GateState {
  const supabase = getSupabaseBrowserClient();
  const [state, setState] = useState<GateState>({
    loading: true,
    visible: false,
    published: false,
    role: null,
  });

  useEffect(() => {
    (async () => {
      const [settingRes, userRes] = await Promise.all([
        supabase
          .from("settings")
          .select("value")
          .eq("key", "teams_published")
          .maybeSingle<{ value: string }>(),
        supabase.auth.getUser(),
      ]);

      const published = settingRes.data?.value === "true";

      let role: string | null = null;
      const user = userRes.data.user;
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single<{ role: string }>();
        role = profile?.role ?? null;
      }

      const privileged = role !== null && PRIVILEGED_ROLES.has(role);
      setState({
        loading: false,
        visible: published || privileged,
        published,
        role,
      });
    })();
  }, [supabase]);

  return state;
}
