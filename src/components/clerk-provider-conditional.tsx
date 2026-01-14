import { ReactNode } from "react";

// Check if we have a valid Clerk key at build time
const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const hasValidKey =
  publishableKey &&
  publishableKey.startsWith("pk_") &&
  publishableKey !== "disabled";

/**
 * Conditionally renders ClerkProvider based on whether a valid publishable key is available.
 * This allows the app to build and run in CI/test environments without a real Clerk key.
 *
 * Uses dynamic import to completely avoid loading @clerk/nextjs when no valid key exists,
 * which prevents Clerk from throwing validation errors during static page generation.
 */
export async function ClerkProviderConditional({
  children,
}: {
  children: ReactNode;
}) {
  if (!hasValidKey) {
    // No valid Clerk key - render without auth (CI/test mode)
    return <>{children}</>;
  }

  // Dynamically import ClerkProvider only when we have a valid key
  const { ClerkProvider } = await import("@clerk/nextjs");

  return (
    <ClerkProvider
      publishableKey={publishableKey}
      appearance={{
        variables: {
          colorPrimary: "#1E3A5F",
          colorText: "#1A1A1A",
          colorTextSecondary: "#4A4A4A",
          colorBackground: "#FFFFFF",
          colorInputBackground: "#EDE8DD",
          colorInputText: "#1A1A1A",
          borderRadius: "0.5rem",
        },
      }}
    >
      {children}
    </ClerkProvider>
  );
}
