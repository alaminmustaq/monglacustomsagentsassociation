"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Drawer, Field, SaveButton, useToast } from "./ui";

export function ChangePasswordDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ current_password: "", password: "", password_confirmation: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const close = () => {
    setForm({ current_password: "", password: "", password_confirmation: "" });
    setErrors({});
    onClose();
  };

  async function save() {
    const local: Record<string, string> = {};
    if (!form.current_password) local.current_password = "Enter your current password.";
    if (!form.password) local.password = "Enter a new password.";
    if (form.password && form.password !== form.password_confirmation) local.password_confirmation = "Confirm Password must match New Password.";
    setErrors(local);
    if (Object.keys(local).length) return;

    setBusy(true);
    try {
      await api("/auth/password", { method: "PUT", body: form });
      toast.success("Password changed.");
      close();
    } catch (e) {
      if (e instanceof ApiError) setErrors(Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k, v[0]])));
      else toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open={open}
      title="Change password"
      onClose={close}
      size="sm"
      footer={
        <>
          <button className="btn btn-secondary" onClick={close}>Cancel</button>
          <SaveButton busy={busy} onClick={save}>Update</SaveButton>
        </>
      }
    >
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
        {(
          [
            ["current_password", "Current password", "current-password"],
            ["password", "New password", "new-password"],
            ["password_confirmation", "Confirm password", "new-password"],
          ] as const
        ).map(([key, label, auto]) => (
          <Field key={key} label={label} required error={errors[key]} htmlFor={key} hint={key === "password" ? "At least 8 characters, with a letter and a digit." : undefined}>
            <input
              id={key}
              type="password"
              autoComplete={auto}
              className={`input ${errors[key] ? "input-error" : ""}`}
              value={form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            />
          </Field>
        ))}
        <button type="submit" className="hidden" />
      </form>
    </Drawer>
  );
}
