/**
 * Admin email allowlist helpers.
 *
 * The allowlist is configured exclusively via the ADMIN_EMAILS env var:
 * ADMIN_EMAILS="admin1@example.com,admin2@example.com"
 *
 * There is no built-in default. If ADMIN_EMAILS is unset (or yields zero
 * entries after parsing), the allowlist is empty and NO email is treated as
 * admin — fail-closed. This prevents a missing or mistyped env var from
 * silently granting access to a single hardcoded account.
 */

interface ClerkEmailAddressLike {
  emailAddress?: string | null;
  verification?: {
    status?: string | null;
  } | null;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Return the admin email allowlist from `ADMIN_EMAILS`, or `[]` if unconfigured (fail-closed). */
export function getAdminEmailAllowlist(): string[] {
  const fromEnv = process.env.ADMIN_EMAILS
    ?.split(",")
    .map(normalizeEmail)
    .filter(Boolean);

  if (fromEnv && fromEnv.length > 0) {
    return Array.from(new Set(fromEnv));
  }

  return [];
}

/** Check whether the given email is on the admin allowlist. */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getAdminEmailAllowlist().includes(normalizeEmail(email));
}

/** Return normalized Clerk email addresses whose ownership has been verified. */
export function getVerifiedEmailAddresses(
  emailAddresses: readonly ClerkEmailAddressLike[] | null | undefined
): string[] {
  return (
    emailAddresses
      ?.filter((item) => item.verification?.status === "verified")
      .map((item) => item.emailAddress && normalizeEmail(item.emailAddress))
      .filter((email): email is string => Boolean(email)) ?? []
  );
}
