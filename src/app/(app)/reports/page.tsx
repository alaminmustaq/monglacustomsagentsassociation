"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useQuery } from "@tanstack/react-query";
import { Download, FileBarChart, Play, Printer } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { AccountPicker } from "@/components/AccountPicker";
import { ErrorBox, Field, PageHeader, Spinner } from "@/components/ui";
import { VoucherPrint } from "@/components/vouchers/VoucherPrint";
import { api, ApiError } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";
import { cx, formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { useAccounts, useFiscalYearStart } from "@/lib/queries";
import { useSession } from "@/lib/session";
import type { Preferences } from "@/lib/types";
import { today, usePayees } from "@/lib/vouchers";

type ReportDef = { key: string; title: string; group: string; params: ("range" | "asAt" | "level" | "account" | "payee" | "type" | "drafts" | "office")[]; note: string };

const REPORTS: ReportDef[] = [
  { key: "trial-balance-posting", title: "Trial Balance (Posting Heads)", group: "Financial statements", params: ["range", "office", "drafts"], note: "Opening, period movement and closing balance of every posting account." },
  { key: "trial-balance-group", title: "Trial Balance (Group Heads)", group: "Financial statements", params: ["range", "level", "office", "drafts"], note: "The same figures rolled up to a chosen level of the chart." },
  { key: "profit-loss", title: "Profit & Loss Statement", group: "Financial statements", params: ["range", "office", "drafts"], note: "Income less cost of sales and expenses for the period." },
  { key: "balance-sheet", title: "Balance Sheet", group: "Financial statements", params: ["asAt", "office", "drafts"], note: "Assets, liabilities and equity as at a date, with the current year profit." },
  { key: "general-ledger", title: "General Ledger Report", group: "Ledgers", params: ["account", "range", "office", "drafts"], note: "Every line posted to an account (or all accounts under a control account), with the running balance." },
  { key: "party-ledger", title: "Customer / Supplier Ledger", group: "Ledgers", params: ["payee", "range", "office", "drafts"], note: "Bills and settlements for one customer, supplier or employee." },
  { key: "party-balances", title: "Customer / Supplier Balances", group: "Ledgers", params: ["type", "asAt", "office", "drafts"], note: "Outstanding balance of every customer, supplier or employee." },
  { key: "receive-voucher", title: "Receivable/Receive Txn. Voucher", group: "Vouchers", params: ["range", "office", "drafts"], note: "Printable receive vouchers for the period, one per page." },
  { key: "payment-voucher", title: "Payable/Payment Txn. Voucher", group: "Vouchers", params: ["range", "office", "drafts"], note: "Printable payment vouchers for the period, one per page." },
  { key: "transfer-voucher", title: "Transfer Transaction Voucher", group: "Vouchers", params: ["range", "office", "drafts"], note: "Journal, fund transfer, entry, upload and reversal vouchers, one per page." },
  { key: "chart-of-accounts", title: "Chart of Accounts Report", group: "Lists", params: [], note: "The full chart with codes, GL IDs and status." },
];

type Params = { from: string; to: string; office_id: string; include_drafts: boolean; level: string; account_id: number | null; payee_id: string; type: string };


export default function ReportsPage() {
  return <Suspense><Reports /></Suspense>;
}

function Reports() {
  const { me } = useSession();
  const router = useRouter();
  const search = useSearchParams();
  const key = search.get("report");
  const def = REPORTS.find((r) => r.key === key);

  if (!def) {
    const groups = Array.from(new Set(REPORTS.map((r) => r.group)));
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Report Admin" description={`Reports for ${me.organization?.name}. Only verified vouchers count unless you tick "Include drafts".`} />
        {groups.map((g) => (
          <section key={g} className="mb-6">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">{g}</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {REPORTS.filter((r) => r.group === g).map((r) => (
                <Link key={r.key} href={`/reports?report=${r.key}`} className="card flex gap-3 p-4 hover:border-brand-600">
                  <span className="h-fit rounded-lg bg-brand-50 p-2.5 text-brand-700"><FileBarChart size={20} /></span>
                  <span>
                    <span className="block text-sm font-semibold text-gray-900">{r.title}</span>
                    <span className="mt-0.5 block text-xs text-gray-500">{r.note}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    );
  }
  return <RunnerWhenReady def={def} onBack={() => router.push("/reports")} initial={search} />;
}

/** Waits for the fiscal year so "Date from" starts at the beginning of the current year. */
function RunnerWhenReady(props: { def: ReportDef; onBack: () => void; initial: URLSearchParams }) {
  const start = useFiscalYearStart();
  if (!start) return <Spinner />;
  return <ReportRunner key={props.def.key} {...props} yearStart={start} />;
}

function ReportRunner({ def, onBack, initial, yearStart }: { def: ReportDef; onBack: () => void; initial: URLSearchParams; yearStart: string }) {
  const { me } = useSession();
  const prefs = me.preferences;
  const accounts = useAccounts();
  const [form, setForm] = useState<Params>({
    from: initial.get("from") ?? yearStart, to: initial.get("to") ?? today(), office_id: initial.get("office_id") ?? "", include_drafts: initial.get("include_drafts") === "1",
    level: "3", account_id: initial.get("account_id") ? Number(initial.get("account_id")) : null, payee_id: initial.get("payee_id") ?? "", type: initial.get("type") ?? "",
  });
  const [run, setRun] = useState<Params | null>(null);
  const has = (p: ReportDef["params"][number]) => def.params.includes(p);
  const payees = usePayees(form.type || null, true);
  const allPayees = usePayees(null, true);
  const missing = (has("account") && !form.account_id) || (has("payee") && !form.payee_id);

  // Reports without required inputs run at once; ledgers wait for the account or payee.
  useEffect(() => {
    if (!missing) setRun(form);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const query = useMemo(() => {
    if (!run) return null;
    const q: Record<string, string | number | undefined> = {};
    if (has("range")) { q.from = run.from; q.to = run.to; }
    if (has("asAt")) q.to = run.to;
    if (run.office_id) q.office_id = run.office_id;
    if (run.include_drafts) q.include_drafts = 1;
    if (has("level")) q.level = run.level;
    if (has("account") && run.account_id) q.account_id = run.account_id;
    if (has("payee")) q.payee_id = run.payee_id;
    if (has("type") && run.type) q.type = run.type;
    return q;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  const report = useQuery({
    queryKey: ["report", def.key, query],
    queryFn: () => api<any>(`/reports/${def.key}`, { query: query! }),
    enabled: !!query,
  });

  const rendered = report.data ? render(def.key, report.data, prefs) : null;

  return (
    <div className="w-full">
      <div className="print:hidden">
        <PageHeader title={def.title} description={def.note}
          actions={<>
            <button className="btn btn-secondary" onClick={onBack}>All reports</button>
            {rendered?.csv && <button className="btn btn-secondary" onClick={() => downloadCsv(def.key, rendered.csv!.header, rendered.csv!.rows)}><Download size={15} /> CSV</button>}
            <button className="btn btn-secondary" onClick={() => window.print()} disabled={!report.data}><Printer size={15} /> Print</button>
          </>} />

        <form className="card mb-4 flex flex-wrap items-end gap-3 p-3" onSubmit={(e) => { e.preventDefault(); setRun({ ...form }); }}>
          {has("account") && (
            <div className="w-full sm:w-96">
              <Field label="GL account" required htmlFor="r-acc" error={report.error instanceof ApiError ? report.error.field("account_id") : undefined}>
                <AccountPicker id="r-acc" accounts={(accounts.data ?? []).filter((a) => a.status === "active")} value={form.account_id} onChange={(id) => setForm({ ...form, account_id: id })} placeholder="Posting or control account" />
              </Field>
            </div>
          )}
          {(has("payee") || has("type")) && (
            <Field label="Party type" htmlFor="r-type">
              <select id="r-type" className="input w-36" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value, payee_id: "" })}>
                <option value="">All</option><option value="customer">Customer</option><option value="supplier">Supplier</option><option value="employee">Employee</option>
              </select>
            </Field>
          )}
          {has("payee") && (
            <Field label="Customer / supplier" required htmlFor="r-payee">
              <select id="r-payee" className="input w-64" value={form.payee_id} onChange={(e) => setForm({ ...form, payee_id: e.target.value })}>
                <option value="">Select</option>
                {(form.type ? payees.data : allPayees.data)?.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.type})</option>)}
              </select>
            </Field>
          )}
          {has("range") && (
            <>
              <Field label="Date from" htmlFor="r-from"><input id="r-from" type="date" className="input" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} /></Field>
              <Field label="Date to" htmlFor="r-to"><input id="r-to" type="date" className="input" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} /></Field>
            </>
          )}
          {has("asAt") && <Field label="As at" htmlFor="r-asat"><input id="r-asat" type="date" className="input" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} /></Field>}
          {has("level") && (
            <Field label="Level" htmlFor="r-level">
              <select id="r-level" className="input w-40" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}>
                <option value="1">1. Class</option><option value="2">2. Group</option><option value="3">3. Sub-group</option><option value="4">4. Ledger</option>
              </select>
            </Field>
          )}
          {has("office") && (
            <Field label="Office" htmlFor="r-office">
              <select id="r-office" className="input w-48" value={form.office_id} onChange={(e) => setForm({ ...form, office_id: e.target.value })} disabled={me.offices.length <= 1}>
                <option value="">Current office</option>
                {me.offices.length > 1 && <option value="all">All my offices</option>}
                {me.offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </Field>
          )}
          {has("drafts") && (
            <label className="flex items-center gap-2 pb-2 text-sm text-gray-700">
              <input type="checkbox" className="h-4 w-4 accent-brand-700" checked={form.include_drafts} onChange={(e) => setForm({ ...form, include_drafts: e.target.checked })} />
              Include drafts
            </label>
          )}
          <button type="submit" className="btn btn-primary" disabled={missing}><Play size={15} /> Run report</button>
        </form>
      </div>

      {!run ? (
        <p className="rounded-md border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500 print:hidden">Choose the {has("account") ? "account" : "customer or supplier"} and run the report.</p>
      ) : report.isLoading ? <Spinner label="Running report" /> : report.error ? <ErrorBox error={report.error} /> : report.data && rendered && (
        rendered.vouchers ? rendered.body : (
          <div className={cx("report-print print:border-0 print:p-0 print:shadow-none", rendered.customHeader ? "card p-2 sm:px-3 sm:py-4" : "card p-6")}>
            {!rendered.customHeader && <ReportHeader data={report.data} prefs={prefs} />}
            {rendered.body}
            {!rendered.customHeader && (
              <p className="mt-6 text-right text-[11px] text-gray-500">Printed by {report.data.printed_by} on {formatDateTime(report.data.printed_at, prefs)}</p>
            )}
          </div>
        )
      )}
    </div>
  );
}

