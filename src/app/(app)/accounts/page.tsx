"use client";

import { ChevronsDownUp, ChevronsUpDown, FileText, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { AccountTree, buildIndex, parentIds } from "@/components/AccountTree";
import { AccountDrawer } from "@/components/AccountDrawer";
import { ErrorBox, PageHeader, Spinner } from "@/components/ui";
import { useAccounts } from "@/lib/queries";
import { useSession } from "@/lib/session";

type Mode = { kind: "create"; parentId?: number | null } | { kind: "edit"; id: number } | null;

export default function ChartOfAccountsPage() {
  const { can } = useSession();
  const accounts = useAccounts();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [mode, setMode] = useState<Mode>(null);
  const index = useMemo(() => buildIndex(accounts.data ?? []), [accounts.data]);

  const canManage = can("accounts.manage");

  const toggle = (id: number) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const counts = useMemo(() => {
    const list = accounts.data ?? [];
    return { total: list.length, posting: list.filter((a) => a.is_posting).length, inactive: list.filter((a) => a.status === "inactive").length };
  }, [accounts.data]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Chart of Accounts"
        description="Click an account to see or edit it. New accounts get their code from the control account you choose."
        actions={
          canManage && (
            <button className="btn btn-primary" onClick={() => setMode({ kind: "create" })}>
              <Plus size={16} /> New
            </button>
          )
        }
      />

      <div className="card">
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 p-3">
          <div className="relative min-w-60 flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="input pl-9"
              placeholder="Search GL A/C by ID, code or name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search accounts"
            />
          </div>
          <button className="btn btn-secondary" onClick={() => setExpanded(new Set())}>
            <ChevronsDownUp size={16} /> Collapse all
          </button>
          <button className="btn btn-secondary" onClick={() => setExpanded(parentIds(index))}>
            <ChevronsUpDown size={16} /> Expand all
          </button>
          <button className="btn btn-secondary" disabled title="The Chart of Accounts report arrives with the reports in Stage 3">
            <FileText size={16} /> Report
          </button>
        </div>
        <div className="max-h-[calc(100vh-17rem)] overflow-y-auto p-2">
          {accounts.isLoading ? (
            <Spinner />
          ) : accounts.error ? (
            <ErrorBox error={accounts.error} />
          ) : (
            <AccountTree
              index={index}
              expanded={expanded}
              onToggle={toggle}
              search={search}
              selectedId={mode?.kind === "edit" ? mode.id : null}
              onSelect={(a) => setMode({ kind: "edit", id: a.id })}
              renderExtra={(a) =>
                canManage && !a.is_posting && a.status === "active" && a.level < 5 ? (
                  <button
                    className="rounded p-1 text-gray-400 opacity-0 hover:bg-brand-50 hover:text-brand-700 focus:opacity-100 group-hover:opacity-100"
                    onClick={() => setMode({ kind: "create", parentId: a.id })}
                    title={`Add account under ${a.title}`}
                    aria-label={`Add account under ${a.title}`}
                  >
                    <Plus size={15} />
                  </button>
                ) : (
                  <span className="hidden text-xs text-gray-400 sm:inline tabular">{a.code}</span>
                )
              }
            />
          )}
        </div>
        <div className="border-t border-gray-200 px-4 py-2 text-xs text-gray-500">
          {counts.total} accounts, {counts.posting} posting, {counts.inactive} inactive
        </div>
      </div>

      <AccountDrawer mode={mode} accounts={accounts.data ?? []} onClose={() => setMode(null)} />
    </div>
  );
}
