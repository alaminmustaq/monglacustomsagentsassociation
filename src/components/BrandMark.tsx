"use client";

import type { Branding } from "@/lib/types";
import { cx } from "@/lib/format";

/** The configured logo, or a plain teal mark when no logo is set. */
export function BrandMark({ branding, size = 32, className }: { branding?: Branding; size?: number; className?: string }) {
  if (branding?.logo_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={branding.logo_url} alt={branding.app_name} style={{ height: size }} className={cx("w-auto object-contain", className)} />;
  }
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className={className}>
      <rect width="64" height="64" rx="14" fill="#0f766e" />
      <path d="M18 44V22h8v22zM28 44V30h8v14zM38 44V16h8v28z" fill="#ccfbf1" />
    </svg>
  );
}
