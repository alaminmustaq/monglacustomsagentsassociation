// Thin client for the Laravel API. Uses the session cookie (same origin through the
// Next.js proxy) and the XSRF-TOKEN cookie Laravel sets for state-changing requests.

export class ApiError extends Error {
  status: number;
  errors: Record<string, string[]>;
  code?: string;

  constructor(status: number, message: string, errors: Record<string, string[]> = {}, code?: string) {
    super(message);
    this.status = status;
    this.errors = errors;
    this.code = code;
  }

  /** First message for a field, if any. */
  field(name: string): string | undefined {
    return this.errors[name]?.[0];
  }
}

let csrfReady: Promise<void> | null = null;

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split("; ").find((row) => row.startsWith(name + "="));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

async function ensureCsrf(): Promise<void> {
  if (readCookie("XSRF-TOKEN")) return;
  csrfReady ??= fetch("/sanctum/csrf-cookie", { credentials: "include" }).then(() => undefined);
  await csrfReady;
  csrfReady = null;
}

type Handler = (error: ApiError) => void;
const handlers: { unauthenticated?: Handler; organizationRequired?: Handler } = {};

export function onApiEvent(event: keyof typeof handlers, handler: Handler) {
  handlers[event] = handler;
}

export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown; query?: Record<string, string | number | boolean | undefined | null> } = {},
): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const url = new URL("/api/v1" + path, window.location.origin);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" };
  let body: BodyInit | undefined;
  if (options.body instanceof FormData) {
    body = options.body;
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  if (method !== "GET") {
    await ensureCsrf();
    const token = readCookie("XSRF-TOKEN");
    if (token) headers["X-XSRF-TOKEN"] = token;
  }

  let response = await fetch(url.toString(), { method, headers, body, credentials: "include" });

  // An expired CSRF token: fetch a new one and retry once.
  if (response.status === 419) {
    document.cookie = "XSRF-TOKEN=; Max-Age=0; path=/";
    await ensureCsrf();
    headers["X-XSRF-TOKEN"] = readCookie("XSRF-TOKEN") ?? "";
    response = await fetch(url.toString(), { method, headers, body, credentials: "include" });
  }

  const text = await response.text();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const error = new ApiError(
      response.status,
      data?.message ?? (response.status >= 500 ? "The server had a problem. Please try again." : "The request failed."),
      data?.errors ?? {},
      data?.code,
    );
    if (response.status === 401 && path !== "/auth/login") handlers.unauthenticated?.(error);
    if (response.status === 409 && error.code === "organization_required") handlers.organizationRequired?.(error);
    throw error;
  }

  return data as T;
}
