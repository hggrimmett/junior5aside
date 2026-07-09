"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function PlayerActions({
  playerId,
  displayName,
  onChanged,
}: {
  playerId: string;
  displayName: string;
  onChanged: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    const res = await fetch("/api/admin/delete-player", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    setDeleting(false);
    if (!res.ok) {
      setError(json.error ?? "Delete failed");
      return;
    }
    setConfirming(false);
    onChanged();
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-[11px] font-bold text-destructive hover:underline"
        aria-label={`Delete ${displayName}`}
      >
        Delete
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-2">
      <p className="text-[11px] leading-snug text-destructive">
        Delete <strong>{displayName}</strong>?
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="destructive"
          onClick={handleDelete}
          disabled={deleting}
          className="h-8 flex-1 rounded-lg text-xs font-bold"
        >
          {deleting ? "Deleting..." : "Yes, delete"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setConfirming(false)}
          disabled={deleting}
          className="h-8 flex-1 rounded-lg text-xs"
        >
          Cancel
        </Button>
      </div>
      {error && (
        <p className="text-[11px] text-destructive">{error}</p>
      )}
    </div>
  );
}
