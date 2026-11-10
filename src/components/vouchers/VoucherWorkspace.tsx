"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Download, Plus, Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ErrorBox, PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";
import { formatDate, formatNumber } from "@/lib/format";
import { useSession } from "@/lib/session";
import { SOURCE_LABEL, useTypes, type Page, type Voucher } from "@/lib/vouchers";
import { EntryForm } from "./EntryForm";
import { ReceivePaymentForm } from "./ReceivePaymentForm";
import { TransferForm } from "./TransferForm";
import { VoucherDetail } from "./VoucherDetail";
import { VoucherStatus } from "./VoucherStatus";

type Kind = "receive" | "payment" | "transfer" | "entry";
type Editing = { kind: Kind; id: number | null } | null;

const formFor = (source: Voucher["source"]): Kind => (source === "upload" || source === "reversal" ? "entry" : source);

/**
 * The list screen for one voucher module: filters, status, paging, CSV export,
 * and the drawers for create, view, edit, verify, reject and reverse.
 */
export function VoucherWorkspace({ kind, sources, title, description, newLabel }: { kind: Kind; sources: string[]; title: string; description: string; newLabel: string }) {
  const { me, can } = useSession();
  const p = me.preferences;
  const router = useRouter();
  const params = useSearchParams();
  const types = useTypes();
  const [filters, setFilters] = useState({ status: "", from: "", to: "", transaction_type_id: "", search: "", office_id: "all" });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Editing>(null);
  const [viewing, setViewing] = useState<number | null>(null);

  // Open a voucher from a link such as ?voucher=12 (dashboard, reports, ledgers).
  useEffect(() => {
    const id = Number(params.get("voucher"));
    if (id) setViewing(id);
    if (params.get("new") === "1" && can("vouchers.create")) setEditing({ kind, id: null });
  }, [params, kind, can]);

  useEffect(() => {
    const t = setTimeout(() => { setFilters((f) => ({ ...f, search })); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const query = { source: sources.join(","), ...filters, page, per_page: 25 };
  const list = useQuery({
    queryKey: ["vouchers", query],
    queryFn: () => api<Page<Voucher>>("/vouchers", { query }),
    placeholderData: keepPreviousData,
  });

  const moduleTypes = (types.data ?? []).filter((t) => kind === "entry" || t.module === kind || (kind === "transfer" && t.module === "journal"));
  const set = (patch: Partial<typeof filters>) => { setFilters((f) => ({ ...f, ...patch })); setPage(1); };
  const isMoney = kind === "receive" || kind === "payment";

  function closeDetail() {
    setViewing(null);
    if (params.get("voucher")) router.replace(window.location.pathname);
  }

  async function exportCsv() {
    const all = await api<Page<Voucher>>("/vouchers", { query: { ...query, page: 1, per_page: 200 } });
    downloadCsv(`${title.toLowerCase().replace(/\s+/g, "-")}`,
      ["Voucher No", "Date", "Source", "Type", "Transaction", "Payee", "Debit account", "Credit account", "Amount", "Deduction", "Net", "Status", "Prepared by", "Verified by", "Narration"],
      all.data.map((v) => [v.voucher_no, v.voucher_date, SOURCE_LABEL[v.source], v.transaction_type?.name, v.transaction_definition?.name, v.payee?.name,
      v.debit_account?.title, v.credit_account?.title, v.total_amount, v.total_deduction, v.net_amount,
      v.status === "draft" && v.rejection_reason ? "rejected" : v.status, v.created_by?.name, v.verified_by?.name, v.narration ?? v.remarks]));
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title={title} description={description}
        actions={<>
          <button className="btn btn-secondary" onClick={exportCsv} disabled={!list.data?.total}><Download size={15} /> CSV</button>
          {can("vouchers.create") && <button className="btn btn-primary" onClick={() => setEditing({ kind, id: null })}><Plus size={16} /> {newLabel}</button>}
        </>} />

      <div className="card mb-4 flex flex-nowrap items-center gap-2.5 p-3 overflow-x-auto whitespace-nowrap">
        <div className="relative min-w-[180px] max-w-[260px] flex-1 shrink-0">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-8" placeholder="Search voucher no, narration..." value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search" />
        </div>
        <select className="input w-36 shrink-0" value={filters.status} onChange={(e) => set({ status: e.target.value })} aria-label="Status">
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="rejected">Rejected</option>
          <option value="verified">Verified</option>
          <option value="reversed">Reversed</option>
        </select>
        <select className="input w-44 shrink-0" value={filters.transaction_type_id} onChange={(e) => set({ transaction_type_id: e.target.value })} aria-label="Transaction type">
          <option value="">All types</option>
          {moduleTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <input type="date" className="input w-36 shrink-0" value={filters.from} onChange={(e) => set({ from: e.target.value })} aria-label="Date from" title="Date from" />
        <input type="date" className="input w-36 shrink-0" value={filters.to} onChange={(e) => set({ to: e.target.value })} aria-label="Date to" title="Date to" />
        {me.offices.length > 1 && (
          <select className="input w-52 shrink-0" value={filters.office_id} onChange={(e) => set({ office_id: e.target.value })} aria-label="Office">
            <option value="all">All offices</option>
            <option value="">Current office</option>
            {me.offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        )}
      </div>

      {list.error ? <ErrorBox error={list.error} /> : !list.data ? <Spinner /> : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Voucher No</th><th>Date</th>
                  {kind === "entry" && <th>Source</th>}
                  <th>Type</th>
                  {!isMoney && <><th>Debit account</th><th>Credit account</th></>}
                  <th className="text-right">{isMoney ? "Net amount" : "Amount"}</th>
                  <th>Status</th><th>Prepared by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {list.data.data.length === 0 && (
                  <tr><td colSpan={10} className="py-10 text-center text-gray-500">No vouchers match. {can("vouchers.create") && <button className="text-brand-700 underline" onClick={() => setEditing({ kind, id: null })}>{newLabel}</button>}</td></tr>
                )}
                {list.data.data.map((v) => (
                  <tr key={v.id} className="cursor-pointer hover:bg-gray-50" onClick={() => setViewing(v.id)}>
                    <td className="font-medium text-brand-800 tabular">{v.voucher_no}</td>
                    <td className="whitespace-nowrap">{formatDate(v.voucher_date, p)}</td>
                    {kind === "entry" && <td>{SOURCE_LABEL[v.source]}</td>}
                    <td>{v.transaction_type?.name}</td>
                    {!isMoney && (
                      <><td className="max-w-56 truncate" title={v.debit_account?.title}>{v.debit_account?.title}</td><td className="max-w-56 truncate" title={v.credit_account?.title}>{v.credit_account?.title}</td></>
                    )}
                    <td className="text-right tabular">{formatNumber(isMoney ? v.net_amount : v.total_amount, p)}</td>
                    <td><VoucherStatus voucher={v} /></td>
                    <td className="text-gray-600">{v.created_by?.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {list.data.last_page > 1 && (
            <div className="flex items-center justify-between border-t border-gray-200 px-4 py-2.5 text-sm text-gray-600">
              <span>{list.data.total} vouchers. Page {list.data.current_page} of {list.data.last_page}</span>
              <span className="flex gap-2">
                <button className="btn btn-secondary py-1" disabled={page <= 1} onClick={() => setPage((x) => x - 1)}>Previous</button>
                <button className="btn btn-secondary py-1" disabled={page >= list.data.last_page} onClick={() => setPage((x) => x + 1)}>Next</button>
              </span>
            </div>
          )}
        </div>
      )}

      {viewing !== null && !editing && (
        <VoucherDetail id={viewing} onClose={closeDetail} onOpen={(id) => setViewing(id)} onEdit={(v) => setEditing({ kind: formFor(v.source), id: v.id })} />
      )}
      {editing && (editing.kind === "receive" || editing.kind === "payment") && (
        <ReceivePaymentForm module={editing.kind} voucherId={editing.id} onClose={() => setEditing(null)} onSaved={(v) => { setEditing(null); setViewing(v.id); }} />
      )}
      {editing?.kind === "transfer" && <TransferForm voucherId={editing.id} onClose={() => setEditing(null)} onSaved={(v) => { setEditing(null); setViewing(v.id); }} />}
      {editing?.kind === "entry" && <EntryForm voucherId={editing.id} onClose={() => setEditing(null)} onSaved={(v) => { setEditing(null); setViewing(v.id); }} />}
    </div>
  );
}
