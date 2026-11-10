import { cx } from "@/lib/format";
import type { Voucher } from "@/lib/vouchers";

/** Draft, Rejected (a draft sent back), Verified or Reversed. */
export function VoucherStatus({ voucher }: { voucher: Pick<Voucher, "status" | "rejection_reason"> }) {
  const rejected = voucher.status === "draft" && !!voucher.rejection_reason;
  const label = rejected ? "Rejected" : voucher.status.charAt(0).toUpperCase() + voucher.status.slice(1);
  const style = rejected
    ? "bg-red-50 text-red-700"
    : voucher.status === "verified"
      ? "bg-brand-50 text-brand-800"
      : voucher.status === "reversed"
        ? "bg-gray-200 text-gray-700"
        : "bg-amber-50 text-amber-800";
  return <span className={cx("badge", style)} title={rejected ? `Rejected: ${voucher.rejection_reason}` : undefined}>{label}</span>;
}
