"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { cx, formatDateTime } from "@/lib/format";
import { useOffices } from "@/lib/queries";
import { useSession } from "@/lib/session";
import type { OrgUser, Role } from "@/lib/types";
import { Drawer, ErrorBox, Field, PageHeader, SaveButton, Spinner, StatusBadge, useToast } from "@/components/ui";

type Form = { id: number | null; name: string; username: string; email: string; password: string; status: "active" | "inactive"; role_ids: number[]; office_ids: number[] };

export default function UsersPage() {
  const { me } = useSession();
  const toast = useToast();
  const queryClient = useQueryClient();
  const users = useQuery({ queryKey: ["users"], queryFn: () => api<{ data: OrgUser[] }>("/settings/users").then((r) => r.data) });
  const roles = useQuery({ queryKey: ["roles-list"], queryFn: () => api<{ data: Role[] }>("/settings/roles-list").then((r) => r.data) });
  const offices = useOffices();
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const roleName = useMemo(() => new Map((roles.data ?? []).map((r) => [r.id, r.name])), [roles.data]);
  const list = (users.data ?? []).filter((u) => !search || `${u.name} ${u.username} ${u.email ?? ""}`.toLowerCase().includes(search.toLowerCase()));

  function edit(u?: OrgUser) {
    setErrors({});
    setForm(
      u
        ? { id: u.id, name: u.name, username: u.username, email: u.email ?? "", password: "", status: u.status, role_ids: u.role_ids, office_ids: u.office_ids }
        : { id: null, name: "", username: "", email: "", password: "", status: "active", role_ids: [], office_ids: [] },
    );
  }

  async function save() {
    if (!form) return;
    const local: Record<string, string> = {};
    if (!form.name.trim()) local.name = "Enter the name.";
    if (!form.id && !form.username.trim()) local.username = "Enter a username.";
    if (!form.id && !form.password) local.password = "Enter a password.";
    setErrors(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    const body: Record<string, unknown> = {
      name: form.name.trim(), email: form.email.trim() || null, status: form.status, role_ids: form.role_ids, office_ids: form.office_ids,
    };
    if (form.password) body.password = form.password;
    if (!form.id) body.username = form.username.trim();
    try {
      if (form.id) await api(`/settings/users/${form.id}`, { method: "PUT", body });
      else await api("/settings/users", { method: "POST", body });
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      if (form.id === me.user.id) queryClient.invalidateQueries({ queryKey: ["me"] });
      toast.success(form.id ? "User saved." : "User created.");
      setForm(null);
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.errors).length) setErrors(Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k.split(".")[0], v[0]])));
      else toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  const toggle = (key: "role_ids" | "office_ids", id: number, on: boolean) =>
    setForm((f) => (f ? { ...f, [key]: on ? [...f[key], id] : f[key].filter((x) => x !== id) } : f));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Users"
        description="People who can sign in to this organization, their roles and the offices they work in."
        actions={<button className="btn btn-primary" onClick={() => edit()}><Plus size={16} /> New user</button>}
      />
      <div className="card">
        <div className="border-b border-gray-200 p-3">
          <div className="relative max-w-sm">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input pl-9" placeholder="Search users" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search users" />
          </div>
        </div>
        {users.isLoading ? (
          <Spinner />
        ) : users.error ? (
          <div className="p-4"><ErrorBox error={users.error} /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr><th>Name</th><th>Username</th><th>Roles</th><th>Offices</th><th>Status</th><th>Last sign-in</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {list.map((u) => (
                  <tr key={u.id} className="cursor-pointer hover:bg-gray-50" onClick={() => edit(u)}>
                    <td className="font-medium">{u.name}</td>
                    <td className="text-gray-600">{u.username}</td>
                    <td>{u.role_ids.map((id) => roleName.get(id)).filter(Boolean).join(", ") || <span className="text-gray-400">None</span>}</td>
                    <td className="text-gray-600">
                      {u.office_ids.length ? (offices.data ?? []).filter((o) => u.office_ids.includes(o.id)).map((o) => o.name).join(", ") : "All offices"}
                    </td>
                    <td>
                      <span className="flex items-center gap-1.5">
                        <StatusBadge status={u.status} />
                        {u.locked && <span className="badge bg-amber-50 text-amber-800"><Lock size={11} className="mr-1" />Locked</span>}
                      </span>
                    </td>
                    <td className="text-gray-600">{formatDateTime(u.last_login_at, me.preferences) || "Never"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Drawer
        open={!!form}
        title={form?.id ? "Edit user" : "New user"}
        onClose={() => setForm(null)}
        footer={<><button className="btn btn-secondary" onClick={() => setForm(null)}>Cancel</button><SaveButton busy={busy} onClick={save} /></>}
      >
        {form && (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
            {errors.roles && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{errors.roles}</p>}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Name" required error={errors.name} htmlFor="u-name">
                <input id="u-name" className={cx("input", errors.name && "input-error")} maxLength={150} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label="Username" required={!form.id} error={errors.username} htmlFor="u-username" hint={form.id ? "Usernames cannot change" : "Letters, digits, dot, dash or underscore"}>
                <input id="u-username" className={cx("input", errors.username && "input-error")} maxLength={100} value={form.username} disabled={!!form.id} onChange={(e) => setForm({ ...form, username: e.target.value })} autoComplete="off" />
              </Field>
              <Field label="Email" error={errors.email} htmlFor="u-email">
                <input id="u-email" type="email" className={cx("input", errors.email && "input-error")} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </Field>
              <Field label={form.id ? "New password" : "Password"} required={!form.id} error={errors.password} htmlFor="u-pass" hint={form.id ? "Leave empty to keep the current password. Setting one also unlocks the account." : "At least 8 characters, with a letter and a digit"}>
                <input id="u-pass" type="password" className={cx("input", errors.password && "input-error")} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" />
              </Field>
              <Field label="Status" htmlFor="u-status">
                <select id="u-status" className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Form["status"] })}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </Field>
            </div>
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-gray-700">Roles</legend>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {(roles.data ?? []).map((r) => (
                  <label key={r.id} className="flex items-start gap-2 text-sm">
                    <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-700" checked={form.role_ids.includes(r.id)} onChange={(e) => toggle("role_ids", r.id, e.target.checked)} />
                    <span>{r.name}{r.description && <span className="block text-xs text-gray-500">{r.description}</span>}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-gray-700">Offices</legend>
              <p className="mb-1.5 text-xs text-gray-500">Leave all unticked to give access to every office.</p>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {(offices.data ?? []).map((o) => (
                  <label key={o.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="h-4 w-4 accent-brand-700" checked={form.office_ids.includes(o.id)} onChange={(e) => toggle("office_ids", o.id, e.target.checked)} />
                    {o.name}
                  </label>
                ))}
              </div>
            </fieldset>
            <button type="submit" className="hidden" />
          </form>
        )}
      </Drawer>
    </div>
  );
}
