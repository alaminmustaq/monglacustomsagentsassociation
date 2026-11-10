"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useSession } from "@/lib/session";
import { ErrorBox, PageHeader, Spinner } from "@/components/ui";

type Row = {
  id: number;
  event: string;
  auditable_type: string | null;
  auditable_id: number | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
  user: { id: number; name: string; username: string } | null;
};
type Page = { data: Row[]; current_page: number; last_page: number; total: number };

export default function AuditLogPage() {
  const { me } = useSession();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    const t = setTimeout(() => { setTerm(search); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);
  const logs = useQuery({ queryKey: ["audit", page, term], queryFn: () => api<Page>("/audit-logs", { query: { page, search: term } }) });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Audit Log" description="Every change to business data, plus sign-ins and failed sign-ins. Click a row to see what changed." />
      <div className="card">
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 p-3">
          <div className="relative max-w-sm flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input pl-9" placeholder="Search events and values" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search audit log" />
          </div>
          {logs.data && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span>{logs.data.total} entries</span>
              <button className="btn btn-secondary p-1.5" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page"><ChevronLeft size={16} /></button>
              <span>Page {logs.data.current_page} of {logs.data.last_page}</span>
              <button className="btn btn-secondary p-1.5" disabled={page >= logs.data.last_page} onClick={() => setPage((p) => p + 1)} aria-label="Next page"><ChevronRight size={16} /></button>
            </div>
          )}
        </div>
        {logs.isLoading ? <Spinner /> : logs.error ? <div className="p-4"><ErrorBox error={logs.error} /></div> : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead><tr><th>When</th><th>User</th><th>Event</th><th>Record</th><th>IP</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {logs.data!.data.map((r) => (
                  <Fragment key={r.id}>
                    <tr className="cursor-pointer hover:bg-gray-50" onClick={() => setOpen(open === r.id ? null : r.id)}>
                      <td className="whitespace-nowrap tabular">{formatDateTime(r.created_at, me.preferences)}</td>
                      <td>{r.user?.name ?? <span className="text-gray-400">System</span>}</td>
                      <td><span className="badge bg-gray-100 text-gray-700">{r.event.replace(/_/g, " ")}</span></td>
                      <td className="text-gray-600">{r.auditable_type ? `${r.auditable_type} #${r.auditable_id}` : ""}</td>
                      <td className="text-gray-500">{r.ip_address}</td>
                    </tr>
                    {open === r.id && (
                      <tr className="bg-gray-50">
                        <td colSpan={5}>
                          <div className="grid grid-cols-1 gap-3 py-1 md:grid-cols-2">
                            <Values title="Before" values={r.old_values} />
                            <Values title="After" values={r.new_values} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Values({ title, values }: { title: string; values: Record<string, unknown> | null }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase text-gray-500">{title}</p>
      {values && Object.keys(values).length ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
          {Object.entries(values).map(([k, v]) => (
            <Fragment key={k}><dt className="text-gray-500">{k}</dt><dd className="break-all text-gray-800">{v === null ? "null" : typeof v === "object" ? JSON.stringify(v) : String(v)}</dd></Fragment>
          ))}
        </dl>
      ) : <p className="text-xs text-gray-400">Nothing</p>}
    </div>
  );
}
