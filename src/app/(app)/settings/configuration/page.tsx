"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageUp, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { cx } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { SettingItem } from "@/lib/types";
import { ErrorBox, PageHeader, SaveButton, Spinner, useToast } from "@/components/ui";

type Scope = "organization" | "platform";

export default function ConfigurationPage() {
  const { me } = useSession();
  const [scope, setScope] = useState<Scope>("organization");
  const settings = useQuery({
    queryKey: ["configuration", scope],
    queryFn: () => api<{ data: SettingItem[] }>("/settings/configuration", { query: { scope: scope === "platform" ? "platform" : undefined } }).then((r) => r.data),
  });
  const groups = useMemo(() => {
    const map = new Map<string, SettingItem[]>();
    for (const item of settings.data ?? []) {
      if (!map.has(item.group)) map.set(item.group, []);
      map.get(item.group)!.push(item);
    }
    return [...map.entries()];
  }, [settings.data]);
  const [active, setActive] = useState<string | null>(null);
  const current = active ?? groups[0]?.[0];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Configuration"
        description={
          scope === "organization"
            ? `Settings for ${me.organization?.name}. A value set here replaces the default for this organization only.`
            : "Platform settings apply to every organization that has not set its own value, and to the sign-in page."
        }
        actions={
          me.user.is_super_admin && (
            <div className="inline-flex rounded-md border border-gray-300 bg-white p-0.5" role="tablist">
              {(["organization", "platform"] as Scope[]).map((s) => (
                <button key={s} role="tab" aria-selected={scope === s} className={cx("rounded px-3 py-1.5 text-sm", scope === s ? "bg-brand-700 text-white" : "text-gray-700")} onClick={() => setScope(s)}>
                  {s === "organization" ? "This organization" : "Platform"}
                </button>
              ))}
            </div>
          )
        }
      />
      {settings.isLoading ? (
        <Spinner />
      ) : settings.error ? (
        <ErrorBox error={settings.error} />
      ) : (
        <div className="flex flex-col gap-4 md:flex-row">
          <nav className="card h-fit shrink-0 p-2 md:w-52" aria-label="Setting groups">
            {groups.map(([group, items]) => (
              <button
                key={group}
                className={cx("flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm", current === group ? "bg-brand-50 font-semibold text-brand-800" : "text-gray-700 hover:bg-gray-50")}
                onClick={() => setActive(group)}
              >
                {group}
                <span className="text-xs text-gray-400">{items.length}</span>
              </button>
            ))}
          </nav>
          <div className="card flex-1 divide-y divide-gray-100">
            {groups
              .filter(([g]) => g === current)
              .flatMap(([, items]) => items)
              .map((item) => (
                <SettingRow key={item.key + scope} item={item} scope={scope} />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SettingRow({ item, scope }: { item: SettingItem; scope: Scope }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [value, setValue] = useState<string>(item.value === null ? "" : String(item.value));
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  useEffect(() => setValue(item.value === null ? "" : String(item.value)), [item.value]);
  const dirty = value !== (item.value === null ? "" : String(item.value));
  const query = { scope: scope === "platform" ? "platform" : undefined };

  async function run(action: () => Promise<{ data: SettingItem[] }>, message: string) {
    setBusy(true);
    setError(undefined);
    try {
      const result = await action();
      queryClient.setQueryData(["configuration", scope], result.data);
      queryClient.invalidateQueries({ queryKey: ["me"] });
      queryClient.invalidateQueries({ queryKey: ["branding"] });
      toast.success(message);
    } catch (e) {
      setError(e instanceof ApiError ? e.field("value") ?? e.field("file") ?? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  const save = () => run(() => api(`/settings/configuration/${item.key}`, { method: "PUT", body: { value }, query }), `${item.label} saved.`);
  const reset = () => run(() => api(`/settings/configuration/${item.key}`, { method: "DELETE", query }), `${item.label} reset to default.`);
  const upload = (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return run(() => api(`/settings/configuration/${item.key}/upload`, { method: "POST", body: form, query }), `${item.label} uploaded.`);
  };

  const id = "setting-" + item.key;
  let input: React.ReactNode;
  if (item.type === "image") {
    input = (
      <div className="flex flex-wrap items-center gap-3">
        {item.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.url} alt={item.label} className="h-12 max-w-48 rounded border border-gray-200 bg-white object-contain p-1" />
        ) : (
          <span className="text-sm text-gray-500">No image. The plain teal mark is used.</span>
        )}
        <label className="btn btn-secondary cursor-pointer">
          <ImageUp size={16} /> Upload
          <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
        {item.source !== "default" && (
          <button className="btn btn-ghost" onClick={reset} disabled={busy}>
            <Trash2 size={16} /> Remove
          </button>
        )}
      </div>
    );
  } else if (item.type === "select") {
    input = (
      <select id={id} className={cx("input max-w-sm", error && "input-error")} value={value} onChange={(e) => setValue(e.target.value)}>
        {Object.entries(item.rules.options ?? {}).map(([k, label]) => (
          <option key={k} value={k}>{label}</option>
        ))}
      </select>
    );
  } else if (item.type === "boolean") {
    input = (
      <select id={id} className="input max-w-40" value={value === "true" ? "1" : value === "false" ? "0" : value} onChange={(e) => setValue(e.target.value)}>
        <option value="1">Yes</option>
        <option value="0">No</option>
      </select>
    );
  } else {
    input = (
      <input
        id={id}
        className={cx("input max-w-sm", item.type === "integer" && "max-w-40", error && "input-error")}
        inputMode={item.type === "integer" || item.type === "decimal" ? "numeric" : undefined}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={item.type === "account" ? "e.g. 1-1-11-000-0000" : undefined}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2 px-5 py-4 lg:grid-cols-[1fr_1.4fr]">
      <div>
        <label htmlFor={id} className="text-sm font-semibold text-gray-900">{item.label}</label>
        <p className="mt-0.5 text-xs text-gray-500">{item.description}</p>
        <p className="mt-1 text-[11px] text-gray-400">
          <code>{item.key}</code>
          {" . "}
          {item.source === "default" ? "Default value" : item.source === "platform" ? "Platform value" : "Set for this organization"}
          {item.type !== "image" && item.default !== null && item.source !== "default" && <> (default: {String(item.default)})</>}
        </p>
      </div>
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          {input}
          {item.type !== "image" && (
            <>
              <SaveButton busy={busy} onClick={save} disabled={!dirty}>Save</SaveButton>
              {item.source !== "default" && (scope === "platform" || item.source === "organization") && (
                <button className="btn btn-ghost" onClick={reset} disabled={busy} title="Reset to default">
                  <RotateCcw size={15} /> Reset
                </button>
              )}
            </>
          )}
        </div>
        {error && <p className="text-xs text-red-600" role="alert">{error}</p>}
      </div>
    </div>
  );
}
