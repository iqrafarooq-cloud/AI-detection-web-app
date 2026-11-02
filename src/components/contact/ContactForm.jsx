"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { Alert, Button, Card, TextField } from "@/components/ui";
import { postJson } from "@/lib/client/api";

export default function ContactForm() {
  const [form, setForm] = useState({ name: "", email: "", message: "", website: "" });
  const [state, setState] = useState({ loading: false, error: "", sent: false });

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setState({ loading: true, error: "", sent: false });
    try {
      await postJson("/api/contact", form);
      setState({ loading: false, error: "", sent: true });
      setForm({ name: "", email: "", message: "", website: "" });
    } catch (err) {
      setState({ loading: false, error: err.message, sent: false });
    }
  }

  return (
    <Card className="p-6">
      {state.sent && (
        <Alert tone="success" title="Message sent" className="mb-5">
          Thanks for reaching out. We&apos;ll reply by email.
        </Alert>
      )}
      {state.error && <Alert tone="error" className="mb-5">{state.error}</Alert>}
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField id="name" label="Name" value={form.name} onChange={set("name")} required maxLength={120} autoComplete="name" />
          <TextField id="email" label="Email" type="email" value={form.email} onChange={set("email")} required maxLength={254} autoComplete="email" />
        </div>
        <label htmlFor="message" className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">Message</span>
          <textarea
            id="message"
            rows={6}
            required
            minLength={10}
            maxLength={5000}
            value={form.message}
            onChange={set("message")}
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm shadow-sm hover:border-slate-300 focus:border-brand-500"
          />
        </label>
        {/* Honeypot for bots - hidden from people and assistive tech. */}
        <input type="text" name="website" value={form.website} onChange={set("website")} tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
        <Button type="submit" loading={state.loading}>
          {!state.loading && <Send className="size-4" aria-hidden />} Send message
        </Button>
      </form>
    </Card>
  );
}
