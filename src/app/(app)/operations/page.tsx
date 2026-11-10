"use client";

import Link from "next/link";
import { NAV, useNav } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";

export default function OperationsPage() {
  const nav = useNav();
  const visible = new Set(nav.flatMap((g) => g.items.map((i) => i.label)));
  const items = NAV.find((g) => g.label === "Operations")!.items.filter((i) => i.href !== "/operations" && (visible.has(i.label) || i.later));

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Operation Admin" description="All day-to-day accounting operations in one place." />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const Icon = item.icon;
          const body = (
            <>
              <span className="rounded-lg bg-brand-50 p-2.5 text-brand-700">
                <Icon size={20} />
              </span>
              <span className="flex-1">
                <span className="block text-sm font-semibold text-gray-900">{item.label}</span>
                {item.later && <span className="mt-0.5 block text-xs text-gray-500">Coming in {item.later}</span>}
              </span>
            </>
          );
          return item.href ? (
            <Link key={item.label} href={item.href} className="card flex items-center gap-3 p-4 hover:border-brand-600">
              {body}
            </Link>
          ) : (
            <div key={item.label} className="card flex items-center gap-3 p-4 opacity-60">
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
}
