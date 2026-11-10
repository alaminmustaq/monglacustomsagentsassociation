
"use client";

import { useQuery } from "@tanstack/react-query";
import { Download, Printer } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ErrorBox, PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";
import { cx, formatDate, formatNumber } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useFiscalYearStart } from "@/lib/queries";
import { today } from "@/lib/vouchers";

type Balance = { id: number; name: string; type: string; code: string | null; status: string; vouchers: number; debit: number; credit: number; balance: number };
type LedgerRow = { date: string; voucher_id: number; voucher_no: string; status: string; type: string; transaction: string | null; narration?: string | null; remarks?: string | null; debit: number; credit: number; balance: number };
type Ledger = { payee: { id: number; name: string; type: string; code: string | null }; opening: number; rows: LedgerRow[]; totals: { debit: number; credit: number }; closing: number };

const TABS = [
  ["customer", "Customers"],
  ["supplier", "Suppliers"],
  ["employee", "Employees"],
] as const;

/** Customer and supplier ledgers (spec 10.4): balances on the left, one party's ledger on the right. */
export default function LedgersPage() {
  const { me, can } = useSession();
  const p = me.preferences;
  const [type, setType] = useState<string>("customer");
  const [asAt, setAsAt] = useState(today());
  const yearStart = useFiscalYearStart();
  const [fromInput, setFrom] = useState<string | null>(null);
  const from = fromInput ?? yearStart ?? `${new Date().getFullYear()}-01-01`;
  const [drafts, setDrafts] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [term, setTerm] = useState("");

  const common = { include_drafts: drafts ? 1 : undefined, office_id: "all" };
  const balances = useQuery({
    queryKey: ["party-balances", type, asAt, drafts],
    queryFn: () => api<{ data: { rows: Balance[] } }>("/reports/party-balances", { query: { type, to: asAt, ...common } }).then((r) => r.data.rows),
  });
  const ledger = useQuery({
    queryKey: ["party-ledger", selected, from, asAt, drafts],
    queryFn: () => api<{ data: Ledger }>("/reports/party-ledger", { query: { payee_id: selected!, from, to: asAt, ...common } }).then((r) => r.data),
    enabled: !!selected,
  });

  const rows = (balances.data ?? []).filter((b) => !term || b.name.toLowerCase().includes(term.toLowerCase()) || (b.code ?? "").toLowerCase().includes(term.toLowerCase()));
  const total = rows.reduce((s, b) => s + b.balance, 0);
  const owed = type === "customer" ? "Receivable" : "Payable";
  // Balances are debit-positive. Show what a supplier or employee is owed as a positive payable.
  const sign = type === "customer" ? 1 : -1;
  const [drLabel, crLabel] = type === "customer" ? ["Billed", "Received"] : ["Paid", "Billed"];

  return (
    <div className="mx-auto max-w-7xl">
      <div className="print:hidden">
        <PageHeader title="Customer and Supplier Ledgers"
          description="What each customer owes and what is owed to each supplier, from receive and payment vouchers with that party. Covers all your offices."
          actions={can("settings.masters.manage") ? <Link href="/settings/master-data?tab=payees" className="btn btn-secondary">Manage customers and suppliers</Link> : undefined} />
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="flex rounded-md border border-gray-300 bg-white p-0.5" role="tablist">
            {TABS.map(([k, l]) => (
              <button key={k} role="tab" aria-selected={type === k} className={cx("rounded px-3 py-1.5 text-sm", type === k ? "bg-brand-700 text-white" : "text-gray-700 hover:bg-gray-100")}
                onClick={() => { setType(k); setSelected(null); }}>{l}</button>
            ))}
          </div>
          <label className="text-sm text-gray-700">From <input type="date" className="input inline-block w-auto" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="text-sm text-gray-700">To <input type="date" className="input inline-block w-auto" value={asAt} onChange={(e) => setAsAt(e.target.value)} /></label>
          <label className="flex items-center gap-2 pb-2 text-sm text-gray-700"><input type="checkbox" className="h-4 w-4 accent-brand-700" checked={drafts} onChange={(e) => setDrafts(e.target.checked)} /> Include drafts</label>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="card overflow-hidden print:hidden">
          <div className="flex items-center gap-2 border-b border-gray-200 p-3">
            <input className="input" placeholder="Search name or code" value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Search" />
            <button className="btn btn-secondary" title="Download CSV" onClick={() => downloadCsv(`${type}-balances`, ["Name", "Code", "Vouchers", "Debit", "Credit", owed], rows.map((b) => [b.name, b.code, b.vouchers, b.debit, b.credit, sign * b.balance]))} disabled={!rows.length}><Download size={15} /></button>
          </div>
          {balances.error ? <div className="p-3"><ErrorBox error={balances.error} /></div> : !balances.data ? <Spinner /> : (
            <div className="max-h-[65vh] overflow-y-auto">
              <table className="table-base">
                <thead className="sticky top-0"><tr><th>Name</th><th className="text-right">{owed}</th></tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.length === 0 && <tr><td colSpan={2} className="py-8 text-center text-gray-500">None yet.</td></tr>}
                  {rows.map((b) => (
                    <tr key={b.id} className={cx("cursor-pointer", selected === b.id ? "bg-brand-50" : "hover:bg-gray-50")} onClick={() => setSelected(b.id)}>
                      <td><span className="block">{b.name}</span><span className="block text-xs text-gray-500">{b.code ? `${b.code}. ` : ""}{b.vouchers} voucher{b.vouchers === 1 ? "" : "s"}{b.status !== "active" ? ". Inactive" : ""}</span></td>
                      <td className="text-right tabular font-medium">{formatNumber(sign * b.balance, p)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr className="bg-gray-50 font-semibold"><td>Total</td><td className="text-right tabular">{formatNumber(sign * total, p)}</td></tr></tfoot>
              </table>
            </div>
          )}
        </div>

        <div className="card p-4 print:border-0 print:p-0 print:shadow-none">
          {!selected ? <p className="py-16 text-center text-sm text-gray-500">Choose a name to see the ledger.</p> : ledger.isLoading ? <Spinner /> : ledger.error ? <ErrorBox error={ledger.error} /> : ledger.data && (
            <>
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-gray-500 print:text-gray-700">{me.organization?.name}</p>
                  <h2 className="text-base font-semibold text-gray-900">{ledger.data.payee.name}</h2>
                  <p className="text-xs text-gray-600">Ledger from {formatDate(from, p)} to {formatDate(asAt, p)}{drafts ? ", including drafts" : ""}</p>
                </div>
                <div className="flex gap-2 print:hidden">
                  <button className="btn btn-secondary" onClick={() => downloadCsv(`ledger-${ledger.data!.payee.name}`, ["Date", "Voucher No", "Status", "Type", "Transaction", "Narration", drLabel, crLabel, owed],
                    [["", "", "", "", "", "Opening balance", "", "", sign * ledger.data!.opening], ...ledger.data!.rows.map((r) => [r.date, r.voucher_no, r.status, r.type, r.transaction, r.narration ?? r.remarks, r.debit, r.credit, sign * r.balance])])}><Download size={15} /></button>
                  <button className="btn btn-secondary" onClick={() => window.print()}><Printer size={15} /></button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead><tr><th>Date</th><th>Voucher</th><th>Transaction</th><th className="text-right">{drLabel} (Dr)</th><th className="text-right">{crLabel} (Cr)</th><th className="text-right">{owed}</th></tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    <tr className="bg-gray-50"><td colSpan={5}>Opening balance</td><td className="text-right tabular">{formatNumber(sign * ledger.data.opening, p)}</td></tr>
                    {ledger.data.rows.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-gray-500">No vouchers in this period.</td></tr>}
                    {ledger.data.rows.map((r) => (
                      <tr key={r.voucher_id}>
                        <td className="whitespace-nowrap">{formatDate(r.date, p)}</td>
                        <td className="whitespace-nowrap"><Link href={`/print/voucher/${r.voucher_id}`} target="_blank" className="tabular text-brand-700 hover:underline">{r.voucher_no}</Link>{r.status === "draft" && <span className="ml-1 text-[10px] text-amber-700">draft</span>}</td>
                        <td><span className="block">{r.type}</span>{(r.transaction || r.narration || r.remarks) && <span className="block text-xs text-gray-500">{[r.transaction, r.narration ?? r.remarks].filter(Boolean).join(". ")}</span>}</td>
                        <td className="text-right tabular">{r.debit ? formatNumber(r.debit, p) : ""}</td>
                        <td className="text-right tabular">{r.credit ? formatNumber(r.credit, p) : ""}</td>
                        <td className="text-right tabular">{formatNumber(sign * r.balance, p)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr className="bg-gray-50 font-semibold"><td colSpan={3}>Closing balance</td><td className="text-right tabular">{formatNumber(ledger.data.totals.debit, p)}</td><td className="text-right tabular">{formatNumber(ledger.data.totals.credit, p)}</td><td className="text-right tabular">{formatNumber(sign * ledger.data.closing, p)}</td></tr></tfoot>
                </table>
              </div>
              <p className="mt-2 text-xs text-gray-500">{type === "customer" ? "Billed comes from Receivable vouchers; Received from cash, bank and money receipts." : "Billed comes from Payable vouchers; Paid from cash and bank payments."} A negative figure means the balance has turned the other way.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
