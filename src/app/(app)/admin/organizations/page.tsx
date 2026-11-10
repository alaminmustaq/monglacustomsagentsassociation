"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { cx } from "@/lib/format";
import { useSession } from "@/lib/session";
import { Drawer, ErrorBox, Field, PageHeader, SaveButton, Spinner, StatusBadge, useToast } from "@/components/ui";

type Org = { id: number; name: string; code: string; currency_code: string; status: string; users_count: number };
type Form = { name: string; code: string; currency_code: string; seed_chart_of_accounts: boolean; admin: { name: string; username: string; email: string; password: string } };
const EMPTY: Form = { name: "", code: "", currency_code: "BDT", seed_chart_of_accounts: true, admin: { name: "", username: "", email: "", password: "" } };

export default function OrganizationsPage() {
  const { me } = useSession();
  const toast = useToast();
  const queryClient = useQueryClient();
  const orgs = useQuery({ queryKey: ["organizations"], queryFn: () => api<{ data: Org[] }>("/admin/organizations").then((r) => r.data), enabled: me.user.is_super_admin });
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  if (!me.user.is_super_admin) return <ErrorBox error={new Error("Only a Super Admin can manage organizations.")} />;

  async function save() {
    if (!form) return;
    setBusy(true);
    setErrors({});
    try {
      await api("/admin/organizations", { method: "POST", body: { ...form, admin: { ...form.admin, email: form.admin.email || null } } });
      await queryClient.invalidateQueries({ queryKey: ["organizations"] });
      queryClient.invalidateQueries({ queryKey: ["me"] });
      toast.success(`Organization ${form.name} is ready.`);
      setForm(null);
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.errors).length) setErrors(Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k, v[0]])));
      else toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(o: Org, status: string) {
    try {
      await api(`/admin/organizations/${o.id}`, { method: "PUT", body: { status } });
      await queryClient.invalidateQueries({ queryKey: ["organizations"] });
      toast.success(`${o.name} is now ${status}.`);
    } catch (e) {
      toast.error(e);
    }
  }

  const a = (k: keyof Form["admin"], v: string) => setForm((f) => (f ? { ...f, admin: { ...f.admin, [k]: v } } : f));

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Organizations"
        description="Each organization keeps its data separate. Creating one sets up its head office, current fiscal year, default roles, chart of accounts and first admin."
        actions={<button className="btn btn-primary" onClick={() => { setErrors({}); setForm(EMPTY); }}><Plus size={16} /> New organization</button>}
      />
      <div className="card overflow-x-auto">
        {orgs.isLoading ? <Spinner /> : orgs.error ? <div className="p-4"><ErrorBox error={orgs.error} /></div> : (
          <table className="table-base">
            <thead><tr><th>Code</th><th>Name</th><th>Currency</th><th>Users</th><th>Status</th><th /></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {orgs.data!.map((o) => (
                <tr key={o.id}>
                  <td className="font-medium">{o.code}</td><td>{o.name}</td><td>{o.currency_code}</td><td>{o.users_count}</td>
                  <td><StatusBadge status={o.status} /></td>
                  <td className="text-right">
                    <button className="btn btn-ghost py-1" onClick={() => setStatus(o, o.status === "active" ? "suspended" : "active")}>{o.status === "active" ? "Suspend" : "Activate"}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Drawer open={!!form} title="New organization" onClose={() => setForm(null)} footer={<><button className="btn btn-secondary" onClick={() => setForm(null)}>Cancel</button><SaveButton busy={busy} onClick={save}>Create</SaveButton></>}>
        {form && (
          <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); save(); }}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2"><Field label="Name" required error={errors.name} htmlFor="org-name"><input id="org-name" className={cx("input", errors.name && "input-error")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field></div>
              <Field label="Code" required error={errors.code} htmlFor="org-code" hint="Short unique code, e.g. ACME"><input id="org-code" className={cx("input", errors.code && "input-error")} maxLength={30} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></Field>
              <Field label="Currency" error={errors.currency_code} htmlFor="org-cur"><input id="org-cur" className="input" maxLength={3} value={form.currency_code} onChange={(e) => setForm({ ...form, currency_code: e.target.value.toUpperCase() })} /></Field>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand-700" checked={form.seed_chart_of_accounts} onChange={(e) => setForm({ ...form, seed_chart_of_accounts: e.target.checked })} /> Start with the default chart of accounts (303 accounts)</label>
            <fieldset className="space-y-4 rounded-md border border-gray-200 p-4">
              <legend className="px-1 text-sm font-semibold text-gray-900">First admin user</legend>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Name" required error={errors["admin.name"]} htmlFor="adm-name"><input id="adm-name" className="input" value={form.admin.name} onChange={(e) => a("name", e.target.value)} /></Field>
                <Field label="Username" required error={errors["admin.username"]} htmlFor="adm-user"><input id="adm-user" className="input" value={form.admin.username} onChange={(e) => a("username", e.target.value)} autoComplete="off" /></Field>
                <Field label="Email" error={errors["admin.email"]} htmlFor="adm-email"><input id="adm-email" type="email" className="input" value={form.admin.email} onChange={(e) => a("email", e.target.value)} /></Field>
                <Field label="Password" required error={errors["admin.password"]} htmlFor="adm-pass" hint="At least 8 characters, with a letter and a digit"><input id="adm-pass" type="password" className="input" value={form.admin.password} onChange={(e) => a("password", e.target.value)} autoComplete="new-password" /></Field>
              </div>
            </fieldset>
            <button type="submit" className="hidden" />
          </form>
        )}
      </Drawer>
    </div>
  );
}
