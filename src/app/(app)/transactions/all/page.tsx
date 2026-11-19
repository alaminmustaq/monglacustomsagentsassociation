import { VoucherWorkspace } from "@/components/vouchers/VoucherWorkspace";

export default function AllTransactionsPage() {
  return (
    <VoucherWorkspace
      kind="entry"
      sources={["receive", "payment", "transfer", "entry", "purchase", "purchase_payment", "sales", "customer_payment"]}
      title="All Transactions"
      description="View every kind of transaction across all modules in one place."
      newLabel="New transaction"
    />
  );
}
