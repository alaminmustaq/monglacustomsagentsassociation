"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Eraser, Send, Upload } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ConfirmDialog, Drawer, ErrorBox, Field, PageHeader, SaveButton, Spinner, useToast } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { cx, formatDate, formatNumber } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useTypes, type Page } from "@/lib/vouchers";

type Row = {
  id: number; sl_no: number; txn_date: string; source: string | null; description: string | null; invoice_no: string | null; debit: number; credit: number;
  account: { id: number; code: string; title: string } | null; contra_account: { id: number; code: string; title: string } | null;
  type: { id: number; code: number; name: string } | null; status: "staged" | "posted"; voucher: { id: number; voucher_no: string; status: string } | null;
};
type PostResult = { vouchers: number; voucher_numbers: string[]; failed: { sl_no: string; message: string }[] };

export default function UploadPage() {
  const { me } = useSession();
  const p = me.preferences;
  const toast = useToast();
  const queryClient = useQueryClient();
  const types = useTypes();
  const [filters, setFilters] = useState({ txn_date: "", transaction_type_id: "", status: "staged" });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [wizard, setWizard] = useState(false);
  const [confirm, setConfirm] = useState<"clear" | "post" | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PostResult | null>(null);

  const query = { ...filters, page, per_page: 50 };
  const rows = useQuery({ queryKey: ["import-rows", query], queryFn: () => api<Page<Row>>("/import-rows", { query }), placeholderData: keepPreviousData });
  const staged = (rows.data?.data ?? []).filter((r) => r.status === "staged");
  const allChecked = staged.length > 0 && staged.every((r) => selected.has(r.id));
  const set = (patch: Partial<typeof filters>) => { setFilters((f) => ({ ...f, ...patch })); setPage(1); setSelected(new Set()); };
  const filteredTotals = (rows.data?.data ?? []).reduce((s, r) => ({ d: s.d + r.debit, c: s.c + r.credit }), { d: 0, c: 0 });

  async function act() {
    setBusy(true);
    try {
      if (confirm === "clear") {
        const r = await api<{ deleted: number }>("/import-rows/clear", { method: "POST", body: { txn_date: filters.txn_date || undefined, transaction_type_id: filters.transaction_type_id || undefined } });
        toast.success(`${r.deleted} staged row${r.deleted === 1 ? "" : "s"} cleared.`);
      } else {
        const body = selected.size ? { ids: Array.from(selected) } : { txn_date: filters.txn_date || undefined, transaction_type_id: filters.transaction_type_id || undefined, status: "staged" };
        const r = await api<PostResult>("/import-rows/post", { method: "POST", body });
        setResult(r);
        queryClient.invalidateQueries({ queryKey: ["vouchers"] });
      }
      setSelected(new Set());
      setConfirm(null);
      await queryClient.invalidateQueries({ queryKey: ["import-rows"] });
    } catch (e) {
      toast.error(e);
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Transaction Data Upload"
        description="Upload transactions from another system as CSV or tab-separated text, check them, then post them as draft vouchers. Rows with the same invoice number, date and type become one voucher; each row gets its contra line."
        actions={<>
          <button className="btn btn-danger" onClick={() => setConfirm("clear")} disabled={!rows.data?.total || filters.status === "posted"}><Eraser size={15} /> Clear data</button>
          <button className="btn btn-secondary" onClick={() => setConfirm("post")} disabled={filters.status === "posted" || !staged.length}><Send size={15} /> {selected.size ? `Post ${selected.size} selected` : "Post all staged rows"}</button>
          <button className="btn btn-primary" onClick={() => setWizard(true)}><Upload size={15} /> Upload data</button>
        </>} />

      {result && (
        <div className={cx("mb-4 rounded-md border px-4 py-3 text-sm", result.failed.length ? "border-amber-200 bg-amber-50 text-amber-900" : "border-brand-100 bg-brand-50 text-brand-900")}>
          <p className="font-semibold">{result.vouchers} draft voucher{result.vouchers === 1 ? "" : "s"} created{result.voucher_numbers.length ? `: ${result.voucher_numbers.slice(0, 12).join(", ")}${result.voucher_numbers.length > 12 ? " and more" : ""}` : ""}.</p>
          {result.vouchers > 0 && <p className="mt-0.5">They wait for verification under <Link className="underline" href="/transactions/vouchers">Transaction Entry</Link>.</p>}
          {result.failed.map((f, i) => <p key={i} className="mt-1">Rows {f.sl_no}: {f.message}</p>)}
          <button className="mt-1 text-xs underline" onClick={() => setResult(null)}>Dismiss</button>
        </div>
      )}

      <div className="card mb-4 flex flex-wrap items-end gap-3 p-3">
        <Field label="Txn. date" htmlFor="u-date"><input id="u-date" type="date" className="input" value={filters.txn_date} onChange={(e) => set({ txn_date: e.target.value })} /></Field>
        <Field label="Txn. type" htmlFor="u-type">
          <select id="u-type" className="input w-56" value={filters.transaction_type_id} onChange={(e) => set({ transaction_type_id: e.target.value })}>
            <option value="">All types</option>
            {(types.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.code}. {t.name}</option>)}
          </select>
        </Field>
        <Field label="Status" htmlFor="u-status">
          <select id="u-status" className="input w-40" value={filters.status} onChange={(e) => set({ status: e.target.value })}>
            <option value="staged">Waiting to post</option><option value="posted">Posted</option><option value="">All</option>
          </select>
        </Field>
      </div>

      {rows.error ? <ErrorBox error={rows.error} /> : !rows.data ? <Spinner /> : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="w-8"><input type="checkbox" className="h-4 w-4 accent-brand-700" aria-label="Select all" checked={allChecked} disabled={!staged.length}
                    onChange={() => setSelected(allChecked ? new Set() : new Set(staged.map((r) => r.id)))} /></th>
                  <th>SL</th><th>Txn date</th><th>Source</th><th>Description</th><th>Invoice No</th><th>GL A/C</th><th>Contra GL A/C</th><th>Type</th>
                  <th className="text-right">Debit</th><th className="text-right">Credit</th><th>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.data.data.length === 0 && <tr><td colSpan={12} className="py-10 text-center text-gray-500">No rows. Choose Upload data to load a file.</td></tr>}
                {rows.data.data.map((r) => (
                  <tr key={r.id} className={cx(selected.has(r.id) && "bg-brand-50")}>
                    <td><input type="checkbox" className="h-4 w-4 accent-brand-700" aria-label={`Select row ${r.sl_no}`} disabled={r.status !== "staged"} checked={selected.has(r.id)}
                      onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} /></td>
                    <td className="tabular">{r.sl_no}</td>
                    <td className="whitespace-nowrap">{formatDate(r.txn_date, p)}</td>
                    <td>{r.source}</td>
                    <td className="max-w-56 truncate" title={r.description ?? ""}>{r.description}</td>
                    <td>{r.invoice_no}</td>
                    <td title={r.account?.title}><span className="block tabular text-xs">{r.account?.code}</span>{r.account?.title}</td>
                    <td title={r.contra_account?.title}><span className="block tabular text-xs">{r.contra_account?.code}</span>{r.contra_account?.title}</td>
                    <td>{r.type?.code}</td>
                    <td className="text-right tabular">{r.debit ? formatNumber(r.debit, p) : ""}</td>
                    <td className="text-right tabular">{r.credit ? formatNumber(r.credit, p) : ""}</td>
                    <td>{r.status === "posted" && r.voucher ? <Link className="text-brand-700 underline" href={`/transactions/vouchers?voucher=${r.voucher.id}`}>{r.voucher.voucher_no}</Link> : <span className="badge bg-amber-50 text-amber-800">Staged</span>}</td>
                  </tr>
                ))}
              </tbody>
              {rows.data.data.length > 0 && (
                <tfoot><tr className="bg-gray-50 font-semibold"><td colSpan={9} className="text-right">Total on this page</td><td className="text-right tabular">{formatNumber(filteredTotals.d, p)}</td><td className="text-right tabular">{formatNumber(filteredTotals.c, p)}</td><td /></tr></tfoot>
              )}
            </table>
          </div>
          {rows.data.last_page > 1 && (
            <div className="flex items-center justify-between border-t border-gray-200 px-4 py-2.5 text-sm text-gray-600">
              <span>{rows.data.total} rows. Page {rows.data.current_page} of {rows.data.last_page}</span>
              <span className="flex gap-2">
                <button className="btn btn-secondary py-1" disabled={page <= 1} onClick={() => setPage((x) => x - 1)}>Previous</button>
                <button className="btn btn-secondary py-1" disabled={page >= rows.data.last_page} onClick={() => setPage((x) => x + 1)}>Next</button>
              </span>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog open={confirm !== null} busy={busy} danger={confirm === "clear"} onCancel={() => setConfirm(null)} onConfirm={act}
        title={confirm === "clear" ? "Clear staged rows?" : "Post rows as draft vouchers?"}
        confirmLabel={confirm === "clear" ? "Clear" : "Post"}
        message={confirm === "clear"
          ? `All staged rows${filters.txn_date || filters.transaction_type_id ? " matching the filters" : ""} for this office will be removed. Rows already posted are kept.`
          : selected.size ? `${selected.size} selected rows will be grouped into draft vouchers.` : `Every staged row${filters.txn_date || filters.transaction_type_id ? " matching the filters" : ""} will be grouped into draft vouchers.`} />

      {wizard && <UploadWizard onClose={() => setWizard(false)} onLoaded={() => { queryClient.invalidateQueries({ queryKey: ["import-rows"] }); set({ status: "staged" }); }} />}
    </div>
  );
}

type UploadResponse = {
  batch_id: number; headers: string[]; preview: string[][]; total_rows: number;
  suggested_mapping: Record<string, number>; targets: { key: string; label: string; required: boolean }[]; date_formats: string[];
};
type Validation = { total: number; valid: number; error_count: number; errors: { row: number; message: string }[] };

const DATE_LABEL: Record<string, string> = { auto: "Detect automatically", "Y-m-d": "2026-07-31", "d/m/Y": "31/07/2026", "m/d/Y": "07/31/2026", "d-m-Y": "31-07-2026", "d-M-Y": "31-Jul-2026", "d-M-y": "31-Jul-26", "d.m.Y": "31.07.2026" };
const STEPS = ["Data source", "Column mapping", "Data validation", "Load results"];

function UploadWizard({ onClose, onLoaded }: { onClose: () => void; onLoaded: () => void }) {
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<"file" | "paste">("file");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [opts, setOpts] = useState({ separator: ",", enclosure: '"', first_row_headers: true, charset: "UTF-8" });
  const [upload, setUpload] = useState<UploadResponse | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [dateFormat, setDateFormat] = useState("auto");
  const [validation, setValidation] = useState<Validation | null>(null);
  const [loadResult, setLoadResult] = useState<{ inserted: number; failed: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fail = (e: unknown) => setError(e instanceof ApiError ? (Object.values(e.errors)[0]?.[0] ?? e.message) : "Something went wrong.");

  async function next() {
    setBusy(true);
    setError(null);
    try {
      if (step === 0) {
        const fd = new FormData();
        if (mode === "file" && file) fd.append("file", file);
        if (mode === "paste") fd.append("text", text);
        // A bare tab would be trimmed away by the server, so send the word.
        fd.append("separator", opts.separator === "\\t" ? "tab" : opts.separator);
        fd.append("enclosure", opts.enclosure);
        fd.append("first_row_headers", opts.first_row_headers ? "1" : "0");
        fd.append("charset", opts.charset);
        const r = await api<UploadResponse>("/imports", { method: "POST", body: fd });
        setUpload(r);
        setMapping(Object.fromEntries(r.targets.map((t) => [t.key, r.suggested_mapping[t.key] !== undefined ? String(r.suggested_mapping[t.key]) : ""])));
        setStep(1);
      } else if (step === 1 && upload) {
        const missing = upload.targets.filter((t) => t.required && mapping[t.key] === "");
        if (missing.length) {
          setError(`Map these columns: ${missing.map((m) => m.label).join(", ")}.`);
          return;
        }
        if (mapping.debit === "" && mapping.credit === "") {
          setError("Map a Debit or a Credit column.");
          return;
        }
        const body = { mapping: Object.fromEntries(Object.entries(mapping).map(([k, v]) => [k, v === "" ? null : Number(v)])), date_format: dateFormat };
        setValidation(await api<Validation>(`/imports/${upload.batch_id}/mapping`, { method: "PUT", body }));
        setStep(2);
      } else if (step === 2 && upload) {
        const r = await api<{ inserted: number; failed: number; total: number }>(`/imports/${upload.batch_id}/load`, { method: "POST" });
        setLoadResult(r);
        onLoaded();
        toast.success(`${r.inserted} rows loaded into staging.`);
        setStep(3);
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  const canNext = step === 0 ? (mode === "file" ? !!file : !!text.trim()) : step === 2 ? (validation?.valid ?? 0) > 0 : true;

  return (
    <Drawer open title="Upload transaction data" onClose={onClose} size="xl"
      footer={step < 3 ? (
        <>
          {step > 0 && step < 3 && <button className="btn btn-secondary mr-auto" onClick={() => { setError(null); setStep(step - 1); }} disabled={busy}>Back</button>}
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <SaveButton busy={busy} onClick={next} disabled={!canNext}>{step === 0 ? "Next: map columns" : step === 1 ? "Next: check data" : `Load ${validation?.valid ?? 0} valid rows`}</SaveButton>
        </>
      ) : <button className="btn btn-primary" onClick={onClose}>Done</button>}>
      <ol className="mb-5 flex flex-wrap gap-2 text-sm">
        {STEPS.map((s, i) => (
          <li key={s} className={cx("flex items-center gap-1.5 rounded-full px-3 py-1", i === step ? "bg-brand-700 text-white" : i < step ? "bg-brand-50 text-brand-800" : "bg-gray-100 text-gray-500")}>
            {i < step ? <Check size={14} /> : <span className="tabular">{i + 1}</span>} {s}
          </li>
        ))}
      </ol>
      {error && <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}

      {step === 0 && (
        <div className="space-y-4">
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="radio" className="accent-brand-700" checked={mode === "file"} onChange={() => setMode("file")} /> Upload a file (CSV or tab-separated text)</label>
            <label className="flex items-center gap-2"><input type="radio" className="accent-brand-700" checked={mode === "paste"} onChange={() => setMode("paste")} /> Copy and paste</label>
          </div>
          {mode === "file" ? (
            <Field label="File" required htmlFor="u-file" hint="Excel workbooks: use File, Save As, CSV first. Up to 10 MB.">
              <input id="u-file" type="file" accept=".csv,.txt,.tsv,text/csv,text/plain" className="input" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </Field>
          ) : (
            <Field label="Data" required htmlFor="u-text" hint="Paste rows copied from a spreadsheet. Copied cells are separated by tabs, so choose Tab as the separator.">
              <textarea id="u-text" className="input font-mono text-xs" rows={10} value={text} onChange={(e) => setText(e.target.value)} />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label="Separator" htmlFor="u-sep">
              <select id="u-sep" className="input" value={opts.separator} onChange={(e) => setOpts({ ...opts, separator: e.target.value })}>
                <option value=",">Comma (,)</option><option value="\t">Tab</option><option value=";">Semicolon (;)</option><option value="|">Pipe (|)</option>
              </select>
            </Field>
            <Field label="Optionally enclosed by" htmlFor="u-enc"><input id="u-enc" className="input" maxLength={1} value={opts.enclosure} onChange={(e) => setOpts({ ...opts, enclosure: e.target.value })} /></Field>
            <Field label="File encoding" htmlFor="u-cs">
              <select id="u-cs" className="input" value={opts.charset} onChange={(e) => setOpts({ ...opts, charset: e.target.value })}>
                {["UTF-8", "Windows-1252", "ISO-8859-1", "UTF-16LE", "UTF-16BE"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand-700" checked={opts.first_row_headers} onChange={(e) => setOpts({ ...opts, first_row_headers: e.target.checked })} /> First row has column names</label>
          </div>
          <div className="rounded-md bg-gray-50 px-4 py-3 text-xs text-gray-600">
            <p className="font-semibold text-gray-800">Expected columns</p>
            <p className="mt-1">Txn Date, GL A/C No, Debit, Credit, Contra GL A/C No, Txn Type Id, and optionally Source, Description and Invoice No. Account numbers can be the full code (such as 1-1-10-101-1001) or the GL ID. Txn Type Id is the code of the transaction type (11 to 18, or 20).</p>
          </div>
        </div>
      )}

      {step === 1 && upload && (
        <div className="space-y-4">
          <p className="text-sm text-gray-700">{upload.total_rows} data rows found. Match each field to a column of your file. Columns with a familiar name are matched already.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {upload.targets.map((t) => (
              <Field key={t.key} label={t.label} required={t.required} htmlFor={`m-${t.key}`}>
                <select id={`m-${t.key}`} className="input" value={mapping[t.key] ?? ""} onChange={(e) => setMapping({ ...mapping, [t.key]: e.target.value })}>
                  <option value="">Do not load</option>
                  {upload.headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                </select>
              </Field>
            ))}
            <Field label="Date format" htmlFor="m-date">
              <select id="m-date" className="input" value={dateFormat} onChange={(e) => setDateFormat(e.target.value)}>
                {upload.date_formats.map((f) => <option key={f} value={f}>{DATE_LABEL[f] ?? f}</option>)}
              </select>
            </Field>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Preview: first {upload.preview.length} rows</p>
            <div className="overflow-x-auto rounded-md border border-gray-200">
              <table className="table-base">
                <thead><tr>{upload.headers.map((h, i) => <th key={i}>{h || `Column ${i + 1}`}</th>)}</tr></thead>
                <tbody className="divide-y divide-gray-100">{upload.preview.map((r, i) => <tr key={i}>{upload.headers.map((_, j) => <td key={j} className="whitespace-nowrap">{r[j]}</td>)}</tr>)}</tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {step === 2 && validation && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Rows in the file" value={validation.total} />
            <Stat label="Valid rows" value={validation.valid} tone="good" />
            <Stat label="Rows with errors" value={validation.error_count} tone={validation.error_count ? "bad" : undefined} />
          </div>
          {validation.error_count > 0 ? (
            <>
              <p className="text-sm text-gray-700">Rows with errors are not loaded. Fix them in the file and upload again, or load the valid rows now.</p>
              <div className="max-h-96 overflow-y-auto rounded-md border border-gray-200">
                <table className="table-base">
                  <thead><tr><th className="w-24">Row</th><th>Problem</th></tr></thead>
                  <tbody className="divide-y divide-gray-100">{validation.errors.map((e, i) => <tr key={i}><td className="tabular">{e.row}</td><td className="text-red-700">{e.message}</td></tr>)}</tbody>
                </table>
              </div>
            </>
          ) : <p className="rounded-md bg-brand-50 px-3 py-2 text-sm text-brand-900">Every row passed the checks.</p>}
        </div>
      )}

      {step === 3 && loadResult && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Rows processed" value={loadResult.total} />
            <Stat label="Rows inserted" value={loadResult.inserted} tone="good" />
            <Stat label="Rows failed" value={loadResult.failed} tone={loadResult.failed ? "bad" : undefined} />
          </div>
          <p className="text-sm text-gray-700">The rows are in staging. Check them in the list, then use Post to turn them into draft vouchers.</p>
        </div>
      )}
    </Drawer>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "good" | "bad" }) {
  return (
    <div className={cx("rounded-md border px-4 py-3", tone === "good" ? "border-brand-100 bg-brand-50" : tone === "bad" ? "border-red-200 bg-red-50" : "border-gray-200 bg-white")}>
      <p className="text-xs text-gray-600">{label}</p>
      <p className="text-xl font-semibold tabular text-gray-900">{value}</p>
    </div>
  );
}
