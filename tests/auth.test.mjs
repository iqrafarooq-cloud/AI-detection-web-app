import { test } from "node:test";
import assert from "node:assert/strict";
import {
  collectErrors,
  passwordStrength,
  suggestEmail,
  validateEmail,
  validateLoginPassword,
  validateName,
  validateNewPassword,
  validatePasswordConfirm,
} from "@/lib/auth/validation";

test("email: accepts normal addresses, trims whitespace", () => {
  for (const ok of ["a@b.co", "first.last+tag@sub.example.org", "  name@example.com  ", "x_y@domain.io"]) {
    assert.equal(validateEmail(ok), "", ok);
  }
});

test("email: rejects empty, malformed and oversized addresses", () => {
  assert.match(validateEmail(""), /Enter your email/);
  assert.match(validateEmail("   "), /Enter your email/);
  for (const bad of ["plain", "a@b", "a@b.c", "a@@b.com", "a b@c.com", "a@b..com", "a..b@c.com", "@example.com", "a@.com", "a@b.com."]) {
    assert.match(validateEmail(bad), /valid email/, bad);
  }
  assert.match(validateEmail(`${"a".repeat(65)}@example.com`), /before @/);
  assert.match(validateEmail(`a@${"b".repeat(250)}.com`), /too long/);
});

test("email: suggests corrections for common domain typos only", () => {
  assert.equal(suggestEmail("Jane@gmial.com"), "Jane@gmail.com");
  assert.equal(suggestEmail("me@hotmial.com "), "me@hotmail.com");
  assert.equal(suggestEmail("me@gmail.com"), "");
  assert.equal(suggestEmail("me@company.com"), "");
  assert.equal(suggestEmail("nope"), "");
});

test("login password: only presence is required", () => {
  assert.match(validateLoginPassword(""), /Enter your password/);
  assert.equal(validateLoginPassword("short"), "");
});

test("new password: enforces length, letter+number, no edge spaces, not the email", () => {
  assert.match(validateNewPassword(""), /Choose a password/);
  assert.match(validateNewPassword("ab1"), /at least 8/);
  assert.match(validateNewPassword("abcdefgh"), /letter and one number/);
  assert.match(validateNewPassword("12345678"), /letter and one number/);
  assert.match(validateNewPassword(" abcdefg1"), /spaces/);
  assert.match(validateNewPassword("a1".repeat(37)), /at most 72/);
  assert.match(validateNewPassword("jane2024", { email: "jane2024@example.com" }), /email address/);
  assert.equal(validateNewPassword("correct horse 9"), "");
  assert.equal(validateNewPassword("Tr0ub4dor&3"), "");
});

test("new password: 72-byte limit counts bytes, not characters", () => {
  // 25 three-byte characters = 75 bytes > 72, even though it is only 26 characters.
  assert.match(validateNewPassword("€".repeat(25) + "a1"), /at most 72/);
});

test("password confirmation must match", () => {
  assert.match(validatePasswordConfirm("abc12345", ""), /Re-enter/);
  assert.match(validatePasswordConfirm("abc12345", "abc12346"), /don't match/);
  assert.equal(validatePasswordConfirm("abc12345", "abc12345"), "");
});

test("name: optional by default, required on signup, length-capped, no markup or links", () => {
  assert.equal(validateName(""), "");
  assert.match(validateName("", { required: true }), /full name/);
  assert.match(validateName("   ", { required: true }), /full name/);
  assert.match(validateName("J", { required: true }), /full name/);
  assert.equal(validateName("Jo", { required: true }), "");
  assert.equal(validateName("María José O'Brien-Smith"), "");
  assert.match(validateName("x".repeat(121)), /at most 120/);
  assert.match(validateName("<script>"), /special characters/);
  assert.match(validateName("visit https://spam.example"), /not a link/);
});

test("password strength is monotonic for typical inputs", () => {
  assert.equal(passwordStrength(""), 0);
  assert.equal(passwordStrength("password123"), 1);
  assert.ok(passwordStrength("abcdefg1") < passwordStrength("Abcdefghijk1!"));
  assert.equal(passwordStrength("Abcdefghijk1!"), 4);
});

test("collectErrors keeps only failing fields", () => {
  assert.deepEqual(collectErrors({ a: () => "", b: () => "bad" }), { b: "bad" });
});
