"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AccountPicker } from "@/components/AccountPicker";
import { Drawer, Field, SaveButton, Spinner, useToast } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { cx } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { Account } from "@/lib/types";
import { fieldErrors, today, usePostingAccounts, useTypes, type Voucher } from "@/lib/vouchers";

type Side = { control: string; account_id: number | null };
const emptySide = (): Side => ({ control: "", account_id: null });
// Fund Transfer moves money between these two groups only (cash, and cash at bank).
const CASH_BANK = ["1-1-10-", "1-1-11-"];
const isCashBank = (a: Account) => CASH_BANK.some((p) => a.code.startsWith(p));

/** Journal Voucher and Fund Transfer: one debit line and one credit line (spec 9.4). */
export function TransferForm({ voucherId, onClose, onSaved }: { voucherId: number | null; onClose: () => void; onSaved: (v: Voucher) => void }) {
  const { me } = useSession();
  const toast = useToast();
  const queryClient = useQueryClient();
  const types = useTypes();
  const posting = usePostingAccounts(null);
  const existing = useQuery({ queryKey: ["voucher", voucherId], queryFn: () => api<{ data: Voucher }>(`/vouchers/${voucherId}`).then((r) => r.data), enabled: !!voucherId });
  const [h, setH] = useState({ transaction_type_id: "", voucher_date: today(), reference: "", reference_date: "", narration: "", amount: "" });
  const [debit, setDebit] = useState<Side>(emptySide());
  const [credit, setCredit] = useState<Side>(emptySide());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(!voucherId);

  const transferTypes = useMemo(() => (types.data ?? []).filter((t) => t.module === "transfer"), [types.data]);
  const type = transferTypes.find((t) => String(t.id) === h.transaction_type_id);
  const fundTransfer = type?.code === 18;

  // Accounts allowed for this type, and the control accounts above them.
  const allowed = useMemo(() => (fundTransfer ? posting.accounts.filter(isCashBank) : posting.accounts), [posting.accounts, fundTransfer]);
  const controls = useMemo(() => {
    const parents = new Set(allowed.map((a) => a.parent_id));
    return posting.all.filter((a) => !a.is_posting && a.status === "active" && parents.has(a.id)).sort((a, b) => a.code.localeCompare(b.code));
  }, [allowed, posting.all]);
  const under = (control: string, exclude: number | null) =>
    (control ? allowed.filter((a) => String(a.parent_id) === control) : allowed).filter((a) => a.id !== exclude);

  useEffect(() => {
    if (!voucherId && transferTypes.length && !h.transaction_type_id) setH((x) => ({ ...x, transaction_type_id: String(transferTypes.find((t) => t.code === 18)?.id ?? transferTypes[0].id) }));
  }, [transferTypes, voucherId, h.transaction_type_id]);

  useEffect(() => {
    const v = existing.data;
    if (!v || loaded) return;
    const d = v.lines?.find((l) => l.debit > 0);
    const c = v.lines?.find((l) => l.credit > 0);
    setH({ transaction_type_id: String(v.transaction_type?.id ?? ""), voucher_date: v.voucher_date, reference: v.reference ?? "", reference_date: v.reference_date ?? "", narration: d?.narration ?? c?.narration ?? "", amount: d ? String(d.debit) : "" });
    const parentOf = (id?: number) => String(posting.all.find((a) => a.id === id)?.parent_id ?? "");
    if (d) setDebit({ control: parentOf(d.account?.id), account_id: d.account?.id ?? null });
    if (c) setCredit({ control: parentOf(c.account?.id), account_id: c.account?.id ?? null });
    setLoaded(true);
  }, [existing.data, loaded, posting.all]);

  useEffect(() => setErrors((e) => (Object.keys(e).length ? {} : e)), [h, debit, credit]);

  function setType(id: string) {
    const next = transferTypes.find((t) => String(t.id) === id);
    setH({ ...h, transaction_type_id: id });
    // Switching to Fund Transfer drops accounts that are not cash or bank.
    if (next?.code === 18) {
      const keep = (s: Side): Side => {
        const a = posting.all.find((x) => x.id === s.account_id);
        const c = posting.all.find((x) => String(x.id) === s.control);
        return { control: c && isCashBank(c) ? s.control : "", account_id: a && isCashBank(a) ? s.account_id : null };
      };
      setDebit(keep(debit));
      setCredit(keep(credit));
    }
  }

  async function save() {
    if (debit.account_id && debit.account_id === credit.account_id) {
      setErrors({ "credit.account_id": "The debit and credit accounts must be different." });
      return;
    }
    setBusy(true);
    setErrors({});
    const amount = h.amount.replace(/,/g, "");
    const body = {
      transaction_type_id: h.transaction_type_id, voucher_date: h.voucher_date, reference: h.reference, reference_date: h.reference_date || null,
      debit: { account_id: debit.account_id, narration: h.narration, amount },
      credit: { account_id: credit.account_id, narration: h.narration, amount },
    };
    try {
      const r = voucherId
        ? await api<{ data: Voucher }>(`/vouchers/${voucherId}`, { method: "PUT", body })
        : await api<{ data: Voucher }>("/vouchers/transfer", { method: "POST", body });
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

  const sideBlock = (label: string, key: "debit" | "credit", side: Side, set: (s: Side) => void, other: number | null) => (
    <fieldset className="rounded-md border border-gray-200 p-4">
      <legend className="px-1 text-sm font-semibold text-gray-900">{label}</legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Control A/C" htmlFor={`${key}-ctl`} hint={fundTransfer ? "Cash and bank only" : "Optional: narrows the account list"}>
          <select id={`${key}-ctl`} className="input" value={side.control} onChange={(e) => set({ control: e.target.value, account_id: null })}>
            <option value="">{fundTransfer ? "All cash and bank accounts" : "All accounts"}</option>
            {controls.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </Field>
        <Field label={key === "debit" ? "Debit account" : "Credit account"} required error={errors[`${key}.account_id`]} htmlFor={`${key}-acc`}>
          <AccountPicker id={`${key}-acc`} accounts={under(side.control, other)} value={side.account_id} onChange={(id) => set({ ...side, account_id: id })} invalid={!!errors[`${key}.account_id`]} />
        </Field>
      </div>
    </fieldset>
  );

  return (
    <Drawer open title={`Transfer Transaction${existing.data ? ` ${existing.data.voucher_no}` : ""}`} onClose={onClose} size="lg"
      footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><SaveButton busy={busy} onClick={save} disabled={!loaded} /></>}>
      {!loaded || types.isLoading || posting.isLoading ? <Spinner /> : (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Office"><p className="py-2 text-sm">{me.offices.find((o) => o.id === me.office_id)?.name}</p></Field>
            <Field label="Transaction type" required error={errors.transaction_type_id} htmlFor="t-type" hint={fundTransfer ? "Both accounts must be cash or bank" : undefined}>
              <select id="t-type" className="input" value={h.transaction_type_id} onChange={(e) => setType(e.target.value)}>
                {transferTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
            <Field label="Txn. date" required error={errors.voucher_date} htmlFor="t-date">
              <input id="t-date" type="date" className={cx("input", errors.voucher_date && "input-error")} value={h.voucher_date} onChange={(e) => setH({ ...h, voucher_date: e.target.value })} />
            </Field>
            <Field label="Voucher No"><p className="py-2 text-sm text-gray-600">{existing.data?.voucher_no ?? "Assigned when saved"}</p></Field>
            <Field label="Reference No." htmlFor="t-ref"><input id="t-ref" className="input" maxLength={200} value={h.reference} onChange={(e) => setH({ ...h, reference: e.target.value })} /></Field>
            <Field label="Ref. date" htmlFor="t-rdate"><input id="t-rdate" type="date" className="input" value={h.reference_date} onChange={(e) => setH({ ...h, reference_date: e.target.value })} /></Field>
          </div>
          {errors.lines && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{errors.lines}</p>}
          {sideBlock("Debit (transfer to)", "debit", debit, setDebit, credit.account_id)}
          {sideBlock("Credit (transfer from)", "credit", credit, setCredit, debit.account_id)}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
            <Field label="Narration" required error={errors["debit.narration"]} htmlFor="t-nar" hint="Used on both the debit and the credit line">
              <input id="t-nar" className={cx("input", errors["debit.narration"] && "input-error")} maxLength={500} value={h.narration} onChange={(e) => setH({ ...h, narration: e.target.value })} />
            </Field>
            <Field label="Amount" required error={errors["debit.amount"] ?? errors["credit.amount"]} htmlFor="t-amt">
              <input id="t-amt" className={cx("input text-right tabular", (errors["debit.amount"] || errors["credit.amount"]) && "input-error")} inputMode="decimal" value={h.amount} onChange={(e) => setH({ ...h, amount: e.target.value })} />
            </Field>
          </div>
          <button type="submit" className="hidden" />
        </form>
      )}
    </Drawer>
  );
}
