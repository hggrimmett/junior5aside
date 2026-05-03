"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

// ── Types ──────────────────────────────────────────────────

interface Tournament {
  id: string;
  name: string;
  age_group_category: string;
}

interface Team {
  id: string;
  name: string;
}

interface Fixture {
  teamA: Team;
  teamB: Team;
  time: Date;
  pitch: number;
}

// ── Round Robin ────────────────────────────────────────────

function generateRoundRobin(teams: Team[]): [Team, Team][] {
  const list = [...teams];
  if (list.length % 2 !== 0) list.push({ id: "__bye__", name: "BYE" });

  const n = list.length;
  const pairs: [Team, Team][] = [];

  for (let round = 0; round < n - 1; round++) {
    for (let i = 0; i < n / 2; i++) {
      const home = list[i];
      const away = list[n - 1 - i];
      if (home.id !== "__bye__" && away.id !== "__bye__") {
        pairs.push([home, away]);
      }
    }
    const last = list.pop()!;
    list.splice(1, 0, last);
  }

  return pairs;
}

// ── Component ──────────────────────────────────────────────

export default function FixtureGenerator() {
  const supabase = getSupabaseBrowserClient();

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [teams, setTeams] = useState<Team[]>([]);
  const [startTime, setStartTime] = useState("");
  const [matchDuration, setMatchDuration] = useState(20);
  const [pitchNumber, setPitchNumber] = useState(1);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Load tournaments ─────────────────────────────────────

  useEffect(() => {
    supabase
      .from("tournaments")
      .select("*")
      .returns<Tournament[]>()
      .then(({ data }) => setTournaments(data ?? []));
  }, [supabase]);

  // ── Load teams on tournament change ──────────────────────

  const fetchTeams = useCallback(async () => {
    if (!selectedId) {
      setTeams([]);
      return;
    }
    const { data } = await supabase
      .from("teams")
      .select("id, name")
      .eq("tournament_id", selectedId)
      .returns<Team[]>();
    setTeams(data ?? []);
    setPreviewing(false);
    setFixtures([]);
    setDone(false);
  }, [supabase, selectedId]);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  // ── Generate preview ─────────────────────────────────────

  function handleGenerate() {
    setError(null);

    if (!selectedId) {
      setError("Select a tournament first.");
      return;
    }
    if (teams.length < 2) {
      setError("Need at least 2 teams to generate fixtures.");
      return;
    }
    if (!startTime) {
      setError("Set a start time.");
      return;
    }

    const pairs = generateRoundRobin(teams);
    const base = new Date(startTime);

    const list: Fixture[] = pairs.map(([a, b], i) => ({
      teamA: a,
      teamB: b,
      time: new Date(base.getTime() + i * matchDuration * 60_000),
      pitch: pitchNumber,
    }));

    setFixtures(list);
    setPreviewing(true);
    setDone(false);
  }

  // ── Save fixtures ────────────────────────────────────────

  async function handleSave() {
    setSaving(true);
    setError(null);

    // Clear existing unplayed matches for this tournament
    const { error: deleteErr } = await supabase
      .from("matches")
      .delete()
      .eq("tournament_id", selectedId)
      .eq("status", false);

    if (deleteErr) {
      setError(deleteErr.message);
      setSaving(false);
      return;
    }

    const rows = fixtures.map((f) => ({
      tournament_id: selectedId,
      team_a_id: f.teamA.id,
      team_b_id: f.teamB.id,
      score_a: 0,
      score_b: 0,
      wickets_a: 0,
      wickets_b: 0,
      status: false,
      scheduled_time: f.time.toISOString(),
    }));

    const { error: insertErr } = await supabase.from("matches").insert(rows);

    if (insertErr) {
      setError(insertErr.message);
      setSaving(false);
      return;
    }

    setDone(true);
    setSaving(false);
  }

  // ── Derived ──────────────────────────────────────────────

  const selectedTournament = tournaments.find((t) => t.id === selectedId);
  const expectedMatches = teams.length >= 2 ? (teams.length * (teams.length - 1)) / 2 : 0;

  const inputClass =
    "w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition";
  const labelClass =
    "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500";

  // ── Render ───────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h2 className="text-lg font-bold text-gray-900">Fixture Generator</h2>
        <p className="mt-0.5 text-sm text-gray-400">
          Round-robin schedule — every team plays each other once.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* ── Configuration card ────────────────────────── */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
        {/* Tournament selector */}
        <div>
          <label className={labelClass}>Age Group / Tournament</label>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className={inputClass}
          >
            <option value="">Select a tournament...</option>
            {tournaments.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} — {t.age_group_category}
              </option>
            ))}
          </select>
        </div>

        {/* Team count summary */}
        {selectedId && (
          <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600">
            <span className="font-bold">{teams.length}</span> team
            {teams.length !== 1 && "s"} found
            {expectedMatches > 0 && (
              <span className="text-gray-400">
                {" "}&middot; {expectedMatches} match
                {expectedMatches !== 1 && "es"} to generate
              </span>
            )}
          </div>
        )}

        {/* Scheduling inputs */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>Start Time</label>
            <input
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Match Duration (mins)</label>
            <input
              type="number"
              min={1}
              value={matchDuration}
              onChange={(e) => setMatchDuration(Math.max(1, Number(e.target.value) || 1))}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Pitch Number</label>
            <input
              type="number"
              min={1}
              value={pitchNumber}
              onChange={(e) => setPitchNumber(Math.max(1, Number(e.target.value) || 1))}
              className={inputClass}
            />
          </div>
        </div>

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={!selectedId || teams.length < 2}
          className="rounded-xl bg-gray-900 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-gray-800 disabled:opacity-40"
        >
          Generate Preview
        </button>
      </div>

      {/* ── Preview ───────────────────────────────────── */}
      {previewing && fixtures.length > 0 && (
        <div className="space-y-4">
          {/* Warning */}
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
            <svg
              className="mt-0.5 h-5 w-5 shrink-0 text-amber-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div>
              <p className="text-sm font-semibold text-amber-800">
                This will delete existing unplayed matches for this group
              </p>
              <p className="mt-0.5 text-xs text-amber-600">
                All pending matches (status&nbsp;=&nbsp;false) for{" "}
                <span className="font-bold">{selectedTournament?.name}</span>{" "}
                will be removed and replaced. Completed matches are not affected.
              </p>
            </div>
          </div>

          {/* Preview table */}
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 bg-gray-50/80 px-5 py-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-700">
                Preview &mdash; {fixtures.length} match
                {fixtures.length !== 1 && "es"}
              </h3>
              <span className="text-xs text-gray-400">
                Pitch {pitchNumber}
              </span>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/40">
                  <th className="w-12 py-2.5 pl-5 pr-1 text-left text-xs font-bold uppercase tracking-wider text-gray-400">
                    #
                  </th>
                  <th className="py-2.5 px-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">
                    Team A
                  </th>
                  <th className="w-8 py-2.5 text-center text-xs text-gray-300">
                    vs
                  </th>
                  <th className="py-2.5 px-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">
                    Team B
                  </th>
                  <th className="w-14 py-2.5 px-2 text-center text-xs font-bold uppercase tracking-wider text-gray-400">
                    Pitch
                  </th>
                  <th className="w-28 py-2.5 pl-2 pr-5 text-right text-xs font-bold uppercase tracking-wider text-gray-400">
                    Time
                  </th>
                </tr>
              </thead>
              <tbody>
                {fixtures.map((f, i) => (
                  <tr
                    key={i}
                    className="border-b border-gray-50 transition-colors hover:bg-gray-50/60"
                  >
                    <td className="py-3 pl-5 pr-1">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-500">
                        {i + 1}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-semibold text-gray-900">
                      {f.teamA.name}
                    </td>
                    <td className="py-3 text-center text-gray-300">vs</td>
                    <td className="py-3 px-3 font-semibold text-gray-900">
                      {f.teamB.name}
                    </td>
                    <td className="py-3 px-2 text-center text-gray-500">
                      {f.pitch}
                    </td>
                    <td className="py-3 pl-2 pr-5 text-right tabular-nums text-gray-500">
                      {f.time.toLocaleTimeString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Duration summary */}
            <div className="border-t border-gray-100 bg-gray-50/40 px-5 py-2.5 text-xs text-gray-400">
              First match{" "}
              <span className="font-medium text-gray-500">
                {fixtures[0].time.toLocaleTimeString(undefined, {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              {" "}&rarr; last match ends approx.{" "}
              <span className="font-medium text-gray-500">
                {new Date(
                  fixtures[fixtures.length - 1].time.getTime() + matchDuration * 60_000
                ).toLocaleTimeString(undefined, {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          </div>

          {/* Save / success */}
          {done ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-center">
              <p className="text-sm font-bold text-emerald-700">
                {fixtures.length} fixtures saved successfully.
              </p>
            </div>
          ) : (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white shadow-md shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:opacity-60"
            >
              {saving ? (
                <>
                  <svg
                    className="h-4 w-4 animate-spin"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Saving...
                </>
              ) : (
                "Save Fixtures"
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
