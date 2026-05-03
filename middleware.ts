import { type NextRequest, NextResponse } from "next/server";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Read Supabase auth token from cookies
  // @supabase/ssr stores the session across chunked cookies named sb-<ref>-auth-token.X
  const ref = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(
    /^https?:\/\/([^.]+).*$/,
    "$1"
  );
  const cookiePrefix = `sb-${ref}-auth-token`;

  // Reassemble chunked cookie value
  let token = "";
  const base = request.cookies.get(cookiePrefix)?.value;
  if (base) {
    token = base;
  } else {
    // Try chunked cookies: sb-<ref>-auth-token.0, .1, .2 ...
    let i = 0;
    while (true) {
      const chunk = request.cookies.get(`${cookiePrefix}.${i}`)?.value;
      if (!chunk) break;
      token += chunk;
      i++;
    }
  }

  // No token → redirect to register
  if (!token) {
    const url = request.nextUrl.clone();
    url.pathname = "/register";
    return NextResponse.redirect(url);
  }

  // For /admin routes, verify the user's role via Supabase REST API
  if (pathname.startsWith("/admin")) {
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

      // Parse the token to extract the access_token
      let accessToken = "";
      try {
        const parsed = JSON.parse(token);
        accessToken = parsed.access_token ?? "";
      } catch {
        accessToken = token;
      }

      if (!accessToken) {
        const url = request.nextUrl.clone();
        url.pathname = "/register";
        return NextResponse.redirect(url);
      }

      // Get user ID from Supabase auth
      const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: anonKey,
        },
      });

      if (!userRes.ok) {
        const url = request.nextUrl.clone();
        url.pathname = "/register";
        return NextResponse.redirect(url);
      }

      const user = await userRes.json();

      // Check profile role
      const profileRes = await fetch(
        `${supabaseUrl}/rest/v1/profiles?select=role&id=eq.${user.id}&limit=1`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            apikey: anonKey,
          },
        }
      );

      const profiles = await profileRes.json();

      const role = profiles[0]?.role;
      if (!Array.isArray(profiles) || (role !== "superadmin" && role !== "coach")) {
        const url = request.nextUrl.clone();
        url.pathname = "/register";
        return NextResponse.redirect(url);
      }
    } catch {
      const url = request.nextUrl.clone();
      url.pathname = "/register";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/mentor/:path*"],
};
