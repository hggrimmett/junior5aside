export const metadata = {
  title: "The Rules",
};

export default function RulesPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
        The Rules
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        How matches are played, scored, and won.
      </p>

      <div className="mt-6 rounded-2xl border-2 border-dashed border-border bg-background px-5 py-8 text-center">
        <p className="text-4xl">📜</p>
        <h2 className="mt-3 text-lg font-bold text-foreground">
          Rules coming soon
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The tournament rules will be published here ahead of registration
          closing on 10 July.
        </p>
      </div>
    </div>
  );
}
