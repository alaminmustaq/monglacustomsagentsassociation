"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Plus, Settings } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { cx } from "@/lib/format";
import { useOffices, useOfficeTypes } from "@/lib/queries";
import type { Office } from "@/lib/types";
import { Drawer, ErrorBox, Field, PageHeader, SaveButton, Spinner, StatusBadge, useToast } from "@/components/ui";

type Form = { id: number | null; office_type_id: number | ""; name: string; address: string; phone: string; is_head_office: boolean; status: "active" | "inactive" };

export default function OfficesPage() {
  const offices = useOffices();
  const officeTypes = useOfficeTypes();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const edit = (o?: Office) => {
    setErrors({});
    const defaultTypeId = (officeTypes.data ?? [])[0]?.id ?? "";
    setForm(o ? {
      id: o.id,
      office_type_id: o.office_type_id ?? "",
      name: o.name,
      address: o.address ?? "",
      phone: o.phone ?? "",
      is_head_office: Boolean(o.is_head_office),
      status: o.status,
    } : {
      id: null,
      office_type_id: defaultTypeId,
      name: "",
      address: "",
      phone: "",
      is_head_office: false,
      status: "active",
    });
  };

  async function save() {
    if (!form) return;
    setBusy(true);
    const body = {
      office_type_id: form.office_type_id || null,
      name: form.name.trim(),
      address: form.address.trim() || null,
      phone: form.phone.trim() || null,
      is_head_office: form.is_head_office,
      status: form.status,
    };
    try {
      if (form.id) await api(`/settings/offices/${form.id}`, { method: "PUT", body });
      else await api("/settings/offices", { method: "POST", body });
      await queryClient.invalidateQueries({ queryKey: ["offices"] });
      queryClient.invalidateQueries({ queryKey: ["me"] });
      toast.success("Office saved.");
      setForm(null);
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.errors).length) setErrors(Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k, v[0]])));
      else toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!form?.id) return;
    if (form.is_head_office) {
      toast.error("Head Office cannot be deleted.");
      return;
    }
    setBusy(true);
    try {
      await api(`/settings/offices/${form.id}`, { method: "DELETE" });
      await queryClient.invalidateQueries({ queryKey: ["offices"] });
      queryClient.invalidateQueries({ queryKey: ["me"] });
      toast.success("Office deleted.");
      setForm(null);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader
        title="Offices"
        description="Units of the organization. Transactions and opening balances are recorded per office."
        actions={
          <div className="flex items-center gap-2">
            <Link href="/settings/office-types" className="btn btn-secondary">
              <Settings size={16} /> Office Types
            </Link>
            <button className="btn btn-primary" onClick={() => edit()}>
              <Plus size={16} /> New office
            </button>
          </div>
        }
      />

      <div className="card overflow-x-auto">
        {offices.isLoading ? <Spinner /> : offices.error ? <div className="p-4"><ErrorBox error={offices.error} /></div> : (
          <table className="table-base">
            <thead>
              <tr>
                <th>Name</th>
                <th>Office Type</th>
                <th>Address</th>
                <th>Phone</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {offices.data!.map((o) => (
                <tr key={o.id} className="cursor-pointer hover:bg-gray-50" onClick={() => edit(o)}>
                  <td className="font-medium">
                    {o.name}
                    {o.is_head_office && (
                      <span className="ml-2 inline-flex items-center rounded bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
                        Head Office
                      </span>
                    )}
                  </td>
                  <td>
                    <span className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                      {o.office_type?.name ?? (o.is_head_office ? "Head Office" : "Branch")}
                    </span>
                  </td>
                  <td className="text-gray-600">{o.address}</td>
                  <td className="text-gray-600">{o.phone}</td>
                  <td><StatusBadge status={o.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Drawer
        open={!!form}
        title={form?.id ? "Edit office" : "New office"}
        onClose={() => setForm(null)}
        size="sm"
        footer={
          <>
            {form?.id && !form.is_head_office && (
              <button className="btn btn-danger mr-auto" onClick={remove}>
                Delete
              </button>
            )}
            <button className="btn btn-secondary" onClick={() => setForm(null)}>
              Cancel
            </button>
            <SaveButton busy={busy} onClick={save} />
          </>
        }
      >
        {form && (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
            <Field label="Name" required error={errors.name} htmlFor="o-name">
              <input id="o-name" className={cx("input", errors.name && "input-error")} maxLength={200} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>

            <Field label="Office Type" error={errors.office_type_id} htmlFor="o-type">
              <select
                id="o-type"
                className={cx("input", errors.office_type_id && "input-error")}
                value={form.office_type_id}
                onChange={(e) => {
                  const val = e.target.value ? Number(e.target.value) : "";
                  const selectedType = (officeTypes.data ?? []).find((t) => t.id === val);
                  setForm({
                    ...form,
                    office_type_id: val,
                    is_head_office: selectedType ? selectedType.is_head_office : form.is_head_office,
                  });
                }}
              >
                <option value="">Select an office type</option>
                {(officeTypes.data ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} {t.is_head_office ? "(Head Office)" : ""}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Head Office Flag" htmlFor="o-head">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  id="o-head"
                  type="checkbox"
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  checked={form.is_head_office}
                  onChange={(e) => setForm({ ...form, is_head_office: e.target.checked })}
                />
                Is Head Office
              </label>
            </Field>

            <Field label="Address" error={errors.address} htmlFor="o-addr">
              <textarea id="o-addr" className="input" rows={2} maxLength={500} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </Field>

            <Field label="Phone" error={errors.phone} htmlFor="o-phone">
              <input id="o-phone" className="input" maxLength={50} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>

            <Field label="Status" htmlFor="o-status">
              <select id="o-status" className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Form["status"] })}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </Field>

            <button type="submit" className="hidden" />
          </form>
        )}
      </Drawer>
    </div>
  );
}
