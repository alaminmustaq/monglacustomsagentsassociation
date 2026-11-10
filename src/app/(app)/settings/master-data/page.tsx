"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AccountPicker } from "@/components/AccountPicker";
import { ConfirmDialog, Drawer, ErrorBox, Field, PageHeader, SaveButton, Spinner, StatusBadge, useToast } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { cx } from "@/lib/format";
import { useAccounts } from "@/lib/queries";
import {
  fieldErrors, useCostCenters, useDeductionTypes, useDefinitions, usePayees, usePostingAccounts, useTypes,
  type CostCenter, type DeductionType, type Definition, type Payee,
} from "@/lib/vouchers";

const TABS = [
  ["payees", "Customers, suppliers and employees"],
  ["definitions", "Transactions"],
  ["deductions", "Deduction types"],
  ["cost-centers", "Cost centers"],
] as const;
type Tab = (typeof TABS)[number][0];

export default function MasterDataPage() {
  return <Suspense><MasterData /></Suspense>;
}

function MasterData() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = (TABS.find(([k]) => k === params.get("tab"))?.[0] ?? "payees") as Tab;
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Master Data" description="The lists that drive the voucher forms. Changes apply to new vouchers at once." />
      <div className="mb-4 flex flex-wrap gap-1 border-b border-gray-200" role="tablist">
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => router.replace(`/settings/master-data?tab=${k}`)}
            className={cx("-mb-px border-b-2 px-3 py-2 text-sm", tab === k ? "border-brand-700 font-semibold text-brand-800" : "border-transparent text-gray-600 hover:text-gray-900")}>{l}</button>
        ))}
      </div>
      {tab === "payees" && <Payees />}
      {tab === "definitions" && <Definitions />}
      {tab === "deductions" && <Deductions />}
      {tab === "cost-centers" && <CostCenters />}
    </div>
  );
}

/** Shared save handling for the small forms on this page. */
function useSaver(invalidate: string[]) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  async function save(path: string, id: number | null | undefined, body: unknown, done: () => void) {
    setBusy(true);
    setErrors({});
    try {
      await api(id ? `${path}/${id}` : path, { method: id ? "PUT" : "POST", body });
      await Promise.all(invalidate.map((k) => queryClient.invalidateQueries({ queryKey: [k] })));
      toast.success("Saved.");
      done();
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.errors).length) setErrors(fieldErrors(e.errors));
      else toast.error(e);
    } finally {
      setBusy(false);
    }
  }
  return { errors, busy, save, setErrors };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------------------------------------------------------------- payees

