"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronsDownUp, ChevronsUpDown, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AccountTree, buildIndex, parentIds } from "@/components/AccountTree";
import { Drawer, ErrorBox, Field, PageHeader, SaveButton, Spinner, useToast } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { cx, formatAmount, formatNumber } from "@/lib/format";
import { useAccounts, useFiscalYears } from "@/lib/queries";
import { useSession } from "@/lib/session";
import type { Account } from "@/lib/types";

type Balances = {
  balances: { account_id: number; debit: number; credit: number }[];
  totals: { debit: number; credit: number; difference: number };
  fiscal_year: { id: number; code: string; label: string; status: string };
  office_id: number;
};

export default function OpeningBalancesPage() {
  const { me, can } = useSession();
  const toast = useToast();
  const queryClient = useQueryClient();
  const accounts = useAccounts();
  const years = useFiscalYears();
  const [officeId, setOfficeId] = useState<number | null>(me.office_id);
  const [yearId, setYearId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<Account | null>(null);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!yearId && years.data?.length) setYearId((years.data.find((y) => y.is_current) ?? years.data[0]).id);
  }, [years.data, yearId]);

  const balances = useQuery({
    queryKey: ["opening-balances", officeId, yearId],
    queryFn: () => api<Balances>("/opening-balances", { query: { office_id: officeId, fiscal_year_id: yearId } }),
    enabled: !!officeId && !!yearId,
  });

  // Opening balances apply to balance sheet heads only: assets, liabilities and equity (classes 1 to 3).
  const index = useMemo(
    () => buildIndex((accounts.data ?? []).filter((a) => a.class <= 3 && (!a.office_id || !officeId || a.office_id === officeId))),
    [accounts.data, officeId],
  );

  // Rolled-up balance per node, shown on the node's normal side (FR-OB-04).
  const rolled = useMemo(() => {
    const net = new Map<number, number>(); // debit - credit
    for (const b of balances.data?.balances ?? []) {
      let cursor = index.byId.get(b.account_id);
      while (cursor) {
        net.set(cursor.id, (net.get(cursor.id) ?? 0) + b.debit - b.credit);
        cursor = cursor.parent_id ? index.byId.get(cursor.parent_id) : undefined;
      }
    }
    return net;
  }, [balances.data, index]);

  const signed = (a: Account) => {
    const n = rolled.get(a.id) ?? 0;
    return a.normal_side === "D" ? n : -n;
  };

  const year = years.data?.find((y) => y.id === yearId);
  const canManage = can("opening_balances.manage") && year?.status === "open";
  const totals = balances.data?.totals;

  function open(a: Account) {
    if (!a.is_posting) {
      setExpanded((s) => {
        const next = new Set(s);
        if (next.has(a.id)) next.delete(a.id);
        else next.add(a.id);
        return next;
      });
      return;
    }
    setEditing(a);
    const value = signed(a);
    setAmount(value ? String(value) : "");
    setError(undefined);
  }

  async function save() {
    if (!editing) return;
    const value = amount.replace(/,/g, "").trim();
    if (value === "" || Number.isNaN(Number(value))) {
      setError("Enter the opening balance. Use 0 to clear it.");
      return;
    }
    setBusy(true);
    try {
      const data = await api<Balances>("/opening-balances", {
        method: "PUT",
        body: { office_id: officeId, fiscal_year_id: yearId, account_id: editing.id, amount: Number(value) },
      });
      queryClient.setQueryData(["opening-balances", officeId, yearId], data);
      queryClient.invalidateQueries({ queryKey: ["kpis"] });
      toast.success("Opening balance saved.");
      setEditing(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.field("amount") ?? e.field("account_id") ?? e.field("fiscal_year_id") ?? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Opening Balance"
        description="Opening balances per posting account for an office and fiscal year. Click a posting account to enter its balance."
      />

      <div className="card mb-4 grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
        <Field label="Office" htmlFor="office">
          <select id="office" className="input" value={officeId ?? ""} onChange={(e) => setOfficeId(Number(e.target.value))} disabled={me.offices.length <= 1} title={me.offices.length <= 1 ? "You have access to this office only" : undefined}>
            {me.offices.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Fiscal year" htmlFor="year">
          <select id="year" className="input" value={yearId ?? ""} onChange={(e) => setYearId(Number(e.target.value))}>
            {(years.data ?? []).map((y) => (
              <option key={y.id} value={y.id}>
                {y.label}
                {y.status === "closed" ? " (closed)" : ""}
              </option>
            ))}
          </select>
        </Field>
        {totals && (
          <div
            className={cx(
              "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
              Math.abs(totals.difference) < 0.005 ? "border-brand-100 bg-brand-50 text-brand-900" : "border-amber-200 bg-amber-50 text-amber-900",
            )}
            role="status"
          >
            {Math.abs(totals.difference) < 0.005 ? <CheckCircle2 size={18} className="mt-0.5 shrink-0" /> : <AlertTriangle size={18} className="mt-0.5 shrink-0" />}
            <div className="tabular space-y-0.5">
              <p>Debit {formatNumber(totals.debit, me.preferences)}</p>
              <p>Credit {formatNumber(totals.credit, me.preferences)}</p>
              <p className="font-semibold">
                {Math.abs(totals.difference) < 0.005 ? "Balanced" : `Difference ${formatNumber(totals.difference, me.preferences)}`}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 p-3">
          <div className="relative min-w-60 flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input pl-9" placeholder="Search GL A/C by ID, code or name" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search accounts" />
          </div>
          <button className="btn btn-secondary" onClick={() => setExpanded(new Set())}>
            <ChevronsDownUp size={16} /> Collapse all
          </button>
          <button className="btn btn-secondary" onClick={() => setExpanded(parentIds(index))}>
            <ChevronsUpDown size={16} /> Expand all
          </button>
        </div>
        <div className="max-h-[calc(100vh-22rem)] overflow-y-auto p-2">
          {accounts.isLoading || balances.isLoading ? (
            <Spinner />
          ) : accounts.error || balances.error ? (
            <ErrorBox error={accounts.error ?? balances.error} />
          ) : (
            <AccountTree
              index={index}
              expanded={expanded}
              onToggle={(id) => open(index.byId.get(id)!)}
              search={search}
              selectedId={editing?.id}
              onSelect={open}
              renderExtra={(a) => {
                const value = signed(a);
                return value ? (
                  <span className={cx("tabular whitespace-nowrap text-sm", a.is_posting ? "text-gray-800" : "font-semibold text-gray-900")}>
                    {formatAmount(value, me.preferences)}
                  </span>
                ) : null;
              }}
            />
          )}
        </div>
      </div>

      <Drawer
        open={!!editing}
        title="Opening balance entry"
        onClose={() => setEditing(null)}
        size="sm"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setEditing(null)}>{canManage ? "Cancel" : "Close"}</button>
            {canManage && <SaveButton busy={busy} onClick={save} />}
          </>
        }
      >
        {editing && (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
            <Field label="Office"><p className="py-1 text-sm">{me.offices.find((o) => o.id === officeId)?.name}</p></Field>
            <Field label="Fiscal year"><p className="py-1 text-sm">{year?.label}</p></Field>
            <Field label="GL account">
              <p className="py-1 text-sm">
                {editing.title} <span className="text-gray-500">({editing.code})</span>
              </p>
            </Field>
            <Field
              label="Opening balance"
              required
              error={error}
              htmlFor="amount"
              hint={`Normal side: ${editing.normal_side === "D" ? "Debit" : "Credit"}. A negative amount records the other side. Enter 0 to clear.`}
            >
              <input
                id="amount"
                className={cx("input tabular text-right", error && "input-error")}
                inputMode="decimal"
                value={amount}
                disabled={!canManage}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
              />
            </Field>
            {year?.status === "closed" && <p className="text-sm text-amber-700">This fiscal year is closed, so balances cannot change.</p>}
            <button type="submit" className="hidden" />
          </form>
        )}
      </Drawer>
    </div>
  );
}
