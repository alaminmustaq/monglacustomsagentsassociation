"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Plus, Star } from "lucide-react";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { cx, formatDate } from "@/lib/format";
import { useFiscalYears } from "@/lib/queries";
import { useSession } from "@/lib/session";
import { Drawer, ErrorBox, Field, PageHeader, SaveButton, Spinner, StatusBadge, useToast } from "@/components/ui";

type Form = { code: string; label: string; start_date: string; end_date: string; is_current: boolean };

export default function FiscalYearsPage() {
  const { me } = useSession();
  const years = useFiscalYears();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function openNew() {
    setErrors({});
    try {
      const { data } = await api<{ data: Omit<Form, "is_current"> }>("/fiscal-years/proposal");
      setForm({ ...data, is_current: false });
    } catch (e) {
      toast.error(e);
    }
  }

  async function save() {
    if (!form) return;
    setBusy(true);
    try {
      await api("/fiscal-years", { method: "POST", body: form });
      await queryClient.invalidateQueries({ queryKey: ["fiscal-years"] });
      toast.success(`Fiscal year ${form.label} created.`);
      setForm(null);
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.errors).length) setErrors(Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k, v[0]])));
      else toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  async function makeCurrent(id: number) {
    try {
      await api(`/fiscal-years/${id}/make-current`, { method: "POST" });
      await queryClient.invalidateQueries({ queryKey: ["fiscal-years"] });
      queryClient.invalidateQueries({ queryKey: ["kpis"] });
      toast.success("Current fiscal year changed.");
    } catch (e) {
      toast.error(e);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Fiscal Years"
        description="New years are proposed from the fiscal year start month and day in Configuration. Year-end close comes with the reports stage."
        actions={<button className="btn btn-primary" onClick={openNew}><Plus size={16} /> New fiscal year</button>}
      />
      <div className="card overflow-x-auto">
        {years.isLoading ? <Spinner /> : years.error ? <div className="p-4"><ErrorBox error={years.error} /></div> : (
          <table className="table-base">
            <thead><tr><th>Code</th><th>Label</th><th>Start</th><th>End</th><th>Status</th><th>Current</th><th /></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {years.data!.map((y) => (
                <tr key={y.id}>
                  <td className="font-medium">{y.code}</td>
                  <td>{y.label}</td>
                  <td className="tabular">{formatDate(y.start_date, me.preferences)}</td>
                  <td className="tabular">{formatDate(y.end_date, me.preferences)}</td>
                  <td><StatusBadge status={y.status} /></td>
                  <td>{y.is_current && <span className="badge bg-brand-700 text-white"><Star size={11} className="mr-1" />Current</span>}</td>
                  <td className="text-right">{!y.is_current && y.status === "open" && <button className="btn btn-ghost py-1" onClick={() => makeCurrent(y.id)}>Make current</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Drawer open={!!form} title="New fiscal year" onClose={() => setForm(null)} size="sm" footer={<><button className="btn btn-secondary" onClick={() => setForm(null)}>Cancel</button><SaveButton busy={busy} onClick={save}>Create</SaveButton></>}>
        {form && (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Code" required error={errors.code} htmlFor="fy-code"><input id="fy-code" className={cx("input", errors.code && "input-error")} maxLength={10} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></Field>
              <Field label="Label" required error={errors.label} htmlFor="fy-label"><input id="fy-label" className="input" maxLength={20} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} /></Field>
              <Field label="Start date" required error={errors.start_date} htmlFor="fy-start"><input id="fy-start" type="date" className={cx("input", errors.start_date && "input-error")} value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></Field>
              <Field label="End date" required error={errors.end_date} htmlFor="fy-end"><input id="fy-end" type="date" className={cx("input", errors.end_date && "input-error")} value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></Field>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand-700" checked={form.is_current} onChange={(e) => setForm({ ...form, is_current: e.target.checked })} /> Make this the current fiscal year</label>
            <button type="submit" className="hidden" />
          </form>
        )}
      </Drawer>
    </div>
  );
}