function ReportHeader({ data, prefs }: { data: any; prefs: Preferences }) {
  const period = data.from ? `From ${formatDate(data.from, prefs)} to ${formatDate(data.to, prefs)}` : data.to ? `As at ${formatDate(data.to, prefs)}` : "";
  return (
    <div className="mb-4 border-b border-gray-300 pb-3 text-center">
      <p className="text-base font-bold text-gray-900">{data.organization?.name}</p>
      {data.office && <p className="text-sm text-gray-700">{data.office}</p>}
      <h2 className="mt-1 text-sm font-bold uppercase tracking-wide text-gray-900">{data.title}</h2>
      <p className="text-xs text-gray-600">{period}{data.include_drafts ? ". Includes draft vouchers" : ""}</p>
    </div>
  );
}

// ---------------------------------------------------------------- renderers

type Rendered = { body: ReactNode; csv?: { header: string[]; rows: (string | number | null | undefined)[][] }; vouchers?: boolean; customHeader?: boolean };
const n = (v: number, p: Preferences) => (v ? formatNumber(v, p) : "");
const drcr = (v: number, p: Preferences) => (Math.abs(v) < 0.005 ? "0.00" : `${formatNumber(Math.abs(v), p)} ${v > 0 ? "Dr" : "Cr"}`);
const fmtTb = (v: number | undefined | null, p: Preferences) => {
  if (!v || Math.abs(v) < 0.005) return ".00";
  return formatNumber(v, p);
};