function Payees() {
  const [type, setType] = useState("");
  const payees = usePayees(type || null, true);
  const accounts = useAccounts();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [edit, setEdit] = useState<Partial<Payee> | null>(null);
  const [remove, setRemove] = useState<Payee | null>(null);
  const s = useSaver(["payees", "party-balances"]);
  const posting = usePostingAccounts(null);

  async function del() {
    try {
      await api(`/settings/payees/${remove!.id}`, { method: "DELETE" });
      toast.success("Deleted.");
      queryClient.invalidateQueries({ queryKey: ["payees"] });
    } catch (e) {
      toast.error(e);
    }
    setRemove(null);
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <select className="input w-48" value={type} onChange={(e) => setType(e.target.value)} aria-label="Type">
          <option value="">All types</option><option value="customer">Customers</option><option value="supplier">Suppliers</option><option value="employee">Employees</option>
        </select>
        <button className="btn btn-primary" onClick={() => { s.setErrors({}); setEdit({ type: (type || "customer") as Payee["type"], status: "active" }); }}><Plus size={16} /> Add</button>
      </div>
      {payees.error ? <ErrorBox error={payees.error} /> : !payees.data ? <Spinner /> : (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>Name</th><th>Type</th><th>Code</th><th>Phone</th><th>Email</th><th>Linked account</th><th>Status</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {payees.data.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-gray-500">None yet.</td></tr>}
              {payees.data.map((p) => {
                const acct = accounts.data?.find((a) => a.id === p.account_id);
                return (
                  <tr key={p.id} className="cursor-pointer hover:bg-gray-50" onClick={() => { s.setErrors({}); setEdit(p); }}>
                    <td className="font-medium">{p.name}</td><td>{cap(p.type)}</td><td>{p.code}</td><td>{p.phone}</td><td>{p.email}</td>
                    <td>{acct ? `${acct.title} (${acct.code})` : ""}</td><td><StatusBadge status={p.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {edit && (
        <Drawer open title={edit.id ? `Edit ${edit.name}` : "Add customer, supplier or employee"} onClose={() => setEdit(null)}
          footer={<>
            {edit.id && <button className="btn btn-danger mr-auto" onClick={() => setRemove(edit as Payee)}>Delete</button>}
            <button className="btn btn-secondary" onClick={() => setEdit(null)}>Cancel</button>
            <SaveButton busy={s.busy} onClick={() => s.save("/settings/payees", edit.id, edit, () => setEdit(null))} />
          </>}>
          <div className="space-y-4">
            <Field label="Type" required error={s.errors.type} htmlFor="p-type">
              <select id="p-type" className="input" value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value as Payee["type"] })}>
                <option value="customer">Customer</option><option value="supplier">Supplier</option><option value="employee">Employee</option>
              </select>
            </Field>
            <Field label="Name" required error={s.errors.name} htmlFor="p-name"><input id="p-name" className={cx("input", s.errors.name && "input-error")} maxLength={200} value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Code" error={s.errors.code} htmlFor="p-code"><input id="p-code" className="input" maxLength={30} value={edit.code ?? ""} onChange={(e) => setEdit({ ...edit, code: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Phone" error={s.errors.phone} htmlFor="p-phone"><input id="p-phone" className="input" maxLength={50} value={edit.phone ?? ""} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
              <Field label="Email" error={s.errors.email} htmlFor="p-email"><input id="p-email" type="email" className={cx("input", s.errors.email && "input-error")} maxLength={190} value={edit.email ?? ""} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>
            </div>
            <Field label="Address" htmlFor="p-addr"><textarea id="p-addr" className="input" rows={2} maxLength={500} value={edit.address ?? ""} onChange={(e) => setEdit({ ...edit, address: e.target.value })} /></Field>
            <Field label="Linked account" hint="Optional: the receivable, payable or advance account kept for this party" error={s.errors.account_id} htmlFor="p-acc">
              <AccountPicker id="p-acc" accounts={posting.accounts} value={edit.account_id} onChange={(id) => setEdit({ ...edit, account_id: id })} />
            </Field>
            <Field label="Status" htmlFor="p-status">
              <select id="p-status" className="input" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option></select>
            </Field>
          </div>
        </Drawer>
      )}
      <ConfirmDialog open={!!remove} danger title={`Delete ${remove?.name}?`} confirmLabel="Delete" onCancel={() => setRemove(null)} onConfirm={async () => { await del(); setEdit(null); }}
        message="A party that appears on vouchers cannot be deleted; make it inactive instead." />
    </>
  );
}

// ---------------------------------------------------------------- transaction definitions

function Definitions() {
  const defs = useDefinitions(undefined, true);
  const types = useTypes();
  const accounts = useAccounts();
  const [edit, setEdit] = useState<{ id?: number; module: "receive" | "payment"; name: string; default_payee_type: string; status: string; type_ids: number[]; account_ids: number[] } | null>(null);
  const [picker, setPicker] = useState<number | null>(null);
  const s = useSaver(["definitions"]);
  const controls = (accounts.data ?? []).filter((a) => !a.is_posting && a.status === "active");

  function open(d?: Definition) {
    s.setErrors({});
    setEdit(d
      ? { id: d.id, module: d.module, name: d.name, default_payee_type: d.default_payee_type ?? "", status: d.status, type_ids: d.types.map((t) => t.id), account_ids: d.accounts.map((a) => a.id) }
      : { module: "receive", name: "", default_payee_type: "", status: "active", type_ids: [], account_ids: [] });
  }

  return (
    <>
      <p className="mb-3 text-sm text-gray-600">A transaction is what the user picks first on a receive or payment voucher, such as &quot;Sales Collection&quot; or &quot;Salary Payment&quot;. It decides which transaction types can be used and which accounts appear on the lines.</p>
      <div className="mb-3 flex justify-end"><button className="btn btn-primary" onClick={() => open()}><Plus size={16} /> Add transaction</button></div>
      {defs.error ? <ErrorBox error={defs.error} /> : !defs.data ? <Spinner /> : (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>Module</th><th>Transaction</th><th>Types</th><th>Line accounts under</th><th>Status</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {defs.data.map((d) => (
                <tr key={d.id} className="cursor-pointer hover:bg-gray-50" onClick={() => open(d)}>
                  <td>{cap(d.module)}</td><td className="font-medium">{d.name}</td>
                  <td>{d.types.map((t) => t.name).join(", ")}</td>
                  <td className="max-w-80">{d.accounts.length ? d.accounts.map((a) => a.title).join(", ") : <span className="text-gray-500">Any posting account</span>}</td>
                  <td><StatusBadge status={d.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && (
        <Drawer open title={edit.id ? `Edit ${edit.name}` : "Add transaction"} onClose={() => setEdit(null)} size="lg"
          footer={<><button className="btn btn-secondary" onClick={() => setEdit(null)}>Cancel</button>
            <SaveButton busy={s.busy} onClick={() => s.save("/settings/transaction-definitions", edit.id, { ...edit, module: edit.id ? undefined : edit.module, default_payee_type: edit.default_payee_type || null }, () => setEdit(null))} /></>}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Module" required error={s.errors.module} htmlFor="d-mod">
                <select id="d-mod" className="input" value={edit.module} disabled={!!edit.id} onChange={(e) => setEdit({ ...edit, module: e.target.value as "receive" | "payment", type_ids: [] })}>
                  <option value="receive">Receive</option><option value="payment">Payment</option>
                </select>
              </Field>
              <Field label="Status" htmlFor="d-status">
                <select id="d-status" className="input" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option></select>
              </Field>
            </div>
            <Field label="Name" required error={s.errors.name} htmlFor="d-name"><input id="d-name" className={cx("input", s.errors.name && "input-error")} maxLength={150} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Default payee type" htmlFor="d-payee">
              <select id="d-payee" className="input" value={edit.default_payee_type} onChange={(e) => setEdit({ ...edit, default_payee_type: e.target.value })}>
                <option value="">None</option><option value="customer">Customer</option><option value="supplier">Supplier</option><option value="employee">Employee</option>
              </select>
            </Field>
            <fieldset>
              <legend className="mb-1 text-sm font-medium text-gray-700">Transaction types <span className="text-red-600">*</span></legend>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {(types.data ?? []).filter((t) => t.module === edit.module).map((t) => (
                  <label key={t.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="h-4 w-4 accent-brand-700" checked={edit.type_ids.includes(t.id)}
                      onChange={(e) => setEdit({ ...edit, type_ids: e.target.checked ? [...edit.type_ids, t.id] : edit.type_ids.filter((x) => x !== t.id) })} />
                    {t.name}
                  </label>
                ))}
              </div>
              {s.errors.type_ids && <p className="mt-1 text-xs text-red-600">{s.errors.type_ids}</p>}
            </fieldset>
            <fieldset>
              <legend className="mb-1 text-sm font-medium text-gray-700">Line accounts</legend>
              <p className="mb-2 text-xs text-gray-500">The {edit.module === "receive" ? "credit" : "debit"} account on each line is chosen from posting accounts under these control accounts. Leave empty to allow any posting account.</p>
              <ul className="mb-2 space-y-1">
                {edit.account_ids.map((id) => {
                  const a = accounts.data?.find((x) => x.id === id);
                  return (
                    <li key={id} className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-1.5 text-sm">
                      <span>{a?.title} <span className="text-xs text-gray-500 tabular">{a?.code}</span></span>
                      <button className="text-xs text-red-700 hover:underline" onClick={() => setEdit({ ...edit, account_ids: edit.account_ids.filter((x) => x !== id) })}>Remove</button>
                    </li>
                  );
                })}
              </ul>
              <div className="flex gap-2">
                <div className="flex-1"><AccountPicker accounts={controls.concat((accounts.data ?? []).filter((a) => a.is_posting && a.status === "active"))} value={picker} onChange={setPicker} placeholder="Add a control or posting account" /></div>
                <button className="btn btn-secondary" disabled={!picker} onClick={() => { if (picker && !edit.account_ids.includes(picker)) setEdit({ ...edit, account_ids: [...edit.account_ids, picker] }); setPicker(null); }}>Add</button>
              </div>
            </fieldset>
          </div>
        </Drawer>
      )}
    </>
  );
}

// ---------------------------------------------------------------- deduction types

function Deductions() {
  const list = useDeductionTypes(true);
  const accounts = useAccounts();
  const posting = usePostingAccounts(null);
  const [edit, setEdit] = useState<Partial<DeductionType> | null>(null);
  const s = useSaver(["deduction-types"]);
  const label = (id: number | null) => { const a = accounts.data?.find((x) => x.id === id); return a ? `${a.title} (${a.code})` : ""; };

  return (
    <>
      <p className="mb-3 text-sm text-gray-600">Amounts withheld on a receive or payment voucher, such as tax or VAT at source. Each type suggests a default account for each side.</p>
      <div className="mb-3 flex justify-end"><button className="btn btn-primary" onClick={() => { s.setErrors({}); setEdit({ status: "active", receive_account_id: null, payment_account_id: null }); }}><Plus size={16} /> Add deduction type</button></div>
      {list.error ? <ErrorBox error={list.error} /> : !list.data ? <Spinner /> : (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>Name</th><th>Account on receive vouchers</th><th>Account on payment vouchers</th><th>Status</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {list.data.map((d) => (
                <tr key={d.id} className="cursor-pointer hover:bg-gray-50" onClick={() => { s.setErrors({}); setEdit(d); }}>
                  <td className="font-medium">{d.name}</td><td>{label(d.receive_account_id)}</td><td>{label(d.payment_account_id)}</td><td><StatusBadge status={d.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && (
        <Drawer open title={edit.id ? `Edit ${edit.name}` : "Add deduction type"} onClose={() => setEdit(null)}
          footer={<><button className="btn btn-secondary" onClick={() => setEdit(null)}>Cancel</button><SaveButton busy={s.busy} onClick={() => s.save("/settings/deduction-types", edit.id, edit, () => setEdit(null))} /></>}>
          <div className="space-y-4">
            <Field label="Name" required error={s.errors.name} htmlFor="dt-name"><input id="dt-name" className={cx("input", s.errors.name && "input-error")} maxLength={100} value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Default account on receive vouchers (debit)" error={s.errors.receive_account_id} htmlFor="dt-r"><AccountPicker id="dt-r" accounts={posting.accounts} value={edit.receive_account_id} onChange={(id) => setEdit({ ...edit, receive_account_id: id })} /></Field>
            <Field label="Default account on payment vouchers (credit)" error={s.errors.payment_account_id} htmlFor="dt-p"><AccountPicker id="dt-p" accounts={posting.accounts} value={edit.payment_account_id} onChange={(id) => setEdit({ ...edit, payment_account_id: id })} /></Field>
            <Field label="Status" htmlFor="dt-status"><select id="dt-status" className="input" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option></select></Field>
          </div>
        </Drawer>
      )}
    </>
  );
}

// ---------------------------------------------------------------- cost centers

function CostCenters() {
  const list = useCostCenters(true);
  const [edit, setEdit] = useState<Partial<CostCenter> | null>(null);
  const s = useSaver(["cost-centers"]);
  return (
    <>
      <p className="mb-3 text-sm text-gray-600">Optional tags on receive and payment lines, for tracking by project, department or site.</p>
      <div className="mb-3 flex justify-end"><button className="btn btn-primary" onClick={() => { s.setErrors({}); setEdit({ status: "active" }); }}><Plus size={16} /> Add cost center</button></div>
      {list.error ? <ErrorBox error={list.error} /> : !list.data ? <Spinner /> : (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>Code</th><th>Name</th><th>Status</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {list.data.map((c) => (
                <tr key={c.id} className="cursor-pointer hover:bg-gray-50" onClick={() => { s.setErrors({}); setEdit(c); }}>
                  <td className="tabular">{c.code}</td><td className="font-medium">{c.name}</td><td><StatusBadge status={c.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && (
        <Drawer open size="sm" title={edit.id ? `Edit ${edit.name}` : "Add cost center"} onClose={() => setEdit(null)}
          footer={<><button className="btn btn-secondary" onClick={() => setEdit(null)}>Cancel</button><SaveButton busy={s.busy} onClick={() => s.save("/settings/cost-centers", edit.id, edit, () => setEdit(null))} /></>}>
          <div className="space-y-4">
            <Field label="Code" required error={s.errors.code} htmlFor="cc-code"><input id="cc-code" className={cx("input", s.errors.code && "input-error")} maxLength={30} value={edit.code ?? ""} onChange={(e) => setEdit({ ...edit, code: e.target.value })} /></Field>
            <Field label="Name" required error={s.errors.name} htmlFor="cc-name"><input id="cc-name" className={cx("input", s.errors.name && "input-error")} maxLength={150} value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Status" htmlFor="cc-status"><select id="cc-status" className="input" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option></select></Field>
          </div>
        </Drawer>
      )}
    </>
  );
}
