"use client";

import { Suspense } from "react";
import { VoucherWorkspace } from "@/components/vouchers/VoucherWorkspace";

export default function Page() {
  return (
    <Suspense>
      <VoucherWorkspace kind="receive" sources={["receive"]} title="Receive Transaction" newLabel="New receive"
        description="Cash, bank and money receipts, and amounts billed to customers. A voucher is saved as a draft and counts in reports once another person verifies it." />
    </Suspense>
  );
}
