/**
 * Canonical form for email comparisons and storage: trimmed and lowercased.
 *
 * Called before every uniqueness check, write, and lookup so that
 * `Jane.Doe@Example.com` and `jane.doe@example.com` always resolve to the
 * same stored record.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
