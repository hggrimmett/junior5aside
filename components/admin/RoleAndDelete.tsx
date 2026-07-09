"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ROLES = ["parent", "mentor", "coach"] as const;
type AssignableRole = (typeof ROLES)[number];

export default function RoleAndDelete({
  profileId,
  currentRole,
  displayName,
  cascadeWarning,
  onChanged,
}: {
  profileId: string;
  currentRole: AssignableRole;
  displayName: string;
  cascadeWarning: string | null;
  onChanged: () => void;
}) {
  const [pendingRole, setPendingRole] = useState<AssignableRole>(currentRole);
  const [savingRole, setSavingRole] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveRole(newRole: AssignableRole) {
    if (newRole === currentRole) return;
    setSavingRole(true);
    setError(null);
    const res = await fetch("/api/admin/update-role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId, newRole }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    setSavingRole(false);
    if (!res.ok) {
      setPendingRole(currentRole);
      setError(json.error ?? "Role update failed");
      return;
    }
    onChanged();
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    const res = await fetch("/api/admin/delete-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    setDeleting(false);
    if (!res.ok) {
      setError(json.error ?? "Delete failed");
      return;
    }
    setConfirmDelete(false);
    onChanged();
  }

  return (
    <div className="border-t pt-3 space-y-2">
      <div className="flex items-center gap-2">
        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground shrink-0">
          Role
        </label>
        <Select
          value={pendingRole}
          onValueChange={(v) => {
            const r = v as AssignableRole;
            setPendingRole(r);
            saveRole(r);
          }}
          disabled={savingRole || deleting}
        >
          <SelectTrigger className="h-9 flex-1 rounded-lg text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {savingRole && <span className="text-[11px] text-muted-foreground">Saving...</span>}
      </div>

      {!confirmDelete ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setError(null);
            setConfirmDelete(true);
          }}
          disabled={savingRole || deleting}
          className="h-9 w-full rounded-lg border-destructive/40 text-xs font-bold text-destructive hover:bg-destructive/5"
        >
          Delete {displayName}
        </Button>
      ) : (
        <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-2">
          <p className="text-[11px] leading-snug text-destructive">
            Permanently delete <strong>{displayName}</strong>?
            {cascadeWarning ? ` ${cascadeWarning}` : ""}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
              className="h-9 flex-1 rounded-lg text-xs font-bold"
            >
              {deleting ? "Deleting..." : "Yes, delete"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
              className="h-9 flex-1 rounded-lg text-xs"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-[11px] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
