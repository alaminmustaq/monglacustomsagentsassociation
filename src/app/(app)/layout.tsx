"use client";

import { SessionGate } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { Spinner } from "@/components/ui";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionGate
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Spinner />
        </div>
      }
    >
      <AppShell>{children}</AppShell>
    </SessionGate>
  );
}
