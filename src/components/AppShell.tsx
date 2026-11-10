"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  BookOpen, Building2, ChevronDown, CircleHelp, FileBarChart, FolderTree, Gauge, KeyRound, LayoutGrid, LogOut,
  Menu, Scale, Shield, Users, CalendarRange, History, SlidersHorizontal, ArrowDownToLine, ArrowUpFromLine,
  ArrowLeftRight, FilePlus2, Upload, Contact, Landmark, Database, Layers,
} from "lucide-react";
import { api } from "@/lib/api";
import { cx } from "@/lib/format";
import { useSession } from "@/lib/session";
import { BrandMark } from "./BrandMark";
import { ChangePasswordDrawer } from "./ChangePasswordDrawer";
import { useToast } from "./ui";

type NavItem = { label: string; href?: string; icon: React.ComponentType<{ size?: number }>; permission?: string; superAdmin?: boolean; later?: string };
type NavGroup = { label: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  { label: "", items: [{ label: "Home", href: "/dashboard", icon: Gauge, permission: "dashboard.view" }] },
  {
    label: "Operations",
    items: [
      { label: "Operation Admin", href: "/operations", icon: LayoutGrid },
      { label: "Chart of Accounts", href: "/accounts", icon: FolderTree, permission: "accounts.view" },
      { label: "Opening Balance", href: "/opening-balances", icon: Scale, permission: "opening_balances.view" },
      { label: "Receive Transaction", href: "/transactions/receive", icon: ArrowDownToLine, permission: "vouchers.view" },
      { label: "Payment Transaction", href: "/transactions/payment", icon: ArrowUpFromLine, permission: "vouchers.view" },
      { label: "Transfer Transaction", href: "/transactions/transfer", icon: ArrowLeftRight, permission: "vouchers.view" },
      { label: "Transaction Entry", href: "/transactions/vouchers", icon: FilePlus2, permission: "vouchers.view" },
      { label: "Transaction Data Upload", href: "/transactions/upload", icon: Upload, permission: "imports.manage" },
      { label: "Customer and Supplier Ledgers", href: "/ledgers", icon: Contact, permission: "reports.view" },
    ],
  },
  { label: "Reports", items: [{ label: "Report Admin", href: "/reports", icon: FileBarChart, permission: "reports.view" }] },
  {
    label: "Settings",
    items: [
      { label: "Configuration", href: "/settings/configuration", icon: SlidersHorizontal, permission: "settings.configuration.manage" },
      { label: "Master Data", href: "/settings/master-data", icon: Database, permission: "settings.masters.manage" },
      { label: "Users", href: "/settings/users", icon: Users, permission: "settings.users.manage" },
      { label: "Roles", href: "/settings/roles", icon: Shield, permission: "settings.roles.manage" },
      { label: "Offices", href: "/settings/offices", icon: Building2, permission: "settings.offices.manage" },
      { label: "Office Types", href: "/settings/office-types", icon: Layers, permission: "settings.offices.manage" },
      { label: "Fiscal Years", href: "/settings/fiscal-years", icon: CalendarRange, permission: "fiscal_years.manage" },
      { label: "Audit Log", href: "/settings/audit-log", icon: History, permission: "audit_logs.view" },
    ],
  },
  { label: "Platform", items: [{ label: "Organizations", href: "/admin/organizations", icon: Landmark, superAdmin: true }] },
];

