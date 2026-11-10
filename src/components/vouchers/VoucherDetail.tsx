"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Pencil, Printer, RotateCcw, Trash2, XCircle } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog, Drawer, ErrorBox, Field, Spinner, useToast } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { useSession } from "@/lib/session";
import { SOURCE_LABEL, today, type Voucher } from "@/lib/vouchers";
import { VoucherStatus } from "./VoucherStatus";

/** Read-only voucher view with the maker-checker actions (spec 9.6). */
export function VoucherDetail({ id, onClose, onEdit, onOpen }: { id: number; onClose: () => void; onEdit: (v: Voucher) => void; onOpen: (id: number) => void }) {
  const { me } = useSession();
  const toast = useToast();
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ["voucher", id], queryFn: () => api<{ data: Voucher }>(`/vouchers/${id}`).then((r) => r.data) });
  const [action, setAction] = useState<"verify" | "reject" | "reverse" | "delete" | null>(null);
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(today());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const v = q.data;
  const p = me.preferences;

  async function run() {
    if (!v || !action) return;
    setBusy(true);
    setError(null);
    try {
      if (action === "delete") {
        await api(`/vouchers/${v.id}`, { method: "DELETE" });
        toast.success(`Voucher ${v.voucher_no} deleted.`);
        await queryClient.invalidateQueries({ queryKey: ["vouchers"] });
        onClose();
        return;
      }
      const body = action === "reject" ? { reason } : action === "reverse" ? { reason, date } : undefined;
      const r = await api<{ data: Voucher }>(`/vouchers/${v.id}/${action}`, { method: "POST", body });
      await queryClient.invalidateQueries({ queryKey: ["vouchers"] });
      await queryClient.invalidateQueries({ queryKey: ["voucher", v.id] });
      queryClient.invalidateQueries({ queryKey: ["kpis"] });
      setAction(null);
      setReason("");
      if (action === "reverse") {
        toast.success(`Reversal voucher ${r.data.voucher_no} created and verified.`);
        onOpen(r.data.id);
      } else {
        toast.success(action === "verify" ? `Voucher ${v.voucher_no} verified. It now counts in balances and reports.` : `Voucher ${v.voucher_no} sent back to its maker.`);
      }
    } catch (e) {
      setError(e instanceof ApiError ? (Object.values(e.errors)[0]?.[0] ?? e.message) : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const debit = (v?.lines ?? []).reduce((s, l) => s + l.debit, 0);
  const credit = (v?.lines ?? []).reduce((s, l) => s + l.credit, 0);
  const can = v?.can;

  return (
    <Drawer open title={v ? `Voucher ${v.voucher_no}` : "Voucher"} onClose={onClose} size="lg"
      footer={v && (
        <>
          <a className="btn btn-secondary mr-auto" href={`/print/voucher/${v.id}`} target="_blank" rel="noreferrer"><Printer size={15} /> Print</a>
          {can?.delete && <button className="btn btn-danger" onClick={() => setAction("delete")}><Trash2 size={15} /> Delete</button>}
          {can?.edit && <button className="btn btn-secondary" onClick={() => onEdit(v)}><Pencil size={15} /> Edit</button>}
          {can?.reject && <button className="btn btn-danger" onClick={() => setAction("reject")}><XCircle size={15} /> Reject</button>}
          {can?.verify && <button className="btn btn-primary" onClick={() => setAction("verify")}><CheckCircle2 size={15} /> Verify</button>}
          {can?.reverse && <button className="btn btn-secondary" onClick={() => setAction("reverse")}><RotateCcw size={15} /> Reverse</button>}
        </>
      )}>
      {q.isLoading ? <Spinner /> : q.error ? <ErrorBox error={q.error} /> : v && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <VoucherStatus voucher={v} />
            <span className="badge bg-gray-100 text-gray-700">{SOURCE_LABEL[v.source]}</span>
            {v.transaction_type && <span className="badge bg-gray-100 text-gray-700">{v.transaction_type.name}</span>}
          </div>
          {v.rejection_reason && v.status === "draft" && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">Rejected: {v.rejection_reason}. {can?.edit ? "Correct it and save again; it then goes back for verification." : "It cannot be verified until its maker corrects it and saves it again."}</p>
          )}
          {v.status === "draft" && can?.is_maker && !can.verify && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">You created or last changed this voucher, so another person must verify it.</p>
          )}
          {v.reversal_of && <p className="text-sm text-gray-700">This voucher reverses <button className="text-brand-700 underline" onClick={() => onOpen(v.reversal_of!.id)}>{v.reversal_of.voucher_no}</button>.</p>}
          {v.reversed_by && <p className="text-sm text-gray-700">Reversed by <button className="text-brand-700 underline" onClick={() => onOpen(v.reversed_by!.id)}>{v.reversed_by.voucher_no}</button>.</p>}

          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            <Item label="Voucher date" value={formatDate(v.voucher_date, p)} />
            <Item label="Office" value={me.offices.find((o) => o.id === v.office_id)?.name} />
            {v.transaction_definition && <Item label="Transaction" value={v.transaction_definition.name} />}
            {v.header_account && <Item label={v.source === "receive" ? "Debit account" : "Credit account"} value={`${v.header_account.title} (${v.header_account.code})`} />}
            {v.payee && <Item label={v.payee.type.charAt(0).toUpperCase() + v.payee.type.slice(1)} value={v.payee.name} />}
            {v.work_order_no && <Item label="Work order no" value={v.work_order_no} />}
            {v.instrument_no && <Item label={v.instrument_type === "cheque" ? "Cheque no" : "Instrument no"} value={`${v.instrument_no}${v.instrument_date ? `, ${formatDate(v.instrument_date, p)}` : ""}`} />}
            {v.ref_advice_no && <Item label="Ref. advice no" value={v.ref_advice_no} />}
            {v.reference && <Item label="Reference" value={`${v.reference}${v.reference_date ? `, ${formatDate(v.reference_date, p)}` : ""}`} />}
            {v.batch_no && <Item label="Batch no" value={v.batch_no} />}
            {(v.narration || v.remarks) && <div className="col-span-2 sm:col-span-3"><Item label="Narration" value={v.narration || v.remarks} /></div>}
          </dl>

          <div className="overflow-x-auto rounded-md border border-gray-200">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Account</th>
                  <th className="text-right">Debit</th>
                  <th className="text-right">Credit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(v.lines ?? []).map((l) => (
                  <tr key={l.id}>
                    <td>
                      <span className="block">{l.account?.title}</span>
                      <span className="block text-xs text-gray-500 tabular">{l.account?.code}{l.deduction_type && ` . ${l.deduction_type}`}{l.cost_center && ` . ${l.cost_center.name}`}</span>
                    </td>
                    <td className="text-right tabular">{l.debit ? formatNumber(l.debit, p) : ""}</td>
                    <td className="text-right tabular">{l.credit ? formatNumber(l.credit, p) : ""}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-semibold">
                  <td className="text-right">Total</td>
                  <td className="text-right tabular">{formatNumber(debit, p)}</td>
                  <td className="text-right tabular">{formatNumber(credit, p)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {(v.source === "receive" || v.source === "payment") && (
            <p className="text-right text-sm text-gray-700">Total {formatNumber(v.total_amount, p)} less deductions {formatNumber(v.total_deduction, p)} = <strong className="tabular">net {formatNumber(v.net_amount, p)}</strong></p>
          )}

          <dl className="grid grid-cols-1 gap-2 border-t border-gray-100 pt-3 text-xs text-gray-600 sm:grid-cols-3">
            <Item label="Prepared by" value={`${v.created_by?.name ?? ""} ${formatDateTime(v.created_at, p)}`} small />
            {v.updated_by && v.updated_by.id !== v.created_by?.id && <Item label="Last changed by" value={v.updated_by.name} small />}
            {v.verified_by && <Item label="Verified by" value={`${v.verified_by.name} ${formatDateTime(v.verified_at, p)}`} small />}
          </dl>
        </div>
      )}

      <ConfirmDialog
        open={action !== null && v !== undefined}
        title={action === "verify" ? "Verify this voucher?" : action === "reject" ? "Reject this voucher" : action === "reverse" ? "Reverse this voucher" : "Delete this draft?"}
        confirmLabel={action === "verify" ? "Verify" : action === "reject" ? "Reject" : action === "reverse" ? "Reverse" : "Delete"}
        danger={action === "reject" || action === "delete"}
        busy={busy}
        onCancel={() => { setAction(null); setError(null); }}
        onConfirm={run}
        message={
          <div className="space-y-3">
            {action === "verify" && <p>Once verified, {v?.voucher_no} counts in balances and reports and can no longer be edited. To undo it later, reverse it.</p>}
            {action === "delete" && <p>{v?.voucher_no} will be removed. Its number is not reused.</p>}
            {action === "reject" && (
              <Field label="Reason" required htmlFor="reject-reason">
                <textarea id="reject-reason" className="input" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
              </Field>
            )}
            {action === "reverse" && (
              <>
                <p>A new voucher with debits and credits swapped will be created and verified at once. The original stays for the record.</p>
                <Field label="Reversal date" required htmlFor="rev-date"><input id="rev-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
                <Field label="Reason" required htmlFor="rev-reason"><input id="rev-reason" className="input" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
              </>
            )}
            {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          </div>
        }
      />
    </Drawer>
  );
}

function Item({ label, value, small }: { label: string; value?: string | null; small?: boolean }) {
  return (
    <div>
      <dt className={small ? "text-gray-500" : "text-xs text-gray-500"}>{label}</dt>
      <dd className={small ? "text-gray-700" : "text-gray-900"}>{value || "-"}</dd>
    </div>
  );
}
