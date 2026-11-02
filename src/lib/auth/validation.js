// Pure validation for the auth forms (shared by the UI and the tests).
// Each validator returns an error message string, or "" when the value is valid.

export const PASSWORD_MIN = 8;
// Supabase hashes passwords with bcrypt, which ignores everything past 72 bytes.
export const PASSWORD_MAX = 72;
export const NAME_MAX = 120;
const EMAIL_MAX = 254;

// local@domain.tld - no spaces, one @, a dot in the domain, a TLD of 2+ letters.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[a-z]{2,}$/i;

export function normalizeEmail(value) {
  return String(value ?? "").trim();
}

export function validateEmail(value) {
  const email = normalizeEmail(value);
  if (!email) return "Enter your email address.";
  if (email.length > EMAIL_MAX) return "This email address is too long.";
  if (!EMAIL_RE.test(email) || email.includes("..")) return "Enter a valid email address, like name@example.com.";
  if (email.split("@")[0].length > 64) return "The part before @ is too long.";
  return "";
}

// Frequent misspellings of popular mail domains -> suggested correction.
const DOMAIN_TYPOS = {
  "gmial.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gamil.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.con": "gmail.com",
  "gmal.com": "gmail.com",
  "gnail.com": "gmail.com",
  "hotmial.com": "hotmail.com",
  "hotmal.com": "hotmail.com",
  "hotmail.co": "hotmail.com",
  "yahooo.com": "yahoo.com",
  "yaho.com": "yahoo.com",
  "yahoo.co": "yahoo.com",
  "outlok.com": "outlook.com",
  "outlook.co": "outlook.com",
  "iclod.com": "icloud.com",
  "icloud.co": "icloud.com",
};

/** Returns a corrected address when the domain looks like a typo, else "". */
export function suggestEmail(value) {
  const email = normalizeEmail(value).toLowerCase();
  const at = email.lastIndexOf("@");
  if (at < 1) return "";
  const fix = DOMAIN_TYPOS[email.slice(at + 1)];
  return fix ? `${normalizeEmail(value).slice(0, at)}@${fix}` : "";
}

/** For login: only presence matters (older accounts may predate the current rules). */
export function validateLoginPassword(value) {
  return value ? "" : "Enter your password.";
}

/** For signup and password reset. */
export function validateNewPassword(value, { email = "" } = {}) {
  const pw = String(value ?? "");
  if (!pw) return "Choose a password.";
  if (pw.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (new TextEncoder().encode(pw).length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  if (pw.trim() !== pw) return "Remove spaces at the start or end of the password.";
  if (!/[a-z]/i.test(pw) || !/\d/.test(pw)) return "Include at least one letter and one number.";
  const e = normalizeEmail(email).toLowerCase();
  if (e && (pw.toLowerCase() === e || pw.toLowerCase() === e.split("@")[0])) return "Don't use your email address as your password.";
  return "";
}

export function validatePasswordConfirm(password, confirm) {
  if (!confirm) return "Re-enter your password.";
  return password === confirm ? "" : "Passwords don't match.";
}

export function validateName(value, { required = false } = {}) {
  const name = String(value ?? "").trim();
  if (!name) return required ? "Enter your full name." : "";
  if (required && name.length < 2) return "Enter your full name.";
  if (name.length > NAME_MAX) return `Use at most ${NAME_MAX} characters.`;
  if (/[\u0000-\u001f\u007f<>]/.test(name)) return "Remove special characters like < and >.";
  if (/https?:\/\/|www\./i.test(name)) return "Enter your name, not a link.";
  return "";
}

/**
 * Rough strength estimate for the meter: 0 (empty) .. 4 (strong).
 * Advisory only - the hard rules are in validateNewPassword.
 */
export function passwordStrength(value) {
  const pw = String(value ?? "");
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= PASSWORD_MIN) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^a-z0-9]/i.test(pw)) score++;
  if (/^(.)\1+$/.test(pw) || /^(?:password|12345678|qwerty)/i.test(pw)) score = 1;
  return Math.max(1, Math.min(4, score));
}

export const STRENGTH_LABEL = ["", "Weak", "Fair", "Good", "Strong"];

/** Runs a { field: () => message } map and returns only the failing fields. */
export function collectErrors(checks) {
  const out = {};
  for (const [field, check] of Object.entries(checks)) {
    const msg = check();
    if (msg) out[field] = msg;
  }
  return out;
}
