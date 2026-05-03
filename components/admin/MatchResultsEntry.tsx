"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { calculateMatchScore } from "@/lib/tournament-logic";

// ── Types ──────────────────────────────────────────────────

type SchoolYear = "Y3" | "Y4" | "Y5" | "Y6" | "Y7" | "Y8";

interface Team {
  id: string;
  name: string;
}

interface Match {
  id: string;
  tournament_id: string;
  team_a_id: string;
  team_b_id: string;
  score_a: number;
  score_b: number;
  wickets_a: number;
  wickets_b: number;
  status: boolean;
  scheduled_time: string | null;
  team_a: Team;
  team_b: Team;
}

interface MatchWithGroup extends Match {
  ageGroup: SchoolYear;
}

const SCHOOL_YEARS: SchoolYear[] = ["Y3", "Y4", "Y5", "Y6", "Y7", "Y8"];

const GROUP_STYLE: Record<SchoolYear, { badge: string; border: string }> = {
  Y3: { badge: "bg-blue-100 text-blue-700", border: "border-l-blue-400" },
  Y4: { badge: "bg-green-100 text-green-700", border: "border-l-green-400" },
  Y5: { badge: "bg-amber-100 text-amber-700", border: "border-l-amber-400" },
  Y6: { badge: "bg-red-100 text-red-700", border: "border-l-red-400" },
  Y7: { badge: "bg-purple-100 text-purple-700", border: "border-l-purple-400" },
  Y8: { badge: "bg-pink-100 text-pink-700", border: "border-l-pink-400" },
};

// ── Toast ──────────────────────────────────────────────────

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-slide-up rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-lg">
      {message}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────

