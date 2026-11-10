"use client";

import { SessionGate } from "@/lib/session";
import { Spinner } from "@/components/ui";

/** Print pages: signed-in, but without the menu and header. */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionGate fallback={<div className="flex min-h-screen items-center justify-center"><Spinner /></div>}>
      <div className="print-root min-h-screen bg-gray-100 py-6 print:bg-white print:py-0">{children}</div>
    </SessionGate>
  );
}
