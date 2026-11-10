"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type { Account, FiscalYear, Office, OfficeType } from "./types";

export function useAccounts() {
  return useQuery({ queryKey: ["accounts"], queryFn: () => api<{ data: Account[] }>("/accounts").then((r) => r.data) });
}

export function useFiscalYears() {
  return useQuery({ queryKey: ["fiscal-years"], queryFn: () => api<{ data: FiscalYear[] }>("/fiscal-years").then((r) => r.data) });
}

export function useOffices() {
  return useQuery({ queryKey: ["offices"], queryFn: () => api<{ data: Office[] }>("/settings/offices").then((r) => r.data) });
}

export function useOfficeTypes() {
  return useQuery({ queryKey: ["office-types"], queryFn: () => api<{ data: OfficeType[] }>("/settings/office-types").then((r) => r.data) });
}

/** Start of the current fiscal year, used as the default "date from" on reports. */
export function useFiscalYearStart(): string | null {
  const years = useFiscalYears();
  if (!years.data) return null;
  const current = years.data.find((y) => y.is_current) ?? years.data[0];
  return current?.start_date ?? `${new Date().getFullYear()}-01-01`;
}
