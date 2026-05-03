import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Routes that don't require authentication
const PUBLIC_PATHS = ["/register", "/standings"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

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

  // ── Unauthenticated → redirect to /register ─────────────
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/register";
    return NextResponse.redirect(url);
  }

  // ── Admin route guard ─────────���──────────────────────────
  if (pathname.startsWith("/admin")) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single<{ role: string }>();

    if (profile?.role !== "admin") {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static, _next/image (Next.js internals)
     * - favicon.ico, sitemap.xml, robots.txt
     * - public assets
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
