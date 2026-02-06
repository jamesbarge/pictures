/**
 * Admin email allowlist helpers.
 *
 * You can override the default list with:
 * ADMIN_EMAILS="admin1@example.com,admin2@example.com"
 */

const DEFAULT_ADMIN_EMAILS = ["jdwbarge@gmail.com"] as const;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function getAdminEmailAllowlist(): string[] {
  const fromEnv = process.env.ADMIN_EMAILS
    ?.split(",")
    .map(normalizeEmail)
    .filter(Boolean);

  if (fromEnv && fromEnv.length > 0) {
    return Array.from(new Set(fromEnv));
  }

  return [...DEFAULT_ADMIN_EMAILS];
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getAdminEmailAllowlist().includes(normalizeEmail(email));
}
