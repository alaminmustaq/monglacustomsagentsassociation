"use client";

import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { use, useEffect } from "react";
import { ErrorBox, Spinner } from "@/components/ui";
import { VoucherPrint, type PrintableVoucher } from "@/components/vouchers/VoucherPrint";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";

export default function PrintVoucherPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { me } = useSession();
  const q = useQuery({ queryKey: ["voucher-print", id], queryFn: () => api<{ data: PrintableVoucher }>(`/vouchers/${id}/print`).then((r) => r.data) });

  useEffect(() => {
    if (q.data) document.title = `Voucher ${q.data.voucher_no}`;
  }, [q.data]);

  return (
    <div className="mx-auto max-w-[210mm]">
      <div className="mb-3 flex justify-end gap-2 print:hidden">
        <button className="btn btn-secondary" onClick={() => window.close()}>Close</button>
        <button className="btn btn-primary" onClick={() => window.print()} disabled={!q.data}><Printer size={15} /> Print</button>
      </div>
      {q.isLoading ? <Spinner /> : q.error ? <ErrorBox error={q.error} /> : q.data && (
        <div className="shadow print:shadow-none"><VoucherPrint v={q.data} prefs={me.preferences} /></div>
      )}
    </div>
  );
}
