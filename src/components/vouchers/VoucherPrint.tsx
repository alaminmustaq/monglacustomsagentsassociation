import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import type { Preferences } from "@/lib/types";
import type { Voucher } from "@/lib/vouchers";

export type PrintableVoucher = Voucher & {
  organization?: { name: string; code: string } | null;
  office?: { code: string; name: string; address?: string | null } | null;
  amount: number;
  amount_in_words: string;
  printed_by?: string;
  printed_at?: string;
};

const TITLE: Record<string, string> = {
  receive: "Receive Voucher",
  payment: "Payment Voucher",
  transfer: "Journal Voucher",
  entry: "Journal Voucher",
  upload: "Journal Voucher",
  reversal: "Reversal Voucher",
};

/** One voucher laid out for A4 printing (spec 10.3). */
export function VoucherPrint({ v, prefs, organizationName }: { v: PrintableVoucher; prefs: Preferences; organizationName?: string }) {
  const lines = v.lines ?? [];
  const debit = lines.reduce((s, l) => s + l.debit, 0);
  const credit = lines.reduce((s, l) => s + l.credit, 0);
  const title = v.source === "transfer" && v.transaction_type?.code === 18 ? "Fund Transfer Voucher" : (v.transaction_type?.name && (v.source === "receive" || v.source === "payment") ? `${v.transaction_type.name} Voucher` : TITLE[v.source]);
  const draft = v.status !== "verified" && v.status !== "reversed";

  return (
    <article className="voucher-print relative mx-auto bg-white p-8 text-[13px] text-gray-900">
      {draft && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-7xl font-bold uppercase tracking-widest text-gray-200/70 [transform:rotate(-20deg)]">Draft</div>}
      <header className="relative border-b-2 border-gray-800 pb-3 text-center">
        <h1 className="text-lg font-bold">{v.organization?.name ?? organizationName}</h1>
        {v.office && <p className="text-sm">{v.office.name}{v.office.address ? `, ${v.office.address}` : ""}</p>}
        <p className="mt-2 inline-block border border-gray-800 px-4 py-0.5 text-sm font-bold uppercase tracking-wide">{title}</p>
      </header>

      <div className="relative mt-3 grid grid-cols-2 gap-x-8 gap-y-1">
        <Row label="Voucher No" value={v.voucher_no} />
        <Row label="Date" value={formatDate(v.voucher_date, prefs)} />
        {v.transaction_definition && <Row label="Transaction" value={v.transaction_definition.name} />}
        {v.payee && <Row label={v.source === "receive" ? "Received from" : "Paid to"} value={v.payee.name} />}
        {v.instrument_no && <Row label={v.instrument_type === "cheque" ? "Cheque No" : "Instrument No"} value={`${v.instrument_no}${v.instrument_date ? `, ${formatDate(v.instrument_date, prefs)}` : ""}`} />}
        {v.work_order_no && <Row label="Work Order No" value={v.work_order_no} />}
        {v.ref_advice_no && <Row label="Ref. Advice No" value={v.ref_advice_no} />}
        {v.reference && <Row label="Reference" value={`${v.reference}${v.reference_date ? `, ${formatDate(v.reference_date, prefs)}` : ""}`} />}
        {v.reversal_of && <Row label="Reverses" value={v.reversal_of.voucher_no} />}
      </div>

      <table className="relative mt-4 w-full border-collapse">
        <thead>
          <tr className="border-y border-gray-800 text-left">
            <th className="w-8 py-1.5 pr-2">SL</th>
            <th className="py-1.5 pr-2">Account Code</th>
            <th className="py-1.5 pr-2">Account Head</th>
            <th className="py-1.5 pr-2">Particulars</th>
            <th className="py-1.5 pr-2 text-right">Debit</th>
            <th className="py-1.5 text-right">Credit</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={l.id} className="border-b border-gray-300 align-top">
              <td className="py-1.5 pr-2">{i + 1}</td>
              <td className="py-1.5 pr-2 tabular whitespace-nowrap">{l.account?.code}</td>
              <td className="py-1.5 pr-2">{l.account?.title}{l.deduction_type && <span className="block text-[11px] text-gray-600">{l.deduction_type}</span>}</td>
              <td className="py-1.5 pr-2">{l.narration}{l.bill_voucher_no && <span className="block text-[11px] text-gray-600">Bill {l.bill_voucher_no}</span>}{l.cheque_no && <span className="block text-[11px] text-gray-600">Cheque {l.cheque_no}</span>}</td>
              <td className="py-1.5 pr-2 text-right tabular">{l.debit ? formatNumber(l.debit, prefs) : ""}</td>
              <td className="py-1.5 text-right tabular">{l.credit ? formatNumber(l.credit, prefs) : ""}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-y-2 border-gray-800 font-bold">
            <td colSpan={4} className="py-1.5 pr-2 text-right">Total</td>
            <td className="py-1.5 pr-2 text-right tabular">{formatNumber(debit, prefs)}</td>
            <td className="py-1.5 text-right tabular">{formatNumber(credit, prefs)}</td>
          </tr>
        </tfoot>
      </table>

      {(v.source === "receive" || v.source === "payment") && v.total_deduction > 0 && (
        <p className="relative mt-2 text-right">Gross {formatNumber(v.total_amount, prefs)}, less deductions {formatNumber(v.total_deduction, prefs)}, net <strong>{formatNumber(v.net_amount, prefs)}</strong></p>
      )}
      <p className="relative mt-3"><span className="font-semibold">In words:</span> {v.amount_in_words}</p>
      {(v.narration || v.remarks) && <p className="relative mt-1"><span className="font-semibold">Narration:</span> {v.narration || v.remarks}</p>}

      <div className="relative mt-16 grid grid-cols-4 gap-6 text-center text-xs">
        {[
          ["Prepared by", v.created_by?.name],
          ["Checked by", v.verified_by?.name],
          ["Approved by", ""],
          [v.source === "payment" ? "Received by" : v.source === "receive" ? "Paid by" : "Authorised by", ""],
        ].map(([label, name]) => (
          <div key={label}>
            <p className="min-h-4 text-gray-700">{name}</p>
            <p className="border-t border-gray-800 pt-1 font-semibold">{label}</p>
          </div>
        ))}
      </div>
      {v.printed_at && <p className="relative mt-6 text-right text-[10px] text-gray-500">Printed by {v.printed_by} on {formatDateTime(v.printed_at, prefs)}</p>}
    </article>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <p>
      <span className="inline-block w-28 font-semibold">{label}</span>: {value}
    </p>
  );
}
