"use client";

import { useActionState, useState } from "react";
import { UserPlus, ShieldCheck, ShieldAlert, Trash2, Plus, KeyRound } from "lucide-react";
import {
  createEmployee,
  assignRole,
  revokeRole,
  setActive,
  resetMfa,
  type ActionResult,
} from "./actions";
import type {
  ManagedUser,
  RoleOption,
  LocationOption,
} from "@/services/admin/users";

interface Props {
  users: ManagedUser[];
  roles: RoleOption[];
  locations: LocationOption[];
  canManage: boolean;
}

function Feedback({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  return (
    <p
      className={`mt-2 text-sm ${result.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}
    >
      {result.message}
    </p>
  );
}

export function UserAdmin({ users, roles, locations, canManage }: Props) {
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="space-y-6">
      {canManage && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <UserPlus className="h-4 w-4" /> Mitarbeiter anlegen
            </h2>
            <button
              onClick={() => setShowCreate((s) => !s)}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm transition hover:bg-[var(--background)]"
            >
              {showCreate ? "Abbrechen" : "Neu"}
            </button>
          </div>
          {showCreate && (
            <CreateForm roles={roles} locations={locations} />
          )}
        </div>
      )}

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="border-b border-[var(--border)] px-5 py-3 text-sm font-medium">
          Mitarbeiter ({users.length})
        </div>
        <ul className="divide-y divide-[var(--border)]">
          {users.map((u) => (
            <UserRow
              key={u.profileId}
              user={u}
              roles={roles}
              locations={locations}
              canManage={canManage}
            />
          ))}
          {users.length === 0 && (
            <li className="px-5 py-6 text-sm text-[var(--muted)]">
              Noch keine Mitarbeiter.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

function CreateForm({
  roles,
  locations,
}: {
  roles: RoleOption[];
  locations: LocationOption[];
}) {
  const [result, action, pending] = useActionState(createEmployee, null);

  return (
    <form action={action} className="mt-4 grid gap-3 sm:grid-cols-2">
      <div>
        <label className="block text-xs font-medium text-[var(--muted)]">Name</label>
        <input
          name="fullName"
          required
          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand-500"
          placeholder="Max Mustermann"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-[var(--muted)]">E-Mail</label>
        <input
          name="email"
          type="email"
          required
          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand-500"
          placeholder="name@miningadventureworld.de"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-[var(--muted)]">
          Initialpasswort
        </label>
        <input
          name="password"
          type="text"
          required
          minLength={10}
          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand-500"
          placeholder="mind. 10 Zeichen"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-[var(--muted)]">Rolle</label>
          <select
            name="roleId"
            required
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-transparent px-2 py-2 text-sm outline-none focus:border-brand-500"
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--muted)]">
            Standort
          </label>
          <select
            name="locationId"
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-transparent px-2 py-2 text-sm outline-none focus:border-brand-500"
          >
            <option value="">global</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "Lege an…" : "Mitarbeiter anlegen"}
        </button>
        <Feedback result={result} />
        <p className="mt-2 text-xs text-[var(--muted)]">
          Der Mitarbeiter richtet beim ersten Login selbst seine 2FA ein.
          Initialpasswort sicher übermitteln.
        </p>
      </div>
    </form>
  );
}

function UserRow({
  user,
  roles,
  locations,
  canManage,
}: {
  user: ManagedUser;
  roles: RoleOption[];
  locations: LocationOption[];
  canManage: boolean;
}) {
  const [assignResult, assignAction, assignPending] = useActionState(assignRole, null);
  const [activeResult, activeAction] = useActionState(setActive, null);
  const [mfaResult, mfaAction, mfaPending] = useActionState(resetMfa, null);
  const [open, setOpen] = useState(false);

  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium">{user.fullName ?? user.email}</span>
            {user.mfaEnabled ? (
              <ShieldCheck
                className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
                aria-label="2FA aktiv"
              />
            ) : (
              <ShieldAlert
                className="h-4 w-4 text-amber-500"
                aria-label="2FA nicht eingerichtet"
              />
            )}
            {!user.isActive && (
              <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase text-red-500">
                inaktiv
              </span>
            )}
          </div>
          <div className="text-sm text-[var(--muted)]">{user.email}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {user.roles.length === 0 && (
              <span className="text-xs text-[var(--muted)]">keine Rolle</span>
            )}
            {user.roles.map((r) => (
              <span
                key={r.userRoleId}
                className="inline-flex items-center gap-1 rounded-full bg-[var(--background)] px-2 py-0.5 text-xs"
              >
                {r.roleName}
                {r.locationName ? ` · ${r.locationName}` : ""}
                {canManage && (
                  <RevokeButton userRoleId={r.userRoleId} />
                )}
              </span>
            ))}
          </div>
        </div>

        {canManage && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setOpen((o) => !o)}
              className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs transition hover:bg-[var(--background)]"
            >
              <Plus className="h-3.5 w-3.5" /> Rolle
            </button>
            <form action={activeAction}>
              <input type="hidden" name="profileId" value={user.profileId} />
              <input type="hidden" name="active" value={(!user.isActive).toString()} />
              <button
                type="submit"
                className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs transition hover:bg-[var(--background)]"
              >
                {user.isActive ? "Deaktivieren" : "Aktivieren"}
              </button>
            </form>
            <form
              action={mfaAction}
              onSubmit={(e) => {
                if (
                  !confirm(
                    `2FA von ${user.email} wirklich zurücksetzen? Der Mitarbeiter muss beim nächsten Login neu einrichten.`,
                  )
                ) {
                  e.preventDefault();
                }
              }}
            >
              <input type="hidden" name="profileId" value={user.profileId} />
              <button
                type="submit"
                disabled={mfaPending}
                title="2FA zurücksetzen"
                className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs text-amber-600 transition hover:bg-amber-500/10 disabled:opacity-60 dark:text-amber-400"
              >
                <KeyRound className="h-3.5 w-3.5" />
                {mfaPending ? "Reset…" : "2FA reset"}
              </button>
            </form>
          </div>
        )}
      </div>

      {canManage && open && (
        <form
          action={assignAction}
          className="mt-3 flex flex-wrap items-end gap-2 rounded-lg bg-[var(--background)] p-3"
        >
          <input type="hidden" name="profileId" value={user.profileId} />
          <div>
            <label className="block text-xs text-[var(--muted)]">Rolle</label>
            <select
              name="roleId"
              required
              className="mt-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm"
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--muted)]">Standort</label>
            <select
              name="locationId"
              className="mt-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm"
            >
              <option value="">global</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={assignPending}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
          >
            Zuweisen
          </button>
          <Feedback result={assignResult} />
        </form>
      )}

      <Feedback result={activeResult} />
      <Feedback result={mfaResult} />
    </li>
  );
}

function RevokeButton({ userRoleId }: { userRoleId: string }) {
  const [, action, pending] = useActionState(revokeRole, null);
  return (
    <form action={action} className="inline">
      <input type="hidden" name="userRoleId" value={userRoleId} />
      <button
        type="submit"
        disabled={pending}
        aria-label="Rolle entziehen"
        title="Rolle entziehen"
        className="text-[var(--muted)] transition hover:text-red-500"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </form>
  );
}
