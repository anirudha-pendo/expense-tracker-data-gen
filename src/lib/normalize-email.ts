/**
 * Canonical form of an email for storage and lookup.
 *
 * Trims whitespace and lowercases so that `Jane.Doe@Example.com` and
 * `jane.doe@example.com` always resolve to the same IndexedDB row.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
