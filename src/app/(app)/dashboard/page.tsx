"use client";

import { useQuery } from "@tanstack/react-query";
import { Banknote, Building2, HandCoins, Landmark, Receipt, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import Link from "next/link";
import { formatAmount, formatDate, formatNumber } from "@/lib/format";
import type { Page, Voucher } from "@/lib/vouchers";
import { useSession } from "@/lib/session";
import { ErrorBox, PageHeader, Spinner } from "@/components/ui";

type AccountChild = {
  id: number;
  code: string;
  title: string;
  amount: number;
};

type AccountBreakdown = {
  code: string;
  title: string;
  total: number;
  children: AccountChild[];
};

type Kpis = {
  fiscal_year: { id: number; code: string; label: string } | null;
  office_id: number | null;
  cards: { key: string; label: string; amount: number; account_code: string | null }[];
  breakdowns?: AccountBreakdown[];
};

const ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  cash_bank: Landmark,
  cash: Banknote,
  receivable: HandCoins,
  payable: Wallet,
  expense: Receipt,
};

export default function DashboardPage() {
  const { me, can } = useSession();
  const kpis = useQuery({ queryKey: ["kpis", me.office_id], queryFn: () => api<Kpis>("/dashboard/kpis"), enabled: can("dashboard.view") });
  const office = me.offices.find((o) => o.id === me.office_id);

  if (!can("dashboard.view")) {
    return <PageHeader title={`Welcome, ${me.user.name}`} description="Use the menu on the left to get started." />;
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Home"
        description={`${me.organization?.name ?? ""}${office ? `, ${office.name}` : ""}${kpis.data?.fiscal_year ? `. Fiscal year ${kpis.data.fiscal_year.label}` : ""}`}
      />
      {kpis.isLoading ? (
        <Spinner />
      ) : kpis.error ? (
        <ErrorBox error={kpis.error} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {kpis.data!.cards.map((card) => {
              const Icon = ICONS[card.key] ?? Banknote;
              return (
                <div key={card.key} className="card flex items-start gap-4 p-5">
                  <span className="rounded-lg bg-brand-50 p-2.5 text-brand-700">
                    <Icon size={22} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-gray-600">{card.label}</p>
                    <p className="tabular mt-1 truncate text-xl font-semibold text-gray-900">{formatAmount(card.amount, me.preferences)}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {kpis.data?.breakdowns && kpis.data.breakdowns.length > 0 && (
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
              {kpis.data.breakdowns.map((b) => {
                const isBank = b.code.startsWith("1-1-11");
                const Icon = isBank ? Landmark : Banknote;
                return (
                  <div key={b.code} className="card overflow-hidden">
                    <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50/75 px-5 py-3.5">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="shrink-0 rounded-md bg-white p-1.5 shadow-sm ring-1 ring-gray-200 text-brand-700">
                          <Icon size={18} />
                        </span>
                        <div className="min-w-0">
                          <h3 className="truncate font-semibold text-gray-900" title={`${b.title} (${b.code})`}>{b.title}</h3>
                          <span className="text-xs text-gray-500 tabular">{b.code}</span>
                        </div>
                      </div>
                      <div className="shrink-0 pl-3 text-right">
                        <span className="text-xs text-gray-500">Total</span>
                        <p className="tabular text-lg font-bold text-gray-900">{formatAmount(b.total, me.preferences)}</p>
                      </div>
                    </div>
                    <div>
                      {b.children.length === 0 ? (
                        <p className="p-4 text-center text-xs text-gray-500">No child accounts found.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="table-base">
                            <thead>
                              <tr className="text-xs text-gray-500">
                                <th className="w-32">A/C Code</th>
                                <th>Account Title</th>
                                <th className="w-32 text-right">Balance</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {b.children.map((c) => (
                                <tr key={c.id} className="hover:bg-gray-50/75">
                                  <td className="w-32 text-xs text-gray-500 tabular whitespace-nowrap">{c.code}</td>
                                  <td className="max-w-[280px] truncate font-medium text-gray-800" title={c.title}>
                                    {c.title}
                                  </td>
                                  <td className="w-32 text-right tabular font-semibold text-gray-900 whitespace-nowrap">
                                    {formatNumber(c.amount, me.preferences)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <p className="mt-4 text-xs text-gray-500">
            Figures are opening balances for the current fiscal year plus verified vouchers. Drafts count once another person verifies them.
          </p>
          {can("vouchers.view") && <PendingVouchers />}
        </>
      )}
    </div>
  );
}

const LIST_FOR: Record<string, string> = { receive: "receive", payment: "payment", transfer: "transfer" };

/** Drafts waiting for a second person, so verifiers see their queue on sign-in. */
function PendingVouchers() {
  const { me } = useSession();
  const drafts = useQuery({
    queryKey: ["vouchers", "pending", me.office_id],
    queryFn: () => api<Page<Voucher>>("/vouchers", { query: { status: "draft", per_page: 10 } }),
  });
  if (!drafts.data || drafts.data.total === 0) return null;
  return (
    <section className="card mt-6">
      <h2 className="border-b border-gray-200 px-4 py-3 text-sm font-semibold text-gray-900">Draft vouchers waiting for verification ({drafts.data.total})</h2>
      <ul className="divide-y divide-gray-100">
        {drafts.data.data.map((v) => (
          <li key={v.id}>
            <Link href={`/transactions/${LIST_FOR[v.source] ?? "vouchers"}?voucher=${v.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm hover:bg-gray-50">
              <span className="w-32 font-medium text-brand-800 tabular">{v.voucher_no}</span>
              <span className="w-28 text-gray-600">{formatDate(v.voucher_date, me.preferences)}</span>
              <span className="flex-1 truncate text-gray-700">{v.transaction_definition?.name ?? v.transaction_type?.name}{v.payee ? `, ${v.payee.name}` : ""}</span>
              <span className="tabular text-gray-900">{formatNumber(v.source === "receive" || v.source === "payment" ? v.net_amount : v.total_amount, me.preferences)}</span>
              {v.rejection_reason && <span className="badge bg-red-50 text-red-700">Rejected</span>}
              <span className="text-xs text-gray-500">by {v.created_by?.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
