"use client";

import { useState } from "react";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { Alert, Button, TextField } from "@/components/ui";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { shouldValidateOnBlur } from "@/lib/client/blur";
import { friendlyAuthError } from "@/components/auth/AuthForms";
import { collectErrors, validateNewPassword, validatePasswordConfirm } from "@/lib/auth/validation";
import { Panel } from "./Panel";

export default function SecurityForm({ email }) {
  const [values, setValues] = useState({ newPassword: "", confirmPassword: "" });
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const errors = collectErrors({
    newPassword: () => validateNewPassword(values.newPassword, { email }),
    confirmPassword: () => validatePasswordConfirm(values.newPassword, values.confirmPassword),
  });
  const bind = (field) => ({
    id: field,
    value: values[field],
    type: show ? "text" : "password",
    autoComplete: "new-password",
    error: submitted || touched[field] ? errors[field] : undefined,
    onBlur: (e) => shouldValidateOnBlur(e) && setTouched((t) => ({ ...t, [field]: true })),
    onChange: (e) => {
      setValues((v) => ({ ...v, [field]: e.target.value }));
      setMsg(null);
    },
  });

  async function save(e) {
    e.preventDefault();
    setSubmitted(true);
    const first = ["newPassword", "confirmPassword"].find((f) => errors[f]);
    if (first) return document.getElementById(first)?.focus();
    setSaving(true);
    const { error } = await getSupabaseBrowserClient().auth.updateUser({ password: values.newPassword });
    setSaving(false);
    if (error) return setMsg({ tone: "error", text: friendlyAuthError(error) });
    setValues({ newPassword: "", confirmPassword: "" });
    setTouched({});
    setSubmitted(false);
    setMsg({ tone: "success", text: "Password updated." });
  }

  const toggle = (
    <button
      type="button"
      onClick={() => setShow((s) => !s)}
      aria-label={show ? "Hide passwords" : "Show passwords"}
      aria-pressed={show}
      className="flex size-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
    >
      {show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
    </button>
  );

  return (
    <Panel title="Password" description="At least 8 characters, with a letter and a number." icon={KeyRound}>
      <form onSubmit={save} noValidate className="space-y-5">
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField label="New password" trailing={toggle} {...bind("newPassword")} />
          <TextField label="Confirm new password" {...bind("confirmPassword")} />
        </div>
        <div className="flex justify-end">
          <Button type="submit" loading={saving} disabled={!values.newPassword}>
            Update password
          </Button>
        </div>
      </form>
    </Panel>
  );
}
