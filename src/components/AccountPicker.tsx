"use client";

import { ChevronDown, X } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAccounts } from "@/lib/queries";
import { cx } from "@/lib/format";
import type { Account } from "@/lib/types";

/**
 * Searchable account combobox. Search by title, code or GL ID. Each option shows
 * its control account (the immediate parent) so similar titles can be told apart.
 * The list opens in a layer above the page, so a table or drawer never cuts it off.
 */
export function AccountPicker({
  accounts,
  value,
  onChange,
  placeholder = "Search account",
  invalid,
  disabled,
  id,
  compact,
}: {
  accounts: Account[];
  value: number | null | undefined;
  onChange: (id: number | null) => void;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  id?: string;
  compact?: boolean;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; width: number; maxHeight: number } | null>(null);
  const all = useAccounts();
  const byId = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const allById = useMemo(() => new Map((all.data ?? []).map((a) => [a.id, a])), [all.data]);
  const selected = value ? byId.get(value) : undefined;

  const matches = useMemo(() => {
    const t = term.trim().toLowerCase();
    const list = t
      ? accounts.filter((a) => a.title.toLowerCase().includes(t) || a.code.includes(t) || (a.gl_id ?? "").includes(t))
      : accounts;
    return list.slice(0, 200);
  }, [accounts, term]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!box.current?.contains(t) && !list.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  // Place the list under the field (or above it when there is no room), and follow the field on scroll.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = input.current?.getBoundingClientRect();
      if (!r) return;
      const width = Math.min(Math.max(r.width, 420), window.innerWidth - 16);
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      const below = window.innerHeight - r.bottom - 8;
      const above = r.top - 8;
      if (below >= 240 || below >= above) setPos({ left, top: r.bottom + 4, width, maxHeight: Math.min(380, below - 4) });
      else setPos({ left, bottom: window.innerHeight - r.top + 4, width, maxHeight: Math.min(380, above - 4) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active]);

  useEffect(() => setActive(0), [term]);

  function choose(a: Account) {
    onChange(a.id);
    setOpen(false);
    setTerm("");
  }

  return (
    <div ref={box} className="relative">
      <div className="relative">
        <input
          ref={input}
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          className={cx("input pr-14", compact && "py-1.5", invalid && "input-error")}
          disabled={disabled}
          placeholder={selected ? "" : placeholder}
          value={open ? term : selected ? `${selected.title}${selected.office && !selected.office.is_head_office ? ` [${selected.office.name}]` : ""} (${selected.code})` : ""}
          onFocus={() => {
            setOpen(true);
            setTerm("");
          }}
          onChange={(e) => {
            setTerm(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((i) => Math.min(i + 1, matches.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter" && open && matches[active]) {
              e.preventDefault();
              choose(matches[active]);
            } else if (e.key === "Escape" && open) {
              e.stopPropagation(); // close the list, not the drawer around it
              setOpen(false);
            } else if (e.key === "Tab" && open && term && matches[active]) {
              choose(matches[active]);
            }
          }}
        />
        <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5 text-gray-400">
          {selected && !disabled && (
            <button type="button" className="rounded p-0.5 hover:text-gray-700" onClick={() => onChange(null)} aria-label="Clear account" tabIndex={-1}>
              <X size={14} />
            </button>
          )}
          <ChevronDown size={15} />
        </div>
      </div>
      {open && !disabled && pos && createPortal(
        <ul ref={list} id={listId} role="listbox" style={{ position: "fixed", left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, maxHeight: pos.maxHeight }}
          className="z-[70] overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          {matches.length === 0 && <li className="px-3 py-2 text-sm text-gray-500">No matching posting account</li>}
          {matches.map((a, i) => {
            const parent = a.parent_id ? allById.get(a.parent_id) : undefined;
            return (
              <li
                key={a.id}
                role="option"
                aria-selected={a.id === value}
                data-active={i === active}
                className={cx("cursor-pointer border-b border-gray-50 px-3 py-1.5 last:border-0", i === active ? "bg-brand-50" : "hover:bg-gray-50")}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(a);
                }}
              >
                <span className="block text-sm text-gray-900">
                  {a.title} {a.gl_id && <span className="text-gray-500">({a.gl_id})</span>}
                  {a.office && !a.office.is_head_office && <span className="ml-1.5 rounded bg-brand-50 px-1 py-0.5 text-[10px] font-normal text-brand-700">[{a.office.name}]</span>}
                </span>
                <span className="flex justify-between gap-3 text-[11px] text-gray-500">
                  <span className="tabular">{a.code}</span>
                  {parent && <span className="truncate">Control: {parent.title}</span>}
                </span>
              </li>
            );
          })}
        </ul>,
        document.body,
      )}
    </div>
  );
}
