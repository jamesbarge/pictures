/**
 * Privacy Policy Page
 * UK GDPR compliant privacy policy
 */

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { CookieConsentSettings } from "@/components/cookie-consent-banner";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background-primary pb-24">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-background-primary/95 backdrop-blur-sm border-b border-border-subtle">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-text-secondary hover:text-text-primary transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
            <span>Back to Calendar</span>
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-display text-text-primary mb-2">
          Privacy Policy
        </h1>
        <p className="text-text-secondary mb-8">
          Last updated: January 2025
        </p>

        <div className="prose prose-slate max-w-none space-y-8">
          {/* Introduction */}
          <section>
            <h2 className="text-xl font-display text-text-primary mb-3">
              Introduction
            </h2>
            <p className="text-text-secondary leading-relaxed">
              Postboxd is a cinema listings service that helps you find film
              screenings at independent cinemas across London. We respect your
              privacy and are committed to protecting your personal data. This
              policy explains how we collect, use, and protect your information
              in compliance with UK GDPR and PECR.
            </p>
          </section>

          {/* What we collect */}
          <section>
            <h2 className="text-xl font-display text-text-primary mb-3">
              What We Collect
            </h2>

            <h3 className="text-lg font-medium text-text-primary mt-4 mb-2">
              Information you provide
            </h3>
            <ul className="list-disc list-inside text-text-secondary space-y-1">
              <li>
                <strong>Account information:</strong> If you create an account,
                we store your email address and name (provided via Clerk
                authentication)
              </li>
              <li>
                <strong>Preferences:</strong> Your selected cinemas, watchlist,
                and films marked as seen or not interested
              </li>
            </ul>

            <h3 className="text-lg font-medium text-text-primary mt-4 mb-2">
              Information collected automatically (with your consent)
            </h3>
            <ul className="list-disc list-inside text-text-secondary space-y-1">
              <li>
                <strong>Analytics data:</strong> Pages visited, features used,
                and how you interact with the site
              </li>
              <li>
                <strong>Session recordings:</strong> Anonymised recordings of
                your browsing session to help us fix bugs and improve the
                experience
              </li>
              <li>
                <strong>Technical data:</strong> Browser type, device type, and
                general location (city level)
              </li>
            </ul>
          </section>

          {/* How we use it */}
          <section>
            <h2 className="text-xl font-display text-text-primary mb-3">
              How We Use Your Data
            </h2>
            <ul className="list-disc list-inside text-text-secondary space-y-1">
              <li>To provide and personalise the cinema listings service</li>
              <li>To sync your preferences across devices (if signed in)</li>
              <li>To understand which features are popular and improve them</li>
              <li>To identify and fix bugs and usability issues</li>
              <li>To ensure the security and integrity of our service</li>
            </ul>
            <p className="text-text-secondary mt-3">
              We do not sell your data to third parties or use it for
              advertising.
            </p>
          </section>

          {/* Cookies */}
          <section>
            <h2 className="text-xl font-display text-text-primary mb-3">
              Cookies and Tracking
            </h2>

            <h3 className="text-lg font-medium text-text-primary mt-4 mb-2">
              Essential cookies (always active)
            </h3>
            <p className="text-text-secondary mb-2">
              These are required for the site to function:
            </p>
            <ul className="list-disc list-inside text-text-secondary space-y-1">
              <li>
                <strong>Authentication cookies:</strong> Clerk session cookies
                that keep you signed in
              </li>
              <li>
                <strong>Preference storage:</strong> localStorage entries for
                your cinema selections and watchlist
              </li>
            </ul>

            <h3 className="text-lg font-medium text-text-primary mt-4 mb-2">
              Analytics cookies (your choice)
            </h3>
            <p className="text-text-secondary mb-2">
              These help us improve Postboxd but are only set with your consent:
            </p>
            <ul className="list-disc list-inside text-text-secondary space-y-1">
              <li>
                <strong>PostHog:</strong> Privacy-focused analytics platform
                hosted in the EU. Collects anonymised usage data and session
                recordings with all text inputs masked.
              </li>
            </ul>

            {/* Cookie settings inline */}
            <div className="mt-6 p-4 bg-background-secondary rounded-lg border border-border-subtle">
              <h4 className="font-medium text-text-primary mb-3">
                Your Cookie Preferences
              </h4>
              <CookieConsentSettings />
            </div>
          </section>

          {/* Data retention */}
          <section>
            <h2 className="text-xl font-display text-text-primary mb-3">
              Data Retention
            </h2>
            <ul className="list-disc list-inside text-text-secondary space-y-1">
              <li>
                <strong>Account data:</strong> Retained while your account is
                active. Deleted within 30 days of account deletion.
              </li>
              <li>
                <strong>Analytics data:</strong> Retained for 12 months, then
                automatically deleted.
              </li>
              <li>
                <strong>Session recordings:</strong> Retained for 30 days.
              </li>
            </ul>
          </section>

          {/* Third parties */}
          <section>
            <h2 className="text-xl font-display text-text-primary mb-3">
              Third-Party Services
            </h2>
            <p className="text-text-secondary mb-3">
              We use the following services to operate Postboxd:
            </p>
            <ul className="list-disc list-inside text-text-secondary space-y-1">
              <li>
                <strong>Clerk</strong> (authentication) - processes account data
                under their{" "}
                <a
                  href="https://clerk.com/legal/privacy"
                  className="text-accent-primary hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  privacy policy
                </a>
              </li>
              <li>
                <strong>PostHog</strong> (analytics) - EU-hosted, processes
                analytics under their{" "}
                <a
                  href="https://posthog.com/privacy"
                  className="text-accent-primary hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  privacy policy
                </a>
              </li>
              <li>
                <strong>Supabase</strong> (database) - EU region, stores your
                preferences under their{" "}
                <a
                  href="https://supabase.com/privacy"
                  className="text-accent-primary hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  privacy policy
                </a>
              </li>
              <li>
                <strong>Vercel</strong> (hosting) - serves the website under
                their{" "}
                <a
                  href="https://vercel.com/legal/privacy-policy"
                  className="text-accent-primary hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  privacy policy
                </a>
              </li>
              <li>
                <strong>TMDB</strong> (film data) - provides film metadata, no
                user data shared
              </li>
            </ul>
          </section>

          {/* Your rights */}
          <section>
            <h2 className="text-xl font-display text-text-primary mb-3">
              Your Rights
            </h2>
            <p className="text-text-secondary mb-3">
              Under UK GDPR, you have the right to:
            </p>
            <ul className="list-disc list-inside text-text-secondary space-y-1">
              <li>
                <strong>Access:</strong> Request a copy of the data we hold
                about you
              </li>
              <li>
                <strong>Rectification:</strong> Ask us to correct inaccurate
                data
              </li>
              <li>
                <strong>Erasure:</strong> Ask us to delete your data
              </li>
              <li>
                <strong>Portability:</strong> Request your data in a portable
                format
              </li>
              <li>
                <strong>Object:</strong> Object to processing of your data
              </li>
              <li>
                <strong>Withdraw consent:</strong> Withdraw consent for
                analytics at any time via{" "}
                <Link
                  href="/settings"
                  className="text-accent-primary hover:underline"
                >
                  Settings
                </Link>
              </li>
            </ul>
            <p className="text-text-secondary mt-3">
              To exercise any of these rights, please contact us at the address
              below.
            </p>
          </section>

          {/* Contact */}
          <section>
            <h2 className="text-xl font-display text-text-primary mb-3">
              Contact Us
            </h2>
            <p className="text-text-secondary">
              For privacy-related questions or to exercise your rights, contact
              us at:{" "}
              <a
                href="mailto:privacy@postboxd.co.uk"
                className="text-accent-primary hover:underline"
              >
                privacy@postboxd.co.uk
              </a>
            </p>
            <p className="text-text-secondary mt-3">
              If you are not satisfied with our response, you have the right to
              lodge a complaint with the{" "}
              <a
                href="https://ico.org.uk/make-a-complaint/"
                className="text-accent-primary hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Information Commissioner&apos;s Office (ICO)
              </a>
              .
            </p>
          </section>

          {/* Changes */}
          <section>
            <h2 className="text-xl font-display text-text-primary mb-3">
              Changes to This Policy
            </h2>
            <p className="text-text-secondary">
              We may update this policy from time to time. Significant changes
              will be communicated via a notice on the site. Your continued use
              of Postboxd after changes constitutes acceptance of the updated
              policy.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

export const metadata = {
  title: "Privacy Policy | Postboxd",
  description:
    "How Postboxd collects, uses, and protects your personal data. UK GDPR compliant.",
};
