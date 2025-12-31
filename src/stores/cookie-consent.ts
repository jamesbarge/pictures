/**
 * Cookie Consent Store
 * Manages user consent for analytics cookies (PECR/UK GDPR compliance)
 *
 * Note: We use localStorage (not cookies) to store consent preference,
 * since we can't set cookies before consent is given!
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type ConsentStatus = "pending" | "accepted" | "rejected";

export interface CookieConsentState {
  // Consent status for analytics/tracking cookies
  analyticsConsent: ConsentStatus;

  // When consent was given/updated (for audit trail)
  consentUpdatedAt: string | null;

  // Actions
  acceptAnalytics: () => void;
  rejectAnalytics: () => void;
  resetConsent: () => void;

  // Helpers
  hasDecided: () => boolean;
  canTrack: () => boolean;
}

export const useCookieConsent = create<CookieConsentState>()(
  persist(
    (set, get) => ({
      analyticsConsent: "pending",
      consentUpdatedAt: null,

      acceptAnalytics: () =>
        set({
          analyticsConsent: "accepted",
          consentUpdatedAt: new Date().toISOString(),
        }),

      rejectAnalytics: () =>
        set({
          analyticsConsent: "rejected",
          consentUpdatedAt: new Date().toISOString(),
        }),

      resetConsent: () =>
        set({
          analyticsConsent: "pending",
          consentUpdatedAt: null,
        }),

      hasDecided: () => get().analyticsConsent !== "pending",

      canTrack: () => get().analyticsConsent === "accepted",
    }),
    {
      name: "pictures-cookie-consent",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
