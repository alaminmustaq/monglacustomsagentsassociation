"use client";

import { Suspense } from "react";
import { VoucherWorkspace } from "@/components/vouchers/VoucherWorkspace";

export default function Page() {
  return (
    <Suspense>
      <VoucherWorkspace kind="payment" sources={["payment"]} title="Payment Transaction" newLabel="New payment"
        description="Cash and bank payments, and bills from suppliers. A voucher is saved as a draft and counts in reports once another person verifies it." />
    </Suspense>
  );
}
