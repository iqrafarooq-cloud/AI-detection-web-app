/**
 * Whether a field's blur should reveal its validation error.
 *
 * Showing an error changes the layout below the field. If focus is leaving for
 * a link or button (e.g. "Forgot password?"), that shift happens between
 * mousedown and mouseup, so the click lands on empty space and does nothing.
 * Only reveal errors when the user moves to another input (or clicks on blank
 * space); everything else is validated on submit.
 */
export function shouldValidateOnBlur(event) {
  const next = event.relatedTarget;
  return !next || ["INPUT", "TEXTAREA", "SELECT"].includes(next.tagName);
}
