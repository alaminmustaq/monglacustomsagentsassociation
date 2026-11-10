"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { api } from "./api";
import { useAccounts } from "./queries";
import { useSession } from "./session";
import type { Account } from "./types";

export type TxnType = {
  id: number;
  code: number;
  name: string;
  module: "receive" | "payment" | "transfer" | "journal" | "any";
  header_side: "D" | "C" | "none";
  show_instrument: boolean;
  header_control: { id: number; code: string; title: string } | null;
};
export type Definition = {
  id: number;
  module: "receive" | "payment";
  name: string;
  default_payee_type: "customer" | "supplier" | "employee" | null;
  status: string;
  types: { id: number; code: number; name: string }[];
  accounts: { id: number; code: string; title: string }[];
};
export type DeductionType = { id: number; name: string; receive_account_id: number | null; payment_account_id: number | null; status: string };
export type Payee = { id: number; type: "customer" | "supplier" | "employee"; code: string | null; name: string; phone: string | null; email: string | null; address: string | null; account_id: number | null; status: string };
export type CostCenter = { id: number; code: string; name: string; status: string };

export type VoucherLine = {
  id: number;
  line_no: number;
  role: "header" | "line" | "deduction";
  account: { id: number; code: string; title: string; gl_id: string | null } | null;
  deduction_type_id: number | null;
  deduction_type: string | null;
  bill_voucher_no: string | null;
  narration: string | null;
  cost_center: { id: number; code: string; name: string } | null;
  cheque_no: string | null;
  cheque_date: string | null;
  debit: number;
  credit: number;
};

export type Voucher = {
  id: number;
  voucher_no: string;
  voucher_date: string;
  source: "receive" | "payment" | "transfer" | "entry" | "upload" | "reversal";
  status: "draft" | "verified" | "reversed";
  transaction_type: { id: number; code: number; name: string } | null;
  transaction_definition: { id: number; name: string } | null;
  header_account: { id: number; code: string; title: string } | null;
  payee_type: string | null;
  payee: { id: number; name: string; type: string } | null;
  office_id: number;
  total_amount: number;
  total_deduction: number;
  net_amount: number;
  narration: string | null;
  remarks?: string | null;
  reference: string | null;
  rejection_reason: string | null;
  debit_account: { id: number; code: string; title: string } | null;
  credit_account: { id: number; code: string; title: string } | null;
  created_by: { id: number; name: string } | null;
  updated_by: { id: number; name: string } | null;
  verified_by: { id: number; name: string } | null;
  verified_at: string | null;
  created_at: string | null;
  reversal_of: { id: number; voucher_no: string } | null;
  // detail only
  work_order_no?: string | null;
  instrument_type?: string | null;
  instrument_no?: string | null;
  instrument_date?: string | null;
  ref_advice_no?: string | null;
  reference_date?: string | null;
  batch_no?: string | null;
  reversed_by?: { id: number; voucher_no: string } | null;
  lines?: VoucherLine[];
  can?: { edit: boolean; delete: boolean; verify: boolean; reject: boolean; reverse: boolean; is_maker: boolean };
};

export type Page<T> = { data: T[]; current_page: number; last_page: number; total: number; per_page: number };

const long = { staleTime: 300_000 };

export function useTypes() {
  return useQuery({ queryKey: ["txn-types"], queryFn: () => api<{ data: TxnType[] }>("/transaction-types").then((r) => r.data), ...long });
}
export function useDefinitions(module?: string, all = false) {
  return useQuery({
    queryKey: ["definitions", module ?? "all", all],
    queryFn: () => api<{ data: Definition[] }>("/transaction-definitions", { query: { module, all: all ? 1 : undefined } }).then((r) => r.data),
    ...long,
  });
}
export function useDeductionTypes(all = false) {
  return useQuery({ queryKey: ["deduction-types", all], queryFn: () => api<{ data: DeductionType[] }>("/deduction-types", { query: { all: all ? 1 : undefined } }).then((r) => r.data), ...long });
}
export function usePayees(type?: string | null, all = false) {
  return useQuery({
    queryKey: ["payees", type ?? "all", all],
    queryFn: () => api<{ data: Payee[] }>("/payees", { query: { type: type ?? undefined, all: all ? 1 : undefined } }).then((r) => r.data),
    ...long,
  });
}
export function useCostCenters(all = false) {
  return useQuery({ queryKey: ["cost-centers", all], queryFn: () => api<{ data: CostCenter[] }>("/cost-centers", { query: { all: all ? 1 : undefined } }).then((r) => r.data), ...long });
}

/** Active posting accounts, optionally limited to those under given control accounts. */
export function usePostingAccounts(underIds?: number[] | null) {
  const { me } = useSession();
  const accounts = useAccounts();
  const list = useMemo(() => {
    const all = accounts.data ?? [];
    const byId = new Map(all.map((a) => [a.id, a]));
    const isUnder = (a: Account, controlId: number) => {
      let cursor: Account | undefined = a;
      while (cursor) {
        if (cursor.id === controlId) return true;
        cursor = cursor.parent_id ? byId.get(cursor.parent_id) : undefined;
      }
      return false;
    };
    return all.filter(
      (a) =>
        a.status === "active" &&
        (!a.office_id || !me.office_id || a.office_id === me.office_id) &&
        (!underIds || underIds.length === 0 || underIds.some((id) => isUnder(a, id))),
    );
  }, [accounts.data, underIds, me.office_id]);
  return { accounts: list, all: accounts.data ?? [], isLoading: accounts.isLoading };
}

export const SOURCE_LABEL: Record<string, string> = {
  receive: "Receive",
  payment: "Payment",
  transfer: "Transfer",
  entry: "Transaction Entry",
  upload: "Upload",
  reversal: "Reversal",
};

export const INSTRUMENTS = [
  ["cheque", "Cheque"],
  ["pay_order", "Pay Order"],
  ["e_fund_transfer", "E-Fund Transfer"],
  ["rtgs", "RTGS"],
  ["beftn", "BEFTN"],
  ["cash", "Cash"],
  ["other", "Other"],
] as const;

export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function fieldErrors(errors: Record<string, string[]>): Record<string, string> {
  return Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, v[0]]));
}
