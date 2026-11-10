"use client";

import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError, onApiEvent } from "./api";
import type { Branding, Me } from "./types";
import { ToastProvider } from "@/components/ui";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
            staleTime: 30_000,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

/** Branding is public: shown on the login page before anyone signs in. */
export function useBranding() {
  return useQuery({ queryKey: ["branding"], queryFn: () => api<Branding>("/branding"), staleTime: 300_000 });
}

const SessionContext = createContext<{ me: Me; can: (permission: string) => boolean; refresh: () => Promise<void> } | null>(null);

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionGate");
  return value;
}

/** Loads /auth/me; sends guests to /login. Renders children once a user is known. */
export function SessionGate({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/auth/me"), staleTime: 60_000 });

  useEffect(() => {
    onApiEvent("unauthenticated", () => {
      queryClient.clear();
      router.replace("/login?next=" + encodeURIComponent(pathname));
    });
    onApiEvent("organizationRequired", () => queryClient.invalidateQueries({ queryKey: ["me"] }));
  }, [router, pathname, queryClient]);

  useEffect(() => {
    if (me.error instanceof ApiError && me.error.status === 401) {
      router.replace("/login?next=" + encodeURIComponent(pathname));
    }
  }, [me.error, router, pathname]);

  // Idle timeout on the client mirrors the server setting (FR-AUTH-05).
  useEffect(() => {
    const minutes = me.data?.preferences.session_timeout_minutes;
    if (!minutes) return;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        queryClient.clear();
        router.replace("/login?expired=1");
      }, minutes * 60_000 + 5_000);
    };
    const events = ["mousedown", "keydown", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [me.data?.preferences.session_timeout_minutes, queryClient, router]);

  if (me.error && !(me.error instanceof ApiError && me.error.status === 401)) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="card max-w-md p-6 text-center">
          <h1 className="text-base font-semibold text-gray-900">The server could not be reached</h1>
          <p className="mt-2 text-sm text-gray-600">
            The web app is running but the API did not answer correctly. If you just started the app, wait a few seconds and try again.
          </p>
          <p className="mt-2 text-xs text-gray-400">{me.error instanceof Error ? me.error.message : ""}</p>
          <button className="btn btn-primary mt-4" onClick={() => me.refetch()}>Try again</button>
        </div>
      </div>
    );
  }

  if (!me.data) return <>{fallback}</>;

  const permissions = new Set(me.data.permissions);
  const value = {
    me: me.data,
    can: (permission: string) => me.data!.user.is_super_admin || permissions.has(permission),
    refresh: async () => {
      await queryClient.invalidateQueries();
    },
  };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
