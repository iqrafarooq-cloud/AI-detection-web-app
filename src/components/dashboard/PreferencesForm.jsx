"use client";

import { useState } from "react";
import { Settings2 } from "lucide-react";
import { Alert, Button, SelectField, Toggle } from "@/components/ui";
import { Panel } from "./Panel";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { WRITING_STYLES } from "@/lib/services/rewrite/options";

// The app is English-only, so the stored language is always English.
const LANGUAGE = "en";

export default function PreferencesForm({ userId, initial }) {
  const [prefs, setPrefs] = useState({
    preferred_writing_style: initial?.preferred_writing_style || "natural",
    save_history: Boolean(initial?.save_history),
    store_original_text: Boolean(initial?.store_original_text),
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = (k) => (v) => setPrefs((p) => ({ ...p, [k]: v, ...(k === "save_history" && !v ? { store_original_text: false } : {}) }));

  async function save() {
    setSaving(true);
    setMsg(null);
    // Upsert covers users created before the signup trigger existed.
    const { error } = await getSupabaseBrowserClient()
      .from("user_preferences")
      .upsert({ user_id: userId, ...prefs, language: LANGUAGE }, { onConflict: "user_id" });
    setSaving(false);
    setMsg(error ? { tone: "error", text: error.message } : { tone: "success", text: "Preferences saved." });
  }

  return (
    <Panel id="preferences" title="Preferences & privacy" description="Defaults for the tools, and what gets saved to your account." icon={Settings2}>
      <div className="space-y-5">
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <Toggle id="saveHistory" label="Save history" description="Keep analysis summaries and improved text in your account." checked={prefs.save_history} onChange={set("save_history")} />
        <Toggle
          id="storeOriginal"
          label="Include original text"
          description="Also store the text you submitted. Off means only results are saved."
          checked={prefs.store_original_text}
          onChange={set("store_original_text")}
          disabled={!prefs.save_history}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <SelectField id="prefStyle" label="Default writing style" value={prefs.preferred_writing_style} onChange={set("preferred_writing_style")} options={WRITING_STYLES.map((s) => ({ value: s.id, label: s.label }))} />
        </div>
        <div className="flex justify-end">
          <Button onClick={save} loading={saving}>
            Save preferences
          </Button>
        </div>
      </div>
    </Panel>
  );
}