function formatHeaderTimestamp(isoString?: string) {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return isoString;
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const dayName = days[d.getDay()];
  const monthName = months[d.getMonth()];
  const day = d.getDate();
  const year = d.getFullYear();
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${dayName} ${monthName} ${day} ${year} ${hours}:${minutes} ${ampm}`;
}

function Table({ head, children, foot }: { head: ReactNode; children: ReactNode; foot?: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="border-y border-gray-400 bg-gray-50 text-left text-xs font-semibold text-gray-700 print:bg-white">{head}</thead>
        <tbody className="divide-y divide-gray-100">{children}</tbody>
        {foot && <tfoot className="border-y-2 border-gray-500 font-semibold">{foot}</tfoot>}
      </table>
    </div>
  );
}
const th = "px-2 py-1.5";
const td = "px-2 py-1.5 align-top";
const num = "px-2 py-1.5 text-right tabular whitespace-nowrap";

function voucherLink(id: number, no: string) {
  return <Link href={`/print/voucher/${id}`} target="_blank" className="text-brand-700 hover:underline print:text-gray-900 print:no-underline">{no}</Link>;
}

function render(key: string, r: any, p: Preferences): Rendered {
  const d = r.data;
  switch (key) {
    case "trial-balance-posting":
    case "trial-balance-group": {
      const rows: any[] = d.rows;
      const t = d.totals;
      const isPosting = key === "trial-balance-posting";
      const reportTitle = isPosting
        ? `Trial Balance (Txn. Head) Summary from ${formatDate(r.from, p)} to ${formatDate(r.to, p)}`
        : `Trial Balance (Group Heads) Summary from ${formatDate(r.from, p)} to ${formatDate(r.to, p)}`;
      const tbTh = "border border-black px-2 py-1 text-center font-bold text-gray-900 bg-gray-50 print:bg-white text-xs print:text-[11px]";
      const tbTd = "border border-black px-2.5 py-1 text-left align-middle text-xs print:text-[11px]";
      const tbNum = "border border-black px-2 py-1 text-right tabular align-middle whitespace-nowrap text-xs print:text-[11px]";

      return {
        customHeader: true,
        body: (
          <div className="text-black">
            {/* Top Report Header matching user's reference */}
            <div className="mb-4">
              <div className="relative text-center">
                <div className="absolute right-0 top-0 hidden sm:block text-right text-xs text-gray-800 whitespace-nowrap">
                  {formatHeaderTimestamp(r.printed_at)}
                </div>
                <h1 className="text-xl font-bold tracking-tight text-gray-900 print:text-lg">
                  {r.organization?.name}
                </h1>
                {(r.office_address || r.office) && (
                  <p className="mt-0.5 text-xs text-gray-700">
                    {r.office_address || r.office}
                  </p>
                )}
                <h2 className="mt-2 text-xs font-bold text-gray-900">
                  {reportTitle}{r.include_drafts ? " (Includes Drafts)" : ""}
                </h2>
                <div className="mt-1 block sm:hidden text-right text-[10px] text-gray-600">
                  {formatHeaderTimestamp(r.printed_at)}
                </div>
              </div>
            </div>

            {/* Trial Balance Table with sharp bordered layout */}
            <div className="overflow-x-auto">
              <table className="w-full table-fixed border-collapse border border-black text-xs print:text-[11px]">
                <thead>
                  <tr className="border border-black">
                    <th rowSpan={2} className={cx(tbTh, "w-[28%]")}>
                      <div>A/C Name</div>
                      <div>A/C No</div>
                    </th>
                    <th colSpan={2} className={cx(tbTh, "w-[24%]")}>Opening Balance</th>
                    <th colSpan={2} className={cx(tbTh, "w-[24%]")}>Transaction Within This Period</th>
                    <th colSpan={2} className={cx(tbTh, "w-[24%]")}>Closing Balance</th>
                  </tr>
                  <tr className="border border-black">
                    <th className={cx(tbTh, "w-[12%]")}>Dr.</th>
                    <th className={cx(tbTh, "w-[12%]")}>Cr.</th>
                    <th className={cx(tbTh, "w-[12%]")}>Dr.</th>
                    <th className={cx(tbTh, "w-[12%]")}>Cr.</th>
                    <th className={cx(tbTh, "w-[12%]")}>Dr.</th>
                    <th className={cx(tbTh, "w-[12%]")}>Cr.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black">
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="border border-black py-8 text-center text-gray-500">
                        No balances in this period.
                      </td>
                    </tr>
                  )}
                  {rows.map((x) => (
                    <tr key={x.code} className="hover:bg-gray-50 print:hover:bg-transparent">
                      <td className={tbTd}>
                        <div className="font-normal text-gray-900">{x.title}</div>
                        <div className="text-[11px] text-gray-700 tabular font-mono">{x.code}</div>
                      </td>
                      <td className={tbNum}>{fmtTb(x.opening_dr, p)}</td>
                      <td className={tbNum}>{fmtTb(x.opening_cr, p)}</td>
                      <td className={tbNum}>{fmtTb(x.debit, p)}</td>
                      <td className={tbNum}>{fmtTb(x.credit, p)}</td>
                      <td className={tbNum}>{fmtTb(x.closing_dr, p)}</td>
                      <td className={tbNum}>{fmtTb(x.closing_cr, p)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border border-black font-bold">
                    <td className={cx(tbTh, "text-center font-bold")}>Total</td>
                    <td className={cx(tbNum, "font-bold text-gray-900")}>{fmtTb(t.opening_dr, p)}</td>
                    <td className={cx(tbNum, "font-bold text-gray-900")}>{fmtTb(t.opening_cr, p)}</td>
                    <td className={cx(tbNum, "font-bold text-gray-900")}>{fmtTb(t.debit, p)}</td>
                    <td className={cx(tbNum, "font-bold text-gray-900")}>{fmtTb(t.credit, p)}</td>
                    <td className={cx(tbNum, "font-bold text-gray-900")}>{fmtTb(t.closing_dr, p)}</td>
                    <td className={cx(tbNum, "font-bold text-gray-900")}>{fmtTb(t.closing_cr, p)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Bottom Footer matching user's document */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-600">
              <div>Developed by: DATADSS; www.datadss.com</div>
              {Math.abs(d.difference) >= 0.005 && (
                <div className="text-red-700 font-medium">
                  The trial balance does not agree: difference {formatNumber(d.difference, p)}. Check opening balances.
                </div>
              )}
            </div>
          </div>
        ),
        csv: {
          header: ["A/C Name", "A/C No", "Opening Dr", "Opening Cr", "Txn Dr", "Txn Cr", "Closing Dr", "Closing Cr"],
          rows: [
            ...rows.map((x) => [x.title, x.code, x.opening_dr, x.opening_cr, x.debit, x.credit, x.closing_dr, x.closing_cr]),
            ["Total", "", t.opening_dr, t.opening_cr, t.debit, t.credit, t.closing_dr, t.closing_cr],
          ],
        },
      };
    }
    case "general-ledger": {
      const rows: any[] = d.rows;
      const many = !d.account.is_posting;
      return {
        body: (
          <>
            <p className="mb-3 text-sm"><span className="font-semibold">Account:</span> {d.account.title} ({d.account.code}){many && " and all posting accounts under it"}</p>
            <Table
              head={<tr><th className={th}>Date</th><th className={th}>Voucher No</th><th className={th}>Type</th>{many && <th className={th}>Account</th>}<th className={th}>Particulars</th><th className={th}>Contra account</th><th className={cx(th, "text-right")}>Debit</th><th className={cx(th, "text-right")}>Credit</th><th className={cx(th, "text-right")}>Balance</th></tr>}
              foot={<>
                <tr><td className={td} colSpan={many ? 6 : 5}>Total for the period</td><td className={num}>{formatNumber(d.totals.debit, p)}</td><td className={num}>{formatNumber(d.totals.credit, p)}</td><td className={num}>{drcr(d.closing, p)}</td></tr>
              </>}>
              <tr className="bg-gray-50 print:bg-white"><td className={td} colSpan={many ? 8 : 7}>Opening balance</td><td className={num}>{drcr(d.opening, p)}</td></tr>
              {rows.map((x, i) => (
                <tr key={i}>
                  <td className={cx(td, "whitespace-nowrap")}>{formatDate(x.date, p)}</td>
                  <td className={cx(td, "whitespace-nowrap tabular")}>{voucherLink(x.voucher_id, x.voucher_no)}{x.status === "draft" && <span className="ml-1 text-[10px] text-amber-700">draft</span>}</td>
                  <td className={td}>{x.type}</td>
                  {many && <td className={td}>{x.account?.title}</td>}
                  <td className={td}>{x.narration}</td><td className={td}>{x.contra}</td>
                  <td className={num}>{n(x.debit, p)}</td><td className={num}>{n(x.credit, p)}</td><td className={num}>{drcr(x.balance, p)}</td>
                </tr>
              ))}
            </Table>
          </>
        ),
        csv: { header: ["Date", "Voucher No", "Status", "Type", "Account", "Particulars", "Contra account", "Debit", "Credit", "Balance"],
          rows: [["", "", "", "", "", "Opening balance", "", "", "", d.opening], ...rows.map((x) => [x.date, x.voucher_no, x.status, x.type, x.account?.title, x.narration, x.contra, x.debit, x.credit, x.balance]), ["", "", "", "", "", "Total", "", d.totals.debit, d.totals.credit, d.closing]] },
      };
    }
    case "profit-loss": {
      const csv: (string | number)[][] = [];
      const body = (
        <Table head={<tr><th className={th}>Particulars</th><th className={cx(th, "text-right")}>Amount</th><th className={cx(th, "text-right")}>Total</th></tr>}>
          {d.sections.map((s: any) => {
            csv.push([s.title, "", s.total]);
            return s.summary ? (
              <tr key={s.key} className="border-y border-gray-400 bg-gray-50 font-bold print:bg-white"><td className={td}>{s.title}</td><td /><td className={num}>{formatNumber(s.total, p)}</td></tr>
            ) : (
              <SectionRows key={s.key} title={s.title} total={s.total} p={p}>
                {s.groups.map((g: any) => {
                  csv.push([`  ${g.title}`, g.amount, ""]);
                  return [
                    <tr key={g.code} className="font-semibold"><td className={cx(td, "pl-6")}>{g.title}</td><td className={num}>{formatNumber(g.amount, p)}</td><td /></tr>,
                    ...g.accounts.map((a: any) => { csv.push([`    ${a.title}`, a.amount, ""]); return <tr key={a.code} className="text-gray-700"><td className={cx(td, "pl-10")}>{a.title}</td><td className={num}>{formatNumber(a.amount, p)}</td><td /></tr>; }),
                  ];
                })}
              </SectionRows>
            );
          })}
        </Table>
      );
      return { body, csv: { header: ["Particulars", "Amount", "Total"], rows: csv } };
    }
    case "balance-sheet": {
      const csv: (string | number)[][] = [];
      const side = (title: string, sec: any, extra?: ReactNode) => {
        csv.push([title, "", sec.total]);
        return (
          <SectionRows title={title} total={sec.total_with_profit ?? sec.total} p={p}>
            {sec.groups.map((g: any) => {
              csv.push([`  ${g.title}`, g.amount, ""]);
              return [
                <tr key={g.code} className="font-semibold"><td className={cx(td, "pl-6")}>{g.title}</td><td className={num}>{formatNumber(g.amount, p)}</td><td /></tr>,
                ...g.items.map((i: any) => { csv.push([`    ${i.title}`, i.amount, ""]); return <tr key={i.code} className="text-gray-700"><td className={cx(td, "pl-10")}>{i.title}</td><td className={num}>{formatNumber(i.amount, p)}</td><td /></tr>; }),
              ];
            })}
            {extra}
          </SectionRows>
        );
      };
      csv.push(["  Current year profit", d.equity.current_year_profit, ""]);
      return {
        body: (
          <>
            <Table head={<tr><th className={th}>Particulars</th><th className={cx(th, "text-right")}>Amount</th><th className={cx(th, "text-right")}>Total</th></tr>}>
              {side("Assets", d.assets)}
              {side("Liabilities", d.liabilities)}
              {side("Equity", d.equity, <tr className="font-semibold"><td className={cx(td, "pl-6")}>Current year profit (loss)</td><td className={num}>{formatNumber(d.equity.current_year_profit, p)}</td><td /></tr>)}
              <tr className="border-y border-gray-400 bg-gray-50 font-bold print:bg-white"><td className={td}>Total liabilities and equity</td><td /><td className={num}>{formatNumber(d.total_liabilities_and_equity, p)}</td></tr>
            </Table>
            {Math.abs(d.difference) >= 0.005 && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">Assets and liabilities plus equity differ by {formatNumber(d.difference, p)}. Check opening balances.</p>}
          </>
        ),
        csv: { header: ["Particulars", "Amount", "Total"], rows: [...csv, ["Total assets", "", d.total_assets], ["Total liabilities and equity", "", d.total_liabilities_and_equity]] },
      };
    }
    case "chart-of-accounts": {
      const rows: any[] = d.rows;
      return {
        body: (
          <Table head={<tr><th className={th}>Code</th><th className={th}>GL ID</th><th className={th}>Account head</th><th className={th}>Level</th><th className={th}>Kind</th><th className={th}>Normal side</th><th className={th}>Status</th></tr>}>
            {rows.map((x) => (
              <tr key={x.code} className={cx(!x.is_posting && "font-semibold", x.status !== "active" && "text-gray-400")}>
                <td className={cx(td, "tabular whitespace-nowrap")}>{x.code}</td><td className={td}>{x.gl_id}</td>
                <td className={td} style={{ paddingLeft: `${(x.level - 1) * 16 + 8}px` }}>{x.title}</td>
                <td className={td}>{x.level}</td><td className={td}>{x.is_posting ? "Posting" : "Control"}</td><td className={td}>{x.normal_side === "D" ? "Debit" : "Credit"}</td><td className={td}>{x.status}</td>
              </tr>
            ))}
          </Table>
        ),
        csv: { header: ["Code", "GL ID", "Account head", "Level", "Kind", "Normal side", "Status"], rows: rows.map((x) => [x.code, x.gl_id, x.title, x.level, x.is_posting ? "Posting" : "Control", x.normal_side, x.status]) },
      };
    }
    case "party-ledger": {
      const rows: any[] = d.rows;
      return {
        body: (
          <>
            <p className="mb-3 text-sm"><span className="font-semibold">{d.payee.type.charAt(0).toUpperCase() + d.payee.type.slice(1)}:</span> {d.payee.name}{d.payee.code ? ` (${d.payee.code})` : ""}</p>
            <Table
              head={<tr><th className={th}>Date</th><th className={th}>Voucher No</th><th className={th}>Type</th><th className={th}>Transaction</th><th className={th}>Narration</th><th className={cx(th, "text-right")}>Debit</th><th className={cx(th, "text-right")}>Credit</th><th className={cx(th, "text-right")}>Balance</th></tr>}
              foot={<tr><td className={td} colSpan={5}>Total for the period</td><td className={num}>{formatNumber(d.totals.debit, p)}</td><td className={num}>{formatNumber(d.totals.credit, p)}</td><td className={num}>{formatNumber(d.closing, p)}</td></tr>}>
              <tr className="bg-gray-50 print:bg-white"><td className={td} colSpan={7}>Opening balance</td><td className={num}>{formatNumber(d.opening, p)}</td></tr>
              {rows.map((x) => (
                <tr key={x.voucher_id}>
                  <td className={cx(td, "whitespace-nowrap")}>{formatDate(x.date, p)}</td><td className={cx(td, "tabular")}>{voucherLink(x.voucher_id, x.voucher_no)}{x.status === "draft" && <span className="ml-1 text-[10px] text-amber-700">draft</span>}</td>
                  <td className={td}>{x.type}</td><td className={td}>{x.transaction}</td><td className={td}>{x.narration ?? x.remarks}</td>
                  <td className={num}>{n(x.debit, p)}</td><td className={num}>{n(x.credit, p)}</td><td className={num}>{formatNumber(x.balance, p)}</td>
                </tr>
              ))}
            </Table>
            <p className="mt-2 text-xs text-gray-500">Debit is a bill to a customer or a payment to a supplier; credit is money received from a customer or a bill from a supplier. A positive balance means the party owes the organization; a negative balance means the organization owes the party.</p>
          </>
        ),
        csv: { header: ["Date", "Voucher No", "Status", "Type", "Transaction", "Narration", "Debit", "Credit", "Balance"], rows: [["", "", "", "", "", "Opening balance", "", "", d.opening], ...rows.map((x) => [x.date, x.voucher_no, x.status, x.type, x.transaction, x.narration ?? x.remarks, x.debit, x.credit, x.balance])] },
      };
    }
    case "party-balances": {
      const rows: any[] = d.rows;
      const total = rows.reduce((s, x) => s + x.balance, 0);
      return {
        body: (
          <Table
            head={<tr><th className={th}>Name</th><th className={th}>Code</th><th className={th}>Type</th><th className={cx(th, "text-right")}>Vouchers</th><th className={cx(th, "text-right")}>Debit</th><th className={cx(th, "text-right")}>Credit</th><th className={cx(th, "text-right")}>Balance</th></tr>}
            foot={<tr><td className={td} colSpan={6}>Total</td><td className={num}>{formatNumber(total, p)}</td></tr>}>
            {rows.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-gray-500">No customers or suppliers yet. Add them under Settings, Master Data.</td></tr>}
            {rows.map((x) => (
              <tr key={x.id}>
                <td className={td}><Link className="text-brand-700 hover:underline print:text-gray-900" href={`/reports?report=party-ledger&payee_id=${x.id}&type=${x.type}`}>{x.name}</Link></td>
                <td className={td}>{x.code}</td><td className={td}>{x.type}</td><td className={num}>{x.vouchers}</td>
                <td className={num}>{formatNumber(x.debit, p)}</td><td className={num}>{formatNumber(x.credit, p)}</td><td className={cx(num, "font-semibold")}>{formatNumber(x.balance, p)}</td>
              </tr>
            ))}
          </Table>
        ),
        csv: { header: ["Name", "Code", "Type", "Vouchers", "Debit", "Credit", "Balance"], rows: rows.map((x) => [x.name, x.code, x.type, x.vouchers, x.debit, x.credit, x.balance]) },
      };
    }
    default: {
      // Voucher reports: one printable voucher per page.
      const vouchers: any[] = d.vouchers;
      return {
        vouchers: true,
        body: vouchers.length === 0 ? (
          <p className="card px-4 py-8 text-center text-sm text-gray-500">No vouchers in this period{r.include_drafts ? "" : " (only verified vouchers are shown; tick Include drafts to see drafts)"}.</p>
        ) : (
          <div className="mx-auto max-w-[210mm] space-y-6 print:space-y-0">
            <p className="text-sm text-gray-600 print:hidden">{vouchers.length} voucher{vouchers.length === 1 ? "" : "s"}{vouchers.length === 500 ? " (the first 500; narrow the dates for more)" : ""}.</p>
            {vouchers.map((v) => <div key={v.id} className="shadow print:shadow-none"><VoucherPrint v={{ ...v, organization: r.organization, printed_by: r.printed_by, printed_at: r.printed_at }} prefs={p} /></div>)}
          </div>
        ),
        csv: { header: ["Voucher No", "Date", "Status", "Type", "Payee", "Account code", "Account", "Particulars", "Debit", "Credit"],
          rows: vouchers.flatMap((v) => (v.lines ?? []).map((l: any) => [v.voucher_no, v.voucher_date, v.status, v.transaction_type?.name, v.payee?.name, l.account?.code, l.account?.title, l.narration, l.debit, l.credit])) },
      };
    }
  }
}

function SectionRows({ title, total, p, children }: { title: string; total: number; p: Preferences; children: ReactNode }) {
  return (
    <>
      <tr className="bg-gray-50 font-bold print:bg-white"><td className={td} colSpan={3}>{title}</td></tr>
      {children}
      <tr className="font-semibold"><td className={cx(td, "pl-6")}>Total {title.replace(/^(Less|Add): /, "").toLowerCase()}</td><td /><td className={num}>{formatNumber(total, p)}</td></tr>
    </>
  );
}
