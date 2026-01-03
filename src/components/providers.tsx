"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { PostHogProvider } from "./posthog-provider";
import { UserSyncProvider } from "./user-sync-provider";
import { ThemeProvider } from "./theme-provider";
import { CookieConsentBanner } from "./cookie-consent-banner";
import { runAllStorageMigrations } from "@/stores/utils/migrate-storage";

export function Providers({ children }: { children: React.ReactNode }) {
  // Run storage migrations on first load (Postboxd -> Pictures rebrand)
  useEffect(() => {
    runAllStorageMigrations();
  }, []);

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Cache data for 5 minutes - matches our ISR revalidation
            staleTime: 5 * 60 * 1000,
            // Keep unused data in cache for 30 minutes
            gcTime: 30 * 60 * 1000,
            // Don't refetch on window focus for cinema data
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <PostHogProvider>
      <QueryClientProvider client={queryClient}>
        <UserSyncProvider>
          <ThemeProvider>
            {children}
            <CookieConsentBanner />
          </ThemeProvider>
        </UserSyncProvider>
      </QueryClientProvider>
    </PostHogProvider>
  );
}
