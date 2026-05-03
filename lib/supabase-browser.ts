import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    "Missing Supabase env vars:",
    { NEXT_PUBLIC_SUPABASE_URL: supabaseUrl ? "set" : "MISSING", NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseKey ? "set" : "MISSING" }
  );
}

export function getSupabaseBrowserClient() {
  return createBrowserClient(supabaseUrl!, supabaseKey!);
}
