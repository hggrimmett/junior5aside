import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Create a Supabase client that reads/writes cookies via the request/response
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            request.cookies.set(name, value);
            response = NextResponse.next({ request });
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  // Refresh the session (required by @supabase/ssr to keep tokens alive)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Unauthenticated users trying to access protected routes → redirect to /register
  if (!user && pathname.startsWith("/admin")) {
    const url = request.nextUrl.clone();
    url.pathname = "/register";
    return NextResponse.redirect(url);
  }

  if (!user && pathname.startsWith("/mentor")) {
    const url = request.nextUrl.clone();
    url.pathname = "/register";
    return NextResponse.redirect(url);
  }

  // Admin route guard: check role via profiles table
  if (user && pathname.startsWith("/admin")) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single<{ role: string }>();

    if (profile?.role !== "admin") {
      const url = request.nextUrl.clone();
      url.pathname = "/register";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Only run middleware on protected routes:
     * - /admin/*
     * - /mentor/*
     */
    "/admin/:path*",
    "/mentor/:path*",
  ],
};
