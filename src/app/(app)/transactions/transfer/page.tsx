"use client";

import { Suspense } from "react";
import { VoucherWorkspace } from "@/components/vouchers/VoucherWorkspace";

export default function Page() {
  return (
    <Suspense>
      <VoucherWorkspace kind="transfer" sources={["transfer"]} title="Transfer Transaction" newLabel="New transfer"
        description="Journal vouchers and fund transfers between cash and bank accounts, with one debit line and one credit line." />
    </Suspense>
  );
}
