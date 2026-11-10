"use client";

import { ChevronRight, FileText, Folder, FolderOpen } from "lucide-react";
import { useMemo } from "react";
import type { Account } from "@/lib/types";
import { cx } from "@/lib/format";

export type TreeIndex = {
  byId: Map<number, Account>;
  children: Map<number | null, Account[]>;
};

export function buildIndex(accounts: Account[]): TreeIndex {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const children = new Map<number | null, Account[]>();
  for (const a of accounts) {
    const key = a.parent_id && byId.has(a.parent_id) ? a.parent_id : null;
    if (!children.has(key)) children.set(key, []);
    children.get(key)!.push(a);
  }
  for (const list of children.values()) list.sort((x, y) => x.code.localeCompare(y.code));
  return { byId, children };
}

/** Ids of accounts matching the search plus all their ancestors (FR-COA-02). */
export function searchVisible(index: TreeIndex, search: string): { visible: Set<number>; matches: Set<number> } | null {
  const term = search.trim().toLowerCase();
  if (term.length < 2) return null;
  const matches = new Set<number>();
  const visible = new Set<number>();
  for (const a of index.byId.values()) {
    if (a.title.toLowerCase().includes(term) || a.code.includes(term) || (a.gl_id ?? "").includes(term)) {
      matches.add(a.id);
      let cursor: Account | undefined = a;
      while (cursor) {
        visible.add(cursor.id);
        cursor = cursor.parent_id ? index.byId.get(cursor.parent_id) : undefined;
      }
    }
  }
  return { visible, matches };
}

export function AccountTree({
  index,
  expanded,
  onToggle,
  search,
  selectedId,
  onSelect,
  renderExtra,
  isSelectable,
}: {
  index: TreeIndex;
  expanded: Set<number>;
  onToggle: (id: number) => void;
  search: string;
  selectedId?: number | null;
  onSelect: (account: Account) => void;
  renderExtra?: (account: Account) => React.ReactNode;
  isSelectable?: (account: Account) => boolean;
}) {
  const filter = useMemo(() => searchVisible(index, search), [index, search]);

  const renderNodes = (parentId: number | null, depth: number): React.ReactNode => {
    const nodes = (index.children.get(parentId) ?? []).filter((a) => !filter || filter.visible.has(a.id));
    if (!nodes.length) return null;
    return (
      <ul role={depth === 0 ? "tree" : "group"} className={depth === 0 ? "" : ""}>
        {nodes.map((account) => {
          const kids = index.children.get(account.id) ?? [];
          const hasKids = kids.length > 0;
          const open = filter ? true : expanded.has(account.id);
          const selectable = isSelectable ? isSelectable(account) : true;
          const Icon = account.is_posting ? FileText : open && hasKids ? FolderOpen : Folder;
          return (
            <li key={account.id} role="treeitem" aria-expanded={hasKids ? open : undefined} aria-selected={selectedId === account.id}>
              <div
                className={cx(
                  "group flex items-center gap-1 rounded-md py-1 pr-2",
                  selectedId === account.id ? "bg-brand-50" : "hover:bg-gray-50",
                )}
                style={{ paddingLeft: depth * 18 + 4 }}
              >
                <button
                  type="button"
                  className={cx("rounded p-0.5 text-gray-400 hover:text-gray-700", !hasKids && "invisible")}
                  onClick={() => onToggle(account.id)}
                  aria-label={open ? "Collapse" : "Expand"}
                  tabIndex={hasKids ? 0 : -1}
                >
                  <ChevronRight size={15} className={cx("transition-transform", open && "rotate-90")} />
                </button>
                <button
                  type="button"
                  disabled={!selectable}
                  onClick={() => onSelect(account)}
                  className={cx(
                    "flex min-w-0 flex-1 items-center gap-2 text-left text-sm",
                    account.status === "inactive" && "text-gray-400",
                    selectable ? "cursor-pointer" : "cursor-default",
                    filter?.matches.has(account.id) && "font-semibold",
                  )}
                >
                  <Icon size={15} className={account.is_posting ? "shrink-0 text-gray-400" : "shrink-0 text-brand-700"} />
                  <span className="truncate">
                    {account.title}
                    {account.gl_id && <span className="text-gray-500"> ({account.gl_id})</span>}
                    {account.office && !account.office.is_head_office && (
                      <span className="ml-1.5 inline-flex items-center rounded bg-brand-50 px-1.5 py-0.5 text-xs font-normal text-brand-700">
                        {account.office.name}
                      </span>
                    )}
                  </span>
                  {account.status === "inactive" && <span className="badge bg-gray-100 text-gray-500">Inactive</span>}
                </button>
                {renderExtra?.(account)}
              </div>
              {hasKids && open && renderNodes(account.id, depth + 1)}
            </li>
          );
        })}
      </ul>
    );
  };

  const tree = renderNodes(null, 0);
  return tree ?? <p className="px-2 py-6 text-sm text-gray-500">No accounts match the search.</p>;
}

/** Ids of all accounts that have children (used by Expand All). */
export function parentIds(index: TreeIndex): Set<number> {
  return new Set([...index.children.keys()].filter((k): k is number => k !== null));
}
