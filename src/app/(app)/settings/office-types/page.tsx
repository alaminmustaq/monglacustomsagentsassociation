"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { cx } from "@/lib/format";
import { useOfficeTypes } from "@/lib/queries";
import type { OfficeType } from "@/lib/types";
import { Drawer, ErrorBox, Field, PageHeader, SaveButton, Spinner, StatusBadge, useToast } from "@/components/ui";

type Form = {
  id: number | null;
  name: string;
  is_head_office: boolean;
  status: "active" | "inactive";
};

export default function OfficeTypesPage() {
  const officeTypes = useOfficeTypes();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const edit = (t?: OfficeType) => {
    setErrors({});
    setForm(t ? {
      id: t.id,
      name: t.name,
      is_head_office: Boolean(t.is_head_office),
      status: t.status,
    } : {
      id: null,
      name: "",
      is_head_office: false,
      status: "active",
    });
  };

  async function save() {
    if (!form) return;
    setBusy(true);
    const body = {
      name: form.name.trim(),
      is_head_office: form.is_head_office,
      status: form.status,
    };
    try {
      if (form.id) await api(`/settings/office-types/${form.id}`, { method: "PUT", body });
      else await api("/settings/office-types", { method: "POST", body });
      await queryClient.invalidateQueries({ queryKey: ["office-types"] });
      await queryClient.invalidateQueries({ queryKey: ["offices"] });
      toast.success("Office type saved.");
      setForm(null);
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.errors).length) {
        setErrors(Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k, v[0]])));
      } else {
        toast.error(e);
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!form?.id) return;
    setBusy(true);
    try {
      await api(`/settings/office-types/${form.id}`, { method: "DELETE" });
      await queryClient.invalidateQueries({ queryKey: ["office-types"] });
      await queryClient.invalidateQueries({ queryKey: ["offices"] });
      toast.success("Office type deleted.");
      setForm(null);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/settings/offices" className="flex items-center gap-1 hover:text-gray-900">
          <ArrowLeft size={16} /> Back to Offices
        </Link>
      </div>

      <PageHeader
        title="Office Types"
        description="Categories of offices (e.g. Head Office, Branch Office, Regional Office). Used to classify organizational units."
        actions={
          <button className="btn btn-primary" onClick={() => edit()}>
            <Plus size={16} /> New office type
          </button>
        }
      />

      <div className="card overflow-x-auto">
        {officeTypes.isLoading ? (
          <Spinner />
        ) : officeTypes.error ? (
          <div className="p-4"><ErrorBox error={officeTypes.error} /></div>
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th>Type Name</th>
                <th>Head Office Classification</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {officeTypes.data!.map((t) => (
                <tr key={t.id} className="cursor-pointer hover:bg-gray-50" onClick={() => edit(t)}>
                  <td className="font-medium">{t.name}</td>
                  <td>
                    {t.is_head_office ? (
                      <span className="inline-flex items-center rounded bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
                        Head Office
                      </span>
                    ) : (
                      <span className="text-gray-500 text-xs">Branch / Other</span>
                    )}
                  </td>
                  <td><StatusBadge status={t.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Drawer
        open={!!form}
        title={form?.id ? "Edit office type" : "New office type"}
        onClose={() => setForm(null)}
        size="sm"
        footer={
          <>
            {form?.id && (
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
            <Field label="Type Name" required error={errors.name} htmlFor="ot-name">
              <input
                id="ot-name"
                className={cx("input", errors.name && "input-error")}
                maxLength={100}
                placeholder="e.g. Regional Office, Branch, Factory"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>

            <Field label="Classification" htmlFor="ot-head">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  id="ot-head"
                  type="checkbox"
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  checked={form.is_head_office}
                  onChange={(e) => setForm({ ...form, is_head_office: e.target.checked })}
                />
                Acts as Head Office
              </label>
            </Field>

            <Field label="Status" htmlFor="ot-status">
              <select
                id="ot-status"
                className="input"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as Form["status"] })}
              >
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

