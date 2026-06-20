export const metadata = {
  title: "Pitch Map",
};

export default function MapPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-6 space-y-4">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
          Pitch Map
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Three pitches by age group, plus the scoreboard, pavilion and bear.
        </p>
      </header>

      <div className="overflow-hidden rounded-2xl bg-background shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/pitch-map.png"
          alt="Bledlow Ridge pitch map showing the Red, Green and Blue pitches, scoreboard, pavilion, hedge, bear and tennis club."
          className="block h-auto w-full"
        />
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-xs font-semibold">
        <div className="rounded-xl bg-sky-100 px-2 py-2 text-sky-900">
          🟦 Blue pitch
        </div>
        <div className="rounded-xl bg-emerald-100 px-2 py-2 text-emerald-900">
          🟩 Green pitch
        </div>
        <div className="rounded-xl bg-rose-100 px-2 py-2 text-rose-900">
          🟥 Red pitch
        </div>
      </div>
    </div>
  );
}
