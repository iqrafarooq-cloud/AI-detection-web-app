"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, MailCheck } from "lucide-react";
import { Alert, Button, Card, TextField, cx } from "@/components/ui";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { shouldValidateOnBlur } from "@/lib/client/blur";
import {
  NAME_MAX,
  PASSWORD_MAX,
  PASSWORD_MIN,
  STRENGTH_LABEL,
  collectErrors,
  normalizeEmail,
  passwordStrength,
  suggestEmail,
  validateEmail,
  validateLoginPassword,
  validateName,
  validateNewPassword,
  validatePasswordConfirm,
} from "@/lib/auth/validation";

/* ----------------------------------------------------------------------------
 * Layout
 * ------------------------------------------------------------------------- */

// Simple centered card. Validation lives in the forms below.
function AuthShell({ title, subtitle, children, footer }) {
  const enabled = Boolean(getSupabaseBrowserClient());
  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-16 sm:px-6">
      <h1 className="text-center text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
      {subtitle && <p className="mt-2 text-center text-sm text-slate-500">{subtitle}</p>}
      <Card className="mt-8 p-6 sm:p-8">
        {enabled ? (
          children
        ) : (
          <Alert tone="info" title="Accounts are not enabled">
            The site operator has not configured authentication. You can still use every tool without an account.
          </Alert>
        )}
      </Card>
      {footer && <p className="mt-6 text-center text-sm text-slate-500">{footer}</p>}
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Form helpers
 * ------------------------------------------------------------------------- */

/**
 * Tracks values plus which fields were touched. Errors are derived from the
 * current values every render, and shown once a field was left (blur) or the
 * form was submitted - so users aren't scolded while still typing.
 */
function useForm(initial, validate) {
  const [values, setValues] = useState(initial);
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const errors = validate(values);
  const visible = (field) => (submitted || touched[field] ? errors[field] : undefined);

  const bind = (field) => ({
    id: field,
    name: field,
    value: values[field],
    error: visible(field),
    onChange: (e) => setValues((v) => ({ ...v, [field]: e.target.value })),
    onBlur: (e) => shouldValidateOnBlur(e) && setTouched((t) => ({ ...t, [field]: true })),
  });

  /** Marks the form submitted; focuses the first invalid field. Returns true when valid. */
  function check(order) {
    setSubmitted(true);
    const first = order.find((f) => errors[f]);
    if (first) document.getElementById(first)?.focus();
    return !first;
  }

  return { values, setValues, errors, bind, check };
}

function PasswordField(props) {
  const [show, setShow] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const onKey = (e) => setCapsLock(Boolean(e.getModifierState?.("CapsLock")));
  return (
    <TextField
      {...props}
      type={show ? "text" : "password"}
      maxLength={PASSWORD_MAX * 2}
      onKeyDown={onKey}
      onKeyUp={onKey}
      hint={capsLock ? "Caps Lock is on." : props.hint}
      trailing={
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
          aria-pressed={show}
          className="flex size-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          {show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        </button>
      }
    />
  );
}

const STRENGTH_COLOR = ["bg-slate-200", "bg-red-500", "bg-amber-500", "bg-emerald-500", "bg-emerald-600"];

function StrengthMeter({ password }) {
  const score = passwordStrength(password);
  if (!password) return null;
  return (
    <div className="-mt-2" aria-live="polite">
      <div className="flex gap-1" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={cx("h-1.5 flex-1 rounded-full transition-colors", i <= score ? STRENGTH_COLOR[score] : "bg-slate-200")} />
        ))}
      </div>
      <p className="mt-1.5 text-xs text-slate-500">
        Password strength: <span className="font-medium text-slate-700">{STRENGTH_LABEL[score]}</span>
        {score < 3 && " - longer passwords with mixed case and symbols are stronger."}
      </p>
    </div>
  );
}

function EmailSuggestion({ email, onAccept }) {
  const suggestion = suggestEmail(email);
  if (!suggestion) return null;
  return (
    <p className="-mt-2 text-xs text-slate-600">
      Did you mean{" "}
      <button type="button" onClick={() => onAccept(suggestion)} className="font-medium text-brand-600 underline-offset-2 hover:underline">
        {suggestion}
      </button>
      ?
    </p>
  );
}

