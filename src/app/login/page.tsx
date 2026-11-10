"use client";

import { Eye, EyeOff, KeyRound, Loader2, User } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { useBranding } from "@/lib/session";
import { BrandMark } from "@/components/BrandMark";
import type { Me } from "@/lib/types";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const branding = useBranding().data;
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.get("expired") ? "Your session expired. Please sign in again." : null);

  useEffect(() => {
    if (branding) document.title = `Sign in | ${branding.app_name}`;
  }, [branding]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError("Enter your username and password.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const me = await api<Me>("/auth/login", {
        method: "POST",
        body: { username, password },
      });
      queryClient.setQueryData(["me"], me);
      const next = params.get("next");
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.field("username") ?? err.field("password") ?? err.message : "Sign-in failed.");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-gray-50 to-gray-100 p-4">
      <div className="w-full max-w-sm">
        <div className="card px-7 py-8">
          <div className="flex flex-col items-center text-center">
            <BrandMark branding={branding} size={56} />
            <h1 className="mt-4 text-xl font-semibold text-gray-900">{branding?.app_name ?? " "}</h1>
            <p className="mt-1 text-sm text-gray-500">Sign in to continue</p>
          </div>

          <form onSubmit={submit} className="mt-7 space-y-4" noValidate>
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700">
                Username
              </label>
              <div className="relative mt-1">
                <User size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  id="username"
                  className="input pl-9"
                  autoComplete="username"
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  maxLength={100}
                />
              </div>
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <div className="relative mt-1">
                <KeyRound size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  id="password"
                  type={show ? "text" : "password"}
                  className="input pl-9 pr-10"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-500 hover:text-gray-800"
                  onClick={() => setShow((s) => !s)}
                  aria-label={show ? "Hide password" : "Show password"}
                >
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                {error}
              </p>
            )}

            <button type="submit" className="btn btn-primary w-full py-2.5" disabled={busy}>
              {busy && <Loader2 size={16} className="animate-spin" />}
              Sign in
            </button>
          </form>
        </div>
        <p className="mt-4 text-center text-xs text-gray-500">{branding?.footer_text}</p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