export default function MatchResultsEntry({
  tournamentId,
  ageGroupMap,
}: {
  tournamentId: string;
  /** Maps team ID → age group. Needed because matches don't store age group directly. */
  ageGroupMap: Record<string, SchoolYear>;
}) {
  const supabase = getSupabaseBrowserClient();

  const [matches, setMatches] = useState<MatchWithGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);
  const [selected, setSelected] = useState<MatchWithGroup | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Fetch ────────────────────────────────────────────────

  const fetchMatches = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: fetchErr } = await supabase
      .from("matches")
      .select("*, team_a:teams!team_a_id(id, name), team_b:teams!team_b_id(id, name)")
      .eq("tournament_id", tournamentId)
      .returns<Match[]>();

    if (fetchErr) {
      setError(fetchErr.message);
      setLoading(false);
      return;
    }

    const enriched: MatchWithGroup[] = (data ?? []).map((m) => ({
      ...m,
      ageGroup: ageGroupMap[m.team_a_id] ?? "Y3",
    }));

    setMatches(enriched);
    setLoading(false);
  }, [supabase, tournamentId, ageGroupMap]);

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  // ── Filtered + grouped ──────────────────────────────────

  const grouped = useMemo(() => {
    const filtered = showCompleted
      ? matches
      : matches.filter((m) => !m.status);

    const groups: Record<SchoolYear, MatchWithGroup[]> = {
      Y3: [],
      Y4: [],
      Y5: [],
      Y6: [],
      Y7: [],
      Y8: [],
    };

    for (const m of filtered) {
      groups[m.ageGroup].push(m);
    }

    return groups;
  }, [matches, showCompleted]);

  // ── Render ───────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-gray-400">
        Loading matches...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">Match Results</h2>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-500">
          <input
            type="checkbox"
            checked={showCompleted}
            onChange={(e) => setShowCompleted(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
          />
          Show Completed
        </label>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Grouped lists */}
      {SCHOOL_YEARS.map((group) => {
        const list = grouped[group];
        if (list.length === 0) return null;

        const style = GROUP_STYLE[group];

        return (
          <section key={group}>
            <div className="mb-2 flex items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${style.badge}`}
              >
                {group}
              </span>
              <span className="text-xs text-gray-400">
                {list.length} match{list.length !== 1 && "es"}
              </span>
            </div>

            <div className="space-y-2">
              {list.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelected(m)}
                  className={`flex w-full items-center justify-between rounded-xl border border-gray-200 border-l-4 ${style.border} bg-white px-4 py-3 text-left transition hover:shadow-md`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">
                      {m.team_a.name}{" "}
                      <span className="font-normal text-gray-400">vs</span>{" "}
                      {m.team_b.name}
                    </p>
                    {m.scheduled_time && (
                      <p className="mt-0.5 text-xs text-gray-400">
                        {new Date(m.scheduled_time).toLocaleString()}
                      </p>
                    )}
                  </div>

                  <div className="ml-4 shrink-0 text-right">
                    {m.status ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
                        {m.score_a}/{m.wickets_a} – {m.score_b}/{m.wickets_b}
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                        Pending
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </section>
        );
      })}

      {/* Empty state */}
      {SCHOOL_YEARS.every((g) => grouped[g].length === 0) && (
        <p className="py-12 text-center text-sm text-gray-400">
          {showCompleted
            ? "No matches found for this tournament."
            : "No pending matches. Toggle 'Show Completed' to see results."}
        </p>
      )}

      {/* Modal */}
      {selected && (
        <EntryModal
          match={selected}
          supabase={supabase}
          onClose={() => setSelected(null)}
          onSaved={(msg) => {
            setSelected(null);
            setToast(msg);
            fetchMatches();
          }}
        />
      )}

      {/* Toast */}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}

// ── Entry Modal ────────────────────────────────────────────

function EntryModal({
  match,
  supabase,
  onClose,
  onSaved,
}: {
  match: MatchWithGroup;
  supabase: ReturnType<typeof getSupabaseBrowserClient>;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [runsA, setRunsA] = useState(String(match.score_a));
  const [wicketsA, setWicketsA] = useState(String(match.wickets_a));
  const [runsB, setRunsB] = useState(String(match.score_b));
  const [wicketsB, setWicketsB] = useState(String(match.wickets_b));
  const [complete, setComplete] = useState(match.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const numRunsA = Number(runsA) || 0;
  const numWicketsA = Number(wicketsA) || 0;
  const numRunsB = Number(runsB) || 0;
  const numWicketsB = Number(wicketsB) || 0;

  const netScoreA = calculateMatchScore(numRunsA, numWicketsA);
  const netScoreB = calculateMatchScore(numRunsB, numWicketsB);

  async function handleSave() {
    setSaving(true);
    setError(null);

    const { error: updateErr } = await supabase
      .from("matches")
      .update({
        score_a: numRunsA,
        wickets_a: numWicketsA,
        score_b: numRunsB,
        wickets_b: numWicketsB,
        status: complete,
      })
      .eq("id", match.id);

    if (updateErr) {
      setError(updateErr.message);
      setSaving(false);
      return;
    }

    onSaved(
      complete
        ? `Result saved: ${match.team_a.name} vs ${match.team_b.name}`
        : "Scores updated (match still pending)."
    );
  }

  const inputClass =
    "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-center text-lg font-bold text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition";

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h3 className="text-base font-bold text-gray-900">
              Enter Match Result
            </h3>
            <p className="mt-0.5 text-xs text-gray-400">
              {match.team_a.name} vs {match.team_b.name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Score grid */}
        <div className="grid grid-cols-2 gap-6">
          {/* Team A */}
          <div>
            <p className="mb-3 text-center text-sm font-bold text-gray-700">
              {match.team_a.name}
            </p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-center text-xs text-gray-400">
                  Runs
                </label>
                <input
                  type="number"
                  min={0}
                  value={runsA}
                  onChange={(e) => setRunsA(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-center text-xs text-gray-400">
                  Wickets
                </label>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={wicketsA}
                  onChange={(e) => setWicketsA(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="rounded-lg bg-gray-50 py-2 text-center">
                <span className="text-xs text-gray-400">Net Score</span>
                <p className="text-lg font-black text-emerald-600">
                  {netScoreA}
                </p>
              </div>
            </div>
          </div>

          {/* Team B */}
          <div>
            <p className="mb-3 text-center text-sm font-bold text-gray-700">
              {match.team_b.name}
            </p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-center text-xs text-gray-400">
                  Runs
                </label>
                <input
                  type="number"
                  min={0}
                  value={runsB}
                  onChange={(e) => setRunsB(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-center text-xs text-gray-400">
                  Wickets
                </label>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={wicketsB}
                  onChange={(e) => setWicketsB(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="rounded-lg bg-gray-50 py-2 text-center">
                <span className="text-xs text-gray-400">Net Score</span>
                <p className="text-lg font-black text-emerald-600">
                  {netScoreB}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Match complete toggle */}
        <label className="mt-6 flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 px-4 py-3">
          <input
            type="checkbox"
            checked={complete}
            onChange={(e) => setComplete(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
          />
          <span className="text-sm font-medium text-gray-700">
            Match Complete
          </span>
        </label>

        {/* Actions */}
        <div className="mt-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white shadow-md shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:opacity-60"
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
              "Save Result"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