/** Button that re-sends the signup confirmation email, with a cooldown. */
function ResendConfirmation({ email, className }) {
  const [cooldown, setCooldown] = useState(0);
  const [state, setState] = useState({ busy: false, msg: null });

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function resend() {
    setState({ busy: true, msg: null });
    const { error } = await getSupabaseBrowserClient().auth.resend({
      type: "signup",
      email: normalizeEmail(email),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard` },
    });
    setState({ busy: false, msg: error ? { tone: "error", text: friendlyAuthError(error) } : { tone: "success", text: "Confirmation email sent." } });
    if (!error) setCooldown(60);
  }

  return (
    <div className={className}>
      <Button variant="secondary" size="sm" onClick={resend} loading={state.busy} disabled={cooldown > 0}>
        {cooldown > 0 ? `Resend available in ${cooldown}s` : "Resend confirmation email"}
      </Button>
      {state.msg && <p className={cx("mt-2 text-xs", state.msg.tone === "error" ? "text-red-600" : "text-emerald-700")}>{state.msg.text}</p>}
    </div>
  );
}

function safeNext(value) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

export function friendlyAuthError(error) {
  const msg = error?.message || "";
  if (/invalid login credentials/i.test(msg)) return "Incorrect email or password.";
  if (/email not confirmed/i.test(msg)) return "Please confirm your email address first - check your inbox for the link.";
  if (/already (registered|exists)/i.test(msg)) return "An account with this email already exists. Try logging in instead.";
  if (/rate limit|too many|security purposes/i.test(msg)) return "Too many attempts. Please wait a minute and try again.";
  if (/same.*password|different from the old/i.test(msg)) return "Choose a password that is different from your current one.";
  if (/password/i.test(msg) && /(weak|short|least|pwned|leaked)/i.test(msg)) return msg;
  if (/fetch|network/i.test(msg)) return "Network error - please check your connection and try again.";
  return msg || "Something went wrong. Please try again.";
}

/* ----------------------------------------------------------------------------
 * Forms
 * ------------------------------------------------------------------------- */

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const form = useForm({ email: "", password: "" }, (v) =>
    collectErrors({ email: () => validateEmail(v.email), password: () => validateLoginPassword(v.password) })
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(params.get("error") === "link_invalid" ? "That link is invalid or has expired. Please request a new one." : "");
  const [unconfirmed, setUnconfirmed] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setUnconfirmed(false);
    if (!form.check(["email", "password"])) return;
    setLoading(true);
    const { error: err } = await getSupabaseBrowserClient().auth.signInWithPassword({
      email: normalizeEmail(form.values.email),
      password: form.values.password,
    });
    if (err) {
      setLoading(false);
      setUnconfirmed(/email not confirmed/i.test(err.message || ""));
      return setError(friendlyAuthError(err));
    }
    router.replace(safeNext(params.get("next")));
    router.refresh();
  }

  return (
    <AuthShell
      title="Welcome back"
      footer={
        <>
          New to Detectly?{" "}
          <Link href="/signup" className="font-medium text-brand-600 hover:underline">
            Create a free account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-5">
        {error && (
          <Alert tone="error">
            {error}
            {unconfirmed && <ResendConfirmation email={form.values.email} className="mt-3" />}
          </Alert>
        )}
        <TextField label="Email" type="email" inputMode="email" autoComplete="email" autoFocus placeholder="name@example.com" {...form.bind("email")} />
        <EmailSuggestion email={form.values.email} onAccept={(email) => form.setValues((v) => ({ ...v, email }))} />
        <PasswordField
          label="Password"
          autoComplete="current-password"
          labelAction={
            <Link
              href={validateEmail(form.values.email) ? "/forgot-password" : `/forgot-password?email=${encodeURIComponent(normalizeEmail(form.values.email))}`}
              className="text-sm font-medium text-brand-600 hover:underline"
            >
              Forgot password?
            </Link>
          }
          {...form.bind("password")}
        />
        <Button type="submit" size="lg" className="w-full" loading={loading}>
          Log in
        </Button>
      </form>
    </AuthShell>
  );
}

export function SignupForm() {
  const router = useRouter();
  const form = useForm({ fullName: "", email: "", password: "", confirm: "" }, (v) =>
    collectErrors({
      fullName: () => validateName(v.fullName, { required: true }),
      email: () => validateEmail(v.email),
      password: () => validateNewPassword(v.password, { email: v.email }),
      confirm: () => validatePasswordConfirm(v.password, v.confirm),
    })
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!form.check(["fullName", "email", "password", "confirm"])) return;
    setLoading(true);
    const { data, error: err } = await getSupabaseBrowserClient().auth.signUp({
      email: normalizeEmail(form.values.email),
      password: form.values.password,
      options: {
        data: { full_name: form.values.fullName.trim().slice(0, NAME_MAX) },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
      },
    });
    if (err) {
      setLoading(false);
      return setError(friendlyAuthError(err));
    }
    if (data.session) {
      router.replace("/dashboard");
      router.refresh();
      return;
    }
    setLoading(false);
    setDone(true);
  }

  if (done) {
    return (
      <AuthShell title="Check your email">
        <div className="text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <MailCheck className="size-6" aria-hidden />
          </div>
          <p className="mt-4 text-sm leading-relaxed text-slate-600">
            We sent a confirmation link to <strong className="text-slate-900">{normalizeEmail(form.values.email)}</strong>. Open it to activate your account. It may take a minute, and can land in spam.
          </p>
          <ResendConfirmation email={form.values.email} className="mt-5" />
        </div>
        <p className="mt-6 text-center text-sm text-slate-500">
          Wrong address?{" "}
          <button type="button" onClick={() => setDone(false)} className="font-medium text-brand-600 hover:underline">
            Go back
          </button>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your free account"
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-brand-600 hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-5">
        {error && <Alert tone="error">{error}</Alert>}
        <TextField label="Full name" autoComplete="name" autoFocus maxLength={NAME_MAX} {...form.bind("fullName")} />
        <TextField label="Email" type="email" inputMode="email" autoComplete="email" placeholder="name@example.com" {...form.bind("email")} />
        <EmailSuggestion email={form.values.email} onAccept={(email) => form.setValues((v) => ({ ...v, email }))} />
        <PasswordField label="Password" autoComplete="new-password" hint={`At least ${PASSWORD_MIN} characters, with a letter and a number.`} {...form.bind("password")} />
        <StrengthMeter password={form.values.password} />
        <PasswordField label="Confirm password" autoComplete="new-password" {...form.bind("confirm")} />
        <Button type="submit" size="lg" className="w-full" loading={loading}>
          Create account
        </Button>
      </form>
    </AuthShell>
  );
}

export function ForgotPasswordForm() {
  const params = useSearchParams();
  // Carries over the address already typed on the login page.
  const form = useForm({ email: params.get("email") || "" }, (v) => collectErrors({ email: () => validateEmail(v.email) }));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!form.check(["email"])) return;
    setLoading(true);
    const { error: err } = await getSupabaseBrowserClient().auth.resetPasswordForEmail(normalizeEmail(form.values.email), {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setLoading(false);
    if (err) return setError(friendlyAuthError(err));
    setSent(true);
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your account email and we'll send you a secure reset link."
      footer={
        <Link href="/login" className="font-medium text-brand-600 hover:underline">
          Back to log in
        </Link>
      }
    >
      {sent ? (
        <Alert tone="success" title="Check your email">
          If an account exists for <strong>{normalizeEmail(form.values.email)}</strong>, you&apos;ll receive a reset link shortly.
        </Alert>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-5">
          {error && <Alert tone="error">{error}</Alert>}
          <TextField label="Email" type="email" inputMode="email" autoComplete="email" autoFocus placeholder="name@example.com" {...form.bind("email")} />
          <EmailSuggestion email={form.values.email} onAccept={(email) => form.setValues((v) => ({ ...v, email }))} />
          <Button type="submit" size="lg" className="w-full" loading={loading}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

export function ResetPasswordForm() {
  const router = useRouter();
  const form = useForm({ password: "", confirm: "" }, (v) =>
    collectErrors({ password: () => validateNewPassword(v.password), confirm: () => validatePasswordConfirm(v.password, v.confirm) })
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!form.check(["password", "confirm"])) return;
    setLoading(true);
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase.auth.getUser();
    if (!data?.user) {
      setLoading(false);
      return setError("Your reset link has expired. Please request a new one.");
    }
    const { error: err } = await supabase.auth.updateUser({ password: form.values.password });
    if (err) {
      setLoading(false);
      return setError(friendlyAuthError(err));
    }
    router.replace("/dashboard?passwordUpdated=1");
    router.refresh();
  }

  return (
    <AuthShell title="Choose a new password">
      <form onSubmit={submit} noValidate className="space-y-5">
        {error && <Alert tone="error">{error}</Alert>}
        <PasswordField label="New password" autoComplete="new-password" autoFocus hint={`At least ${PASSWORD_MIN} characters, with a letter and a number.`} {...form.bind("password")} />
        <StrengthMeter password={form.values.password} />
        <PasswordField label="Confirm new password" autoComplete="new-password" {...form.bind("confirm")} />
        <Button type="submit" size="lg" className="w-full" loading={loading}>
          Update password
        </Button>
      </form>
    </AuthShell>
  );
}
