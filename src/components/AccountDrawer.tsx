"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useOffices } from "@/lib/queries";
import type { Account } from "@/lib/types";
import { useSession } from "@/lib/session";
import { ConfirmDialog, Drawer, Field, MultiSelectDropdown, SaveButton, Spinner, useToast } from "./ui";

type Mode = { kind: "create"; parentId?: number | null } | { kind: "edit"; id: number };

type Form = {
  parent_id: number | "";
  office_ids: number[];
  code: string;
  title: string;
  gl_id: string;
  old_code: string;
  is_posting: boolean;
  normal_side: "D" | "C" | "";
  economic_code: string;
  status: "active" | "inactive";
};

const EMPTY: Form = { parent_id: "", office_ids: [], code: "", title: "", gl_id: "", old_code: "", is_posting: true, normal_side: "", economic_code: "", status: "active" };

export function AccountDrawer({ mode, accounts, onClose }: { mode: Mode | null; accounts: Account[]; onClose: () => void }) {
  const { me, can } = useSession();
  const officesQuery = useOffices();
  const offices = useMemo(() => {
    if (officesQuery.data && officesQuery.data.length > 0) {
      return officesQuery.data;
    }
    return me.offices;
  }, [officesQuery.data, me.offices]);

  // Head office is the default base office; do not show Head Office in branch selection
  const branchOffices = useMemo(() => {
    return offices.filter((o) => !o.is_head_office);
  }, [offices]);
  
  const toast = useToast();
  const queryClient = useQueryClient();
  const canManage = can("accounts.manage");
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const editId = mode?.kind === "edit" ? mode.id : null;
  const detail = useQuery({
    queryKey: ["account", editId],
    queryFn: () => api<{ data: Account & { parent: { id: number; code: string; title: string } | null; has_children: boolean; has_activity: boolean } }>(`/accounts/${editId}`),
    enabled: editId !== null,
  });

  const controls = useMemo(
    () => accounts.filter((a) => !a.is_posting && a.status === "active" && a.level < 5).sort((a, b) => a.code.localeCompare(b.code)),
    [accounts],
  );

  const parentAccount = useMemo(() => {
    if (!form.parent_id) return null;
    return accounts.find((a) => a.id === form.parent_id) ?? null;
  }, [form.parent_id, accounts]);

  const parentHasOffice = Boolean(mode?.kind === "create" && parentAccount?.office_id && !parentAccount?.office?.is_head_office);

  useEffect(() => {
    setErrors({});
    if (mode?.kind === "create") {
      const p = mode.parentId ? accounts.find((a) => a.id === mode.parentId) : undefined;
      const headOfficeIds = new Set(offices.filter((o) => o.is_head_office).map((o) => o.id));
      const defaultOfficeIds = (p?.office_id ? [p.office_id] : (me.office_id ? [me.office_id] : []))
        .filter((id) => !headOfficeIds.has(id));
      setForm({ ...EMPTY, parent_id: mode.parentId ?? "", office_ids: defaultOfficeIds });
    }
  }, [mode, me.office_id, accounts, offices]);

  // When control account changes, pre-fill parent's branch if none selected yet
  useEffect(() => {
    if (mode?.kind === "create" && form.parent_id) {
      const p = accounts.find((a) => a.id === form.parent_id);
      const isHeadOffice = p?.office?.is_head_office;
      if (p?.office_id && !isHeadOffice && !form.office_ids.length) {
        setForm((f) => ({ ...f, office_ids: [p.office_id!] }));
      }
    }
  }, [form.parent_id, mode, accounts]);

  useEffect(() => {
    const a = detail.data?.data;
    if (a && mode?.kind === "edit") {
      const headOfficeIds = new Set(offices.filter((o) => o.is_head_office).map((o) => o.id));
      const officeIdsFromData = (a as unknown as { office_ids?: number[] }).office_ids;
      const rawOfficeIds = officeIdsFromData && officeIdsFromData.length > 0
        ? officeIdsFromData
        : a.office_id
        ? [a.office_id]
        : [];
      const initialOfficeIds = rawOfficeIds.filter((id) => !headOfficeIds.has(id));
      setForm({
        parent_id: a.parent_id ?? "",
        office_ids: initialOfficeIds,
        code: a.code,
        title: a.title,
        gl_id: a.gl_id ?? "",
        old_code: a.old_code ?? "",
        is_posting: a.is_posting,
        normal_side: a.normal_side,
        economic_code: a.economic_code ?? "",
        status: a.status,
      });
    }
  }, [detail.data, mode, me.office_id, offices]);

  // Preview the generated code when the control account changes (FR-COA-10).
  useEffect(() => {
    if (mode?.kind !== "create" || !form.parent_id) {
      if (mode?.kind === "create") setForm((f) => ({ ...f, code: "", gl_id: "" }));
      return;
    }
    let cancelled = false;
    api<{ code: string; normal_side: "D" | "C"; gl_id?: string }>("/accounts/next-code", { query: { parent_id: form.parent_id } })
      .then((r) => {
        if (!cancelled) {
          setForm((f) => ({
            ...f,
            code: r.code,
            normal_side: r.normal_side,
            gl_id: f.gl_id ? f.gl_id : (r.gl_id ?? ""),
          }));
        }
      })
      .catch((e) => !cancelled && setErrors((x) => ({ ...x, parent_id: e instanceof ApiError ? e.field("parent_id") ?? e.message : "Could not get a code." })));
    return () => {
      cancelled = true;
    };
  }, [form.parent_id, mode]);

if (!mode) return null;
const creating = mode.kind === "create";
const account = detail.data?.data;
const readOnly = !canManage;
const postingLocked = !creating && (account?.has_children || account?.has_activity);
const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

async function save() {
  const local: Record<string, string> = {};
  if (creating && !form.parent_id) local.parent_id = "Choose a control account.";
  if (!form.title.trim()) local.title = "Title must have some value.";
  setErrors(local);
  if (Object.keys(local).length) return;

  setBusy(true);
  const body = {
    title: form.title.trim(),
    gl_id: form.gl_id.trim() || null,
    old_code: form.old_code.trim() || null,
    is_posting: form.is_posting,
    normal_side: form.normal_side || undefined,
    economic_code: form.economic_code.trim() || null,
    status: form.status,
    office_ids: form.office_ids,
    office_id: form.office_ids[0] ?? null,
    ...(creating ? { parent_id: form.parent_id } : {}),
  };
  try {
    if (creating) await api("/accounts", { method: "POST", body });
    else if (mode?.kind === "edit") await api(`/accounts/${mode.id}`, { method: "PUT", body });
    await queryClient.invalidateQueries({ queryKey: ["accounts"] });
    await queryClient.invalidateQueries({ queryKey: ["account"] });
    toast.success(creating ? "Account created." : "Account saved.");
    onClose();
  } catch (e) {
    if (e instanceof ApiError && Object.keys(e.errors).length) setErrors(Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k, v[0]])));
    else toast.error(e);
  } finally {
    setBusy(false);
  }
}

