import Link from "next/link";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f5f5f5] px-6 py-16">
      <div className="w-full max-w-md space-y-8">
        {/* Title block */}
        <div className="text-center">
          <p className="text-4xl">🏏</p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-foreground">
            Junior 5-a-Side
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Youth Cricket Tournament
          </p>
        </div>

        {/* Buttons */}
        <div className="flex flex-col gap-3">
          <Link
            href="/login"
            className="inline-flex h-14 w-full items-center justify-center rounded-2xl bg-cricket px-6 text-base font-bold text-cricket-foreground shadow-md transition-opacity hover:opacity-90 active:opacity-80"
          >
            Sign In
          </Link>
          <Link
            href="/register"
            className="inline-flex h-14 w-full items-center justify-center rounded-2xl border-2 border-cricket bg-background px-6 text-base font-bold text-cricket shadow-md transition-opacity hover:opacity-90 active:opacity-80"
          >
            Register
          </Link>
        </div>
      </div>
    </div>
  );
}
