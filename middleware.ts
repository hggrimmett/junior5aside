// Middleware intentionally minimal — role checks are handled client-side
// in each protected page for reliability with Supabase SSR cookie handling.

export const config = {
  matcher: [],
};