async function remove() {
  if (mode?.kind !== "edit") return;
  setBusy(true);
  try {
    await api(`/accounts/${mode.id}`, { method: "DELETE" });
    await queryClient.invalidateQueries({ queryKey: ["accounts"] });
    toast.success("Account deleted.");
    setConfirmDelete(false);
    onClose();
  } catch (e) {
    toast.error(e);
    setConfirmDelete(false);
  } finally {
    setBusy(false);
  }
}

  const isBranchOfficeAccount = Boolean(account?.office && account.office.is_head_office === false);
  const isHeadOfficeUser = Boolean(
    me.user.is_super_admin ||
    me.roles.includes("Org Admin") ||
    me.offices.some((o) => o.is_head_office && (o.id === me.office_id || !me.office_id))
  );

  const canDelete =
    !creating &&
    canManage &&
    account &&
    !account.has_activity &&
    account.level > 1 &&
    (isBranchOfficeAccount ? isHeadOfficeUser : !account.has_children);

return (
  <Drawer
    open
    title={creating ? "New account" : readOnly ? "Account" : "Edit account"}
    onClose={onClose}
    footer={
      <>
        {canDelete && (
          <button className="btn btn-danger mr-auto" onClick={() => setConfirmDelete(true)}>
            Delete
          </button>
        )}
        <button className="btn btn-secondary" onClick={onClose}>
          {readOnly ? "Close" : "Cancel"}
        </button>
        {!readOnly && <SaveButton busy={busy} onClick={save} />}
      </>
    }
  >
    {!creating && detail.isLoading ? (
      <Spinner />
    ) : (
      <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field label="Organization unit">
          <p className="py-2 text-sm text-gray-800">{me.organization?.name}</p>
        </Field>
        <Field
          label="Branches"
          error={errors.office_ids}
          htmlFor="office_ids"
          hint={
            account?.has_children || !form.is_posting
              ? "Header account: selected branches are assigned to child accounts only (parent remains unassigned)"
              : parentHasOffice
              ? `Control account belongs to ${parentAccount?.office?.name ?? "a branch"}`
              : undefined
          }
        >
          <MultiSelectDropdown
            id="office_ids"
            options={branchOffices}
            value={form.office_ids}
            disabled={readOnly}
            invalid={!!errors.office_ids}
            placeholder={branchOffices.length ? "Select branches" : "No branch offices"}
            allLabel="All branches"
            onChange={(selected) => {
              setErrors((x) => ({ ...x, office_ids: "" }));
              setForm((f) => ({ ...f, office_ids: selected as number[] }));
            }}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Control A/C" required={creating} error={errors.parent_id} htmlFor="parent_id">
            {creating ? (
              <select id="parent_id" className={`input ${errors.parent_id ? "input-error" : ""}`} value={form.parent_id} onChange={(e) => { setErrors((x) => ({ ...x, parent_id: "" })); set("parent_id", e.target.value ? Number(e.target.value) : ""); }}>
                <option value="">Select a control account</option>
                {controls.map((c) => (
                  <option key={c.id} value={c.id}>
                    {"  ".repeat(c.level - 1)}
                    {c.title} {c.office && !c.office.is_head_office ? `[${c.office.name}] ` : ""}({c.code})
                  </option>
                ))}
              </select>
            ) : (
              <p className="py-2 text-sm text-gray-800">
                {account?.parent
                  ? `${account.parent.title} ${(account.parent as unknown as { office?: { name: string; is_head_office?: boolean } })?.office && !(account.parent as unknown as { office?: { is_head_office?: boolean } })?.office?.is_head_office ? `[${(account.parent as unknown as { office: { name: string } }).office.name}] ` : ""}(${account.parent.code})`
                  : "None (class account)"}
              </p>
            )}
          </Field>
        </div>
        <Field label="GL A/C No" hint={creating ? "Generated from the control account" : undefined}>
          <input className="input tabular" value={form.code} disabled readOnly placeholder={creating ? "Choose a control account" : ""} />
        </Field>
        <Field label="GL ID" error={errors.gl_id} htmlFor="gl_id" hint="Short numeric code (auto serial if blank)">
          <input id="gl_id" className={`input ${errors.gl_id ? "input-error" : ""}`} maxLength={20} inputMode="numeric" value={form.gl_id} disabled={readOnly} onChange={(e) => set("gl_id", e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Title" required error={errors.title} htmlFor="title">
            <input id="title" className={`input ${errors.title ? "input-error" : ""}`} maxLength={200} value={form.title} disabled={readOnly} onChange={(e) => set("title", e.target.value)} />
          </Field>
        </div>
        <Field label="Posting allowed" required error={errors.is_posting} htmlFor="is_posting" hint={postingLocked ? "Locked: the account has child accounts or balances" : "Yes = accepts entries; No = groups other accounts"}>
          <select id="is_posting" className="input" value={form.is_posting ? "1" : "0"} disabled={readOnly || !!postingLocked} onChange={(e) => set("is_posting", e.target.value === "1")}>
            <option value="1">Yes</option>
            <option value="0">No</option>
          </select>
        </Field>
        <Field label="Transaction type" required error={errors.normal_side} htmlFor="normal_side" hint="Normal balance side">
          <select id="normal_side" className="input" value={form.normal_side} disabled={readOnly} onChange={(e) => set("normal_side", e.target.value as Form["normal_side"])}>
            <option value="">Select</option>
            <option value="D">Debit</option>
            <option value="C">Credit</option>
          </select>
        </Field>
        <Field label="Old GL A/C No" error={errors.old_code} htmlFor="old_code">
          <input id="old_code" className="input" maxLength={20} value={form.old_code} disabled={readOnly} onChange={(e) => set("old_code", e.target.value)} />
        </Field>
        <Field label="Economic code" error={errors.economic_code} htmlFor="economic_code">
          <input id="economic_code" className="input" maxLength={20} value={form.economic_code} disabled={readOnly} onChange={(e) => set("economic_code", e.target.value)} />
        </Field>
        <Field label="Status" required error={errors.status} htmlFor="status" hint={!creating && account && !account.is_posting ? "Making a control account inactive also makes the accounts below it inactive" : undefined}>
          <select id="status" className="input" value={form.status} disabled={readOnly} onChange={(e) => set("status", e.target.value as Form["status"])}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </Field>
        <button type="submit" className="hidden" />
      </form>
    )}
    <ConfirmDialog
      open={confirmDelete}
      title="Delete account"
      message={
        account?.has_children
          ? `Delete "${form.title}" (${form.code}) and all accounts under it? This cannot be undone.`
          : `Delete "${form.title}" (${form.code})? This cannot be undone.`
      }
      confirmLabel="Delete"
      danger
      busy={busy}
      onConfirm={remove}
      onCancel={() => setConfirmDelete(false)}
    />
  </Drawer>
);
}
