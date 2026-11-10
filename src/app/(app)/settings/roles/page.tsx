"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Shield, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { cx } from "@/lib/format";
import type { PermissionDef, Role } from "@/lib/types";
import { ConfirmDialog, ErrorBox, Field, PageHeader, SaveButton, Spinner, useToast } from "@/components/ui";

type Draft = { id: number | null; name: string; description: string; permissions: Set<string> };

export default function RolesPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const roles = useQuery({ queryKey: ["roles"], queryFn: () => api<{ data: Role[] }>("/settings/roles").then((r) => r.data) });
  const catalogue = useQuery({ queryKey: ["permissions"], queryFn: () => api<{ data: PermissionDef[] }>("/settings/permissions").then((r) => r.data), staleTime: Infinity });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (!draft && roles.data?.length) select(roles.data[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roles.data]);

  const groups = useMemo(() => {
    const map = new Map<string, PermissionDef[]>();
    for (const p of catalogue.data ?? []) {
      if (!map.has(p.group)) map.set(p.group, []);
      map.get(p.group)!.push(p);
    }
    return [...map.entries()];
  }, [catalogue.data]);

  function select(role: Role) {
    setErrors({});
    setDraft({ id: role.id, name: role.name, description: role.description ?? "", permissions: new Set(role.permissions) });
  }

  const original = roles.data?.find((r) => r.id === draft?.id);

  function toggle(keys: string[], on: boolean) {
    setDraft((d) => {
      if (!d) return d;
      const next = new Set(d.permissions);
      keys.forEach((k) => (on ? next.add(k) : next.delete(k)));
      return { ...d, permissions: next };
    });
  }

  async function save() {
    if (!draft) return;
    if (!draft.name.trim()) {
      setErrors({ name: "Enter a role name." });
      return;
    }
    setBusy(true);
    setErrors({});
    const body = { name: draft.name.trim(), description: draft.description.trim() || null, permissions: [...draft.permissions] };
    try {
      const result = draft.id
        ? await api<{ data: { id: number } }>(`/settings/roles/${draft.id}`, { method: "PUT", body })
        : await api<{ data: { id: number } }>("/settings/roles", { method: "POST", body });
      const fresh = await queryClient.fetchQuery({ queryKey: ["roles"], queryFn: () => api<{ data: Role[] }>("/settings/roles").then((r) => r.data) });
      const saved = fresh.find((r) => r.id === result.data.id);
      if (saved) select(saved);
      queryClient.invalidateQueries({ queryKey: ["me"] });
      toast.success(`Role "${body.name}" saved.${original && original.users_count ? ` It applies to ${original.users_count} user(s).` : ""}`);
    } catch (e) {
      if (e instanceof ApiError) {
        setErrors(Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k, v[0]])));
        if (!Object.keys(e.errors).length) toast.error(e);
      } else toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!draft?.id) return;
    setBusy(true);
    try {
      await api(`/settings/roles/${draft.id}`, { method: "DELETE" });
      toast.success("Role deleted.");
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: ["roles"] });
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Roles"
        description="A role is a named set of permissions. Change roles here at any time; users get the combined permissions of all their roles."
        actions={
          <button className="btn btn-primary" onClick={() => { setErrors({}); setDraft({ id: null, name: "", description: "", permissions: new Set() }); }}>
            <Plus size={16} /> New role
          </button>
        }
      />
      {roles.isLoading || catalogue.isLoading ? (
        <Spinner />
      ) : roles.error ? (
        <ErrorBox error={roles.error} />
      ) : (
        <div className="flex flex-col gap-4 lg:flex-row">
          <div className="card h-fit shrink-0 p-2 lg:w-64">
            {roles.data!.map((r) => (
              <button
                key={r.id}
                onClick={() => select(r)}
                className={cx("flex w-full items-start gap-2.5 rounded-md px-3 py-2.5 text-left", draft?.id === r.id ? "bg-brand-50" : "hover:bg-gray-50")}
              >
                <Shield size={16} className="mt-0.5 shrink-0 text-brand-700" />
                <span className="min-w-0">
                  <span className={cx("block truncate text-sm", draft?.id === r.id ? "font-semibold text-brand-900" : "text-gray-900")}>{r.name}</span>
                  <span className="block text-xs text-gray-500">
                    {r.permissions.length} permissions, {r.users_count} user{r.users_count === 1 ? "" : "s"}
                  </span>
                </span>
              </button>
            ))}
          </div>

          {draft && (
            <div className="card flex-1">
              <div className="grid grid-cols-1 gap-4 border-b border-gray-200 p-5 sm:grid-cols-2">
                <Field label="Role name" required error={errors.name} htmlFor="role-name">
                  <input id="role-name" className={cx("input", errors.name && "input-error")} maxLength={100} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                </Field>
                <Field label="Description" htmlFor="role-desc">
                  <input id="role-desc" className="input" maxLength={255} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
                </Field>
              </div>
              {errors.roles && <p className="mx-5 mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{errors.roles}</p>}
              <div className="divide-y divide-gray-100">
                {groups.map(([group, perms]) => {
                  const all = perms.every((p) => draft.permissions.has(p.key));
                  return (
                    <fieldset key={group} className="px-5 py-3.5">
                      <div className="mb-2 flex items-center justify-between">
                        <legend className="text-sm font-semibold text-gray-900">{group}</legend>
                        <button type="button" className="text-xs font-medium text-brand-700 hover:underline" onClick={() => toggle(perms.map((p) => p.key), !all)}>
                          {all ? "Clear all" : "Select all"}
                        </button>
                      </div>
                      <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
                        {perms.map((p) => (
                          <label key={p.key} className="flex cursor-pointer items-start gap-2 text-sm">
                            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-700" checked={draft.permissions.has(p.key)} onChange={(e) => toggle([p.key], e.target.checked)} />
                            <span>
                              <span className="text-gray-800">{p.description}</span>
                              <code className="block text-[11px] text-gray-400">{p.key}</code>
                            </span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  );
                })}
              </div>
              <div className="flex justify-end gap-2 border-t border-gray-200 bg-gray-50 px-5 py-3">
                {draft.id && (
                  <button className="btn btn-danger mr-auto" onClick={() => setConfirm(true)} disabled={!!original?.users_count} title={original?.users_count ? "Move its users to another role first" : undefined}>
                    <Trash2 size={16} /> Delete
                  </button>
                )}
                <SaveButton busy={busy} onClick={save}>{draft.id ? "Save role" : "Create role"}</SaveButton>
              </div>
            </div>
          )}
        </div>
      )}
      <ConfirmDialog open={confirm} title="Delete role" message={`Delete the role "${draft?.name}"?`} confirmLabel="Delete" danger busy={busy} onConfirm={remove} onCancel={() => setConfirm(false)} />
    </div>
  );
}
