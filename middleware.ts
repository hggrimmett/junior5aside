import { type NextRequest, NextResponse } from "next/server";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  // Read Supabase auth token from cookies
  const ref = supabaseUrl.replace(/^https?:\/\/([^.]+).*$/, "$1");
  const cookiePrefix = `sb-${ref}-auth-token`;

  // Reassemble chunked cookie value
  let token = "";
  const base = request.cookies.get(cookiePrefix)?.value;
  if (base) {
    token = base;
  } else {
    let i = 0;
    while (true) {
      const chunk = request.cookies.get(`${cookiePrefix}.${i}`)?.value;
      if (!chunk) break;
      token += chunk;
      i++;
    }
  }

  // No token → redirect to login
  if (!token) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Extract access_token from the cookie value
  let accessToken = "";
  try {
    const parsed = JSON.parse(token);
    accessToken = parsed.access_token ?? "";
  } catch {
    accessToken = token;
  }

  if (!accessToken) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // For /admin routes, verify user is superadmin or coach
  if (pathname.startsWith("/admin")) {
    try {
      // Get user from auth
      const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: anonKey,
        },
      });

      if (!userRes.ok) {
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        return NextResponse.redirect(url);
      }

      const user = await userRes.json();

      // Use service role to bypass RLS for the role check
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      const profileRes = await fetch(
        `${supabaseUrl}/rest/v1/profiles?select=role&id=eq.${user.id}&limit=1`,
        {
          headers: {
            Authorization: `Bearer ${serviceKey ?? accessToken}`,
            apikey: serviceKey ?? anonKey,
          },
        }
      );

      const profiles = await profileRes.json();
      const role = profiles?.[0]?.role;

      if (role !== "superadmin" && role !== "coach") {
        const url = request.nextUrl.clone();
        url.pathname = "/dashboard";
        return NextResponse.redirect(url);
      }
    } catch {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/mentor/:path*"],
};
