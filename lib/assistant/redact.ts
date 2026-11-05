/**
 * Removes identifiers before a question or draft is stored for review.
 * Pikalo never needs these, and the UI already asks people not to type them;
 * this is the backstop. Tax numbers (dollar amounts, years, days, form
 * numbers) are left alone.
 */

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// SSN / ITIN: 3-2-4 digits with optional separators.
const SSN = /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g;
// USCIS A-number.
const A_NUMBER = /\bA[-\s]?\d{8,9}\b/gi;
// Card and bank account numbers: 10–19 digits, optional spaces or dashes.
const LONG_NUMBER = /\b\d(?:[\s-]?\d){9,18}\b/g;

export function redactPii(text: string): string {
  return text
    .replace(EMAIL, "[redacted email]")
    .replace(A_NUMBER, "[redacted id]")
    .replace(LONG_NUMBER, (m) =>
      m.replace(/\D/g, "").length === 9 ? m : "[redacted number]",
    )
    .replace(SSN, "[redacted id]");
}
