import Link from "next/link";

export default function HomePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8f7f4] px-4">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-3xl font-black tracking-tight text-gray-900">
          Junior 5-a-Side
        </h1>
        <p className="mt-2 text-sm text-gray-400">
          Youth Cricket Tournament
        </p>

        <div className="mt-8 space-y-3">
          <Link
            href="/register"
            className="block rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white shadow-md shadow-emerald-600/20 transition hover:bg-emerald-700"
          >
            Register
          </Link>
          <Link
            href="/standings"
            className="block rounded-xl border border-gray-200 bg-white py-3 text-sm font-bold text-gray-700 shadow-sm transition hover:bg-gray-50"
          >
            View Standings
          </Link>
        </div>
      </div>
    </div>
  );
}
