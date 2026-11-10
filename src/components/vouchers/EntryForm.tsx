"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { AccountPicker } from "@/components/AccountPicker";
import { Drawer, Field, SaveButton, Spinner, useToast } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { cx, formatNumber } from "@/lib/format";
import { useSession } from "@/lib/session";
import { fieldErrors, today, usePostingAccounts, useTypes, type Voucher } from "@/lib/vouchers";

type Line = { key: number; account_id: number | null; narration: string; cheque_no: string; cheque_date: string; debit: string; credit: string };
let seq = 1;
const newLine = (): Line => ({ key: seq++, account_id: null, narration: "", cheque_no: "", cheque_date: "", debit: "", credit: "" });
const num = (s: string) => {
  const n = parseFloat(String(s).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** Transaction Entry: a free multi-line voucher that must balance (spec 9.5). */
export function EntryForm({ voucherId, onClose, onSaved }: { voucherId: number | null; onClose: () => void; onSaved: (v: Voucher) => void }) {
  const { me } = useSession();
  const toast = useToast();
  const queryClient = useQueryClient();
  const types = useTypes();
  const posting = usePostingAccounts(null);
  const existing = useQuery({ queryKey: ["voucher", voucherId], queryFn: () => api<{ data: Voucher }>(`/vouchers/${voucherId}`).then((r) => r.data), enabled: !!voucherId });
  const [h, setH] = useState({ voucher_date: today(), transaction_type_id: "", batch_no: "", reference: "", reference_date: "" });
  const [lines, setLines] = useState<Line[]>([newLine(), newLine()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(!voucherId);

  useEffect(() => {
    if (!voucherId && types.data?.length && !h.transaction_type_id) setH((x) => ({ ...x, transaction_type_id: String(types.data!.find((t) => t.code === 20)?.id ?? types.data![0].id) }));
  }, [types.data, voucherId, h.transaction_type_id]);

  useEffect(() => {
    const v = existing.data;
    if (!v || loaded) return;
    setH({ voucher_date: v.voucher_date, transaction_type_id: String(v.transaction_type?.id ?? ""), batch_no: v.batch_no ?? "", reference: v.reference ?? "", reference_date: v.reference_date ?? "" });
    setLines((v.lines ?? []).map((l) => ({ key: seq++, account_id: l.account?.id ?? null, narration: l.narration ?? "", cheque_no: l.cheque_no ?? "", cheque_date: l.cheque_date ?? "", debit: l.debit ? String(l.debit) : "", credit: l.credit ? String(l.credit) : "" })));
    setLoaded(true);
  }, [existing.data, loaded]);

  const debit = lines.reduce((s, l) => s + num(l.debit), 0);
  const credit = lines.reduce((s, l) => s + num(l.credit), 0);
  const diff = Math.round((debit - credit) * 100) / 100;
  const filled = lines.filter((l) => l.account_id || num(l.debit) || num(l.credit)).length;
  const balanced = diff === 0 && debit > 0 && filled >= 2;
  const set = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  useEffect(() => setErrors((e) => (Object.keys(e).length ? {} : e)), [h, lines]);

  async function save() {
    setBusy(true);
    setErrors({});
    const body = {
      ...h, reference_date: h.reference_date || null,
      lines: lines.map((l) => ({ account_id: l.account_id, narration: l.narration, cheque_no: l.cheque_no, cheque_date: l.cheque_date || null, debit: l.debit.replace(/,/g, "") || 0, credit: l.credit.replace(/,/g, "") || 0 })),
    };
    try {
      const r = voucherId
        ? await api<{ data: Voucher }>(`/vouchers/${voucherId}`, { method: "PUT", body })
        : await api<{ data: Voucher }>("/vouchers/entry", { method: "POST", body });
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

  return (
    <Drawer open title={`Transaction Entry${existing.data ? ` ${existing.data.voucher_no}` : ""}`} onClose={onClose} size="xl"
      footer={<>
        <span className={cx("mr-auto self-center text-sm tabular", balanced ? "text-brand-800" : "text-red-600")}>
          {balanced ? "Balanced" : `Difference ${formatNumber(diff, me.preferences)}`}
        </span>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <SaveButton busy={busy} onClick={save} disabled={!balanced || !loaded} title={!balanced ? "Debits must equal credits, with at least two lines" : undefined} />
      </>}>
      {!loaded || types.isLoading ? <Spinner /> : (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (balanced) save(); }}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Office"><p className="py-2 text-sm">{me.offices.find((o) => o.id === me.office_id)?.name}</p></Field>
            <Field label="Voucher date" required error={errors.voucher_date} htmlFor="e-date">
              <input id="e-date" type="date" className={cx("input", errors.voucher_date && "input-error")} value={h.voucher_date} onChange={(e) => setH({ ...h, voucher_date: e.target.value })} />
            </Field>
            <Field label="Transaction type" required error={errors.transaction_type_id} htmlFor="e-type">
              <select id="e-type" className="input" value={h.transaction_type_id} onChange={(e) => setH({ ...h, transaction_type_id: e.target.value })}>
                {(types.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
            <Field label="Voucher No"><p className="py-2 text-sm text-gray-600">{existing.data?.voucher_no ?? "Assigned when saved"}</p></Field>
            <Field label="Batch No" htmlFor="e-batch"><input id="e-batch" className="input" maxLength={20} value={h.batch_no} onChange={(e) => setH({ ...h, batch_no: e.target.value })} /></Field>
            <Field label="Reference" htmlFor="e-ref"><input id="e-ref" className="input" maxLength={200} value={h.reference} onChange={(e) => setH({ ...h, reference: e.target.value })} /></Field>
            <Field label="Reference date" htmlFor="e-rdate"><input id="e-rdate" type="date" className="input" value={h.reference_date} onChange={(e) => setH({ ...h, reference_date: e.target.value })} /></Field>
          </div>
          {errors.lines && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{errors.lines}</p>}
          <div className="flex justify-end">
            <button type="button" className="btn btn-secondary py-1" onClick={() => setLines((l) => [...l, newLine()])}><Plus size={15} /> Add row</button>
          </div>
          <div className="overflow-x-auto rounded-md border border-gray-200">
            <table className="table-base">
              <thead><tr><th className="w-10">SL</th><th className="min-w-64">GL A/C *</th><th className="min-w-44">Narration *</th><th className="w-28">Cheque No</th><th className="w-36">Cheque date</th><th className="w-32 text-right">Debit</th><th className="w-32 text-right">Credit</th><th className="w-10" /></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {lines.map((l, i) => (
                  <tr key={l.key} className="align-top">
                    <td className="pt-3 text-gray-500">{i + 1}</td>
                    <td>
                      <AccountPicker compact accounts={posting.accounts} value={l.account_id} onChange={(id) => set(l.key, { account_id: id })} invalid={!!errors[`lines.${i}.account_id`]} />
                      {errors[`lines.${i}.account_id`] && <p className="mt-0.5 text-xs text-red-600">{errors[`lines.${i}.account_id`]}</p>}
                    </td>
                    <td>
                      <input className={cx("input py-1.5", errors[`lines.${i}.narration`] && "input-error")} maxLength={500} value={l.narration} aria-label="Narration"
                        onChange={(e) => set(l.key, { narration: e.target.value })}
                        onFocus={() => { if (!l.narration && i > 0 && lines[i - 1].narration) set(l.key, { narration: lines[i - 1].narration }); }} />
                    </td>
                    <td><input className="input py-1.5" maxLength={50} value={l.cheque_no} onChange={(e) => set(l.key, { cheque_no: e.target.value })} aria-label="Cheque no" /></td>
                    <td><input type="date" className="input py-1.5" value={l.cheque_date} onChange={(e) => set(l.key, { cheque_date: e.target.value })} aria-label="Cheque date" /></td>
                    <td>
                      <input className={cx("input py-1.5 text-right tabular", errors[`lines.${i}.debit`] && "input-error")} inputMode="decimal" value={l.debit} aria-label="Debit"
                        onChange={(e) => set(l.key, { debit: e.target.value, credit: e.target.value ? "" : l.credit })} />
                      {errors[`lines.${i}.debit`] && <p className="mt-0.5 text-xs text-red-600">{errors[`lines.${i}.debit`]}</p>}
                    </td>
                    <td>
                      <input className="input py-1.5 text-right tabular" inputMode="decimal" value={l.credit} aria-label="Credit"
                        onChange={(e) => set(l.key, { credit: e.target.value, debit: e.target.value ? "" : l.debit })}
                        onFocus={() => { if (!l.credit && !l.debit && diff > 0) set(l.key, { credit: String(diff) }); }} />
                    </td>
                    <td><button type="button" className="btn btn-ghost p-1.5" onClick={() => setLines((ls) => (ls.length > 2 ? ls.filter((x) => x.key !== l.key) : ls))} aria-label="Remove row"><Trash2 size={15} /></button></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-semibold">
                  <td colSpan={5} className="text-right">Total</td>
                  <td className="text-right tabular">{formatNumber(debit, me.preferences)}</td>
                  <td className="text-right tabular">{formatNumber(credit, me.preferences)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          <button type="submit" className="hidden" />
        </form>
      )}
    </Drawer>
  );
}
