"use client";

import { Suspense } from "react";
import { VoucherWorkspace } from "@/components/vouchers/VoucherWorkspace";

export default function Page() {
  return (
    <Suspense>
      <VoucherWorkspace kind="entry" sources={["entry", "upload", "reversal"]} title="Transaction Entry" newLabel="New entry"
        description="Multi-line vouchers that must balance. Vouchers created from uploaded data and reversals are listed here too." />
    </Suspense>
  );
}