export function useNav() {
  const { me, can } = useSession();
  return useMemo(
    () =>
      NAV.map((g) => ({
        ...g,
        items: g.items.filter((i) => (i.superAdmin ? me.user.is_super_admin : !i.permission || can(i.permission))),
      }))
        // The hub is only useful when at least one operation is visible.
        .map((g) => (g.label === "Operations" && g.items.length === 1 ? { ...g, items: [] } : g))
        .filter((g) => g.items.length > 0),
    [me, can],
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { me } = useSession();
  const nav = useNav();
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menu, setMenu] = useState<"user" | "help" | null>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const branding = me.branding;

  const current = nav.flatMap((g) => g.items).find((i) => i.href && pathname.startsWith(i.href));
  useEffect(() => {
    document.title = `${current?.label ?? "Home"} | ${branding.app_name}`;
  }, [current, branding.app_name]);
  useEffect(() => setMobileOpen(false), [pathname]);

  async function signOut() {
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      queryClient.clear();
      router.replace("/login");
    }
  }

  async function switchContext(organizationId: number, officeId?: number | null) {
    try {
      const updated = await api("/auth/context", { method: "POST", body: { organization_id: organizationId, office_id: officeId ?? null } });
      queryClient.clear();
      queryClient.setQueryData(["me"], updated);
      setMenu(null);
      window.location.reload();
    } catch (e) {
      toast.error(e);
    }
  }

  const sidebar = (
    <nav className="flex h-full flex-col gap-4 overflow-y-auto px-2 py-4" aria-label="Main">
      {nav.map((group) => (
        <div key={group.label || "home"}>
          {group.label && !collapsed && (
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{group.label}</p>
          )}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = item.href && (pathname === item.href || pathname.startsWith(item.href + "/"));
              const content = (
                <>
                  <Icon size={17} />
                  {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                  {!collapsed && item.later && <span className="badge bg-gray-100 text-[10px] text-gray-500">{item.later}</span>}
                </>
              );
              return (
                <li key={item.label}>
                  {item.href ? (
                    <Link
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={cx(
                        "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm",
                        active ? "bg-brand-50 font-semibold text-brand-800" : "text-gray-700 hover:bg-gray-100",
                      )}
                      aria-current={active ? "page" : undefined}
                    >
                      {content}
                    </Link>
                  ) : (
                    <span
                      className="flex cursor-not-allowed items-center gap-2.5 rounded-md px-3 py-2 text-sm text-gray-400"
                      title={`${item.label}: coming in ${item.later}`}
                    >
                      {content}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 print:hidden flex h-14 items-center gap-3 border-b border-brand-900/20 bg-brand-700 px-3 text-white">
        <button
          className="rounded-md p-2 hover:bg-white/10"
          onClick={() => (window.innerWidth < 768 ? setMobileOpen((o) => !o) : setCollapsed((c) => !c))}
          aria-label="Toggle menu"
        >
          <Menu size={20} />
        </button>
        <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5">
          <span className="rounded-md bg-white p-0.5">
            <BrandMark branding={branding} size={28} />
          </span>
          <span className="truncate text-base font-semibold">{branding.app_name}</span>
        </Link>

        <div className="ml-auto flex items-center gap-2">
          {me.organization && (
            me.offices.length > 1 ? (
              <select
                className="rounded-md border border-white/30 bg-brand-800 px-2.5 py-1 text-xs font-medium text-white sm:text-sm"
                value={me.office_id ?? ""}
                onChange={(e) => switchContext(me.organization!.id, Number(e.target.value))}
                aria-label="Office"
              >
                {me.offices.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            ) : (
              (() => {
                const currentOffice = me.offices.find((o) => o.id === me.office_id) ?? me.offices[0];
                return currentOffice ? (
                  <div className="flex items-center gap-1.5 rounded-md bg-brand-800/80 px-2.5 py-1 text-xs font-medium text-white">
                    <Building2 size={14} className="text-brand-200" />
                    <span>{currentOffice.name}</span>
                  </div>
                ) : null;
              })()
            )
          )}

          <div className="relative">
            <button className="flex items-center gap-1 rounded-md p-2 hover:bg-white/10" onClick={() => setMenu(menu === "help" ? null : "help")} aria-label="Help">
              <CircleHelp size={19} />
              <ChevronDown size={14} />
            </button>
            {menu === "help" && (
              <Dropdown onClose={() => setMenu(null)}>
                <div className="px-3 py-2 text-sm text-gray-600">
                  <p className="font-semibold text-gray-900">{branding.app_name}</p>
                  <p className="mt-1">Chart of accounts, opening balances, receive, payment, transfer and journal vouchers with second-person verification, data upload, ledgers and reports.</p>
                </div>
              </Dropdown>
            )}
          </div>

          <div className="relative">
            <button className="flex items-center gap-1.5 rounded-md px-2 py-1.5 hover:bg-white/10" onClick={() => setMenu(menu === "user" ? null : "user")} aria-label="User menu">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-xs font-semibold uppercase">
                {me.user.name.slice(0, 2)}
              </span>
              <span className="hidden max-w-40 truncate text-sm md:block">{me.user.name}</span>
              <ChevronDown size={14} />
            </button>
            {menu === "user" && (
              <Dropdown onClose={() => setMenu(null)}>
                <div className="border-b border-gray-100 px-3 py-2">
                  <p className="text-sm font-semibold text-gray-900">{me.user.name}</p>
                  <p className="text-xs text-gray-500">{me.organization?.name ?? "No organization selected"}</p>
                  {me.roles.length > 0 && <p className="mt-0.5 text-xs text-gray-500">{me.roles.join(", ")}</p>}
                </div>
                {me.organizations.length > 1 && (
                  <div className="border-b border-gray-100 py-1">
                    <p className="px-3 py-1 text-[11px] font-semibold uppercase text-gray-400">Switch organization</p>
                    {me.organizations.map((o) => (
                      <button
                        key={o.id}
                        className={cx("block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50", o.id === me.organization?.id && "font-semibold text-brand-800")}
                        onClick={() => switchContext(o.id)}
                      >
                        {o.name}
                      </button>
                    ))}
                  </div>
                )}
                <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50" onClick={() => { setMenu(null); setPasswordOpen(true); }}>
                  <KeyRound size={15} /> Change password
                </button>
                <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50" onClick={signOut}>
                  <LogOut size={15} /> Sign out
                </button>
              </Dropdown>
            )}
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        <aside className={cx("hidden shrink-0 print:!hidden border-r border-gray-200 bg-white md:block", collapsed ? "w-16" : "w-64")}>
          <div className="sticky top-14 h-[calc(100vh-3.5rem)]">{sidebar}</div>
        </aside>
        {mobileOpen && (
          <div className="fixed inset-0 top-14 z-20 md:hidden">
            <div className="absolute inset-0 bg-gray-900/30" onClick={() => setMobileOpen(false)} />
            <aside className="relative h-full w-72 bg-white shadow-lg">{sidebar}</aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="border-b border-gray-200 bg-white px-6 py-2 text-xs text-gray-500 print:hidden">
            <Link href="/dashboard" className="hover:text-brand-700">
              Home
            </Link>
            {current && current.href !== "/dashboard" && <span> \ {current.label}</span>}
          </div>
          <main className="flex-1 px-4 py-5 sm:px-6 print:p-0">
            {me.organization || pathname.startsWith("/admin") ? children : <OrganizationPicker onPick={(id) => switchContext(id)} />}
          </main>
          <footer className="border-t border-gray-200 bg-white px-6 py-3 print:hidden text-center text-xs text-gray-500">
            {branding.footer_text}
          </footer>
        </div>
      </div>

      <ChangePasswordDrawer open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </div>
  );
}

function Dropdown({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute right-0 z-40 mt-1 w-64 overflow-hidden rounded-md border border-gray-200 bg-white py-1 text-gray-800 shadow-lg">
        {children}
      </div>
    </>
  );
}

function OrganizationPicker({ onPick }: { onPick: (id: number) => void }) {
  const { me } = useSession();
  return (
    <div className="mx-auto mt-10 max-w-md">
      <div className="card p-6">
        <h1 className="text-lg font-semibold text-gray-900">Choose an organization</h1>
        {me.organizations.length === 0 ? (
          <p className="mt-2 text-sm text-gray-600">
            {me.user.is_super_admin ? (
              <>
                There are no organizations yet. <Link className="text-brand-700 underline" href="/admin/organizations">Create one</Link>.
              </>
            ) : (
              "Your account is not linked to an organization. Ask your administrator to add you."
            )}
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {me.organizations.map((o) => (
              <li key={o.id}>
                <button className="flex w-full items-center gap-3 rounded-md border border-gray-200 px-4 py-3 text-left hover:border-brand-600 hover:bg-brand-50" onClick={() => onPick(o.id)}>
                  <BookOpen size={18} className="text-brand-700" />
                  <span>
                    <span className="block text-sm font-semibold text-gray-900">{o.name}</span>
                    <span className="block text-xs text-gray-500">{o.code}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

