/**
 * Privacy Policy Page
 * GDPR-compliant privacy policy for Postboxd
 */

import { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

const BASE_URL = "https://postboxd.co.uk";
const CONTACT_EMAIL = "jdwbarge@gmail.com";
const LAST_UPDATED = "31 December 2024";

export const metadata: Metadata = {
  title: "Privacy Policy - Postboxd",
  description:
    "Privacy policy for Postboxd, the London cinema calendar. Learn how we collect, use, and protect your data.",
  alternates: {
    canonical: "/privacy",
  },
  openGraph: {
    title: "Privacy Policy - Postboxd",
    description: "Privacy policy for Postboxd, the London cinema calendar.",
    url: `${BASE_URL}/privacy`,
    type: "website",
  },
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background-primary pb-12">
      {/* Back Navigation */}
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
        <p className="text-sm text-text-tertiary mb-8">
          Last updated: {LAST_UPDATED}
        </p>

        <div className="prose prose-invert max-w-none space-y-8">
          {/* Introduction */}
          <section>
            <h2 className="text-xl font-display text-text-primary mb-4">
              Introduction
            </h2>
            <p className="text-text-secondary mb-4">
              Postboxd (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) is
              committed to protecting your privacy. This Privacy Policy explains
              how we collect, use, and safeguard your information when you use
              our website at{" "}
              <a
                href={BASE_URL}
                className="text-accent-primary hover:underline"
              >
                postboxd.co.uk
              </a>
              .
            </p>
            <p className="text-text-secondary">
              By using Postboxd, you agree to the collection and use of
              information in accordance with this policy.
            </p>
          </section>

          {/* Information We Collect */}
          <section>
            <h2 className="text-xl font-display text-text-primary mb-4">
              Information We Collect
            </h2>

            <h3 className="text-lg font-medium text-text-primary mb-2">
              Information You Provide
            </h3>
            <p className="text-text-secondary mb-4">
              When you create an account, we collect:
            </p>
            <ul className="list-disc list-inside text-text-secondary mb-4 space-y-1">
              <li>Email address</li>
              <li>Name (if provided)</li>
              <li>Profile picture (if provided via social login)</li>
              <li>
                Your film preferences (watchlist, seen films, not interested)
              </li>
              <li>Cinema preferences and filter settings</li>
            </ul>

            <h3 className="text-lg font-medium text-text-primary mb-2">
              Information Collected Automatically
            </h3>
            <p className="text-text-secondary mb-4">
              When you use Postboxd, we automatically collect:
            </p>
            <ul className="list-disc list-inside text-text-secondary mb-4 space-y-1">
              <li>Pages visited and features used</li>
              <li>Device type and browser information</li>
              <li>IP address (anonymised)</li>
              <li>Session recordings (with sensitive data masked)</li>
            </ul>
          </section>

          {/* How We Use Your Information */}
          <section>
            <h2 className="text-xl font-display text-text-primary mb-4">
              How We Use Your Information
            </h2>
            <p className="text-text-secondary mb-4">
              We use the information we collect to:
            </p>
            <ul className="list-disc list-inside text-text-secondary space-y-1">
              <li>Provide and maintain the service</li>
              <li>Sync your preferences across devices when signed in</li>
              <li>Improve the user experience</li>
              <li>Understand how the service is used</li>
              <li>Fix bugs and technical issues</li>
              <li>Send important service updates (rare)</li>
            </ul>
          </section>

          {/* Third-Party Services */}
          <section>
            <h2 className="text-xl font-display text-text-primary mb-4">
              Third-Party Services
            </h2>
            <p className="text-text-secondary mb-4">
              We use the following third-party services:
            </p>

            <div className="space-y-4">
              <div className="bg-background-secondary rounded-lg p-4">
                <h4 className="font-medium text-text-primary mb-1">
                  Clerk (Authentication)
                </h4>
                <p className="text-sm text-text-secondary">
                  Handles user sign-up and sign-in. Processes your email and
                  profile information.{" "}
                  <a
                    href="https://clerk.com/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent-primary hover:underline"
                  >
                    Clerk Privacy Policy
                  </a>
                </p>
              </div>

              <div className="bg-background-secondary rounded-lg p-4">
                <h4 className="font-medium text-text-primary mb-1">
                  PostHog (Analytics)
                </h4>
                <p className="text-sm text-text-secondary">
                  Tracks usage analytics and session recordings to improve the
                  service. Data is hosted in the EU.{" "}
                  <a
                    href="https://posthog.com/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent-primary hover:underline"
                  >
                    PostHog Privacy Policy
                  </a>
                </p>
              </div>

              <div className="bg-background-secondary rounded-lg p-4">
                <h4 className="font-medium text-text-primary mb-1">
                  Supabase (Database)
                </h4>
                <p className="text-sm text-text-secondary">
                  Stores your account data and preferences. Data is hosted in
                  the EU.{" "}
                  <a
                    href="https://supabase.com/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent-primary hover:underline"
                  >
                    Supabase Privacy Policy
                  </a>
                </p>
              </div>

              <div className="bg-background-secondary rounded-lg p-4">
                <h4 className="font-medium text-text-primary mb-1">
                  Vercel (Hosting)
                </h4>
                <p className="text-sm text-text-secondary">
                  Hosts the website and processes requests.{" "}
                  <a
                    href="https://vercel.com/legal/privacy-policy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent-primary hover:underline"
                  >
                    Vercel Privacy Policy
                  </a>
                </p>
              </div>

              <div className="bg-background-secondary rounded-lg p-4">
                <h4 className="font-medium text-text-primary mb-1">
                  TMDB (Film Data)
                </h4>
                <p className="text-sm text-text-secondary">
                  Provides film metadata (posters, descriptions). No user data
                  is shared with TMDB.{" "}
                  <a
                    href="https://www.themoviedb.org/privacy-policy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent-primary hover:underline"
                  >
                    TMDB Privacy Policy
                  </a>
                </p>
              </div>
            </div>
          </section>

          {/* Cookies */}
          <section>
            <h2 className="text-xl font-display text-text-primary mb-4">
              Cookies
            </h2>
            <p className="text-text-secondary mb-4">
              We use cookies and similar technologies to:
            </p>
            <ul className="list-disc list-inside text-text-secondary mb-4 space-y-1">
              <li>Keep you signed in</li>
              <li>Remember your preferences</li>
              <li>Understand how you use the service (analytics)</li>
            </ul>
            <p className="text-text-secondary">
              You can control cookie preferences through the cookie banner when
              you first visit the site, or through your browser settings.
            </p>
          </section>

          {/* Data Retention */}
          <section>
            <h2 className="text-xl font-display text-text-primary mb-4">
              Data Retention
            </h2>
            <p className="text-text-secondary mb-4">
              We retain your data for as long as your account is active. If you
              delete your account, we will delete your personal data within 30
              days, except where we are required to retain it for legal purposes.
            </p>
            <p className="text-text-secondary">
              Anonymous analytics data may be retained indefinitely in aggregate
              form.
            </p>
          </section>

          {/* Your Rights */}
          <section>
            <h2 className="text-xl font-display text-text-primary mb-4">
              Your Rights (GDPR)
            </h2>
            <p className="text-text-secondary mb-4">
              Under UK GDPR, you have the right to:
            </p>
            <ul className="list-disc list-inside text-text-secondary mb-4 space-y-1">
              <li>
                <strong>Access</strong> - Request a copy of your personal data
              </li>
              <li>
                <strong>Rectification</strong> - Request correction of
                inaccurate data
              </li>
              <li>
                <strong>Erasure</strong> - Request deletion of your data
              </li>
              <li>
                <strong>Portability</strong> - Request your data in a portable
                format
              </li>
              <li>
                <strong>Object</strong> - Object to processing of your data
              </li>
              <li>
                <strong>Withdraw consent</strong> - Withdraw consent for
                analytics at any time
              </li>
            </ul>
            <p className="text-text-secondary">
              To exercise any of these rights, please contact us at{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-accent-primary hover:underline"
              >
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </section>

          {/* Data Security */}
          <section>
            <h2 className="text-xl font-display text-text-primary mb-4">
              Data Security
            </h2>
            <p className="text-text-secondary">
              We implement appropriate technical and organisational measures to
              protect your data, including encryption in transit (HTTPS) and at
              rest, secure authentication via Clerk, and access controls.
              However, no method of transmission over the internet is 100%
              secure.
            </p>
          </section>

          {/* Children */}
          <section>
            <h2 className="text-xl font-display text-text-primary mb-4">
              Children&apos;s Privacy
            </h2>
            <p className="text-text-secondary">
              Postboxd is not intended for children under 13. We do not knowingly
              collect personal information from children under 13. If you believe
              we have collected such information, please contact us immediately.
            </p>
          </section>

          {/* Changes */}
          <section>
            <h2 className="text-xl font-display text-text-primary mb-4">
              Changes to This Policy
            </h2>
            <p className="text-text-secondary">
              We may update this Privacy Policy from time to time. We will
              notify you of any changes by posting the new policy on this page
              and updating the &quot;Last updated&quot; date.
            </p>
          </section>

          {/* Contact */}
          <section>
            <h2 className="text-xl font-display text-text-primary mb-4">
              Contact Us
            </h2>
            <p className="text-text-secondary">
              If you have any questions about this Privacy Policy, please
              contact us at{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-accent-primary hover:underline"
              >
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
