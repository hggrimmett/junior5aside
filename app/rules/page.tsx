export const metadata = {
  title: "The Rules",
};

export default function RulesPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-6 space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
          Rules of the day
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Junior 5-a-Side · Bledlow Ridge CC · 12 July 2026
        </p>
      </header>

      <Section title="Format">
        <Rule>Tournaments are run on a <strong>league basis</strong>.</Rule>
        <Rule>
          Each team has an older <strong>mentor</strong> who keeps wicket — the
          mentor won&apos;t bat or bowl but will do everything else they can to
          help their team win.
        </Rule>
        <Rule>Each side <strong>starts on 100 runs</strong> per game.</Rule>
        <Rule>Each match is <strong>5 overs per side</strong>.</Rule>
        <Rule>
          The team batting first is listed first in the tournament schedule.
        </Rule>
      </Section>

      <Section title="Batting">
        <Rule>
          Batters bat in <strong>pairs for 2 overs each</strong> per game. One
          team member will bat twice — the mentor picks who.
        </Rule>
        <Rule>
          Each wicket costs the batting side <strong>6 runs</strong>.
        </Rule>
        <Rule>
          At the fall of a wicket, the batters <strong>swap ends</strong> so
          the other player faces the next delivery (unless their 2-over stint
          is done).
        </Rule>
        <Rule>
          <strong>No LBWs.</strong>
        </Rule>
      </Section>

      <Section title="Bowling &amp; extras">
        <Rule>Each player bowls <strong>one six-ball over</strong> per game.</Rule>
        <Rule>
          <strong>Wides and no balls</strong> count as 2 runs to the
          opposition — no extra ball.
        </Rule>
      </Section>

      <Section title="Equipment">
        <Rule>
          We&apos;re using softer balls, so <strong>no pads required</strong>.
          Batting gloves are advisable to save blisters.
        </Rule>
      </Section>

      <Section title="Points">
        <Rule>Winning team: <strong>3 points</strong>.</Rule>
        <Rule>Losing team: <strong>1 point</strong>.</Rule>
        <Rule>Tie: <strong>2 points each</strong>.</Rule>
      </Section>

      <Section title="The final">
        <Rule>
          The top two sides on league position go through to the final.
        </Rule>
        <Rule>
          In the event of a points tie, <strong>total runs scored across the
          tournament</strong> is the tie-breaker.
        </Rule>
        <Rule className="italic">
          If the runs are also tied, I&apos;ll give up and get myself a large
          glass of red…
        </Rule>
        <Rule>
          The final is played in the same format as above — no extra balls.
        </Rule>
      </Section>

      <Section title="Trophies">
        <Rule>
          Trophies for the <strong>winners</strong> and{" "}
          <strong>runners-up</strong> of each tournament.
        </Rule>
        <Rule>
          <strong>Player of the Tournament</strong> awards for each tournament.
        </Rule>
        <Rule>
          Trophies for <strong>most wickets</strong> and{" "}
          <strong>most boundaries</strong> on the day.
        </Rule>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-background px-5 py-5 shadow-sm">
      <h2 className="text-xs font-bold uppercase tracking-widest text-cricket">
        {title}
      </h2>
      <ul className="mt-3 space-y-2.5">{children}</ul>
    </section>
  );
}

function Rule({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <li className={`flex items-start gap-2 text-sm leading-relaxed text-foreground ${className}`}>
      <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cricket" />
      <span>{children}</span>
    </li>
  );
}
