"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserRound } from "lucide-react";
import { Alert, Button, TextField } from "@/components/ui";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { shouldValidateOnBlur } from "@/lib/client/blur";
import { NAME_MAX, validateName } from "@/lib/auth/validation";
import { Panel } from "./Panel";

export default function ProfileForm({ userId, email, initialName }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [touched, setTouched] = useState(false);
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const error = validateName(name);
  const dirty = name.trim() !== initialName.trim();

  async function save(e) {
    e.preventDefault();
    setTouched(true);
    if (error) return document.getElementById("fullName")?.focus();
    setSaving(true);
    setMsg(null);
    const { error: err } = await getSupabaseBrowserClient()
      .from("profiles")
      .update({ full_name: name.trim().slice(0, NAME_MAX) || null })
      .eq("id", userId);
    setSaving(false);
    if (err) return setMsg({ tone: "error", text: err.message });
    setMsg({ tone: "success", text: "Profile saved." });
    router.refresh();
  }

  return (
    <Panel title="Profile" description="How you appear in your dashboard." icon={UserRound}>
      <form onSubmit={save} noValidate className="space-y-5">
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Email</span>
            <p className="flex h-11 items-center truncate rounded-xl bg-slate-50 px-3.5 text-sm text-slate-600 ring-1 ring-slate-200">{email}</p>
          </div>
          <TextField
            id="fullName"
            label="Full name"
            value={name}
            maxLength={NAME_MAX}
            autoComplete="name"
            error={touched ? error : undefined}
            onBlur={(e) => shouldValidateOnBlur(e) && setTouched(true)}
            onChange={(e) => {
              setName(e.target.value);
              setMsg(null);
            }}
          />
        </div>
        <div className="flex justify-end">
          <Button type="submit" loading={saving} disabled={!dirty}>
            Save profile
          </Button>
        </div>
      </form>
    </Panel>
  );
}
