"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AccountPicker } from "@/components/AccountPicker";
import { Drawer, ErrorBox, Field, SaveButton, Spinner, useToast } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { cx, formatNumber } from "@/lib/format";
import { useSession } from "@/lib/session";
import {
  fieldErrors, INSTRUMENTS, today, useCostCenters, useDeductionTypes, useDefinitions, usePayees, usePostingAccounts, useTypes,
  type Voucher,
} from "@/lib/vouchers";

type Line = { key: number; bill_voucher_no: string; account_id: number | null; narration: string; amount: string; cost_center_id: string };
type Deduction = { key: number; deduction_type_id: string; bill_voucher_no: string; account_id: number | null; amount: string };
type Header = {
  voucher_date: string; transaction_definition_id: string; transaction_type_id: string; header_account_id: number | null;
  payee_type: string; payee_id: string; work_order_no: string; instrument_type: string; instrument_no: string; instrument_date: string;
  ref_advice_no: string; narration: string; remarks?: string;
};

let seq = 1;
const newLine = (): Line => ({ key: seq++, bill_voucher_no: "", account_id: null, narration: "", amount: "", cost_center_id: "" });
const newDeduction = (): Deduction => ({ key: seq++, deduction_type_id: "", bill_voucher_no: "", account_id: null, amount: "" });
const num = (s: string) => {
  const n = parseFloat(String(s).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const HEADER_LABEL: Record<string, Record<number, string>> = {
  receive: { 11: "Cash Debit A/C No.", 13: "Bank Debit A/C No.", 15: "Receivable Dr. A/C No.", 17: "Cash Debit A/C No." },
  payment: { 12: "Cash Credit A/C No.", 14: "Bank Credit A/C No.", 16: "Payable Credit A/C No." },
};

export function ReceivePaymentForm({ module, voucherId, onClose, onSaved }: { module: "receive" | "payment"; voucherId: number | null; onClose: () => void; onSaved: (v: Voucher) => void }) {
  const { me } = useSession();
  const toast = useToast();
  const queryClient = useQueryClient();
  const isReceive = module === "receive";
  const definitions = useDefinitions(module);
  const types = useTypes();
  const deductionTypes = useDeductionTypes();
  const costCenters = useCostCenters();
  const existing = useQuery({ queryKey: ["voucher", voucherId], queryFn: () => api<{ data: Voucher }>(`/vouchers/${voucherId}`).then((r) => r.data), enabled: !!voucherId });

  const [h, setH] = useState<Header>({
    voucher_date: today(), transaction_definition_id: "", transaction_type_id: "", header_account_id: null, payee_type: "", payee_id: "",
    work_order_no: "", instrument_type: "", instrument_no: "", instrument_date: "", ref_advice_no: "", narration: "", remarks: "",
  });
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [deductions, setDeductions] = useState<Deduction[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(!voucherId);

  useEffect(() => {
    const v = existing.data;
    if (!v || loaded) return;
    setH({
      voucher_date: v.voucher_date, transaction_definition_id: String(v.transaction_definition?.id ?? ""), transaction_type_id: String(v.transaction_type?.id ?? ""),
      header_account_id: v.header_account?.id ?? null, payee_type: v.payee_type ?? "", payee_id: String(v.payee?.id ?? ""), work_order_no: v.work_order_no ?? "",
      instrument_type: v.instrument_type ?? "", instrument_no: v.instrument_no ?? "", instrument_date: v.instrument_date ?? "", ref_advice_no: v.ref_advice_no ?? "",
      narration: v.narration ?? v.remarks ?? "", remarks: v.narration ?? v.remarks ?? "",
    });
    const ls = (v.lines ?? []).filter((l) => l.role === "line").map((l) => ({
      key: seq++, bill_voucher_no: l.bill_voucher_no ?? "", account_id: l.account?.id ?? null, narration: l.narration ?? "",
      amount: String(isReceive ? l.credit : l.debit), cost_center_id: String(l.cost_center?.id ?? ""),
    }));
    const ds = (v.lines ?? []).filter((l) => l.role === "deduction").map((l) => ({
      key: seq++, deduction_type_id: String(l.deduction_type_id ?? ""), bill_voucher_no: l.bill_voucher_no ?? "", account_id: l.account?.id ?? null,
      amount: String(isReceive ? l.debit : l.credit),
    }));
    setLines(ls.length ? ls : [newLine()]);
    setDeductions(ds);
    setLoaded(true);
  }, [existing.data, loaded, isReceive]);

  // A header error clears as soon as the user changes the header.
  useEffect(() => {
    setErrors((e) => (Object.keys(e).some((k) => !k.includes(".")) ? Object.fromEntries(Object.entries(e).filter(([k]) => k.includes("."))) : e));
  }, [h]);

  const definition = definitions.data?.find((d) => String(d.id) === h.transaction_definition_id);


  const allowedTypes = useMemo(() => {
    const codes = isReceive ? [11, 13] : [12, 14];
    return (types.data ?? []).filter((t) => codes.includes(t.code));
  }, [isReceive, types.data]);


  const type = types.data?.find((t) => String(t.id) === h.transaction_type_id);
  const headerAccounts = usePostingAccounts(type?.header_control ? [type.header_control.id] : [-1]);
  const lineIds = useMemo(() => (definition?.accounts ?? []).map((a) => a.id), [definition]);
  const lineAccounts = usePostingAccounts(lineIds.length ? lineIds : null);
  const isCashBank = (a: { code: string }) => a.code.startsWith("1-1-10-") || a.code.startsWith("1-1-11-");
  const filteredLineAccounts = useMemo(() => {
    if (!isReceive) return lineAccounts.accounts;
    return lineAccounts.accounts.filter((a) => !isCashBank(a));
  }, [isReceive, lineAccounts.accounts]);
  const allPosting = usePostingAccounts(null);
  const payees = usePayees(h.payee_type || null);

  // Cascades (spec 9.2): definition drives the types; the type drives the header account list.
  function setDefinition(id: string) {
    const d = definitions.data?.find((x) => String(x.id) === id);
    const typeIds = (d?.types ?? []).map((t) => String(t.id));
    setH((x) => ({
      ...x, transaction_definition_id: id,
      transaction_type_id: typeIds.includes(x.transaction_type_id) ? x.transaction_type_id : typeIds.length === 1 ? typeIds[0] : "",
      header_account_id: typeIds.includes(x.transaction_type_id) ? x.header_account_id : null,
      payee_type: x.payee_type || d?.default_payee_type || "",
    }));
  }
  function setType(id: string) {
    setH((x) => ({ ...x, transaction_type_id: id, header_account_id: null }));
  }

  const total = lines.reduce((s, l) => s + num(l.amount), 0);
  const totalDeduction = deductions.reduce((s, d) => s + num(d.amount), 0);
  const net = total - totalDeduction;

  const setLine = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const setDed = (key: number, patch: Partial<Deduction>) => setDeductions((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  async function save() {
    setBusy(true);
    setErrors({});
    const body = {
      ...h,
      transaction_definition_id: h.transaction_definition_id || null,
      transaction_type_id: h.transaction_type_id || null,
      payee_type: h.payee_type || null,
      payee_id: h.payee_id || null,
      instrument_type: h.instrument_type || null,
      instrument_date: h.instrument_date || null,
      narration: h.narration || null,
      remarks: h.narration || null,
      lines: lines.map((l) => ({ bill_voucher_no: l.bill_voucher_no, account_id: l.account_id, narration: l.narration, amount: l.amount.replace(/,/g, ""), cost_center_id: l.cost_center_id || null })),
      deductions: deductions.map((d) => ({ deduction_type_id: d.deduction_type_id || null, bill_voucher_no: d.bill_voucher_no, account_id: d.account_id, amount: d.amount.replace(/,/g, "") })),
    };
    try {
      const r = voucherId
        ? await api<{ data: Voucher }>(`/vouchers/${voucherId}`, { method: "PUT", body })
        : await api<{ data: Voucher }>(`/vouchers/${module}`, { method: "POST", body });
      await queryClient.invalidateQueries({ queryKey: ["vouchers"] });
      queryClient.invalidateQueries({ queryKey: ["voucher", r.data.id] });
      toast.success(`Voucher ${r.data.voucher_no} saved as draft.`);
      onSaved(r.data);
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.errors).length) setErrors(fieldErrors(e.errors));
      else toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  const title = `${isReceive ? "Receive" : "Payment"} Transaction${existing.data ? ` ${existing.data.voucher_no}` : ""}`;
  const headerLabel = (type && HEADER_LABEL[module][type.code]) ?? (isReceive ? "Debit A/C No." : "Credit A/C No.");
  const lineSide = isReceive ? "Cr." : "Dr.";
  const dedSide = isReceive ? "Dr." : "Cr.";
  const generalError = errors.lines || errors.net_amount || errors.status;

  return (
    <Drawer open title={title} onClose={onClose} size="xl"
      footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><SaveButton busy={busy} onClick={save} disabled={!loaded} /></>}>
      {!loaded || definitions.isLoading || types.isLoading ? <Spinner /> : (
        <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); save(); }}>
          {existing.data?.rejection_reason && <ErrorBox error={new Error(`Rejected: ${existing.data.rejection_reason}`)} />}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Office"><p className="py-2 text-sm">{me.offices.find((o) => o.id === me.office_id)?.name}</p></Field>
            <Field label="Txn. date" required error={errors.voucher_date} htmlFor="v-date">
              <input id="v-date" type="date" className={cx("input", errors.voucher_date && "input-error")} value={h.voucher_date} onChange={(e) => setH({ ...h, voucher_date: e.target.value })} />
            </Field>
            <Field label="Voucher No"><p className="py-2 text-sm text-gray-600">{existing.data?.voucher_no ?? "Assigned when saved"}</p></Field>

            {/* <Field label="Transaction" required error={errors.transaction_definition_id} htmlFor="v-def">
              <select id="v-def" className={cx("input", errors.transaction_definition_id && "input-error")} value={h.transaction_definition_id} onChange={(e) => {
                setDefinition(e.target.value)
              }
              }>
                <option value="">Select</option>
                {(definitions.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field> */}
            <Field label="Transaction type" required error={errors.transaction_type_id} htmlFor="v-type">
              <select id="v-type" className={cx("input", errors.transaction_type_id && "input-error")} value={h.transaction_type_id} onChange={(e) => setType(e.target.value)}>
                <option value="">Select</option>
                {allowedTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
            <Field label={headerLabel} required error={errors.header_account_id} htmlFor="v-head">
              <AccountPicker id="v-head" accounts={headerAccounts.accounts} value={h.header_account_id} onChange={(id) => setH({ ...h, header_account_id: id })} disabled={!type} invalid={!!errors.header_account_id} placeholder={type ? "Choose account" : "Choose a transaction type first"} />
            </Field>
            {/* 
            <Field label={isReceive ? "Receive from" : "Payee type"} error={errors.payee_type} htmlFor="v-ptype">
              <select id="v-ptype" className="input" value={h.payee_type} onChange={(e) => setH({ ...h, payee_type: e.target.value, payee_id: "" })}>
                <option value="">None</option>
                {(isReceive ? ["customer", "employee"] : ["supplier", "employee"]).map((t) => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
              </select>
            </Field> */}
            {/* <Field label="Payee" error={errors.payee_id} htmlFor="v-payee" hint={h.payee_type && payees.data?.length === 0 ? "No payees of this type yet. Add them under Settings, Master Data." : undefined}>
              <select id="v-payee" className={cx("input", errors.payee_id && "input-error")} value={h.payee_id} onChange={(e) => setH({ ...h, payee_id: e.target.value })} disabled={!h.payee_type}>
                <option value="">Select</option>
                {(payees.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field> */}
            {/* <Field label={isReceive ? "Work Order No." : "W/O No"} htmlFor="v-wo">
              <input id="v-wo" className="input" maxLength={30} value={h.work_order_no} onChange={(e) => setH({ ...h, work_order_no: e.target.value })} />
            </Field> */}

            {type?.show_instrument && (
              <>
                <Field label="Instrument type" htmlFor="v-itype">
                  <select id="v-itype" className="input" value={h.instrument_type} onChange={(e) => setH({ ...h, instrument_type: e.target.value })}>
                    <option value="">Select</option>
                    {INSTRUMENTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </Field>
                <Field label={h.instrument_type === "cheque" ? "Cheque No." : "Instrument No."} htmlFor="v-ino">
                  <input id="v-ino" className="input" maxLength={50} value={h.instrument_no} onChange={(e) => setH({ ...h, instrument_no: e.target.value })} />
                </Field>
                <Field label="Instrument date" error={errors.instrument_date} htmlFor="v-idate">
                  <input id="v-idate" type="date" className="input" value={h.instrument_date} onChange={(e) => setH({ ...h, instrument_date: e.target.value })} />
                </Field>
              </>
            )}
            {/* <Field label="Ref. Advice No." htmlFor="v-ref">
              <input id="v-ref" className="input" maxLength={50} value={h.ref_advice_no} onChange={(e) => setH({ ...h, ref_advice_no: e.target.value })} />
            </Field> */}
            <div className="sm:col-span-1">
              <Field label="Narration" htmlFor="v-rem">
                <input id="v-rem" className="input" maxLength={1000} value={h.narration} onChange={(e) => setH({ ...h, narration: e.target.value, remarks: e.target.value })} />
              </Field>
            </div>
          </div>

          {generalError && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{generalError}</p>}

          <section>
            <h3 className="mb-2 text-sm font-semibold text-gray-900">{isReceive ? "Receive" : "Payment"} lines</h3>
            <div className="overflow-x-auto rounded-md border border-gray-200">
              <table className="table-base">
                <thead><tr><th className="w-28">Bill Voucher No</th><th className="min-w-64">{isReceive ? "Credit" : "Debit"} A/C No *</th>
                  {/* <th className="min-w-44">Particulars *</th> */}
                  <th className="w-36 text-right">Amount ({lineSide}) *</th><th className="w-36">Cost center</th><th className="w-10" /></tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {lines.map((l, i) => (
                    <tr key={l.key} className="align-top">
                      <td><input className="input py-1.5" maxLength={30} value={l.bill_voucher_no} onChange={(e) => setLine(l.key, { bill_voucher_no: e.target.value })} aria-label="Bill voucher no" /></td>
                      <td>
                        <AccountPicker compact accounts={filteredLineAccounts} value={l.account_id} onChange={(id) => setLine(l.key, { account_id: id })} invalid={!!errors[`lines.${i}.account_id`]} />
                        {errors[`lines.${i}.account_id`] && <p className="mt-0.5 text-xs text-red-600">{errors[`lines.${i}.account_id`]}</p>}
                      </td>
                      {/* <td>
                        <input className={cx("input py-1.5", errors[`lines.${i}.narration`] && "input-error")} maxLength={500} value={l.narration} onChange={(e) => setLine(l.key, { narration: e.target.value })} aria-label="Particulars"
                          onFocus={() => { if (!l.narration && i > 0 && lines[i - 1].narration) setLine(l.key, { narration: lines[i - 1].narration }); }} />
                        {errors[`lines.${i}.narration`] && <p className="mt-0.5 text-xs text-red-600">{errors[`lines.${i}.narration`]}</p>}
                      </td> */}
                      <td>
                        <input className={cx("input py-1.5 text-right tabular", errors[`lines.${i}.amount`] && "input-error")} inputMode="decimal" value={l.amount} onChange={(e) => setLine(l.key, { amount: e.target.value })} aria-label="Amount" />
                        {errors[`lines.${i}.amount`] && <p className="mt-0.5 text-xs text-red-600">{errors[`lines.${i}.amount`]}</p>}
                      </td>
                      <td>
                        <select className="input py-1.5" value={l.cost_center_id} onChange={(e) => setLine(l.key, { cost_center_id: e.target.value })} aria-label="Cost center">
                          <option value="" />
                          {(costCenters.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </td>
                      <td><button type="button" className="btn btn-ghost p-1.5" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [newLine()]))} aria-label="Remove row"><Trash2 size={15} /></button></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50">
                    <td colSpan={2} className="text-right text-sm font-semibold pr-3">Total</td>
                    <td className="text-right font-semibold tabular">{formatNumber(total, me.preferences)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="mt-2 flex justify-start">
              <button type="button" className="btn btn-secondary py-1" onClick={() => setLines((l) => [...l, { ...newLine(), narration: l[l.length - 1]?.narration ?? "" }])}><Plus size={15} /> Add row</button>
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-gray-900">Deductions</h3>
            {deductions.length === 0 ? (
              <p className="rounded-md border border-dashed border-gray-300 px-3 py-3 text-sm text-gray-500">No deductions. Add tax, VAT, advance adjustment or similar if any amount is withheld.</p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-gray-200">
                <table className="table-base">
                  <thead><tr><th className="w-48">Deduction type *</th><th className="w-28">Bill Voucher No</th><th className="min-w-64">Deduction ({dedSide}) A/C No *</th><th className="w-36 text-right">Amount ({dedSide}) *</th><th className="w-10" /></tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {deductions.map((d, i) => (
                      <tr key={d.key} className="align-top">
                        <td>
                          <select className={cx("input py-1.5", errors[`deductions.${i}.deduction_type_id`] && "input-error")} value={d.deduction_type_id} aria-label="Deduction type"
                            onChange={(e) => {
                              const t = deductionTypes.data?.find((x) => String(x.id) === e.target.value);
                              const acct = t ? (isReceive ? t.receive_account_id : t.payment_account_id) : null;
                              setDed(d.key, { deduction_type_id: e.target.value, account_id: d.account_id ?? acct });
                            }}>
                            <option value="">Select</option>
                            {(deductionTypes.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                        </td>
                        <td><input className="input py-1.5" maxLength={30} value={d.bill_voucher_no} onChange={(e) => setDed(d.key, { bill_voucher_no: e.target.value })} aria-label="Bill voucher no" /></td>
                        <td>
                          <AccountPicker compact accounts={allPosting.accounts} value={d.account_id} onChange={(id) => setDed(d.key, { account_id: id })} invalid={!!errors[`deductions.${i}.account_id`]} />
                          {errors[`deductions.${i}.account_id`] && <p className="mt-0.5 text-xs text-red-600">{errors[`deductions.${i}.account_id`]}</p>}
                        </td>
                        <td>
                          <input className={cx("input py-1.5 text-right tabular", errors[`deductions.${i}.amount`] && "input-error")} inputMode="decimal" value={d.amount} onChange={(e) => setDed(d.key, { amount: e.target.value })} aria-label="Deduction amount" />
                        </td>
                        <td><button type="button" className="btn btn-ghost p-1.5" onClick={() => setDeductions((ds) => ds.filter((x) => x.key !== d.key))} aria-label="Remove deduction"><Trash2 size={15} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr className="bg-gray-50"><td colSpan={3} className="text-right text-sm font-semibold">Total deduction</td><td className="text-right font-semibold tabular">{formatNumber(totalDeduction, me.preferences)}</td><td /></tr></tfoot>
                </table>
              </div>
            )}
            <div className="mt-2 flex justify-start">
              <button type="button" className="btn btn-secondary py-1" onClick={() => setDeductions((d) => [...d, newDeduction()])}><Plus size={15} /> Add deduction</button>
            </div>
          </section>

          <div className={cx("flex items-center justify-end gap-3 rounded-md px-4 py-3 text-sm", net > 0 ? "bg-brand-50 text-brand-900" : "bg-amber-50 text-amber-900")}>
            <span>Total {formatNumber(total, me.preferences)} less deductions {formatNumber(totalDeduction, me.preferences)} =</span>
            <span className="text-base font-semibold tabular">Net amount {formatNumber(net, me.preferences)}</span>
          </div>
          <button type="submit" className="hidden" />
        </form>
      )}
    </Drawer>
  );
}
